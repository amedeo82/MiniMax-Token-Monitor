# Audit implementazioni — 2026-10-12T12:51:46.895Z

- Verifiche totali: **275** · PASS: **275** · FAIL: **0**
- Item ✅ in docs/04 senza verifiche dedicate (SCOPERTE): nessuno

| Item | Verifica | Tipo | Esito | Dettaglio |
|------|----------|------|-------|-----------|
| I12 | screenshot verifiche agent-browser (scripts/*.png ≥ 1) | file | PASS | — |
| I1 | dipendenze Next/React/Tailwind (package.json) | simbolo | PASS | — |
| I1 | componenti shadcn/ui | file | PASS | — |
| I2 | parser principale (src/lib/minimax.ts) | simbolo | PASS | — |
| I2 | endpoint regionali (src/lib/minimax.ts) | simbolo | PASS | — |
| I3 | handler proxy (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I3 | timeout 12s (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I4 | fuso Rome (src/lib/time.ts) | simbolo | PASS | — |
| I4 | countdown (src/lib/time.ts) | simbolo | PASS | — |
| I4 | progresso finestra (src/lib/time.ts) | simbolo | PASS | — |
| I5 | ModelCard (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I5 | MainWindows (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I5 | QuotaRing (src/components/quota-ring.tsx) | simbolo | PASS | — |
| I6 | tick 1s (src/app/page.tsx) | simbolo | PASS | — |
| I6 | ora server dedotta (src/lib/minimax.ts) | simbolo | PASS | — |
| I7 | chiave storico locale (src/app/page.tsx) | simbolo | PASS | — |
| I7 | HistoryChart (src/components/history-chart.tsx) | simbolo | PASS | — |
| I7 | computeTrend (src/components/history-chart.tsx) | simbolo | PASS | — |
| I8 | SettingsDialog (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I8 | default persistiti (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I9 | import JSON manuale (src/app/page.tsx) | simbolo | PASS | — |
| I10 | snapshot demo (src/lib/demo.ts) | simbolo | PASS | — |
| I10 | storia demo (src/lib/demo.ts) | simbolo | PASS | — |
| I11 | RawJsonPanel (src/components/tech-panels.tsx) | simbolo | PASS | — |
| I11 | TechInfo (src/components/tech-panels.tsx) | simbolo | PASS | — |
| I13 | bugfix I13 presente (src/lib/demo.ts) | simbolo | PASS | — |
| I14 | documentazione di progetto | file | PASS | — |
| I15 | nessun proxy chat (ADR-8) — nessun file deve esistere | assenza | PASS | — |
| I15 | nessun token-log.ts (ADR-8) — assenza richiesta (src/lib) | assenza | PASS | — |
| I15 | nessun TokenTracker (ADR-8) — assenza richiesta (src) | assenza | PASS | — |
| I19 | nessuna persistenza registro token — assenza richiesta (src) | assenza | PASS | — |
| I20 | nessuna correlazione token↔quota — assenza richiesta (src) | assenza | PASS | — |
| I16 | modello UsagePoint (prisma/schema.prisma) | simbolo | PASS | — |
| I16 | endpoint api/history | file | PASS | — |
| I16 | replica punti (src/lib/server-history.ts) | simbolo | PASS | — |
| I16 | merge storici (src/lib/server-history.ts) | simbolo | PASS | — |
| I17 | banner soglie (src/lib/usage-events.ts) | simbolo | PASS | — |
| I17 | transizioni toast/notifiche (src/lib/usage-events.ts) | simbolo | PASS | — |
| I21 | chiave registro eventi (src/lib/usage-events.ts) | simbolo | PASS | — |
| I21 | EventLog UI (src/components/event-log.tsx) | simbolo | PASS | — |
| I22 | export CSV (src/lib/export.ts) | simbolo | PASS | — |
| I22 | BOM per Excel it-IT (src/lib/export.ts) | simbolo | PASS | — |
| I23 | verdetto esaurimento vs reset (src/components/history-chart.tsx) | simbolo | PASS | — |
| I24 | vista panoramica (src/components/model-table.tsx) | simbolo | PASS | — |
| I25 | tab Connessione (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I25 | tab Avvisi (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I25 | tab Dati (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I26 | soglia reset (src/lib/cycles.ts) | simbolo | PASS | — |
| I26 | cicli di finestra (src/lib/cycles.ts) | simbolo | PASS | — |
| I26 | consumo per giorno (src/lib/cycles.ts) | simbolo | PASS | — |
| I26 | pannello analisi (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I27 | modello eventi server (prisma/schema.prisma) | simbolo | PASS | — |
| I27 | endpoint api/events | file | PASS | — |
| I27 | replica eventi (src/lib/server-events.ts) | simbolo | PASS | — |
| I27 | merge eventi per id (src/lib/server-events.ts) | simbolo | PASS | — |
| I28 | chiavi soglia per finestra (src/lib/usage-events.ts) | simbolo | PASS | — |
| I28 | migrazione soglie legacy (src/lib/usage-events.ts) | simbolo | PASS | — |
| I28 | matrice soglie nelle impostazioni (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I29 | toolkit verifiche V1–V6 | file | PASS | — |
| I29 | runbook verifiche | file | PASS | — |
| I30 | proxy senza cattura chiave (I30) — assenza richiesta (src/app/api/minimax/usage/route.ts) | assenza | PASS | — |
| I31 | pace di consumo (src/components/history-chart.tsx) | simbolo | PASS | — |
| I32 | heatmap 7×24 (src/lib/cycles.ts) | simbolo | PASS | — |
| I32 | tab heatmap in UI (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I55 | audit tool stesso | file | PASS | — |
| I55 | coverage check ✅ senza verifiche (scripts/verifiche/audit-implementazioni.mjs) | simbolo | PASS | — |
| I55 | report in esiti/ (scripts/verifiche/audit-implementazioni.mjs) | simbolo | PASS | — |
| I50 | suite test lib core | file | PASS | — |
| I50 | script test (package.json) | simbolo | PASS | — |
| I50 | tipi bun:test per tsc | file | PASS | — |
| I51 | backoff con jitter (src/lib/backoff.ts) | simbolo | PASS | — |
| I51 | parsing Retry-After (src/lib/backoff.ts) | simbolo | PASS | — |
| I51 | decisione client (src/lib/backoff.ts) | simbolo | PASS | — |
| I51 | wiring scheduler client (src/app/page.tsx) | simbolo | PASS | — |
| I51 | wiring retry transitorio proxy (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I51 | classificazione errori transitori (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I18 | endpoint alternativi per regione (src/lib/minimax.ts) | simbolo | PASS | — |
| I18 | URL alternativo dichiarato (src/lib/minimax.ts) | simbolo | PASS | — |
| I18 | trigger HTTP endpoint scomparso (src/lib/minimax.ts) | simbolo | PASS | — |
| I18 | decisione di fallback pura (src/lib/minimax.ts) | simbolo | PASS | — |
| I18 | wiring fallback nel proxy (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I18 | campagna di fetch riusabile primario/fallback (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I18 | annotazione fallback tentato senza successo (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I18 | stato fallback nel client (src/app/page.tsx) | simbolo | PASS | — |
| I18 | evento tecnico su transizione fallback (src/app/page.tsx) | simbolo | PASS | — |
| I18 | test dedicati al fallback | file | PASS | — |
| I52 | artefatti PWA | file | PASS | — |
| I52 | SW usa la fonte unica (public/sw.js) | simbolo | PASS | — |
| I52 | segreti solo in IndexedDB (ADR-14) (public/sw.js) | simbolo | PASS | — |
| I52 | cache snapshot solo su ok:true (fix 1004 cachato) (public/sw.js) | simbolo | PASS | — |
| I52 | parser condiviso (public/sw-shared.js) | simbolo | PASS | — |
| I52 | chiavi soglia condivise (public/sw-shared.js) | simbolo | PASS | — |
| I52 | transizioni condivise (public/sw-shared.js) | simbolo | PASS | — |
| I52 | wiring registro SW nel layout (src/app/layout.tsx) | simbolo | PASS | — |
| I52 | dispatch cambio impostazioni → SW (src/app/page.tsx) | simbolo | PASS | — |
| I52 | test di parità TS↔SW | file | PASS | — |
| I57 | WasteStats (src/lib/cycles.ts) | simbolo | PASS | — |
| I57 | KPI spreco nei tab Cicli (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I58 | aggregazione calendario (src/lib/cycles.ts) | simbolo | PASS | — |
| I58 | tab Calendario (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I59 | serie ritmo %/h (src/lib/rate.ts) | simbolo | PASS | — |
| I59 | grafico ritmo (src/components/history-chart.tsx) | simbolo | PASS | — |
| I59 | ancora sezione ritmo (src/app/page.tsx) | simbolo | PASS | — |
| I60 | dot plot reset (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I60 | blocchi teorici UTC (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I61 | istogramma residuo (src/lib/cycles.ts) | simbolo | PASS | — |
| I61 | colori fasce (src/lib/cycles.ts) | simbolo | PASS | — |
| I61 | tab Distribuzione (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I62 | episodi errore (src/lib/health.ts) | simbolo | PASS | — |
| I62 | salute in Diagnostica (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I63 | indice regolarità (src/lib/cycles.ts) | simbolo | PASS | — |
| I63 | striscia nei tab Cicli (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I64 | oggi vs media (src/lib/cycles.ts) | simbolo | PASS | — |
| I64 | tab Per giorno (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I65 | colore HSL continuo (src/lib/ring-color.ts) | simbolo | PASS | — |
| I65 | count-up (src/lib/ring-color.ts) | simbolo | PASS | — |
| I65 | prop anelli principali (src/components/quota-ring.tsx) | simbolo | PASS | — |
| I65 | MainWindows continuous (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I66 | scrollspy (src/components/section-nav.tsx) | simbolo | PASS | — |
| I66 | offset header+56px (src/components/section-nav.tsx) | simbolo | PASS | — |
| I66 | wiring nav (src/app/page.tsx) | simbolo | PASS | — |
| I66 | scroll-margin sezioni (src/app/globals.css) | simbolo | PASS | — |
| I67 | title dinamico (src/lib/tab-identity.ts) | simbolo | PASS | — |
| I67 | favicon canvas (src/lib/tab-identity.ts) | simbolo | PASS | — |
| I67 | guard anti re-asserzione (src/lib/tab-identity.ts) | simbolo | PASS | — |
| I67 | wiring tab identity (src/app/page.tsx) | simbolo | PASS | — |
| I69 | preset 6h/24h/3g/7g/30g/tutto (src/lib/interval.ts) | simbolo | PASS | — |
| I69 | filtro client-side puro (src/lib/interval.ts) | simbolo | PASS | — |
| I69 | wiring filtro nello storico (src/app/page.tsx) | simbolo | PASS | — |
| I69 | selettore a chips (src/app/page.tsx) | simbolo | PASS | — |
| I69 | semantica finestra testata (tests/lib/interval.test.ts) | simbolo | PASS | — |
| I77 | filtri kind+testo+periodo puri (src/lib/event-filters.ts) | simbolo | PASS | — |
| I77 | confine oggi Roma DST-safe (src/lib/event-filters.ts) | simbolo | PASS | — |
| I77 | wiring filtri nel registro (src/components/event-log.tsx) | simbolo | PASS | — |
| I77 | chips per kind (src/components/event-log.tsx) | simbolo | PASS | — |
| I77 | reset della vista (src/components/event-log.tsx) | simbolo | PASS | — |
| I77 | test confine ora legale/solare (tests/lib/event-filters.test.ts) | simbolo | PASS | — |
| I76 | fix bug undefined.toFixed (src/components/event-log.tsx) | simbolo | PASS | — |
| I76 | error boundary React (src/components/section-boundary.tsx) | simbolo | PASS | — |
| I76 | skeleton con retry (src/components/section-boundary.tsx) | simbolo | PASS | — |
| I76 | sezioni avvolte indipendentemente (src/app/page.tsx) | simbolo | PASS | — |
| I73 | parsing ?compact=1 (src/lib/compact.ts) | simbolo | PASS | — |
| I73 | wiring modalità compatta (src/app/page.tsx) | simbolo | PASS | — |
| I73 | widget anelli+countdown+ritmo (src/app/page.tsx) | simbolo | PASS | — |
| I73 | uscita dal widget (src/app/page.tsx) | simbolo | PASS | — |
| I73 | test parsing (tests/lib/compact.test.ts) | simbolo | PASS | — |
| I70 | z-score robusto mediana+MAD (src/lib/rate-anomalies.ts) | simbolo | PASS | — |
| I70 | costante Iglewicz-Hoaglin (src/lib/rate-anomalies.ts) | simbolo | PASS | — |
| I70 | ritmi GREZZI (SMA disattivata) (src/lib/rate-anomalies.ts) | simbolo | PASS | — |
| I70 | sezione Anomalie del ritmo (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I70 | mediana mostrata in UI (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I70 | statistiche robuste testate (tests/lib/rate-anomalies.test.ts) | simbolo | PASS | — |
| I71 | copertura+gap puri (src/lib/sampling.ts) | simbolo | PASS | — |
| I71 | giorno Roma DST-safe (src/lib/sampling.ts) | simbolo | PASS | — |
| I71 | sezione Qualità del campionamento (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I71 | badge copertura in UI (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I71 | soglia 15 min testata (tests/lib/sampling.test.ts) | simbolo | PASS | — |
| I72 | proiezione EWMA pura (src/lib/ewma.ts) | simbolo | PASS | — |
| I72 | peso esponenziale sulla mezza vita (src/lib/ewma.ts) | simbolo | PASS | — |
| I72 | card A/B affiancata al verdetto (src/components/history-chart.tsx) | simbolo | PASS | — |
| I72 | badge sperimentale (src/components/history-chart.tsx) | simbolo | PASS | — |
| I72 | wiring ewma in page.tsx (src/app/page.tsx) | simbolo | PASS | — |
| I72 | effetto half-life testato (tests/lib/ewma.test.ts) | simbolo | PASS | — |
| I80 | endpoint di sintesi read-only | file | PASS | — |
| I80 | solo GET, senza chiave (src/app/api/summary/route.ts) | simbolo | PASS | — |
| I80 | KPI aggregati dal DB (src/app/api/summary/route.ts) | simbolo | PASS | — |
| I80 | ADR-8: nessuna scrittura — assenza richiesta (src/app/api/summary/route.ts) | assenza | PASS | — |
| I81 | registrazione happy-dom (GlobalRegistrator) | file | PASS | — |
| I81 | pattern DOM ufficiale di Bun (tests/components/setup-dom.ts) | simbolo | PASS | — |
| I81 | DOM registrato prima di testing-library (bunfig.toml) | simbolo | PASS | — |
| I81 | test QuotaRing (tests/components/quota-ring.test.tsx) | simbolo | PASS | — |
| I81 | test EventLog (filtri I77) (tests/components/event-log.test.tsx) | simbolo | PASS | — |
| I81 | test error boundary + section-nav (tests/components/nav-boundary.test.tsx) | simbolo | PASS | — |
| I68 | tabella bucket orari derivati (prisma/schema.prisma) | simbolo | PASS | — |
| I68 | univocità ora+sorgente (niente mix api/demo) (prisma/schema.prisma) | simbolo | PASS | — |
| I68 | merge incrementale puro (src/lib/downsample.ts) | simbolo | PASS | — |
| I68 | bucket allineato all'ora UTC (src/lib/downsample.ts) | simbolo | PASS | — |
| I68 | manutenzione bucket nella POST (src/app/api/history/route.ts) | simbolo | PASS | — |
| I68 | GET ?granularity=hour (src/app/api/history/route.ts) | simbolo | PASS | — |
| I68 | backfill idempotente dai punti grezzi | file | PASS | — |
| I68 | client grana oraria (src/lib/server-history.ts) | simbolo | PASS | — |
| I68 | voci export orario nel menu (src/components/history-chart.tsx) | simbolo | PASS | — |
| I68 | bucket separati api/demo testati (tests/lib/downsample.test.ts) | simbolo | PASS | — |
| I74 | barra di navigazione inferiore mobile | file | PASS | — |
| I74 | scrollspy estratto in hook condiviso (src/components/section-nav.tsx) | simbolo | PASS | — |
| I74 | stesso scrollspy della nav I66 (src/components/bottom-nav.tsx) | simbolo | PASS | — |
| I74 | visibile solo sotto md (src/components/bottom-nav.tsx) | simbolo | PASS | — |
| I74 | wiring barra mobile in page.tsx (src/app/page.tsx) | simbolo | PASS | — |
| I74 | nav superiore nascosta su <md (alternativa; I85: la classe vive sul componente, nav figlia diretta di main) (src/components/section-nav.tsx) | simbolo | PASS | — |
| I75 | flusso di stampa con afterprint (src/lib/print.ts) | simbolo | PASS | — |
| I75 | blocco solo-carta (src/components/print-report.tsx) | simbolo | PASS | — |
| I75 | cicli nel report (src/components/print-report.tsx) | simbolo | PASS | — |
| I75 | spreco per ciclo (I57) nel report (src/components/print-report.tsx) | simbolo | PASS | — |
| I75 | calendario (I58) nel report (src/components/print-report.tsx) | simbolo | PASS | — |
| I75 | voce nel menu Esporta (src/components/history-chart.tsx) | simbolo | PASS | — |
| I75 | regole di stampa generiche (src/app/globals.css) | simbolo | PASS | — |
| I75 | modalità report-only nel CSS (src/app/globals.css) | simbolo | PASS | — |
| I78 | toggle tema next-themes (src/components/theme-toggle.tsx) | simbolo | PASS | — |
| I78 | provider temi in layout (src/app/layout.tsx) | simbolo | PASS | — |
| I78 | default scuro (comportamento invariato) (src/app/layout.tsx) | simbolo | PASS | — |
| I78 | strato chiaro: rimappatura superfici hardcoded (src/app/globals.css) | simbolo | PASS | — |
| I78 | tab Aspetto nelle impostazioni (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I78 | persistenza tema testata (tests/components/theme-toggle.test.tsx) | simbolo | PASS | — |
| I83 | varianti opacità remappate (strato chiaro) (src/app/globals.css) | simbolo | PASS | — |
| I83 | classi ! gestite in @layer utilities (src/app/globals.css) | simbolo | PASS | — |
| I83 | stato attivo tab/chip in tema chiaro (src/app/globals.css) | simbolo | PASS | — |
| I84 | token famiglie colore (chiaro/scuro) (src/app/globals.css) | simbolo | PASS | — |
| I84 | famiglia scuro: muted revisionati (src/app/globals.css) | simbolo | PASS | — |
| I84 | famiglia scuro: placeholder leggibile (src/app/globals.css) | simbolo | PASS | — |
| I84 | tinte forti → toni 50 pieni (strato chiaro) (src/app/globals.css) | simbolo | PASS | — |
| I84 | etichette menu text-zinc-500! in famiglia scuro (src/app/globals.css) | simbolo | PASS | — |
| I85 | nav figlia DIRETTA di main: contenitore sticky = tutta la pagina (nascosta in compact e kiosk) (src/app/page.tsx) | simbolo | PASS | — |
| I85 | niente wrapper attorno alla nav (limiterebbe la corsa dello sticky) — assenza richiesta (src/app/page.tsx) | assenza | PASS | — |
| I85 | sticky + hidden md:block sulla nav stessa (desktop ≥md) (src/components/section-nav.tsx) | simbolo | PASS | — |
| I79 | descrizione heatmap per screen reader (modulo puro) (src/lib/a11y.ts) | simbolo | PASS | — |
| I79 | descrizione calendario per screen reader (src/lib/a11y.ts) | simbolo | PASS | — |
| I79 | descrizione reset clock per screen reader (src/lib/a11y.ts) | simbolo | PASS | — |
| I79 | sr-only heatmap + griglia aria-hidden (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I79 | sr-only calendario + griglia aria-hidden (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I79 | reset clock: aria-label DINAMICO dai dati (role=img) (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I79 | regione live del polling nell'header (orologio degradato ad aria-hidden) (src/app/page.tsx) | simbolo | PASS | — |
| I79 | focus visibile sui link nav (famiglia scuro) (src/app/globals.css) | simbolo | PASS | — |
| I79 | focus visibile sui link nav (famiglia chiaro) (src/app/globals.css) | simbolo | PASS | — |
| I82 | storico per-modello → HistoryPoint[] (contratto analisi invariato, forward-fill) (src/lib/model-history.ts) | simbolo | PASS | — |
| I82 | acquisizione per-modello con dedup 20s (src/lib/model-history.ts) | simbolo | PASS | — |
| I82 | righe server LONG (model+win+t) → punti wide UI (src/lib/model-history.ts) | simbolo | PASS | — |
| I82 | route /api/history/models su lib I42 (tabella ModelUsagePoint, SQL parametrizzato) (src/app/api/history/models/route.ts) | simbolo | PASS | — |
| I82 | la route tocca SOLO SQLite: nessun endpoint MiniMax (ADR-8) — assenza richiesta (src/app/api/history/models/route.ts) | assenza | PASS | — |
| I82 | tabella storico per-modello nello schema (I42/82, @@unique model+win+t) (prisma/schema.prisma) | simbolo | PASS | — |
| I82 | pivotHistory: le analisi seguono il modello pivot (src/app/page.tsx) | simbolo | PASS | — |
| I82 | ingestione per-modello in pushHistory (unico punto per demo/api/import) (src/app/page.tsx) | simbolo | PASS | — |
| I82 | backfill demo dello storico per-modello (src/app/page.tsx) | simbolo | PASS | — |
| I82 | selettore del modello pivot nel grafico (src/app/page.tsx) | simbolo | PASS | — |
| I82 | Analisi con pivot non-general: fonte server per-modello (NON lo storico flat di general) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I82 | etichetta breve della finestra interval dalla durata osservata (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I82 | etichette finestra parametriche su grafico/statistiche/ritmo (src/components/history-chart.tsx) | simbolo | PASS | — |
| I82 | storico demo per-modello coerente con i tick dal vivo (src/lib/demo.ts) | simbolo | PASS | — |
| I86 | route Task 7 api/verifiche RIMOSSA (coerenza ADR-13-R: nessun endpoint che spawn di processi) — nessun file deve esistere | assenza | PASS | — |
| I86 | scaffold api/route.ts rimosso — nessun file deve esistere | assenza | PASS | — |
| I86 | campionatore I49 dormiente FUORI campagna / ri-cablato SOLO con blocco marcato CAMPAGNA V8 (ADR-13-R2) | condizione | PASS | — |
| I86 | contratto del campionatore superstite (dormiente, per la campagna V8) (src/lib/campione.ts) | simbolo | PASS | — |
| I86 | marcatore versione (I46): fonte unica (src/lib/version.ts) | simbolo | PASS | — |
| I86 | versione renderizzata nel footer (src/app/page.tsx) | simbolo | PASS | — |
| I86 | nessun riferimento a file chiave in src/app FUORI dal blocco marcato CAMPAGNA V8 (ADR-13-R intatto) | condizione | PASS | — |
| I87 | modulo kiosk (puro) + barra di controllo | file | PASS | — |
| I87 | parsing ?kiosk=1 (semantica readCompactMode) (src/lib/kiosk.ts) | simbolo | PASS | — |
| I87 | finestra notturna dimming 22:00–06:59 Europe/Rome (src/lib/kiosk.ts) | simbolo | PASS | — |
| I87 | barra kiosk cablata (sostituisce footer e nav mobile) (src/app/page.tsx) | simbolo | PASS | — |
| I87 | rotazione automatica delle viste (src/app/page.tsx) | simbolo | PASS | — |
| I87 | dimming notturno cablato (overlay z-45 sotto la barra) (src/app/page.tsx) | simbolo | PASS | — |
| I87 | URL sincronizzato via history.replaceState (src/app/page.tsx) | simbolo | PASS | — |
| I87 | uscita con Esc (src/app/page.tsx) | simbolo | PASS | — |
| I87 | toggle di ingresso nell'header (src/app/page.tsx) | simbolo | PASS | — |
| I87 | uscita sempre disponibile dalla barra sticky (src/components/kiosk-bar.tsx) | simbolo | PASS | — |
| I87 | versione resa anche nella barra kiosk (I46) (src/components/kiosk-bar.tsx) | simbolo | PASS | — |
| I53 | regione opposta (eu↔cn) (src/lib/minimax.ts) | simbolo | PASS | — |
| I53 | coppie {region,key} della campagna parallela (dedup chiave doppia) (src/lib/minimax.ts) | simbolo | PASS | — |
| I53 | settings multi-chiave (seconda chiave opzionale, retrocompatibile) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I53 | etichetta dinamica della seconda regione nel dialog (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I53 | pannello della seconda regione (solo visualizzazione) (src/components/region-alt-panel.tsx) | simbolo | PASS | — |
| I53 | campagna di fetch PARALLELA per regione (src/app/page.tsx) | simbolo | PASS | — |
| I53 | coppie di interrogazione derivate dalle impostazioni (src/app/page.tsx) | simbolo | PASS | — |
| I53 | pannello cablato nella sezione Panoramica (src/app/page.tsx) | simbolo | PASS | — |
| I53 | riga TechInfo con stato della secondaria (src/components/tech-panels.tsx) | simbolo | PASS | — |
| I53 | lo snapshot secondario NON entra nello storico (integrità analisi §5.21) — assenza richiesta (src/app/page.tsx) | assenza | PASS | — |
| I48 | matrice demo ↔ API ri-creata (era §11.2, persa col rollback) (docs/01-api-minimax-ricerca.md) | simbolo | PASS | — |
| I48 | verdetto della verifica registrato nella docs (docs/01-api-minimax-ricerca.md) | simbolo | PASS | — |
| I48 | script di verifica riproducibile (bun, zero rete, zero chiavi) (scripts/verifiche/verifica-i48-demo-vs-api.ts) | simbolo | PASS | — |
| I48 | t_query reale derivato (triangolazione docs/02 §4.2) incorporato (scripts/verifiche/verifica-i48-demo-vs-api.ts) | simbolo | PASS | — |
| I48 | esito persistente a nome stabile (lezione rollback: nessun verdetto senza artefatto) | file | PASS | — |
| I54 | matrice live ↔ demo ricostruita (era §5.9, persa col rollback) (docs/03-piano-implementazione.md) | simbolo | PASS | — |
| I54 | verdetto della verifica registrato nella docs (docs/03-piano-implementazione.md) | simbolo | PASS | — |
| I54 | script di verifica riproducibile (evidenze statiche su file) (scripts/verifiche/verifica-i54-live-vs-demo.mjs) | simbolo | PASS | — |
| I54 | assenze richieste verificate esplicitamente (nessun fork nel parser/kiosk) (scripts/verifiche/verifica-i54-live-vs-demo.mjs) | simbolo | PASS | — |
| I54 | esito persistente a nome stabile | file | PASS | — |

Verdetto: **PASS** (275 pass, 0 fail, 0 scoperte)