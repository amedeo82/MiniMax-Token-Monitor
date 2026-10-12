# Audit implementazioni (I55) — 2026-10-09T09:26:27.855Z

Verifica di riconciliazione: ogni item dichiarato ✅ in docs/04 deve avere l'artefatto corrispondente nella codebase.

| ID | Item dichiarato | Esito | Dettaglio |
|----|-----------------|-------|-----------|
| I1 | Progetto Next 16 + React 19 + Tailwind 4 + shadcn/ui | ✅ | next ^16.1.1, react ^19.0.0, 48 componenti ui |
| I2 | lib/minimax.ts: tipi + parser + normalizzazioni | ✅ | src/lib/minimax.ts: 18 pattern OK |
| I3 | Proxy /api/minimax/usage (timeout 12s, errori italiani) | ✅ | src/app/api/minimax/usage/route.ts: 8 pattern OK |
| I4 | lib/time.ts: formattazioni Europe/Rome it-IT (7 formattatori + countdown) | ✅ | src/lib/time.ts: 14 pattern OK |
| I5 | ModelCard + MainWindows + QuotaRing + windowKindLabel + CountsRow | ❌ | in src/components/quota-cards.tsx mancano: export function CountsRow |
| I5 | QuotaRing (anello SVG) | ✅ | src/components/quota-ring.tsx: 1 pattern OK |
| I6 | Countdown vivi: ora server dedotta (inferServerTime) usata in page.tsx + TechInfo | ✅ | src/app/page.tsx: 2 pattern OK |
| I7 | Storico localStorage (dedup <20s, cap 600) in page.tsx | ✅ | src/app/page.tsx: 4 pattern OK |
| I7 | HistoryChart + StatsPanel + computeTrend + TrendBadge | ✅ | src/components/history-chart.tsx: 5 pattern OK |
| I8 | SettingsDialog + DashboardSettings + DEFAULT_SETTINGS persistiti | ✅ | src/components/settings-dialog.tsx: 5 pattern OK |
| I9 | Import manuale JSON con validazione | ✅ | src/app/page.tsx: 2 pattern OK |
| I9 | Import JSON nel settings-dialog (onImportJson + UI «Incolla la risposta») | ✅ | src/components/settings-dialog.tsx: 3 pattern OK |
| I10 | Modalità demo: makeDemoSnapshot + makeDemoHistory | ✅ | src/lib/demo.ts: 4 pattern OK |
| I11 | RawJsonPanel + TechInfo + avviso semantica usage_count | ✅ | src/components/tech-panels.tsx: 6 pattern OK |
| I13 | Bugfix videoDayStart definito in demo.ts | ✅ | src/lib/demo.ts: 2 pattern OK |
| I12 | Screenshot verifiche agent-browser (scripts/verify_*.png) | ✅ | 76 screenshot: verify_analysis_cicli5h.png, verify_analysis_desktop.png, verify_analysis_finale.png, verify_analysis_finale_reale.png … |
| I14 | Documentazione completa (README + docs/01–05) | ✅ | 6 documenti |
| I16 | Prisma: modello UsagePoint (t unique, interval, weekly, source, region) | ✅ | prisma/schema.prisma: 6 pattern OK |
| I16 | API /api/history: POST upsert+pruning, GET limit/since, DELETE | ✅ | src/app/api/history/route.ts: 5 pattern OK |
| I16 | lib/server-history.ts: sync offline-first (push fire-and-forget, fetch/merge/clear async) | ✅ | src/lib/server-history.ts: 5 pattern OK |
| I16 | page.tsx: merge storico server all'avvio | ✅ | src/app/page.tsx: 3 pattern OK |
| I17 | lib/usage-events.ts: banner + toast + Notification API | ✅ | src/lib/usage-events.ts: 5 pattern OK |
| I21 | Registro eventi: mm-dash-events-v1 cap 200 + makeEvent | ✅ | src/lib/usage-events.ts: 7 pattern OK |
| I21 | EventLog: timeline per giorno Roma, badge, svuota | ✅ | src/components/event-log.tsx: 4 pattern OK |
| I28 | Soglie per finestra: AlertThresholds h5/h24/weekly + windowThresholdKey + migrateLegacyThresholds | ✅ | src/lib/usage-events.ts: 6 pattern OK |
| I28 | Matrice soglie 3×2 nel tab Avvisi (settings-dialog; la migrazione legacy vive in page.tsx loadSettings) | ✅ | src/components/settings-dialog.tsx: 5 pattern OK |
| I22 | lib/export.ts: CSV «;» + BOM, exportHistory/Events | ✅ | src/lib/export.ts: 8 pattern OK |
| I22 | Pulsanti export su grafico e registro | ✅ | trovato in src/components/history-chart.tsx |
| I23 | Verdetto esaurimento vs reset (ProjectionVerdict) in StatsPanel | ✅ | src/components/history-chart.tsx: 2 pattern OK |
| I31 | Pace: computePace/PaceInfo + PacePanel (ritmo pareggio, quota sprecata, fermo tecnico) | ✅ | src/components/history-chart.tsx: 6 pattern OK |
| I24 | PanoramicTable: tutte le finestre a confronto | ✅ | src/components/model-table.tsx: 1 pattern OK |
| I25 | Settings su 3 tab (Connessione/Avvisi/Dati) con max-h-[85svh] | ✅ | src/components/settings-dialog.tsx: 4 pattern OK |
| I26 | lib/cycles.ts: RESET_JUMP=15, RESET_TARGET=85, detectCycles, summarizeCycles, weekdayConsumption, movingAverage | ✅ | src/lib/cycles.ts: 6 pattern OK |
| I26 | LongTermAnalysis: pannello 4 tab + KPI + tabella cicli + 10.000 punti server | ✅ | src/components/analysis-panel.tsx: 5 pattern OK |
| I26 | Toggle «Media mobile» (SMA-10) sul grafico | ✅ | src/components/history-chart.tsx: 2 pattern OK |
| I32 | Heatmap ore×giorno (tab «Per ora») + heatmapConsumption | ✅ | src/lib/cycles.ts: 1 pattern OK |
| I32 | Tab «Per ora» + sezione heatmap + overlay cicli | ✅ | src/components/analysis-panel.tsx: 4 pattern OK |
| I32 | Overlay «Cicli» sul grafico storico (fasce + marker reset) | ✅ | src/components/history-chart.tsx: 3 pattern OK |
| I27 | Prisma: modello UsageEventRecord | ✅ | prisma/schema.prisma: 1 pattern OK |
| I27 | API /api/events: POST upsert per id + pruning 5000/180g, GET since/kind, DELETE | ✅ | src/app/api/events/route.ts: 7 pattern OK |
| I27 | lib/server-events.ts: replica fire-and-forget (push sincrono) + fetch/merge/clear per id | ✅ | src/lib/server-events.ts: 5 pattern OK |
| I27 | page.tsx: addEvents replica + svuota locale+server | ✅ | src/app/page.tsx: 3 pattern OK |
| I29 | Toolkit verifiche V1–V6 (verifica.mjs: v1–v6 + prova-parser) | ✅ | scripts/verifiche/verifica.mjs: 8 pattern OK |
| I30 | Proxy SENZA cattura della chiave (ADR-13-R ritirato; solo campionatore risposta ADR-13-R2) | ✅ | nessuna cattura chiave; campionatore risposta-only presente e marcato |
| I49 | lib/campione.ts: envelopeValida + campionaRisposta async (cap 12 MB, mai la chiave) | ✅ | src/lib/campione.ts: 4 pattern OK |
| I49 | Test campionatore (test-campione.ts) | ✅ | scripts/verifiche/test-campione.ts (5563 byte) |
| I49 | Analizzatore fuso reset (analisi-reset-timezone.mjs) | ✅ | scripts/analisi-reset-timezone.mjs (15180 byte) |
| I49 | File campione live (campione-live.jsonl) | ✅ | scripts/verifiche/campione-live.jsonl (84056 byte) |
| I50 | Test suite tests/lib (4 file) + script test in package.json | ✅ | 4 file test + script test OK |
| I48 | Matrice demo ↔ API (docs/01 §11) | ✅ | docs/01-api-minimax-ricerca.md: 3 pattern OK |
| I54 | Matrice parità demo ↔ live (docs/03 §5.9) | ✅ | docs/03-piano-implementazione.md: 2 pattern OK |
| §6 | layout.tsx: tema dark + Toaster theme dark | ✅ | src/app/layout.tsx: 2 pattern OK |
| §6 | globals.css: regole unlayered per hover custom | ✅ | src/app/globals.css: 2 pattern OK |
| §6 | page.tsx: migrazione soglie legacy in loadSettings (ADR-12) | ✅ | src/app/page.tsx: 3 pattern OK |
| ADR-2 | Countdown ricalcolati da end_time (msUntil) nel rendering finestre | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| ADR-6 | Parser tollerante: wrapper data + epoch s/ms + status numerici/testuali | ✅ | src/lib/minimax.ts: 3 pattern OK |
| ADR-7 | Demo + import JSON come first-class (setup panel con «Prova la demo») | ✅ | src/app/page.tsx: 1 pattern OK |
| ADR-13-R2 | Blocco campionatore marcato nel proxy con delimitatori chiari | ✅ | src/app/api/minimax/usage/route.ts: 3 pattern OK |
| Wiring | page.tsx renderizza TUTTI i pannelli dichiarati (MainWindows, HistoryChart, StatsPanel, PanoramicTable, LongTermAnalysis, EventLog, RawJsonPanel, TechInfo, SettingsDialog) | ✅ | src/app/page.tsx: 9 pattern OK |
| Wiring | QuotaRing usato nelle card (quota-cards.tsx) | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| Wiring | CountsRow usato nelle card (ModelCard) | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| Wiring | evaluateTransitions + notifyBrowser cablati nel ciclo snapshot (page.tsx) | ✅ | src/app/page.tsx: 4 pattern OK |
| Wiring | ModelCard per gli altri modelli (video) in page.tsx | ✅ | src/app/page.tsx: 1 pattern OK |

**Totale**: 62/63 superate, 1 discordanze.
