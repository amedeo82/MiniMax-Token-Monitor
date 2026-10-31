#!/usr/bin/env python3
"""Asset visivi per il README GitHub (Task 41; rigenerati Task 48; adattati I134).

I134 — due adattamenti all'evoluzione dell'app:
1. DEMO OPT-IN (I126): dal 20/10 un contesto browser FRESH NON mostra più la demo
   (era il presupposto della cattura originale) ma la scheda di configurazione
   («Inserisci la chiave» / «Prova la demo»). Ogni passata ora CLICCA «Prova la
   demo» e verifica il badge «dati simulati» PRIMA di catturare: la demo resta
   una scelta esplicita, anche nelle catture.
2. CATTURA KIOSK (I87/I132/I133): nuova passata su `/?kiosk=1` con lo stato
   kiosk seminato in localStorage (rotazione attiva, 30 s) — lo screenshot
   `modalita-kiosk.png` mostra la barra «Rotazione tra schermate» con il
   countdown «prossima schermata tra Ns» e l'hint del ciclo.

Invariato (Task 41/48):
- Contesto browser FRESH = localStorage vuoto → scheda I126 → click demo (dati
  sintetici, sicuri da pubblicare; nessuna chiave reale mai inserita).
- Rotte API bloccate (ADR-8 + prudenza): usage proxy, history, events, summary
  → nessun dato reale ne' scritture durante la cattura.
- Screenshot retina (dsf=2) in docs/assets/, frame del tour GIF (dsf=1) in
  scripts/gif-frames/.
"""
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path("/home/z/my-project")
OUT = ROOT / "docs" / "assets"
TMP = ROOT / "scripts" / "gif-frames"
BASE = "http://localhost:3000"

# Stato kiosk seminato (chiave di src/lib/kiosk.ts): rotazione attiva a 30 s
# per mostrare nella cattura countdown I132 e hint I133 del ciclo automatico.
KIOSK_SEED = (
    "try{localStorage.setItem('mm-dash-kiosk-v1',"
    " JSON.stringify({enabled:true,rotation:true,rotationSeconds:30,nightDim:false}))"
    "}catch(e){}"
)

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


async def attiva_demo(page, contesto: str) -> bool:
    """I126: attiva la demo con un click esplicito sulla scheda di setup.

    Il rilevamento usa il BOTTONE «Prova la demo»: la copia della scheda I126
    contiene lei stessa «dati simulati» («…oppure prova la modalità demo con
    dati simulati»), quindi il testo del body da solo non certifica nulla.
    Se il bottone esiste la demo NON è attiva e va cliccato; se è assente, il
    badge «dati simulati» dell'header distingue la demo attiva da una pagina
    inattesa. Restituisce True se la demo risulta attiva a fine chiamata.
    """
    # I126: `needsSetup` richiede `mounted` — una prima lettura può cadere sullo
    # skeleton SSR: due tentativi con attesa coprono l'idratazione del client.
    setup = page.get_by_role("button", name="Prova la demo")
    for _ in range(2):
        if await setup.count() > 0:
            print(f"[{contesto}] scheda di setup I126 presente — click su «Prova la demo»")
            await setup.first.click(timeout=15000)
            await page.wait_for_timeout(5000)  # generazione demo I125 + count-up anelli
            body = await page.inner_text("body")
            ok = "dati simulati" in body
            print(f"[{contesto}] badge «dati simulati» dopo il click: {ok}")
            return ok
        await page.wait_for_timeout(2500)
    body = await page.inner_text("body")
    if "dati simulati" in body:
        print(f"[{contesto}] demo già attiva (badge presente, nessun bottone di setup) — nessun click")
        return True
    print(f"[{contesto}] ATTENZIONE: né scheda di setup né badge demo — pagina inattesa")
    return False


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
        await attiva_demo(page, "dashboard")
        await page.wait_for_timeout(5000)  # count-up anelli + generazione demo

        body = await page.inner_text("body")
        print("DEMO MODE presente nel body:", "dati simulati" in body)
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

        # modalita' compatta (widget) — STESSO CONTESTO della dashboard: la demo
        # è già stata attivata con il click I126 (settings salvati nel localStorage
        # del contesto). Il widget compact non mostra né scheda di setup né badge:
        # il probe affidabile è il CONTENUTO (le finestre principali del widget I73;
        # durante lo skeleton SSR «Finestra di 5 ore» non è ancora nel body).
        await page.goto(BASE + "/?compact=1", wait_until="networkidle")
        await page.wait_for_timeout(4500)
        body_c = await page.inner_text("body")
        print("COMPACT widget «Finestra di 5 ore» presente:", "Finestra di 5 ore" in body_c)
        await page.screenshot(path=str(OUT / "modalita-compatta.png"))
        print("OK modalita-compatta.png")
        await ctx.close()

        # ---------- PASSATA 1-bis (I134): modalità kiosk/TV (dsf=2) ----------
        # Stato kiosk seminato PRIMA del load: rotazione attiva → la barra mostra
        # «Rotazione tra schermate», il countdown «prossima schermata tra Ns» (I132)
        # e l'hint del ciclo automatico (I133): la vista più rappresentativa.
        ctx_k = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            locale="it-IT",
            timezone_id="Europe/Rome",
        )
        await ctx_k.add_init_script(KIOSK_SEED)
        await block_all(ctx_k)
        page_k = await ctx_k.new_page()

        await page_k.goto(BASE + "/?kiosk=1", wait_until="networkidle")
        await attiva_demo(page_k, "kiosk")
        await page_k.wait_for_timeout(6000)  # demo + count-up + countdown visibile

        body_k = await page_k.inner_text("body")
        print("KIOSK barra «Rotazione tra schermate»:", "Rotazione tra schermate" in body_k)
        print("KIOSK countdown «prossima schermata tra»:", "prossima schermata tra" in body_k)
        await page_k.screenshot(path=str(OUT / "modalita-kiosk.png"))
        print("OK modalita-kiosk.png")
        await ctx_k.close()

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
        await attiva_demo(pg, "gif")
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
