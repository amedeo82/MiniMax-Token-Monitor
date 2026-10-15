#!/usr/bin/env python3
"""Verifica browser Ondata 1 (I98/I100/I101/I102) — read-only, ADR-8.

Contesto fresco = localStorage vuoto = modalità demo per costruzione.
Controlli: dashboard completa, footer version I102, skip-link visibile al
primo Tab e focus su #contenuto dopo Enter, nessun banner PWA a regime,
Diagnostica renderizzata, console 0 errori.
"""
import asyncio
from playwright.async_api import async_playwright

BLOCK = ["**/api/minimax/usage*", "**/api/history*", "**/api/events*", "**/api/summary*"]
BASE = "http://localhost:3000"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(
            locale="it-IT", timezone_id="Europe/Rome", viewport={"width": 1440, "height": 900}
        )
        for pat in BLOCK:
            await ctx.route(pat, lambda r: asyncio.ensure_future(r.abort()))
        page = await ctx.new_page()
        errori_console = []
        page.on("console", lambda m: errori_console.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errori_console.append(str(e)))

        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(2500)

        # 1. Modalità demo e footer versione
        body = await page.inner_text("body")
        demo_ok = "dati simulati" in body
        versione = "2026-10-14 · I102" in body

        # 2. Nessun banner PWA a regime (I101: appare solo con aggiornamento reale)
        banner = await page.locator('[data-testid="pwa-update-banner"]').count()

        # 3. I102 — primo Tab mostra lo skip-link; Enter sposta il focus sul contenuto
        await page.keyboard.press("Tab")
        await page.wait_for_timeout(200)
        skip = page.locator("text=Salta al contenuto").first
        skip_visibile = await skip.is_visible()
        await page.screenshot(path="scripts/verify-i102-skip-link.png")
        await skip.press("Enter")
        await page.wait_for_timeout(400)
        focus_id = await page.evaluate("document.activeElement && document.activeElement.id")

        # 4. Diagnostica renderizzata (I100: pannello con pollCausa senza errori)
        diag = await page.locator("text=Diagnostica del monitor").count()

        # 5. Scroll fino alla Diagnostica e screenshot
        await page.locator("#diagnostica").scroll_into_view_if_needed()
        await page.wait_for_timeout(600)
        await page.screenshot(path="scripts/verify-i100-diagnostica.png")

        print(f"demo_mode={demo_ok} versione_I102={versione} banner_pwa={banner} "
              f"skip_visibile={skip_visibile} focus_dopo_enter={focus_id!r} diagnostica={diag} "
              f"console_errori={len(errori_console)}")
        if errori_console:
            print("ERRORI:", errori_console[:5])
        await browser.close()

asyncio.run(main())
