#!/usr/bin/env python3
"""Asset visivi per il README GitHub (Task 41).

- Contesto browser FRESH = localStorage vuoto = modalita' DEMO (dati sintetici, sicuri da pubblicare).
- Rotte API bloccate (ADR-8 + prudenza): usage proxy, history, events, summary -> nessun dato reale
  ne' scritture durante la cattura.
- Screenshot retina (dsf=2) in docs/assets/, frame del tour GIF (dsf=1) in scripts/gif-frames/.
"""
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path("/home/z/my-project")
OUT = ROOT / "docs" / "assets"
TMP = ROOT / "scripts" / "gif-frames"
BASE = "http://localhost:3000"

# ADR-8 / prudenza: nessuna chiamata a proxy, archivio, eventi, summary durante la cattura
BLOCK = [
    "**/api/minimax/usage*",
    "**/api/history*",
    "**/api/events*",
    "**/api/summary*",
]


async def block_all(ctx):
    for pat in BLOCK:
        await ctx.route(pat, lambda r: asyncio.ensure_future(r.abort()))


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch()

        # ---------- PASSATA 1: screenshot retina (dsf=2) ----------
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            locale="it-IT",
            timezone_id="Europe/Rome",
        )
        await block_all(ctx)
        page = await ctx.new_page()

        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(5000)  # count-up anelli + generazione demo

        body = await page.inner_text("body")
        print("DEMO MODE presente nel body:", "demo" in body.lower())
        print("Titolo pagina:", await page.title())

        await page.screenshot(path=str(OUT / "hero-dashboard.png"))
        print("OK hero-dashboard.png")

        for sec in ["grafico", "analisi", "diagnostica"]:
            await page.evaluate(
                f"document.getElementById('{sec}')?.scrollIntoView({{behavior:'instant', block:'start'}})"
            )
            await page.wait_for_timeout(2800)
            await page.screenshot(path=str(OUT / f"sezione-{sec}.png"))
            print(f"OK sezione-{sec}.png")

        # modalita' compatta (widget)
        await page.goto(BASE + "/?compact=1", wait_until="networkidle")
        await page.wait_for_timeout(4500)
        await page.screenshot(path=str(OUT / "modalita-compatta.png"))
        print("OK modalita-compatta.png")
        await ctx.close()

        # ---------- PASSATA 2: tour GIF (dsf=1) ----------
        ctx2 = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
            locale="it-IT",
            timezone_id="Europe/Rome",
        )
        await block_all(ctx2)
        pg = await ctx2.new_page()
        await pg.goto(BASE, wait_until="networkidle")
        await pg.wait_for_timeout(5000)

        height = await pg.evaluate("document.documentElement.scrollHeight")
        print("Altezza pagina:", height)

        n = 0

        async def snap():
            nonlocal n
            await pg.screenshot(path=str(TMP / f"f{n:03d}.png"))
            n += 1

        # pausa iniziale (3 frame)
        for _ in range(3):
            await snap()

        # scorrimento graduale fino in fondo
        step = 320
        y = 0
        while y < height - 900:
            y = min(y + step, height - 900)
            await pg.evaluate(f"window.scrollTo(0, {y})")
            await pg.wait_for_timeout(400)
            await snap()

        # pausa finale (2 frame)
        for _ in range(2):
            await snap()

        print("Frame totali:", n)
        await ctx2.close()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
