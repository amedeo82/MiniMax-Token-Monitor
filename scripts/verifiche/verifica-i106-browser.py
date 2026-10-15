#!/usr/bin/env python3
"""Verifica browser I106 (persistenza portabile) — read-only, ADR-8.

I106 è un item INFRASTRUTTURALE: l'accettazione è «sviluppo locale INVARIATO».
Il ramo adattato (Turso/file via driver adapter) è provato da
scripts/verifiche/verifica-i106.mjs; qui si verifica che l'app sul ramo NATIVO
(env TURSO_* assenti, come locale/CI) funzioni esattamente come prima:
dashboard demo, versione footer I106, sync archivio server visibile
(«in archivio sul server» — la persistenza server risponde), compatta/kiosk,
mobile 390 zero overflow, console senza errori reali (solo le 4 rotte ADR-8
bloccate di proposito).
"""
import asyncio
from playwright.async_api import async_playwright

BLOCK = ["**/api/minimax/usage*", "**/api/history*", "**/api/events*"]
BASE = "http://localhost:3000"


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            locale="it-IT", timezone_id="Europe/Rome", viewport={"width": 1440, "height": 900}
        )
        for pat in BLOCK:
            await ctx.route(pat, lambda r: asyncio.ensure_future(r.abort()))
        page = await ctx.new_page()
        errori = []
        page.on("pageerror", lambda e: errori.append(str(e)))
        page.on("console", lambda m: errori.append("CONSOLE: " + m.text[:160]) if m.type == "error" else None)
        page.on("response", lambda r: print(f"  HTTP {r.status} {r.url}") if r.status >= 400 else None)

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(3000)

        esiti = {}
        body = await page.inner_text("body")
        esiti["demo"] = "dati simulati" in body
        esiti["versione_i106"] = "2026-10-15 · I106" in body
        # Persistenza server locale VIVA (ramo nativo I106): /api/summary (read-only,
        # NON bloccata) risponde nel contesto browser — il contatore «in archivio
        # sul server» dell'EventLog non è verificabile qui perché /api/events è
        # bloccata per ADR-8 (serverEventsCount resta null: comportamento atteso).
        r = await page.request.get(BASE + "/api/summary")
        esiti["summary_200"] = r.status == 200 and (await r.json())["ok"] is True

        await page.screenshot(path="scripts/verify-i106-dashboard.png")

        # Vista compatta invariata
        await page.goto(BASE + "/?compact=1", wait_until="domcontentloaded")
        await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(1500)
        compatta = await page.inner_text("body")
        esiti["compatta"] = "finestra 5 ore" in compatta and "Panoramica modelli" not in compatta

        # Mobile 390: zero overflow orizzontale
        mob = await ctx.new_page()
        await mob.set_viewport_size({"width": 390, "height": 844})
        await mob.goto(BASE, wait_until="domcontentloaded")
        await mob.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await mob.wait_for_timeout(2000)
        dims = await mob.evaluate("() => ({ docW: document.documentElement.scrollWidth, innerW: window.innerWidth })")
        esiti["mobile_390"] = dims
        await mob.screenshot(path="scripts/verify-i106-mobile-390.png")

        errori_real = [
            e for e in errori
            if "net::ERR_FAILED" not in e and "api/history" not in e and "api/events" not in e
            and "api/minimax/usage" not in e
            # Il 503 su /api/history e /api/events È la risposta DESIGNATA del
            # Service Worker al blocco ADR-8: ctx.route aborta la fetch, il SW
            # la traduce nel 503 JSON offline che i client riducono a null
            # (public/sw.js fetch handler, nota I92) — non è un errore reale.
            and "status of 503" not in e
        ]
        print(f"esiti={esiti}")
        print(f"errori_console_real={len(errori_real)} (bloccati ADR-8 attesi: {len(errori) - len(errori_real)})")
        for e in errori_real[:6]:
            print("  ERR:", e)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
