# 06 — Catalogo abbellimenti dashboard (I57–I67)

> **Storia**: questo documento è stato creato il 09/10/2026 come proposta di 11 abbellimenti
> in 3 batch, implementati nelle sessioni 09–10/10 e **persi col secondo rollback del
> workspace dell'11/10**. Ri-creato l'11/10 nel recovery con le stesse specifiche
> (continuità di numeri e significati comunicati in chat); le 11 voci sono ora di nuovo
> implementate e verificate (vedi `docs/04` §3 e worklog Task 20).
>
> Stato: **tutte ✅** (ri-implementation recovery 11/10).

Principi condivisi (invariati):
- Tutte le aggregazioni sono **funzioni pure** in `src/lib/` (testabili, riusabili), la UI
  legge solo i risultati; la semantica del consumo resta quella di I26 (drawdown del
  minimo progressivo, reset riconosciuti con `RESET_JUMP`/`RESET_TARGET`, attribuzione al
  punto medio tra rilevamenti, orario Europe/Rome).
- Nessuna chiamata API aggiuntiva: tutto è derivato dallo storico già in pagina/server
  (ADR-8 intoccato).

---

## 5.1 I57 — Spreco per ciclo
`src/lib/cycles.ts`: `sprecoPerCiclo(cycles)` → `WasteStats`. Per ogni ciclo **completato**
il «spreco» è il residuo osservato all'ultimo rilevamento prima del reset (`endValue`):
la quota che il reset ha riportato a pieno senza che fosse usata. Statistiche: `n`,
`media`, `mediana`, `max` (spreco più grande osservato = peggiore ciclo), `clean` (cicli
con spreco < 5 punti) e `percClean`. `null` senza cicli completati.
UI: `CycleWaste` nel pannello Cicli (`analysis-panel.tsx`): riga di KPI (media/mediana/max
e % di cicli puliti) sotto le statistiche esistenti.

## 5.2 I58 — Calendario del consumo (stile GitHub)
`src/lib/cycles.ts`: `consumoGiornaliero(history, win, settimane)` → `CalendarGrid`:
consumo per **giorno di calendario** (Europe/Rome, chiave `YYYY-MM-DD` via formatter
`en-CA` — DST-safe per costruzione), griglia di N settimane lun→dom con celle
`{ date, value | null }` (null = giorno futuro/vuoto), **settimana corrente = ULTIMA
colonna** (convenzione corretta in originale), `max` per la scala di colore.
UI: `CalendarSection` nel tab «Calendario» di `analysis-panel.tsx`: celle quadre tonde,
intensità verde proporzionale (√-normalizzata), tooltip con data estesa e consumo,
legenda.

## 5.3 I59 — Ritmo di consumo %/h
`src/lib/rate.ts` (nuovo modulo): `rateSeries(history, win, opts)` → `(number|null)[]`:
ritmo istantaneo tra rilevamenti consecutivi (`(v_prev − v_curr)/Δh`), **null** se il gap
supera 30 minuti (misura inaffidabile), **null** su reset/rise (non è consumo), poi
**SMA-3** sui valori validi consecutivi per attenuare il rumore. Opzioni testabili:
`gapMs` (default 30 min), `sma` (default 3).
UI: `RateChart` (esportato da `history-chart.tsx`, montato in `page.tsx` sotto il
grafico): AreaChart %/h con linea a 0, tooltip tempo Roma, scala coerente col segno.

## 5.4 I60 — Orologio dei reset
Nuovo `src/components/diagnostica-panel.tsx`: `ResetClock` — dot plot SVG a 24 ore con
**asse UTC** e **3 corsie**: reset osservati della finestra 5h, reset osservati della
settimanale, blocchi teorici UTC (00/05/10/15/20 — orari fissi dei reset MiniMax).
Ogni dot ha tooltip con orario Roma e UTC; i teorici sono marker di fondo. Serve a
verificare a colpo d'occhio se i reset cadono sui blocchi fissi (collega la campagna V8).

## 5.5 I61 — Istogramma del residuo
`src/lib/cycles.ts`: `distribuzioneResiduo(history, win)` → `Distribuzione`: 10 fasce
(0–10 … 90–100), assegnazione con **ceil** (84,5 → fascia 80–90), conteggio per fascia,
`max` per la scala. `BAND_COLORS`: 10 colori dal rosso (0–10) al verde (90–100), gli
stessi valori di `quotaLevel` come casi limite.
UI: `DistributionSection` nel tab «Distribuzione» di `analysis-panel.tsx`: barre
orizzontali colorate per fascia, conteggio e percentuale, nota metodologica.

## 5.6 I62 — Salute del monitor
`src/lib/health.ts` (nuovo modulo): `saluteMonitor(events, opts)` → `SaluteMonitor`:
dagli eventi del registro (`kind: "error"`) raggruppa in **episodi** (errori consecutivi
a meno di 15 minuti = stesso episodio) nelle ultime 7 giorni (Europe/Rome), con inizio,
fine, durata, conteggio e ultimo messaggio; più `ultimoErrore` e `piuFrequente`
(messaggio più ricorrente). `windowMs` e `episodeGapMs` iniettabili per i test.
UI: `MonitorHealth` nel pannello Diagnostica: lista episodi recenti, badge di stato e
**badge backoff (I51)** quando lo scheduler è in backoff (mostra il ritardo corrente).

