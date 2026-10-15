#!/usr/bin/env python3
"""Verifica browser I96 (performance render) — read-only, ADR-8.

Contesto fresco = localStorage vuoto = modalità demo per costruzione.
Controlli: dashboard completa, foglie vive che ticchettano (orologio header,
countdown reset) SENZA ri-renderizzare la pagina (sonde __mmRender*), vista
compatta (?compact=1), kiosk (?kiosk=1), mobile 390 zero overflow, console
senza errori reali.
"""
import asyncio
from playwright.async_api import async_playwright

BLOCK = ["**/api/minimax/usage*", "**/api/history*", "**/api/events*", "**/api/summary*"]
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

        await page.goto(BASE, wait_until="domcontentloaded")
        await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(3000)

        esiti = {}

        # 1. Dashboard demo + footer versione
        body = await page.inner_text("body")
        esiti["demo"] = "dati simulati" in body
        esiti["versione"] = "2026-10-14 · I102" in body  # bump a I96 nel commit docs (questa riga si aggiorna lì)

        # 2. Foglia orologio VIVA: l'ora cambia entro ~2 s senza render di pagina
        ora1 = await page.locator("p.font-mono.text-sm.font-semibold").first.inner_text()
        await page.wait_for_timeout(2200)
        ora2 = await page.locator("p.font-mono.text-sm.font-semibold").first.inner_text()
        esiti["orologio_vivo"] = ora1 != ora2

        # 3. Foglia countdown VIVA: il testo «tra Xm Ys» cambia entro ~2 s
        cd1 = await page.locator("#quota").inner_text()
        await page.wait_for_timeout(2200)
        cd2 = await page.locator("#quota").inner_text()
        esiti["countdown_vivo"] = cd1 != cd2

        # 4. Render pagina QUASI fermo mentre le foglie vivono (12 s: ≤2 tick 30 s)
        await page.evaluate("() => { window.__mmRenderPagina = 0; window.__mmRenderGrafico = 0; }")
        await page.wait_for_timeout(12000)
        sonda = await page.evaluate("() => ({ p: window.__mmRenderPagina, g: window.__mmRenderGrafico })")
        esiti["render_pagina_12s"] = sonda["p"]
        esiti["render_grafico_12s"] = sonda["g"]

        await page.screenshot(path="scripts/verify-i96-dashboard.png")

        # 5. Vista compatta (?compact=1): anelli + countdown + ritmo
        await page.goto(BASE + "/?compact=1", wait_until="domcontentloaded")
        await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(1500)
        compatta_body = await page.inner_text("body")
        esiti["compatta"] = "finestra 5 ore" in compatta_body and "Panoramica modelli" not in compatta_body

        # 6. Kiosk (?kiosk=1): vista quote + KioskBar
        await page.goto(BASE + "/?kiosk=1", wait_until="domcontentloaded")
        await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(1500)
        kiosk_body = await page.inner_text("body")
        esiti["kiosk"] = "Rotazione" in kiosk_body or "kiosk" in kiosk_body.lower()
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)

        # 7. Mobile 390: zero overflow orizzontale
        mob = await ctx.new_page()
        await mob.set_viewport_size({"width": 390, "height": 844})
        await mob.goto(BASE, wait_until="domcontentloaded")
        await mob.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await mob.wait_for_timeout(2000)
        dims = await mob.evaluate("() => ({ docW: document.documentElement.scrollWidth, innerW: window.innerWidth })")
        esiti["mobile_390"] = dims
        await mob.screenshot(path="scripts/verify-i96-mobile-390.png")

        print(f"esiti={esiti}")
        print(f"errori_console={len(errori)}")
        for e in errori[:6]:
            print("  ERR:", e)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
