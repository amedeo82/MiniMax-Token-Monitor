# Audit implementazioni — 2026-10-20T12:42:35.877Z

- Verifiche totali: **659** · PASS: **659** · FAIL: **0**
- Item ✅ in docs/04 senza verifiche dedicate (SCOPERTE): nessuno

| Item | Verifica | Tipo | Esito | Dettaglio |
|------|----------|------|-------|-----------|
| I12 | screenshot verifiche browser (scripts/*.png oppure docs/assets/*.png ≥ 1) | file | PASS | — |
| I1 | dipendenze Next/React/Tailwind (package.json) | simbolo | PASS | — |
| I1 | componenti shadcn/ui | file | PASS | — |
| I2 | parser principale (src/lib/minimax.ts) | simbolo | PASS | — |
| I2 | endpoint regionali (src/lib/minimax.ts) | simbolo | PASS | — |
| I3 | handler proxy (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I3 | timeout 12s (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I4 | fuso Rome (src/lib/time.ts) | simbolo | PASS | — |
| I4 | countdown (src/lib/time.ts) | simbolo | PASS | — |
| I4 | progresso finestra (src/lib/time.ts) | simbolo | PASS | — |
| I5 | ModelCard (memoizzata da I96) (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I5 | MainWindows (memoizzato da I96) (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I5 | QuotaRing (src/components/quota-ring.tsx) | simbolo | PASS | — |
| I6 | orologio pagina (30 s da I96: il secondo vive nelle foglie useOrologio) (src/app/page.tsx) | simbolo | PASS | — |
| I6 | ora server dedotta (src/lib/minimax.ts) | simbolo | PASS | — |
| I7 | chiave storico locale (fonte unica I124, prima inline in page.tsx) (src/lib/storage-chiavi.ts) | simbolo | PASS | — |
| I124 | page.tsx consuma la chiave dalla fonte unica (nessuna duplicazione della stringa) (src/app/page.tsx) | simbolo | PASS | — |
| I7 | HistoryChart (memoizzato da I96) (src/components/history-chart.tsx) | simbolo | PASS | — |
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
| I24 | vista panoramica (memoizzata da I96) (src/components/model-table.tsx) | simbolo | PASS | — |
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
| I52 | nessuna cache delle risposte usage (fix 1004 cachato, superato da I92) — assenza richiesta (public/sw.js) | assenza | PASS | — |
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
| I59 | grafico ritmo (memoizzato da I96) (src/components/history-chart.tsx) | simbolo | PASS | — |
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
| I53 | pannello della seconda regione (solo visualizzazione; memoizzato da I96) (src/components/region-alt-panel.tsx) | simbolo | PASS | — |
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
| I49 | analizzatore fuso reset ri-creato + file campione commesso come prova grezza (205 righe: 122 del 09/10 recuperate + 83 fresche) | file | PASS | — |
| I56 | verdetto V8 «blocchi fissi UTC» su esito stabile a nome persistente | file | PASS | — |
| I56 | esiti rapidi con chiave reale commessi (V4/V5/V6, 12/10) | file | PASS | — |
| I88 | descrittore originale catturato (happy-dom window===globalThis: il delete eliminava la proprietà own PER SEMRE) (tests/lib/kiosk.test.ts) | simbolo | PASS | — |
| I88 | ripristino del descrittore in afterEach (mai delete secco) (tests/lib/kiosk.test.ts) | simbolo | PASS | — |
| I88 | secondo polluter (mock usage-events) ripristinato con afterAll (tests/lib/usage-events.test.ts) | simbolo | PASS | — |
| I88 | prova meccanista window===globalThis commessa (prima/durante/dopo) | file | PASS | — |
| I89 | ui/chart.tsx shadcn RIMOSSO (dead code 353 righe incompatibile con recharts 3, precedente I86) — nessun file deve esistere | assenza | PASS | — |
| I89 | voci tenute indietro con motivo documentato (TS 7, Prisma 7/8, eslint 10) (docs/04-stato-avanzamento.md) | simbolo | PASS | — |
| I89 | wrapper shadcn non importati tenuti indietro con motivo (upgrade con rigenerazione) (docs/04-stato-avanzamento.md) | simbolo | PASS | — |
| I90 | set-state-in-effect RIATTIVATA (niente più off in config) — assenza richiesta (eslint.config.mjs) | assenza | PASS | — |
| I90 | refs RIATTIVATA (niente più off in config) — assenza richiesta (eslint.config.mjs) | assenza | PASS | — |
| I90 | motivazione della riattivazione documentata in config (eslint.config.mjs) | simbolo | PASS | — |
| I90 | ui/carousel.tsx shadcn RIMOSSO (dead code a zero import, precedente I86) — nessun file deve esistere | assenza | PASS | — |
| I90 | hook shadcn convertito (niente setState sincrono in effect) (src/hooks/use-mobile.ts) | simbolo | PASS | — |
| I90 | mounted-guard senza setState in effect (src/components/theme-toggle.tsx) | simbolo | PASS | — |
| I90 | offset nav come misura da store esterno (src/components/section-nav.tsx) | simbolo | PASS | — |
| I90 | caricamento persisted differito a microtask (init senza setState sincroni) (src/app/page.tsx) | simbolo | PASS | — |
| I90 | ritardo scheduler come STATO (le ref non si leggono in render) (src/app/page.tsx) | simbolo | PASS | — |
| I90 | reset pivot in fase di render (coppia remoteRef+serverVersion eliminata) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I90 | reset form all'apertura con aggiustamento in render (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I90 | casi istantanei AnimatedPercent con aggiustamento in render (src/lib/ring-color.ts) | simbolo | PASS | — |
| I91 | vecchia guardia codice morto RIMOSSA da pushHistory (produceva punto finto {100,100}) — assenza richiesta (src/app/page.tsx) | assenza | PASS | — |
| I91 | punto flat «general» costruito con la funzione pura condivisa (src/app/page.tsx) | simbolo | PASS | — |
| I91 | costruzione del punto flat estratta e testabile (src/lib/model-history.ts) | simbolo | PASS | — |
| I91 | transizioni azzerate al cambio connessione (niente falsi reset eu→cn / demo→api) (src/app/page.tsx) | simbolo | PASS | — |
| I91 | disgiuntiva irraggiungibile rimossa (la risalita copre già il reset) — assenza richiesta (src/lib/rate.ts) | assenza | PASS | — |
| I91 | disgiuntiva irraggiungibile rimossa + import ripulito — assenza richiesta (src/lib/ewma.ts) | assenza | PASS | — |
| I91 | mediana condivisa (DRY: era duplicata in sampling/rate-anomalies/cycles) (src/lib/stats.ts) | simbolo | PASS | — |
| I91 | copia locale rimossa (usa lib/stats) — assenza richiesta (src/lib/sampling.ts) | assenza | PASS | — |
| I91 | copia locale rimossa (usa lib/stats) — assenza richiesta (src/lib/rate-anomalies.ts) | assenza | PASS | — |
| I91 | validazione HTTP condivisa (DRY: era duplicata in 3 routes) (src/lib/http-validate.ts) | simbolo | PASS | — |
| I91 | copia locale rimossa (usa lib/http-validate) — assenza richiesta (src/app/api/events/route.ts) | assenza | PASS | — |
| I91 | copia locale rimossa (usa lib/http-validate) — assenza richiesta (src/app/api/history/models/route.ts) | assenza | PASS | — |
| I91 | test di regressione del punto finto {100,100} (tests/lib/flat-history.test.ts) | simbolo | PASS | — |
| I92 | cache «ultimo snapshot» RIMOSSA (payload senza consumatore GET, avvelenava il fallback offline) — assenza richiesta (public/sw.js) | assenza | PASS | — |
| I92 | cache bump a v2 (attivazione elimina le voci stale mm-dash-v1) (public/sw.js) | simbolo | PASS | — |
| I92 | normalizzazione condivisa delle risposte archivio (total garantito number) (src/lib/server-response.ts) | simbolo | PASS | — |
| I92 | fetchServerHistory usa il normalizzatore (src/lib/server-history.ts) | simbolo | PASS | — |
| I92 | fetchServerHourly usa il normalizzatore (src/lib/server-history.ts) | simbolo | PASS | — |
| I92 | fetchServerEvents usa il normalizzatore (src/lib/server-events.ts) | simbolo | PASS | — |
| I92 | test di regressione del payload degradato {ok:true} senza total (tests/lib/server-response.test.ts) | simbolo | PASS | — |
| I92 | cleanup PwaRegister COMPLETO (prima: listener anonimo mai rimosso) (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I92 | listener message del SW rimosso nel cleanup (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I92 | stack shadcn toast RIMOSSO (dead code: la dashboard usa sonner) — nessun file deve esistere | assenza | PASS | — |
| I92 | hook use-toast RIMOSSO (dead code, unico consumatore era ui/toaster) — nessun file deve esistere | assenza | PASS | — |
| I92 | dipendenze morte rimosse (@radix-ui/react-toast, embla-carousel-react senza consumatori) — assenza richiesta (package.json) | assenza | PASS | — |
| I93 | GET storico: la fetta servita è la PIÙ RECENTE (era asc = più vecchi) (src/app/api/history/route.ts) | simbolo | PASS | — |
| I93 | GET storico: output restaurato cronologico dopo la selezione desc (src/app/api/history/route.ts) | simbolo | PASS | — |
| I93 | GET eventi: la fetta servita è la PIÙ RECENTE (era asc = più vecchi) (src/app/api/events/route.ts) | simbolo | PASS | — |
| I93 | GET eventi: output restaurato cronologico dopo la selezione desc (src/app/api/events/route.ts) | simbolo | PASS | — |
| I93 | findModelPoints: fetta PIÙ RECENTE (era ASC = righe più vecchie) (src/lib/server-model-history.ts) | simbolo | PASS | — |
| I93 | findModelPoints: output restaurato cronologico dopo la selezione DESC (src/lib/server-model-history.ts) | simbolo | PASS | — |
| I93 | test di regressione route-level con db mockato (query desc + output cronologico) (tests/lib/archive-recent.test.ts) | simbolo | PASS | — |
| I93 | parametro parseWindow «prefix» RIMOSSO (dead code: mai usato) — assenza richiesta (src/lib/minimax.ts) | assenza | PASS | — |
| I93 | variabile «p» RIMOSSA dal parseWindow del mirror SW (dead code, mai letta) — assenza richiesta (public/sw-shared.js) | assenza | PASS | — |
| I94 | tsconfig esclude examples/ (scaffolding non-progetto: tsc onesto su tutto il repo) (tsconfig.json) | simbolo | PASS | — |
| I94 | tsconfig esclude skills/ (scaffolding non-progetto) (tsconfig.json) | simbolo | PASS | — |
| I94 | next.config NON maschera più i tipi al build (ignoreBuildErrors rimosso) — assenza richiesta (next.config.ts) | assenza | PASS | — |
| I94 | script typecheck dichiarato in package.json (package.json) | simbolo | PASS | — |
| I94 | script audit dichiarato in package.json (package.json) | simbolo | PASS | — |
| I94 | workflow CI GitHub Actions presente | file | PASS | — |
| I94 | CI esegue il typecheck (.github/workflows/ci.yml) | simbolo | PASS | — |
| I94 | CI esegue la suite (.github/workflows/ci.yml) | simbolo | PASS | — |
| I94 | CI esegue l'audit di riconciliazione (.github/workflows/ci.yml) | simbolo | PASS | — |
| I94 | dependabot settimanale (npm + actions) presente | file | PASS | — |
| I97 | .gitignore: esiti/ ignorati (contenuto, non la directory) (.gitignore) | simbolo | PASS | — |
| I97 | .gitignore: audit-latest.md esplicitamente NON ignorato (evidenza corrente tracciata) (.gitignore) | simbolo | PASS | — |
| I97 | .gitignore: database runtime ignorato (fine dei commit DB separati, lezione I30) (.gitignore) | simbolo | PASS | — |
| I97 | entry ambigua «test» rimossa (ignorava QUALSIASI file/dir «test» nel repo) → sostituita da /test — assenza richiesta (.gitignore) | assenza | PASS | — |
| I97 | esito audit corrente tracciato con nome fisso (evidenza pubblica) | file | PASS | — |
| I97 | tool-results/ fuori dall'indice — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I97 | upload/ fuori dall'indice — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I97 | db runtime fuori dall'indice — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I97 | PNG di verifica di sessione fuori dall'indice — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I97 | esiti storici fuori dall'indice (restano su disco e nella storia git; tracciati solo audit-latest + evidenze a nome stabile I48/I54/I56/I106/I110) — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I105 | name npm coerente col progetto (era nextjs_tailwind_shadcn_ts) (package.json) | simbolo | PASS | — |
| I105 | name generico scaffolding RIMOSSO — assenza richiesta (package.json) | assenza | PASS | — |
| I105 | badge audit allineato al numero reale dei check — contatore dinamico | simbolo | PASS | — |
| I105 | contatore audit §Qualità allineato — contatore dinamico | simbolo | PASS | — |
| I105 | contatori suite §Struttura/§Qualità allineati (aggiornare a ogni aggiunta test) (README.md) | simbolo | PASS | — |
| I123 | contatore §Qualità allineato al numero reale della suite — I122 aveva aggiornato solo §Struttura lasciando §Qualità a 560/1896 (README.md) | simbolo | PASS | — |
| I123 | badge test allineato al numero reale della suite — I122 lo aveva lasciato a 560 (README.md) | simbolo | PASS | — |
| I105 | indice documentazione README completo (docs/11 incluso) (README.md) | simbolo | PASS | — |
| I105 | docs/08 presente nella tabella indice del README (README.md) | simbolo | PASS | — |
| I105 | docs/09 presente nella tabella indice del README (README.md) | simbolo | PASS | — |
| I105 | README dichiara il changelog canonico (docs/04 §8) e APP_VERSION come riferimento versione (README.md) | simbolo | PASS | — |
| I98 | helper centralizzato persistJson (unico punto di scrittura localStorage) (src/lib/persist-json.ts) | simbolo | PASS | — |
| I98 | rilevamento esplicito dell'errore di quota (alias Firefox incluso) (src/lib/persist-json.ts) | simbolo | PASS | — |
| I98 | notifica registrabile una tantum per sessione (toast + evento tecnico fuori dal modulo) (src/lib/persist-json.ts) | simbolo | PASS | — |
| I98 | page.tsx: nessun setItem diretto (tutte le scritture passano da persistJson — prima: 4 catch silenziosi) — assenza richiesta (src/app/page.tsx) | assenza | PASS | — |
| I98 | usage-events: nessun setItem diretto (prima: catch silenzioso sul registro eventi) — assenza richiesta (src/lib/usage-events.ts) | assenza | PASS | — |
| I98 | model-history: nessun setItem diretto (prima: catch silenzioso sullo storico per-modello) — assenza richiesta (src/lib/model-history.ts) | assenza | PASS | — |
| I98 | kiosk: nessun setItem diretto (sesto catch silenzioso individuato in implementazione) — assenza richiesta (src/lib/kiosk.ts) | assenza | PASS | — |
| I98 | notifier cablato in page.tsx: toast sonner + evento tecnico «error» nel registro (src/app/page.tsx) | simbolo | PASS | — |
| I98 | test con storage finto che solleva QuotaExceededError (fallback FIFO, rinuncia, notifica una tantum) | file | PASS | — |
| I100 | dilatazione ×4 a tab nascosta (pura, testata) (src/lib/backoff.ts) | simbolo | PASS | — |
| I100 | tick al ritorno in visibilità solo se dati più vecchi di metà intervallo base (src/lib/backoff.ts) | simbolo | PASS | — |
| I100 | dilatazione NON sospensione (coerenza badge/registri e verifiche V1–V6) (src/lib/backoff.ts) | simbolo | PASS | — |
| I100 | scheduler: rientro rete → tick immediato (prima: attesa backoff fino a 10 min) (src/app/page.tsx) | simbolo | PASS | — |
| I100 | scheduler: ritorno in visibilità → tick condizionato (src/app/page.tsx) | simbolo | PASS | — |
| I100 | tick immediato con reset del backoff (attempt riparte da 0) (src/app/page.tsx) | simbolo | PASS | — |
| I100 | epoch ultimo rilevamento per il tick condizionato alla visibilità (src/app/page.tsx) | simbolo | PASS | — |
| I100 | schedule applica la dilatazione ×4 a tab nascosta (src/app/page.tsx) | simbolo | PASS | — |
| I100 | Diagnostica mostra la causa dell'attesa (offline / tab nascosta; backoff già badge I51) (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I100 | test delle decisioni pure di rete/visibilità (tests/lib/backoff.test.ts) | simbolo | PASS | — |
| I101 | nuovo SW installato in attesa → stato banner (prima: SKIP_WAITING automatico silenzioso) (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I101 | niente SKIP_WAITING AUTOMATICO sul worker installing (l'attivazione è esplicita via banner) — assenza richiesta (src/components/pwa-register.tsx) | assenza | PASS | — |
| I101 | banner persistente con testo esplicito (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I101 | azione esplicita del banner (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I101 | reload SOLO quando la nuova versione prende il controllo (src/components/pwa-register.tsx) | simbolo | PASS | — |
| I101 | test componente: niente auto-skip, click → postMessage al worker in attesa (tests/components/pwa-update.test.tsx) | simbolo | PASS | — |
| I102 | skip-link come PRIMO elemento focusabile (etichetta in italiano) (src/app/layout.tsx) | simbolo | PASS | — |
| I102 | destinazione: <main id="contenuto"> (src/app/layout.tsx) | simbolo | PASS | — |
| I102 | visibile SOLO on-focus (pattern Tailwind, famiglia focus-visible I79) (src/app/layout.tsx) | simbolo | PASS | — |
| I102 | main focalizzabile programmaticamente (niente anello gigante: outline-none) (src/app/page.tsx) | simbolo | PASS | — |
| I96 | orologio condiviso a 1 Hz per le foglie vive | file | PASS | — |
| I96 | hook delle foglie vive (useSyncExternalStore, pattern I90/I100) (src/lib/orologio.ts) | simbolo | PASS | — |
| I96 | intervallo 1 Hz avviato al primo abbonato (src/lib/orologio.ts) | simbolo | PASS | — |
| I96 | timer fermato all'ultimo disiscritto (zero timer a riposo) (src/lib/orologio.ts) | simbolo | PASS | — |
| I96 | fine del tick 1 s a livello pagina — assenza richiesta (src/app/page.tsx) | assenza | PASS | — |
| I96 | orologio di pagina a MINUTO (30 s): finestra scorrevole/data/dimming/fuso (src/app/page.tsx) | simbolo | PASS | — |
| I96 | foglia viva del countdown «prossimo aggiornamento» (header) (src/app/page.tsx) | simbolo | PASS | — |
| I96 | orologio dell'header come foglia viva (1 Hz, zero render pagina) (src/components/orologio-roma.tsx) | simbolo | PASS | — |
| I96 | ora viva del footer come foglia viva (src/components/orologio-roma.tsx) | simbolo | PASS | — |
| I96 | ModelCard/MainWindows senza prop now (countdown = foglie ResetTra*/WindowDetails) — assenza richiesta (src/components/quota-cards.tsx) | assenza | PASS | — |
| I96 | PanoramicTable senza prop now (cella Reset = foglia ResetCell) — assenza richiesta (src/components/model-table.tsx) | assenza | PASS | — |
| I96 | RegionAltPanel senza prop now — assenza richiesta (src/components/region-alt-panel.tsx) | assenza | PASS | — |
| I96 | ModelCard memoizzata (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I96 | MainWindows memoizzato (src/components/quota-cards.tsx) | simbolo | PASS | — |
| I96 | PanoramicTable memoizzata (src/components/model-table.tsx) | simbolo | PASS | — |
| I96 | RegionAltPanel memoizzato (src/components/region-alt-panel.tsx) | simbolo | PASS | — |
| I96 | HistoryChart memoizzato (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | StatsPanel memoizzato (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | RateChart memoizzato (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | LongTermAnalysis memoizzata (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I96 | DiagnosticaPanel memoizzato (src/components/diagnostica-panel.tsx) | simbolo | PASS | — |
| I96 | costanti Recharts a livello modulo (props referenzialmente stabili) (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | tooltip content estratto a livello modulo (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | sonda di misura del render pagina (strumento docs/04 §3 I96) (src/app/page.tsx) | simbolo | PASS | — |
| I96 | sonda di misura del render grafico (src/components/history-chart.tsx) | simbolo | PASS | — |
| I96 | test store 1 Hz: primo abbonato, stop all'ultimo, multi-abbonato | file | PASS | — |
| I96 | strumento di misura render/min (prima 60,9 → dopo 3,7) | file | PASS | — |
| I99 | POST/DELETE dei 3 archivi: validazione, dedup upsert, cap 500, limiti GET (db mockato) | file | PASS | — |
| I99 | pattern I93: mock.module sul client Prisma + import dinamico delle route (tests/lib/api-archivi.test.ts) | simbolo | PASS | — |
| I99 | proxy /api/minimax/usage: fetch mockato (429 Retry-After, 401, 1004, fallback I18, bad_json, rete) | file | PASS | — |
| I99 | fallback I18 verificato: errore del primario + annotazione del tentativo (tests/lib/api-proxy.test.ts) | simbolo | PASS | — |
| I99 | GET /api/summary: forma KPI, archivio vuoto, read-only | file | PASS | — |
| I99 | contratti toEpoch (ms/secondi) e toFloat (clamp 0-100) | file | PASS | — |
| I99 | formati export: CSV ; + BOM + virgola decimali + quoting, JSON incapsulato | file | PASS | — |
| I99 | client storico server: merge dedup (vince locale), POST/GET/DELETE, normalizzazione I92 | file | PASS | — |
| I99 | client eventi server: scarto kind non valido, dedup id, contratti HTTP | file | PASS | — |
| I99 | medianaDi: pari/dispari/vuoto/immutabilità dell'input | file | PASS | — |
| I103 | schemi zod dei corpi API (proxy + 3 archivi) | file | PASS | — |
| I103 | proxy: apiKey trim ≥1, region eu|cn degradata a eu (contratto storico) (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I103 | punto storico normalizzato (t/interval/weekly/source/region) (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I103 | evento normalizzato (id/t/kind/model/win/message/value) (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I103 | punto per-modello LONG normalizzato (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I103 | cap batch 500 come transform (troncamento silenzioso del contratto storico) (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I103 | zod dichiarato tra le dipendenze (ora davvero usato) (package.json) | simbolo | PASS | — |
| I103 | proxy: validazione via schema (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I103 | check manuale della chiave RIMOSSO (sostituito dallo schema) — assenza richiesta (src/app/api/minimax/usage/route.ts) | assenza | PASS | — |
| I103 | archivio storico: riga normalizzata dallo schema (src/app/api/history/route.ts) | simbolo | PASS | — |
| I103 | check manuale dell'array RIMOSSO — assenza richiesta (src/app/api/history/route.ts) | assenza | PASS | — |
| I103 | archivio eventi: riga normalizzata dallo schema (src/app/api/events/route.ts) | simbolo | PASS | — |
| I103 | check manuale dell'array RIMOSSO — assenza richiesta (src/app/api/events/route.ts) | assenza | PASS | — |
| I103 | helper di validazione manuale RIMOSSO (assorbito dallo schema) — assenza richiesta (src/app/api/events/route.ts) | assenza | PASS | — |
| I103 | archivio per-modello: riga normalizzata dallo schema (src/app/api/history/models/route.ts) | simbolo | PASS | — |
| I103 | helper di validazione manuale RIMOSSO (assorbito dallo schema) — assenza richiesta (src/app/api/history/models/route.ts) | assenza | PASS | — |
| I95 | guard ADMIN_TOKEN + rate limit scritture in-memory per-IP | file | PASS | — |
| I95 | guardia composta (401/429) per le route di scrittura (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | guard attiva SOLO con env impostata (default: uso locale invariato) (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | header richiesto alle scritture quando la guard è attiva (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | confronto del token timing-safe (SHA-256) (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | IP del client (per-IP; fallback «locale») (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | budget scritture/minuto configurabile (default 120, per-istanza su serverless) (src/lib/api-protezione.ts) | simbolo | PASS | — |
| I95 | POST+DELETE storico protetti (src/app/api/history/route.ts) | simbolo | PASS | — |
| I95 | POST+DELETE eventi protetti (src/app/api/events/route.ts) | simbolo | PASS | — |
| I95 | POST+DELETE per-modello protetti (src/app/api/history/models/route.ts) | simbolo | PASS | — |
| I95 | proxy: rate limit (senza ADMIN_TOKEN: canale della chiave dell'utente) (src/app/api/minimax/usage/route.ts) | simbolo | PASS | — |
| I95 | summary read-only resta pubblica per design (I80) — assenza richiesta (src/app/api/summary/route.ts) | assenza | PASS | — |
| I95 | header nosniff su tutte le risposte (next.config.ts) | simbolo | PASS | — |
| I95 | header SAMEORIGIN (next.config.ts) | simbolo | PASS | — |
| I95 | header strict-origin-when-cross-origin (next.config.ts) | simbolo | PASS | — |
| I95 | header minima (camera/microfono/geolocalizzazione) (next.config.ts) | simbolo | PASS | — |
| I95 | CSP in report-only (prima passata senza rischi) (next.config.ts) | simbolo | PASS | — |
| I95 | HSTS solo se servito https (produzione) (next.config.ts) | simbolo | PASS | — |
| I95 | test guard (spenta/attiva/401) + rate limit (budget, finestra, per-IP, default 120) | file | PASS | — |
| I95 | accettazione route-level: DELETE → 401 senza header, 200 con header | file | PASS | — |
| I95 | header di sicurezza presenti; HSTS solo in produzione | file | PASS | — |
| I104 | next-auth RIMOSSO (zero import) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | z-ai-web-dev-sdk RIMOSSO (zero import) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | zustand RIMOSSO (zero import) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | mdxeditor RIMOSSO (zero import) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | date-fns RIMOSSO (calendar inutilizzato) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | react-hook-form RIMOSSO (form inutilizzato) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | framer-motion RIMOSSO: la premessa della decisione I104 («usato in quota-ring») era venuta meno — restava solo un commento stale, l'import era già sparito — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | radix tooltip RIMOSSO (ui/tooltip usato solo da sidebar) — assenza richiesta (package.json) | assenza | PASS | — |
| I104 | componenti ui a zero import eliminati (con la loro chiusura: skeleton/tooltip/sheet servivano solo a sidebar) — nessun file deve esistere | assenza | PASS | — |
| I104 | ui/toggle RESTAURATO: importato da toggle-group (il grep della prima stesura l'aveva scartato) (src/components/ui/toggle-group.tsx) | simbolo | PASS | — |
| I104 | commento stale framer-motion corretto (l'animazione è già CSS) (src/components/quota-ring.tsx) | simbolo | PASS | — |
| I104 | zod CONSERVATO (in uso da I103) (package.json) | simbolo | PASS | — |
| I104 | recharts conservato (grafici) (package.json) | simbolo | PASS | — |
| I106 | schema: NESSUN preview flag (dal I115 prisma 7 l'adapter è GA e obbligatorio — il flag preview è deprecato; il client accetta `adapter` nativamente) — assenza richiesta (prisma/schema.prisma) | assenza | PASS | — |
| I106 | factory: ramo portabile selezionato dall'env (modulo proprio per testabilità senza collisioni con i mock @/lib/db) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I106 | factory: token Turso opzionale (database pubblici e file: non lo richiedono) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I106 | factory: driver adapter libsql costruito con {url, authToken} (dal I115 il costruttore si chiama PrismaLibSql — era PrismaLibSQL in v6) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I106 | factory esportata per i test (il singleton è valutato una volta per processo) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I106 | shim canonico @/lib/db: le route non cambiano import (contratto I106) (src/lib/db.ts) | simbolo | PASS | — |
| I106 | dipendenza driver adapter (dal I115 major 7 allineata a Prisma 7 — la v6 non è più compatibile col client generato) (package.json) | simbolo | PASS | — |
| I106 | dipendenza client libsql (dal I115 range richiesto dall'adapter 7: ^0.17 → 0.18) (package.json) | simbolo | PASS | — |
| I106 | push schema su Turso: SDL via migrate diff + esecuzione via client libsql (idempotente, token mai stampato) | file | PASS | — |
| I106 | ciclo accettazione adapter: scrivi→leggi→dedup→SQL raw su db temporaneo; read-only su Turso reale | file | PASS | — |
| I106 | test factory env-driven (mock costruttori con cattura argomenti, igiene env con delete) | file | PASS | — |
| I106 | esito verifica I106 tracciato con nome fisso (evidenza pubblica, eccezione .gitignore) | file | PASS | — |
| I106 | README documenta le env del deployment persistente (Vercel + Turso) (README.md) | simbolo | PASS | — |
| I106 | README dichiara la persistenza portabile (SQLite in locale, Turso su Vercel) (README.md) | simbolo | PASS | — |
| I107 | route diagnostica persistenza (modalità, host sanificato, test connessione, conteggi) | file | PASS | — |
| I107 | endpoint SOLO GET (read-only: fuori dalla guardia I95, non altera nulla) (src/app/api/persistenza/route.ts) | simbolo | PASS | — |
| I107 | nessuna mutazione: l'endpoint non espone POST/DELETE/PUT/PATCH — assenza richiesta (src/app/api/persistenza/route.ts) | assenza | PASS | — |
| I107 | host ridotto all'hostname: userinfo/porta/percorso/query scartati (il token non attraversa mai la risposta) (src/app/api/persistenza/route.ts) | simbolo | PASS | — |
| I107 | test di connessione reale sul motore attivo con latenza misurata (src/app/api/persistenza/route.ts) | simbolo | PASS | — |
| I107 | modalità dal MODULO PROPRIO (il shim @/lib/db resta { db } per i mock di processo I99/I95 — bun applica il primo mock per specificatore) (src/app/api/persistenza/route.ts) | simbolo | PASS | — |
| I107 | regola ambiente→modalità in unità pura separata (solo TURSO_DATABASE_URL decide, token da solo non basta) | file | PASS | — |
| I107 | ri-esportazione dalla factory: superficie pubblica stabile per lo shim db.ts e i test I106 (I107-fix: multi-riga con urlPersistenzaLocale) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I107 | I107-fix: URL SEMPRE esplicito via urlPersistenzaLocale() — fino a I114 viaggiava in datasourceUrl, dal I115 (prisma 7: opzione rimossa) nella config dell'adapter (senza URL esplicito il vecchio client nativo esigeva env("DATABASE_URL") dallo schema e il primo $queryRaw esplodeva in ambienti senza .env) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I107 | I107-fix: URL effettivo del ramo locale (DATABASE_URL o default assoluto db/custom.db dal CWD — dal I115 l'URL file: è consumato dal driver libsql, che risolve i relativi contro il CWD; il default assoluto è corretto sotto entrambe le semantiche) (src/lib/modalita-persistenza.ts) | simbolo | PASS | — |
| I107 | pannello nel tab Dati: modalità attiva, host, test connessione, conteggi (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I107 | il pannello consuma l'endpoint di diagnostica (fetch all'apertura + bottone Aggiorna) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I107 | badge modalità attiva distinto per ramo turso/locale (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I107 | contratto route: forma, modalità env-driven, segreti MAI nella risposta, 500 db_read | file | PASS | — |
| I107 | test componente pannello: stati dati/errore, it-IT, ricarica manuale | file | PASS | — |
| I107 | README documenta l'endpoint e il pannello Impostazioni→Dati → Persistenza server (README.md) | simbolo | PASS | — |
| I107 | I107-fix2: con VERCEL=1 il default NON va nel CWD read-only ma in tmpdir()/db/custom.db (report utente: «Error code 14: Unable to open the database file» — SQLITE_CANTOPEN su Vercel, filesystem read-only) (src/lib/modalita-persistenza.ts) | simbolo | PASS | — |
| I107 | I107-fix2: la factory prepara la directory padre degli URL file: ASSOLUTI (SQLite NON crea le cartelle: clone fresco senza db/ e Vercel senza env esplodevano al primo $queryRaw; i percorsi relativi restano a Prisma) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I107 | I107-fix2: nel ramo locale il pannello dichiara l'effimero del file su serverless (ogni istanza parte vuota — la durata richiede TURSO_DATABASE_URL) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I107 | schema INCORPORATO nel codice: DDL idempotente delle 5 tabelle + preparaSchema (gate con cache WeakMap) | file | PASS | — |
| I107 | DDL idempotente: riavvii, hot-reload e istanze concorrenti non si disturbano (no-op su tabelle esistenti) (src/lib/schema-persistenza.ts) | simbolo | PASS | — |
| I107 | il DDL incorporato copre le 4 tabelle dello schema Prisma (l'esattezza è presidiata dal test anti-drift su prisma migrate diff) (src/lib/schema-persistenza.ts) | simbolo | PASS | — |
| I107 | I107-fix3: ENTRAMBE le branche (nativa e adapter) garantiscono lo schema all'avvio — un DB fresco (file /tmp su Vercel, Turso appena creato) funziona senza db:push né db-push-turso.mjs (src/lib/db-factory.ts) | simbolo | PASS | — |
| I107 | I107-fix3: la route attende il gate del bootstrap prima dei conteggi (determinismo al primo colpo su DB fresco) (src/app/api/persistenza/route.ts) | simbolo | PASS | — |
| I107 | e2e motore reale su file vuoto + anti-drift DDL vs prisma migrate diff + semantica gate (il file gira PRIMA di db.test.ts in ordine alfabetico: client reale, non mockato) | file | PASS | — |
| I107 | I107-fix4: le GET/POST/DELETE attendono il gate del bootstrap DDL prima di toccare il DB (report utente: 500 su /api/events, /api/history e /api/history/models su Vercel — la factory lancia il DDL fire-and-forget e solo /api/persistenza lo attendeva) (src/app/api/events/route.ts) | simbolo | PASS | — |
| I107 | I107-fix4: gate su POST + DELETE + GET prima della diramazione granularity (copre punti grezzi E bucket orari) (src/app/api/history/route.ts) | simbolo | PASS | — |
| I107 | I107-fix4: gate su GET/POST/DELETE — anche l'SQL raw della lib I42 parte solo a schema pronto (import db aggiunto: la rotta non lo importava, passava dalla lib) (src/app/api/history/models/route.ts) | simbolo | PASS | — |
| I107 | I107-fix4: anche la sintesi KPI read-only attende il gate (stessa classe di guasto) (src/app/api/summary/route.ts) | simbolo | PASS | — |
| I107 | I107-fix4: il bootstrap è RIPROVATO a passate intere — all'avvio freddo il motore rifiuta i primi DDL («Engine is not yet connected», «Response from the Engine was empty») e senza riprove lo schema restava parziale per l'intera vita dell'istanza (probe verifica-i107-fix4-gate.mjs: 0/8 senza gate, 8/8 col gate) (src/lib/schema-persistenza.ts) | simbolo | PASS | — |
| I107 | route-level: ogni handler delle 4 rotte tocca il DB solo dopo il gate (primo accesso dati a schema completo; per la rotta per-modello asserzione al livello gate — il binding del lib dipende dall'ordine dei file di bun, non alfabetico) | file | PASS | — |
| I110 | probe di attivazione via FACTORY REALE di produzione (creaPrismaClient + preparaSchema + round-trip Prisma) — non un client libsql parallelo: ciò che si verifica è la stessa via del runtime (scripts/verifiche/verifica-i110-turso-attivo.ts) | simbolo | PASS | — |
| I110 | evidenza a nome fisso dell'attivazione (7 passi: selezione ambiente, client, DDL incorporato sul cloud, SELECT 1, conteggi, round-trip, idempotenza — host sanificato, token MAI stampato) | file | PASS | — |
| I110 | segreti fuori dall'indice: .env è gitignored e le credenziali (TURSO_*, DATABASE_URL, chiavi) restano SOLO nell'ambiente (header db-factory.ts, README §Persistenza) — il commit dd03d16 dell'utente l'aveva aggiunto con git add -f e in CI rompeva anche la suite: bun auto-carica il .env e il test I106 «env assente» vedeva l'adapter Turso — nessun file tracciato deve corrispondere | assenza | PASS | — |
| I110 | suite indipendente dall'ambiente: baseline DICHIARATO (chiavi cancellate all'avvio e a ogni beforeEach), lo stato ambientale (.env incluso) ripristinato solo nell'afterAll — mai assumere lo stato del processo (tests/lib/db.test.ts) | simbolo | PASS | — |
| I111 | lib manutenzione (unità pura, pattern I106/I107): misura storage PRAGMA, statistiche tabelle, integrità, ritenuta da ambiente con clamp, valutazione quota, proiezione scritture, pulizia con dryRun, VACUUM onesto, orchestratore | file | PASS | — |
| I111 | limiti del free tier Turso come costante verificabile (5 GiB / 500M read / 10M write / 100 database — fonti datate in docs/10 §2) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I111 | confronti temporali DUALI — INTEGER (motore Prisma, epoch ms) e TEXT (SQL raw I42, ISO 8601): il bug della prima stesura, beccato dalla suite e2e, non può tornare (probe-i111-datetime.ts, docs/10 §4) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I111 | procedure complete: limiti free tier con fonti (§2), architettura (§3), due codifiche DateTime (§4), procedure P1–P6 (§5), configurazione env (§6), runbook (§7), verifiche (§8), stime e onestà (§9) | file | PASS | — |
| I111 | GET rapporto read-only senza chiave + POST azioni protette (pulizia | vacuum | manutenzione) | file | PASS | — |
| I111 | gate dello schema I107-fix4 anche sulle rotte di manutenzione: nessuna misura o scrittura parte a schema incompleto (src/app/api/manutenzione/route.ts) | simbolo | PASS | — |
| I111 | il GET NON scrive nulla: nessuna pulizia e vacuum disattivato nel rapporto read-only (dimostrato dalla suite) (src/app/api/manutenzione/route.ts) | simbolo | PASS | — |
| I111 | POST sotto la guardia I95 (ADMIN_TOKEN timing-safe + rate limit scritture) — qui la guardia conta doppio: le azioni cancellano righe (src/app/api/manutenzione/route.ts) | simbolo | PASS | — |
| I111 | cron notturno autenticato: senza env → 403 ONESTO (un endpoint che cancella non si apre mai al pubblico), Bearer sbagliato → 401 timing-safe, kill-switch MANUTENZIONE_AUTO_PULIZIA=0 (src/app/api/manutenzione/cron/route.ts) | simbolo | PASS | — |
| I111 | cron programmato 02:30 UTC ogni giorno (vercel.json §crons): pulizia e verifica anche a traffico zero (vercel.json) | simbolo | PASS | — |
| I111 | validazione zod dell'azione di manutenzione (I103: niente check manuali sparsi) (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I111 | suite lib: funzioni pure + client finto (dryRun zero DELETE, VACUUM onesto, orchestratore) + e2e su file con ENTRAMBE le codifiche DateTime, cap FIFO e idempotenza (tests/lib/database-manutenzione.test.ts) | simbolo | PASS | — |
| I111 | contratti route: GET read-only dimostrato (zero $executeRaw), zod 400, guard 401, tre azioni, cron 403/401/200 con kill-switch | file | PASS | — |
| I111 | probe empirica delle due codifiche DateTime nel database (motore Prisma INTEGER vs SQL raw TEXT) e del confronto duale corretto | file | PASS | — |
| I112 | procedura P7: le stesse procedure sul file SQLite locale — cosa è identico (PRAGMA, statistiche, quick_check, ritenuta+cap, quota), differenze oneste (VACUUM nativo funziona e recupera byte; soglie quota adattabili) e commutazione via .env (docs/10-manutenzione-database.md) | simbolo | PASS | — |
| I112 | soglie di quota adattabili al disco locale: il tetto del free tier Turso diventa un limite scelto dall'utente sul file locale (clamp §6) (docs/10-manutenzione-database.md) | simbolo | PASS | — |
| I112 | README §Persistenza dichiara la copertura locale delle procedure di manutenzione (modalita locale, VACUUM nativo, commutazione) (README.md) | simbolo | PASS | — |
| I113 | tabella «Regole del piano» senza più l'ipotesi rolling (smentita V8: blocchi fissi UTC) — assenza richiesta (README.md) | assenza | PASS | — |
| I113 | regole README allineate al verdetto V8 (inizio = confine di griglia, non primo utilizzo) (README.md) | simbolo | PASS | — |
| I113 | nota correttiva in §7: le regole ufficiali rolling restano CITAZIONE con smentita empirica e rimando al verdetto (docs/02 §5, esiti v8) (docs/01-api-minimax-ricerca.md) | simbolo | PASS | — |
| I113 | casi limite §7 allineati: lo start del blocco successivo è prevedibile (confine di griglia, V8) — assenza richiesta (docs/02-analisi-json-quota.md) | assenza | PASS | — |
| I113 | caso limite §9 «subito dopo il reset senza uso» chiuso con V3/V8 — assenza richiesta (docs/02-analisi-json-quota.md) | assenza | PASS | — |
| I113 | R11 chiusa dall'evidenza V8: nessun rimando a V3 come aperta — assenza richiesta (docs/04-stato-avanzamento.md) | assenza | PASS | — |
| I113 | apertura §7 «primo utilizzo previsto» risolta per obsolescenza (blocchi fissi UTC) — assenza richiesta (docs/04-stato-avanzamento.md) | assenza | PASS | — |
| I114 | eslint 10 adottato (9→10.13.0 verificato empiricamente con lint exit 0 reale; peer eslint-config-next >=9 accetta 10) (package.json) | simbolo | PASS | — |
| I114 | typescript resta su 5.9.x: TS 7.0 rifiutato da typescript-eslint (rompe il gate lint) — rivalutare quando supporterà TS >=7.1 (issue typescript-eslint #10940) (package.json) | simbolo | PASS | — |
| I114 | inventario dipendenze dichiarato↔installato dal bun.lock (strumento dell'audit dipendenze) | file | PASS | — |
| I115 | prisma 7 adottato (chiude la catena di produzione deepmerge-ts/defu via @prisma/config 7.10.1: deepmerge-ts 8.0.2 fissato — bun audit 25→2 nel I114 → 1 residua dev-only) (package.json) | simbolo | PASS | — |
| I115 | @libsql/client 0.18 (range richiesto dall'adapter 7: ^0.17 — i due major sono ACCOPPIATI) (package.json) | simbolo | PASS | — |
| I115 | schema senza URL nel datasource (prisma 7: P1012 — l'URL vive in prisma.config.ts per il CLI, nella config dell'adapter per il client) — assenza richiesta (prisma/schema.prisma) | assenza | PASS | — |
| I115 | config CLI prisma 7 (defineConfig: schema + datasource per i comandi migrate/db push) | file | PASS | — |
| I115 | config CLI con l'API prisma/config (defineConfig) (prisma.config.ts) | simbolo | PASS | — |
| I115 | nessun ricorso all'opzione RIMOSSA dal client 7 (entrambi i rami passano dall'adapter PrismaLibSql — anche il file: locale, stesso dialetto SQLite) — assenza richiesta (src/lib/db-factory.ts) | assenza | PASS | — |
| I115 | anti-drift sul flag CLI 7 (--to-schema: --to-schema-datamodel è stato rimosso) (tests/lib/database-schema.test.ts) | simbolo | PASS | — |
| I116 | build rigenera SEMPRE il client prima di next build (prisma 7 ha rimosso l'auto-generate del postinstall della dipendenza: su Vercel il node_modules ripristinato dalla build cache portava un .prisma/client stantio dell'era prisma 6 — richiedeva @prisma/client/runtime/library.js, eliminato in v7 — e la raccolta configurazione delle route falliva; riprodotto localmente con lo STESSO errore «Failed to load external module @prisma/client-<hash>: Cannot find module …/runtime/library.js» e fix verificato dallo stesso stato avvelenato: exit 0) (package.json) | simbolo | PASS | — |
| I116 | postinstall rigenera il client a ogni install (v7 non lo fa più in automatico: fresh clone e ambienti freddi hanno il client pronto per dev/test senza passi manuali) (package.json) | simbolo | PASS | — |
| I116 | CI conserva lo step esplicito di generazione (difesa in profondità: il client è fresco prima di tsc/test anche se postinstall venisse saltato) (.github/workflows/ci.yml) | simbolo | PASS | — |
| I117 | 5ª tabella nello schema: il registro delle esecuzioni (cron notturno + azione POST «manutenzione») — la prova DURATURA che il cron è passato, indipendente dalla breve retention dei log Vercel (l'esattezza del DDL è presidiata dal test anti-drift su prisma migrate diff) (prisma/schema.prisma) | simbolo | PASS | — |
| I117 | DDL della 5ª tabella incorporato nel gate I107-fix3 (IF NOT EXISTS: bootstrap idempotente anche sui DB esistenti — nessuna migrazione) (src/lib/schema-persistenza.ts) | simbolo | PASS | — |
| I117 | scrittura del registro BEST-EFFORT per contratto: non lancia mai — un problema del registro non maschera l'esito reale della manutenzione (risultato dichiarato registrato/errore) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I117 | lettura robusta: righe malformate SALTATE (mai presentate come dati validi), dettaglio JSON parsato o { grezzo }, LIMIT parametrizzato e clampato (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I117 | cap FIFO del registro applicato ALLA SCRITTURA: il registro non può crescere senza limite (100 righe ≈ oltre 3 mesi di run notturni) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I117 | il cron registra OGNI ciclo — riuscito E fallito (best-effort: se il DB rifiuta anche l'INSERT la riga manca onestamente e resta il console.error) (src/app/api/manutenzione/cron/route.ts) | simbolo | PASS | — |
| I117 | riga compatta nei runtime logs a ogni ciclo (esito, durata, bytes, quota, integrità, eliminati, vacuum, registro): nei log Vercel l'esito non è più solo lo status code (src/app/api/manutenzione/cron/route.ts) | simbolo | PASS | — |
| I117 | il GET read-only espone «ultimeEsecuzioni»: verifica del cron interrogabile in qualsiasi momento (solo SELECT — resta read-only, dimostrato dalla suite) (src/app/api/manutenzione/route.ts) | simbolo | PASS | — |
| I117 | suite lib: INSERT parametrizzato, mai un lancio, cap FIFO alla scrittura, mappa robusta + e2e motore reale in processo figlio (verifica-i117-registro-reale.ts) (tests/lib/database-manutenzione.test.ts) | simbolo | PASS | — |
| I117 | contratti route: cron e POST «manutenzione» si registrano (innesco cron/post nei parametri), azioni parziali NO, GET espone ultimeEsecuzioni (tests/lib/api-manutenzione.test.ts) | simbolo | PASS | — |
| I117 | e2e motore reale su file temporaneo: roundtrip registra/leggi, cap FIFO che riporta ESATTAMENTE a REGISTRO_CAP, ordine id DESC (lezione I111 estesa alla lettura: la colonna DATETIME può tornare come Date dal driver) | file | PASS | — |
| I117 | procedura P8 documentata: come verificare il cron a distanza di settimane (GET /api/manutenzione → ultimeEsecuzioni; console.log [manutenzione-cron] nei runtime logs) (docs/10-manutenzione-database.md) | simbolo | PASS | — |
| I118 | pannello nel tab Dati (sotto Persistenza server): la visualizzazione NELL'APP del registro delle esecuzioni — la prova duratura del cron leggibile senza curl né runtime logs (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I118 | il pannello consuma GET /api/manutenzione (SOLO LETTURA, stesso perimetro pubblico di /api/persistenza) e rende le righe del registro: innesco, esito, durata, istante, dettaglio (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I118 | specchio CLIENT di formattaBytes (manutenzione-db.ts è codice server: importarlo trascinerebbe prisma nel bundle del browser) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I118 | stato vuoto ONESTO con la spiegazione di chi popola il registro (cron notturno + azione «manutenzione») — nessuna riga finta (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I118 | due bottoni «Aggiorna» disambiguati per gli screen reader (persistenza vs registro) — pannelli con stati INDIPENDENTI (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I118 | mock instradato per URL: all'apertura del dialogo convivono DUE fetch (persistenza + manutenzione) con fixture dedicate (tests/components/settings-persistenza.test.tsx) | simbolo | PASS | — |
| I118 | test di componente dedicato: righe renderizzate, errore del motore nella riga fallita, registro vuoto onesto, errore API senza mascherare l'altro pannello, «Aggiorna registro» indipendente + helper puri verificati | file | PASS | — |
| I118 | docs/10 aggiornato: la visualizzazione nell'app è la prima via di verifica del registro (P8) (docs/10-manutenzione-database.md) | simbolo | PASS | — |
| I119 | fingerprinting X-Powered-By DISATTIVATO (default Next attivo: rivelava la tecnologia del server a chiunque mappi le superfici d'attacco) (next.config.ts) | simbolo | PASS | — |
| I119 | regola PURA ambiente→log Prisma: produzione = warn/error (nessun query log con i parametri nei runtime logs), dev/test = query come prima — stessa famiglia di modalitaPersistenza/urlPersistenzaLocale (src/lib/modalita-persistenza.ts) | simbolo | PASS | — |
| I119 | la factory NON logga più le query in produzione (fino a I119 `log: ["query"]` era sempre attivo: ogni query con i valori dei parametri finiva nei log della piattaforma — noise, esposizione di stringhe inserite dagli utenti, overhead) (src/lib/db-factory.ts) | simbolo | PASS | — |
| I119 | contratto del livello log testato su env INIETTABILE (produzione/dev/test/assente + purezza senza side-effect su process.env) (tests/lib/db-log-livello.test.ts) | simbolo | PASS | — |
| I119 | la disattivazione dell'header è presidiata dal test di configurazione (non solo dalla memoria) (tests/lib/header-sicurezza.test.ts) | simbolo | PASS | — |
| I119 | avvertimento SSRF sul blocco @transform_port_query (?XTransformPort= porta localhost arbitraria): accettabile SOLO in rete fidata di sviluppo — in self-hosting pubblico va rimosso (produzione Vercel non usa Caddy) (Caddyfile) | simbolo | PASS | — |
| I119 | report dell'audit sicurezza completo: metodologia (ricognizione, caccia ai segreti, injection, auth/authz, DoS, crypto, dipendenze, configurazioni), 16 voci di analisi con gravità, remediation applicate (poweredByHeader, log Prisma, Caddyfile), rischi RESIDUI con azioni utente (rotazione token Turso della storia git dd03d16, ADMIN_TOKEN/CRON_SECRET su Vercel, CSP enforcing futuro) | file | PASS | — |
| I120 | token admin client: storage mm-dash-admin-token-v1 (come la chiave MiniMax, mai nel codice/log), headerAdmin SSR-safe, sonda di identità classificata (401 rifiutato / 400-429 accettato) — chiude docs/11 §5.2: impostare ADMIN_TOKEN sul server NON rompe più la replica browser→server | file | PASS | — |
| I120 | header PURA da token ({} se assente: scritture identiche a prima del I120) (src/lib/admin-token.ts) | simbolo | PASS | — |
| I120 | classificazione PURA dell'esito della sonda (401 PRIMA del rate limit → 429 implica identità accettata) (src/lib/admin-token.ts) | simbolo | PASS | — |
| I120 | replica storico: header admin su POST e DELETE (src/lib/server-history.ts) | simbolo | PASS | — |
| I120 | replica eventi: header admin su POST e DELETE (src/lib/server-events.ts) | simbolo | PASS | — |
| I120 | replica per-modello: header admin su POST e DELETE (src/lib/model-history.ts) | simbolo | PASS | — |
| I120 | sezione nel tab Dati: campo password con mostra/nascondi, salva/rimuovi IMMEDIATI (fuori dal «Salva» del dialogo), sonda col server (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I120 | la sonda usa un'azione inesistente: il body è rifiutato con 400 DOPO la guardia — nessuna scrittura sul database (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I120 | contratto di rete: le 6 scritture degli archivi allegano l'header SOLO con token salvato, invariate senza (tests/lib/admin-token-scritture.test.ts) | simbolo | PASS | — |
| I120 | test di componente della sezione: campo dal localStorage, salvataggio immediato, mostra/nascondi, sonda 400/401 con header e body verificati, rimozione | file | PASS | — |
| I121 | la POST /api/minimax/usage allega x-admin-token: la guardia I95 protegge ANCHE la POST proxy (api-protezione.ts: «POST/DELETE degli archivi, POST proxy») — con ADMIN_TOKEN attivo il refresh non fallisce più con 401 «Scrittura protetta» (bug riportato dall'utente a I120 attivo) (src/app/page.tsx) | simbolo | PASS | — |
| I121 | perimetro fissato: verifica statica che la fetch del proxy in page.tsx allega ...headerAdmin() — sette scritture protette, zero eccezioni (tests/lib/admin-token-scritture.test.ts) | simbolo | PASS | — |
| I122 | DELETE selettivo source=demo con backup PRIMA del DELETE (righe nella risposta) e dryRun (conteggio senza cancellare) — i punti demo replicati generano falsi reset nelle analisi (12/12 marker di produzione falsi, verificati 17/10) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I122 | cap del backup restituito (500): oltre il cap il backup è PARZIALE ma il DELETE resta totale (troncato: true dichiara) (src/lib/manutenzione-db.ts) | simbolo | PASS | — |
| I122 | schema zod azione estesa: rimuovi-demo nel contratto POST /api/manutenzione, dryRun booleano opzionale (src/lib/api-schemi.ts) | simbolo | PASS | — |
| I122 | dispatch POST «rimuovi-demo» nella route protetta I95 (guard ADMIN_TOKEN + rate limit scritture), risposta completa con rimozione+backup (src/app/api/manutenzione/route.ts) | simbolo | PASS | — |
| I122 | semantica su client finto: dryRun ZERO DELETE, backup PRIMA del DELETE, DELETE parametrizzato su source=demo, cap/troncato, client senza superficie SQL → errore (tests/lib/database-manutenzione.test.ts) | simbolo | PASS | — |
| I122 | contratto route: dryRun 200 senza scritture, reale con DELETE parametrizzato + backup, dryRun non-booleano → 400 (tests/lib/api-manutenzione.test.ts) | simbolo | PASS | — |
| I122 | e2e motore reale in processo figlio: dryRun non cancella, reale con backup completo, restano SOLO i punti reali, idempotenza (scripts/verifiche/verifica-i111-motore-reale.ts) | simbolo | PASS | — |
| I123 | cleanup esplicito tra i test (pattern I79) anche nell'ultimo file che ne era rimasto privo: il residuo «—» dei render dei file precedenti rompeva getByText("—") (I81 N/D) a seconda dell'ordine di discovery di bun (tests/components/quota-ring.test.tsx) | simbolo | PASS | — |
| I123 | PRESIDIO anti-ordine: OGNI file di test in tests/components/* usa la cleanup esplicita — il document happy-dom è condiviso in-process e la auto-cleanup di testing-library non è attiva in bun (il pattern I79 diventa obbligatorio e verificato) | presidio | PASS | — |
| I124 | segmentazione a finestre ufficiali: blocchi orari fissi UTC 00/05/10/15/20 semantica cron (verdetto V8) per «interval», settimane lunedì 00:00 UTC per «weekly»; il ciclo si chiude al reset ufficiale anche senza campioni successivi (le finestre proseguono il conteggio lato MiniMax) (src/lib/cycles.ts) | simbolo | PASS | — |
| I124 | esclusione dei punti demo dalle analisi (proposal (a) del task 69); i punti senza marca legacy restano inclusi e documentati (src/lib/cycles.ts) | simbolo | PASS | — |
| I124 | allineamento ai blocchi orari fissi 00/05/10/15/20 UTC di ogni giorno con fineFinestra5h (discriminatori di produzione: confine 15:00 UTC del 19/10 e reset 20:00 UTC del venerdì 16/10 — la griglia epoch è refutata e presidianta nei test) (src/lib/cycles.ts) | simbolo | PASS | — |
| I124 | allineamento settimane a lunedì 00:00 UTC (finestra a livello di piano; conferma produzione 46% domenica 18/10 → 92% lunedì 19/10) (src/lib/cycles.ts) | simbolo | PASS | — |
| I124 | la serie d'analisi del pannello esclude i punti demo prima di OGNI analisi (cicli, per giorno, heatmap, calendario, distribuzione, oggi vs media) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I124 | cicli «interval» di general a finestre ufficiali; gli altri modelli restano sull'euristica (cadenza breve non verificata per modello — inventare un allineamento produrrebbe cicli sbagliati plausibili) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I124 | colonna «Reset finestra» in tabella: il momento ufficiale del reset di ogni ciclo (il PROSSIMO reset per quello in corso) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I124 | fasce e marker «reset» del grafico al confine di finestra ufficiale (momento vero del reset, anche dentro un buco di campionamento); fallback sull'intera serie in modalità demo (src/components/history-chart.tsx) | simbolo | PASS | — |
| I124 | il report stampabile esclude i punti demo fuori dalla modalità demo e segmenta i cicli a finestre ufficiali (src/components/print-report.tsx) | simbolo | PASS | — |
| I124 | svuotamento dello storico locale (flat + per-modello) da fonte unica delle chiavi: la via per eliminare i punti demo legacy pre-I124, privi della marca source (src/lib/storage-chiavi.ts) | simbolo | PASS | — |
| I124 | azione «Svuota storico locale» nel tab Dati: conferma esplicita con promessa esplicita (punti server NON toccati, riscaricati al prossimo avvio) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I124 | la marca d'origine dello snapshot segue il punto flat (localStorage + replica server) (src/app/page.tsx) | simbolo | PASS | — |
| I124 | anche i backfill demo (flat e per-modello) sono marcati: da I124 nessun nuovo punto demo senza marca (src/lib/demo.ts) | simbolo | PASS | — |
| I124 | la source dei punti server (api/demo/import) passa al HistoryPoint (src/lib/server-history.ts) | simbolo | PASS | — |
| I124 | lo storico per-modello replica la marca d'origine lungo tutta la catena (ModelSample → ModelHistoryPoint → HistoryPoint) (src/lib/model-history.ts) | simbolo | PASS | — |
| I124 | i casi di test replicano i dati reali di produzione (confine 15:00 UTC 17→96; settimanale 46→92 al lunedì 00 UTC; chiusura al reset senza campioni successivi) (tests/lib/cycles-finestre.test.ts) | simbolo | PASS | — |
| I125 | la finestra breve demo è il BLOCCO FISSO corrente UTC {00,05,10,15,20} (verdetto V8) — non più rolling «3,2h fa»: il reset a confine è ora visibile in demo come sul server reale (src/lib/demo.ts) | simbolo | PASS | — |
| I125 | la fine della finestra breve demo è il confine del blocco successivo (durata reale 5h, 4h nell'ultimo blocco del giorno) (src/lib/demo.ts) | simbolo | PASS | — |
| I125 | la finestra settimanale demo è la settimana corrente da lunedì 00:00 UTC, condivisa tra i modelli (chiude la differenza dichiarata G9 della matrice I48) (src/lib/demo.ts) | simbolo | PASS | — |
| I125 | le percentuali demo sono clampate in [0,100]: l'API non sfora mai, nemmeno il jitter deve farlo (src/lib/demo.ts) | simbolo | PASS | — |
| I125 | lo storico demo simula ogni punto dentro la SUA finestra (ancoraggio per punto): il grafico dimostrativo mostra i reset ai confini come la serie reale (src/lib/demo.ts) | simbolo | PASS | — |
| I125 | test di fedeltà demo con istanti deterministici 19–20/10/2026 (blocco pieno, ultimo blocco 4h reali, post-reset settimanale, salto al confine) (tests/lib/demo-finestre.test.ts) | simbolo | PASS | — |
| I125 | matrice I48 con la NUOVA riga G13 (finestra breve = blocco fisso UTC) e la riga G9 CHIUSA (settimanale allineata, ora fedele) (scripts/verifiche/verifica-i48-demo-vs-api.ts) | simbolo | PASS | — |
| I125 | quadro ufficiale ri-verificato in tempo reale (20/10/2026): tier 1×/3×/7,5×, modelli per tier, endpoint confermato, NESSUNO schema JSON ufficiale (docs/02 resta il riferimento de-facto), tensione «rolling» ufficiale vs V8 presidiata (docs/02-analisi-json-quota.md) | simbolo | PASS | — |
| I125 | racconto dell'ancoraggio demo (G9 chiusa, G13 nuova) con l'esito della matrice ri-eseguita (docs/01-api-minimax-ricerca.md) | simbolo | PASS | — |
| I125 | la nota §7 distingue la CITAZIONE delle docs ufficiali (rolling) dal comportamento verificato (blocchi V8) con la data della verifica documentale (docs/01-api-minimax-ricerca.md) | simbolo | PASS | — |
| I126 | il default NON è più la demo: il primo avvio senza chiave mostra la needsSetup card — chiusa lato client la causa radice dei burst demo post-deploy (task 69/I122) (src/components/settings-dialog.tsx) | simbolo | PASS | — |
| I126 | handleSave non forza più la demo quando la chiave è vuota: la scelta dell'utente viene salvata così com'è (il caso api-senza-chiave è della needsSetup card e del guard fetchData) — assenza richiesta (src/components/settings-dialog.tsx) | assenza | PASS | — |
| I126 | needsSetup gated su mounted: SSR e primo render mostrano lo skeleton — nessun flash della card di setup per gli utenti di ritorno con impostazioni salvate (src/app/page.tsx) | simbolo | PASS | — |
| I126 | l'effetto connessione non chiama fetchData (e non apre il dialog via guard) senza demo né chiave: il primo fetch parte al salvataggio, quando connKey cambia (src/app/page.tsx) | simbolo | PASS | — |
| I126 | test di componente dell'opt-in: default FALSE, switch spento, salvataggio senza chiave rispettato, opt-in esplicito funzionante, chiave trimmata (mock completo a livello di contratto — lezione bombe d'ordine) | file | PASS | — |
| I127 | soglia di onestà statistica della strip Prevedibilità: sotto 7 cicli completati l'indice resta calcolato ma viene dichiarato fragile (σ dominata dai singoli valori + durate = limiti inferiori con campionamento sparso) (src/lib/cycles.ts) | simbolo | PASS | — |
| I127 | la strip Prevedibilità mostra il caveat «campione ridotto (indice fragile)» quando n < soglia — onestà statistica sull'indice 26/100 osservato in produzione con 4 cicli (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I127 | ritmo della FINESTRA CORRENTE (blocco fisso UTC corrente per la 5h, settimana corrente da lunedì 00 UTC per la settimanale — stesso allineamento V8): la proiezione non usa più la sola media di lungo periodo che include le ore di inattività (+0.37 %/h di produzione mentre la sessione bruciava al 18-36 %/h) (src/components/history-chart.tsx) | simbolo | PASS | — |
| I127 | verdetto d'esaurimento e pace dichiarano SEMPRE la base della proiezione (sessione quando ci sono ≥2 rilevamenti nella finestra attiva, lungo periodo altrimenti) (src/components/history-chart.tsx) | simbolo | PASS | — |
| I127 | il trend di sessione è calcolato memoizzato e passato a StatsPanel sia nella vista principale sia nel kiosk (src/app/page.tsx) | simbolo | PASS | — |
| I127 | test della base di sessione: solo punti del blocco UTC corrente, null con <2 punti (i vecchi NON rientrano), confine inclusivo, settimanale da lunedì 00 UTC, consumo nullo, verdetto/pace con etichetta base, fallback dichiarato sul trend lungo | file | PASS | — |
| I128 | serie cumulativa dell'indice di regolarità (k = 3..n cicli completati, ricalcolo con la STESSA formula di prevedibilitaCicli) con ultimo Δ e salto massimo: dà il CONTESTO del caveat «campione ridotto» (I127) — non basta dichiarare la fragilità statistica (indice 26 con 4 cicli in produzione, task 76), va mostrata come si è mossa la lettura al crescere del campione (src/lib/cycles.ts) | simbolo | PASS | — |
| I128 | la strip Prevedibilità mostra il percorso dell'indice (chip n→indice, ultimi 8 punti, colori delle soglie 70/40) con ultimo Δ colorato e salti max quando ci sono ≥2 punti — con un solo punto (n=3) non c'è ancora una storia e la riga non appare (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I128 | l'evoluzione è calcolata memoizzata nella sezione cicli e passata alla strip (wiring I96) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I128 | test dell'evoluzione: null sotto 3 completati, punto unico con n=3 (nessun delta, salto 0), ricalcolo cumulativo coerente con prevedibilitaCicli (durati 2,2,2,7h → 100→33, Δ −67), percorso su 5 completati con ultimo Δ positivo e salto max preservato | file | PASS | — |
| I129 | media cumulativa generica per k = 1..n (una media esiste dal primo ciclo, a differenza dell'indice I128 che parte da 3) con delta, ultimoDelta e maxSalto: la stessa lettura d'evoluzione di I128 applicata a ritmo medio e spreco medio — i cicli recenti stanno ancora spostando le medie? (src/lib/cycles.ts) | simbolo | PASS | — |
| I129 | riga «n → media» (ultimi 8 punti, «…» se troncata) con ultimo Δ e salti max NEUTRI (grigio): la direzione del Δ di una media non ha valenza buona/cattiva univoca — il colore dichiarerebbe un giudizio che non è del codice (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I129 | wiring: evoluzioneMedia sui ratePerHour dei cicli completati (null con consumo nullo escluso), memoizzata, riga sopra lo spreco/per-ciclo; sotto la griglia spreco la riga «Evoluzione dello spreco medio» (residuo al reset) (src/components/analysis-panel.tsx) | simbolo | PASS | — |
| I129 | test evoluzioneMedia: null su vuoto, punto unico, medie cumulative sui ritmi reali di serieCicli (35/46/24 → 35, 40,5, 35) con Δ e salto max, spreco endValue (20/3/44 → 20, 11,5, 22,33…), salto max = max|Δ| | file | PASS | — |
| I111 | APP_VERSION allineata al changelog canonico (docs/04 §8, riga più recente) — regola dell'utente «aggiorna sempre la versione», ora presidiata dall'audit e non solo dalla memoria | versione | PASS | — |

Verdetto: **PASS** (659 pass, 0 fail, 0 scoperte)