## 5.7 I63 — Prevedibilità dei cicli
`src/lib/cycles.ts`: `prevedibilitaCicli(cycles)` → `Prevedibilita | null`: su almeno
**3** cicli completati calcola σ popolazione delle durate, coefficiente di variazione
`cv = σ/μ` e **indice di regolarità 0–100** (`100 × (1 − min(1, cv))`); `null` sotto
soglia. UI: striscia nei tab Cicli (`analysis-panel.tsx`): indice, σ, CV e lettura
qualitativa («regolari» ≥ 70, «variabili» ≥ 40, «irregolari» sotto).

**I127 — caveat «campione ridotto»**: l'indice è una σ su pochi campioni e le durate
sono limiti inferiori (primo→ultimo rilevamento, campionamento sparso): con meno di
`PREVEDIBILITA_CAMPIONE_SOGLIA` (7) cicli completati la strip aggiunge «campione ridotto
(indice fragile)». Casi reali: in produzione con 4 cicli (11 min → 1h43) l'indice 26/100
è corretto ma fragile — ora lo dichiara.

## 5.8 I64 — Oggi vs media
`src/lib/cycles.ts`: `oggiVsMedia(history, win, settimane)` → `OggiVsMedia`: consumo di
OGGI (Europe/Rome) contro la **media degli stessi weekday** delle ultime N settimane
(default 5, **oggi escluso** dalla media); riusa l'aggregazione per giorno di I58.
UI: `TodayComparison` nel tab «Per giorno» di `analysis-panel.tsx`: due KPI (oggi, media)
con differenza colorata e nota sui giorni considerati.

## 5.9 I65 — Ring: colore continuo + glow + count-up
`src/lib/ring-color.ts` (nuovo modulo): `coloreContinuo(remainingPercent)` → colore HSL
continuo (tonalità interpolata 0° rosso → 142° verde) con le soglie di `quotaLevel`
(60/30/10) come **casi limite** di interpolazione (i colori discreti esistenti restano i
punti d'ancoraggio); `glowStyle(colore)` → box-shadow del glow dinamico;
`AnimatedPercent` — count-up con `requestAnimationFrame` che **rispetta
`prefers-reduced-motion`** (salto secco se attivo). Prop `continuous` sul `QuotaRing`:
**solo gli anelli principali** di `MainWindows` la usano; le card degli altri modelli
restano sui gradienti discreti.

## 5.10 I66 — Navigazione interna sticky con scrollspy
`src/components/section-nav.tsx` (nuovo): barra sticky sotto l'header con le **8 ancore**
della pagina (Quota, Grafico, Ritmo, Panoramica, Analisi, Diagnostica, Tecnici, Eventi);
`IntersectionObserver` per lo **scrollspy** (`aria-current="true"` sulla sezione
visibile), offset calcolato con la variabile CSS `--nav-offset` = header + 56px;
`scroll-margin-top` sulle sezioni (classe `.mm-anchor` in `globals.css`) per il salto
preciso; nascosta su mobile molto stretto (scroll orizzontale).

> **Nota implementazione I85 (12/10)** — richiesta «nav sempre visibile durante lo
> scrolling»: la barra era già `sticky top` ma un wrapper `hidden md:block` alto quanto
> la barra stessa ne bloccava la corsa (lo sticky scorre solo dentro il proprio
> contenitore). Ora la nav è **figlia diretta di `<main>`** e porta essa stessa
> `hidden md:block` — resta inchiodata sotto l'header per tutto lo scroll della pagina.
> Nella stessa sede è emerso e corretto un bug di I66 rimasto silenzioso: l'observer
> nasceva sullo skeleton (sezioni non ancora nel DOM → `getElementById` null) e non
> osservava mai nulla; `useScrollSpySezioni` ora riprova (250 ms × 120) finché le 8
> sezioni sono montate — cura anche la barra mobile I74. Dettagli e verifiche:
> `docs/03` §5.17.

## 5.11 I67 — Identità del tab: titolo e favicon dinamici
`src/lib/tab-identity.ts` (nuovo modulo): `formatTabTitle(...)` (residuo finestra 5h nel
titolo, es. «84% · MiniMax Token Monitor») e `drawFaviconDataUrl(percent)` (canvas 64×64:
anello colorato con la percentuale, colore = `coloreContinuo`); componente `<TabIdentity>`
(anch'esso nel modulo, via `React.createElement`): aggiorna `document.title` e
`<link rel="icon">` quando cambia il residuo, con **guard anti re-asserzione**
(MutationObserver sul `<title>`: Next/React 19 può ri-scrivere il titolo da metadata —
il guard lo ripristina), disattivato senza snapshot.
