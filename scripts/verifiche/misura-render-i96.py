#!/usr/bin/env python3
"""I96 — misura del numero di render al minuto (pagina e grafico storico).

Legge le sonde neutre `window.__mmRenderPagina` / `window.__mmRenderGrafico`
(page.tsx / history-chart.tsx): contesto fresco = modalità demo per costruzione;
rotte di scrittura bloccate per ADR-8. Misura su una finestra fissa di 65 s
dopo il carico completo della dashboard demo.

Uso: python scripts/verifiche/misura-render-i96.py [--secondi 65] [--etichetta prima|dopo]
"""
import argparse
import asyncio
from playwright.async_api import async_playwright

BLOCK = ["**/api/minimax/usage*", "**/api/history*", "**/api/events*", "**/api/summary*"]
BASE = "http://localhost:3000"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--secondi", type=int, default=65)
    ap.add_argument("--etichetta", default="")
    args = ap.parse_args()

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

        await page.goto(BASE, wait_until="domcontentloaded")
        # Contesto fresco = impostazioni di default = demo attiva subito:
        # attendi la dashboard demo completa (prima compilazione dev inclusa).
        try:
            await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=20000)
        except Exception:
            await page.reload(wait_until="domcontentloaded")
            await page.locator("text=dati simulati").first.wait_for(state="visible", timeout=30000)
        await page.wait_for_timeout(4000)  # retrofill demo + render completo

        demo = "dati simulati" in (await page.inner_text("body"))

        # Finestra di misura: azzera le sonde e attende N secondi
        await page.evaluate("() => { window.__mmRenderPagina = 0; window.__mmRenderGrafico = 0; }")
        await page.wait_for_timeout(args.secondi * 1000)
        misura = await page.evaluate(
            "() => ({ pagina: window.__mmRenderPagina ?? null, grafico: window.__mmRenderGrafico ?? null })"
        )
        minuti = args.secondi / 60
        pagina_min = misura["pagina"] / minuti if misura["pagina"] is not None else None
        grafico_min = misura["grafico"] / minuti if misura["grafico"] is not None else None

        etichetta = f"[{args.etichetta}] " if args.etichetta else ""
        print(
            f"{etichetta}demo={demo} finestra={args.secondi}s "
            f"render_pagina={misura['pagina']} ({pagina_min:.1f}/min) "
            f"render_grafico={misura['grafico']} ({grafico_min:.1f}/min) "
            f"pageerror={len(errori)}"
        )
        if errori:
            for e in errori[:5]:
                print("PAGEERROR:", e[:200])
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
