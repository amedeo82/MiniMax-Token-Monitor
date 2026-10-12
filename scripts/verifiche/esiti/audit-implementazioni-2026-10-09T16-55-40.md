# Audit implementazioni (I55) — 2026-10-09T16:55:40.843Z

Verifica di riconciliazione: ogni item dichiarato ✅ in docs/04 deve avere l'artefatto corrispondente nella codebase.

| ID | Item dichiarato | Esito | Dettaglio |
|----|-----------------|-------|-----------|
| I1 | Progetto Next 16 + React 19 + Tailwind 4 + shadcn/ui | ✅ | next ^16.1.1, react ^19.0.0, 48 componenti ui |
| I2 | lib/minimax.ts: tipi + parser + normalizzazioni | ✅ | src/lib/minimax.ts: 18 pattern OK |
| I3 | Proxy /api/minimax/usage (timeout 12s, errori italiani) | ✅ | src/app/api/minimax/usage/route.ts: 8 pattern OK |
| I4 | lib/time.ts: formattazioni Europe/Rome it-IT (7 formattatori + countdown) | ✅ | src/lib/time.ts: 14 pattern OK |
| I5 | ModelCard + MainWindows + QuotaRing + windowKindLabel + CountsRow (privato, usato in ModelCard) | ✅ | src/components/quota-cards.tsx: 4 pattern OK |
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
| I12 | Screenshot verifiche agent-browser (scripts/verify_*.png) | ✅ | 89 screenshot: verify_analysis_cicli5h.png, verify_analysis_desktop.png, verify_analysis_finale.png, verify_analysis_finale_reale.png … |
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
| I30 | Proxy SENZA cattura della chiave e SENZA blocco campionatore (ADR-13-R2 rimosso a campagna V8 chiusa, I56) | ✅ | nessuna cattura chiave; campionatore rimosso con nota storica (campagna V8 chiusa) |
| I49/I56 | Campionatore rimosso dalla codebase: src/lib/campione.ts e test-campione.ts non esistono più (recuperabili da git) | ✅ | campionatore e test rimossi dalla codebase |
| I49 | Dati di campagna V8 (campione-live.jsonl, 115+ campioni) | ✅ | scripts/verifiche/campione-live.jsonl (134941 byte) |
| I49 | Analizzatore fuso reset (analisi-reset-timezone.mjs) | ✅ | scripts/analisi-reset-timezone.mjs (15180 byte) |
| I50 | Test suite tests/lib (4 file) + script test in package.json | ✅ | 4 file test + script test OK |
| I51 | lib/backoff.ts: calcolo puro del ritardo (cap 10 min, jitter ±25 %, floor) | ✅ | src/lib/backoff.ts: 4 pattern OK |
| I51 | page.tsx: scheduler backoff (setTimeout ricorsivo, contatore errori, reset al successo e al salvataggio) | ✅ | src/app/page.tsx: 6 pattern OK |
| I51 | page.tsx: polling NON più a setInterval fisso | ✅ | src/app/page.tsx: 1 pattern OK |
| I51 | page.tsx: nessun doppio fetch al salvataggio impostazioni (fix I51) | ✅ | src/app/page.tsx: 1 pattern OK |
| I51 | proxy route.ts: retry transitorio + hint Retry-After (429/503, MAI 4xx) | ✅ | src/app/api/minimax/usage/route.ts: 6 pattern OK |
| I51 | TechInfo: riga backoff visibile su errori consecutivi | ✅ | src/components/tech-panels.tsx: 2 pattern OK |
| I51 | Test deterministici backoff (tests/lib/backoff.test.ts) | ✅ | tests/lib/backoff.test.ts (4023 byte) |
| I18 | lib/minimax.ts: endpoint alternativo + decisione pura del fallback (solo guasti endpoint) | ✅ | src/lib/minimax.ts: 3 pattern OK |
| I18 | proxy route.ts: fallback singolo su coding_plan con trasparenza (endpoint effettivo + flag) | ✅ | src/app/api/minimax/usage/route.ts: 4 pattern OK |
| I18 | Test unitari della decisione di fallback (tests/lib/minimax.test.ts) | ✅ | tests/lib/minimax.test.ts: 2 pattern OK |
| I48 | Matrice demo ↔ API (docs/01 §11) | ✅ | docs/01-api-minimax-ricerca.md: 3 pattern OK |
| I54 | Matrice parità demo ↔ live (docs/03 §5.9) | ✅ | docs/03-piano-implementazione.md: 2 pattern OK |
| §6 | layout.tsx: tema dark + Toaster theme dark | ✅ | src/app/layout.tsx: 2 pattern OK |
| §6 | globals.css: regole unlayered per hover custom | ✅ | src/app/globals.css: 2 pattern OK |
| §6 | page.tsx: migrazione soglie legacy in loadSettings (ADR-12) | ✅ | src/app/page.tsx: 3 pattern OK |
| ADR-2 | Countdown ricalcolati da end_time (msUntil) nel rendering finestre | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| ADR-6 | Parser tollerante: wrapper data + epoch s/ms + status numerici/testuali | ✅ | src/lib/minimax.ts: 3 pattern OK |
| ADR-7 | Demo + import JSON come first-class (setup panel con «Prova la demo») | ✅ | src/app/page.tsx: 1 pattern OK |
| ADR-13-R2 | Nota storica della rimozione del campionatore nel proxy (campagna V8 chiusa con verdetto) | ✅ | src/app/api/minimax/usage/route.ts: 3 pattern OK |
| Wiring | page.tsx renderizza TUTTI i pannelli dichiarati (MainWindows, HistoryChart, StatsPanel, PanoramicTable, LongTermAnalysis, EventLog, RawJsonPanel, TechInfo, SettingsDialog) | ✅ | src/app/page.tsx: 9 pattern OK |
| Wiring | QuotaRing usato nelle card (quota-cards.tsx) | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| Wiring | CountsRow usato nelle card (ModelCard) | ✅ | src/components/quota-cards.tsx: 1 pattern OK |
| Wiring | evaluateTransitions + notifyBrowser cablati nel ciclo snapshot (page.tsx) | ✅ | src/app/page.tsx: 4 pattern OK |
| Wiring | ModelCard per gli altri modelli (video) in page.tsx | ✅ | src/app/page.tsx: 1 pattern OK |
| I57 | lib/cycles.ts: statistiche di spreco pure (media, mediana, totale, cicli puliti <5 %) | ✅ | src/lib/cycles.ts: 4 pattern OK |
| I57 | analysis-panel.tsx: CycleWaste con barre 1:1 alla tabella cicli (ciclo in corso escluso) e KPI spreco | ✅ | src/components/analysis-panel.tsx: 3 pattern OK |
| I58 | lib/cycles.ts: aggregazione per giorno civile Europe/Rome (DST-safe via date stringhe, drawdown + rilevamenti) | ✅ | src/lib/cycles.ts: 5 pattern OK |
| I58 | analysis-panel.tsx: calendario stile GitHub (10 settimane, ultima colonna = settimana corrente, scala emerald a 5 livelli) | ✅ | src/components/analysis-panel.tsx: 4 pattern OK |
| I58 | analysis-panel.tsx: empty-state calendario con meno di 7 giorni coperti | ✅ | src/components/analysis-panel.tsx: 1 pattern OK |
| I61 | lib/cycles.ts: distribuzione del residuo (fasce con soglie in fascia inferiore, come quotaLevel) | ✅ | src/lib/cycles.ts: 4 pattern OK |
| I61 | analysis-panel.tsx: tab «Distribuzione» con KPI «al limite (<20 %)» e colori di allerta | ✅ | src/components/analysis-panel.tsx: 3 pattern OK |
| Batch1 | Wiring tab: «Calendario» e «Distribuzione» in TabsList/TabsContent di LongTermAnalysis | ✅ | src/components/analysis-panel.tsx: 4 pattern OK |
| Batch1 | Test unitari batch 1 in tests/lib/cycles.test.ts (spreco, calendario + DST, distribuzione) | ✅ | tests/lib/cycles.test.ts: 4 pattern OK |
| I59 | lib/rate.ts: serie del ritmo pura (gap → null, reset → null, SMA per tratti continui) | ✅ | src/lib/rate.ts: 6 pattern OK |
| I59 | rate-chart.tsx: RateChart sotto il grafico (barre viola/rose sopra il pareggio, linea ReferenceLine, scala radice quadrata) | ✅ | src/components/rate-chart.tsx: 5 pattern OK |
| I59 | page.tsx: RateChart cablato sotto StatsPanel con breakevenPace da computePace | ✅ | src/app/page.tsx: 2 pattern OK |
| I59 | Test unitari rateSeries (gap, reset, SMA per tratti, coerenza con computeTrend) | ✅ | tests/lib/rate.test.ts: 3 pattern OK |
| I60 | diagnostica-panel.tsx: ResetClock dot plot 24h (asse UTC, blocchi 00/05/10/15/20, 3 corsie, offset dal confine) | ✅ | src/components/diagnostica-panel.tsx: 6 pattern OK |
| I60 | ResetClock: empty-state con meno di 2 reset e KPI offset medio/massimo | ✅ | src/components/diagnostica-panel.tsx: 3 pattern OK |
| I62 | lib/health.ts: salute del monitor pura (episodi 7 giorni, ultimo errore, più frequente, bucket giornalieri Roma) | ✅ | src/lib/health.ts: 5 pattern OK |
| I62 | MonitorHealth: KPI episodi/ultimo errore/più frequente + backoff badge + mini barre giorno | ✅ | src/components/diagnostica-panel.tsx: 5 pattern OK |
| I62 | page.tsx: DiagnosticaPanel riceve gli STESSI events del registro (coerenza 1:1) e il backoff | ✅ | src/app/page.tsx: 1 pattern OK |
| I62 | Test unitari saluteMonitor (esclusione oltre 7 giorni, più frequente, giorno Roma) | ✅ | tests/lib/health.test.ts: 3 pattern OK |
| I63 | lib/cycles.ts: prevedibilitaCicli (dev. std. popolazione, CV, indice regolarità 0–100, null con <3 completati) | ✅ | src/lib/cycles.ts: 5 pattern OK |
| I63 | analysis-panel.tsx: striscia CyclePredictability nei tab Cicli (regolarità + range min—max, N/D con <3) | ✅ | src/components/analysis-panel.tsx: 4 pattern OK |
| I64 | lib/cycles.ts: oggiVsMedia (consumoGiornaliero a 5 settimane, oggi escluso dalla media, null con <2 comparabili) | ✅ | src/lib/cycles.ts: 4 pattern OK |
| I64 | analysis-panel.tsx: TodayComparison nel tab «Per giorno» (doppia mini-card 5h/settimanale con delta e freccia) | ✅ | src/components/analysis-panel.tsx: 4 pattern OK |
| I64 | WeekdaySection riceve lo storico completo e mostra TodayComparison sopra il grafico weekday | ✅ | src/components/analysis-panel.tsx: 2 pattern OK |
| Batch2 | Wiring diagnostica: sezione «Diagnostica» con id e due card in page.tsx (dopo LongTermAnalysis) | ✅ | src/components/diagnostica-panel.tsx: 4 pattern OK |
| Batch2 | Test unitari batch 2 in tests/lib (prevedibilità: indice 100 con cicli identici, null con <3; oggiVsMedia: oggi escluso) | ✅ | tests/lib/cycles.test.ts: 4 pattern OK |
| I65 | lib/ring-color.ts: coloreContinuo (HSL lerp a tratti, soglie 10/30/60/75 come casi limite, clamp, hue monotona) | ✅ | src/lib/ring-color.ts: 5 pattern OK |
| I65 | quota-ring.tsx: modalità continuous (gradiente interpolato + glow drop-shadow tinto) con AnimatedPercent count-up framer-motion e prefers-reduced-motion | ✅ | src/components/quota-ring.tsx: 8 pattern OK |
| I65 | MiniBar resta discreta (§10: colore continuo solo anelli principali) e quota-cards abilita continuous sui due anelli | ✅ | src/components/quota-ring.tsx: 2 pattern OK |
| I65 | MainWindows passa continuous a entrambi gli anelli principali | ✅ | src/components/quota-cards.tsx: 3 pattern OK |
| I65 | Test unitari colore continuo (casi limite alle soglie, lerp metà segmento, clamp, hue monotona, contrasto testo 53–64) | ✅ | tests/lib/ring-color.test.ts: 3 pattern OK |
| I66 | section-nav.tsx: barra fixed con scrollspy IntersectionObserver (banda header+nav), occultabile in cima pagina, aria-current | ✅ | src/components/section-nav.tsx: 6 pattern OK |
| I66 | page.tsx: sezioni con id + scroll-mt dinamico (quota/andamento/panoramica/analisi/modelli/tecnici/eventi) e SectionNav nel fragment snapshot | ✅ | src/app/page.tsx: 9 pattern OK |
| I66 | DiagnosticaPanel mantiene id (batch 2) con scroll-mt; smooth scroll solo senza prefers-reduced-motion | ✅ | src/components/diagnostica-panel.tsx: 2 pattern OK |
| I66 | globals.css: scroll-behavior smooth gated su prefers-reduced-motion: no-preference | ✅ | src/app/globals.css: 2 pattern OK |
| I67 | lib/tab-identity.ts: formatTabTitle con ENTRAMBE le percentuali (§10) + favicon canvas due archi concentrici tinti coloreContinuo | ✅ | src/lib/tab-identity.ts: 5 pattern OK |
| I67 | tab-identity.tsx: solo client in useEffect, fallback statico, vincibile la corsa di re-asserzione title Next/React 19 (re-set post-flush + guardia) | ✅ | src/components/tab-identity.tsx: 6 pattern OK |
| I67 | page.tsx: TabIdentity cablato con i residui general interval + weekly | ✅ | src/app/page.tsx: 3 pattern OK |
| Batch3 | Test unitari batch 3 (title entrambe le percentuali, arc ore 12, clamp, favicon null senza DOM) | ✅ | tests/lib/tab-identity.test.ts: 4 pattern OK |
| I52 | Service Worker module (public/sw.js) | ✅ | public/sw.js (11534 byte) |
| I52 | Fonte unica di verità SW (public/sw-shared.js) | ✅ | public/sw-shared.js (10077 byte) |
| I52 | Manifest PWA (src/app/manifest.ts) | ✅ | src/app/manifest.ts (1130 byte) |
| I52 | Registrazione SW + sync config + badge offline (src/components/pwa-register.tsx) | ✅ | src/components/pwa-register.tsx (7162 byte) |
| I52 | Generatore icone PWA (scripts/genera-icone-pwa.mjs) | ✅ | scripts/genera-icone-pwa.mjs (2719 byte) |
| I52 | Icone PWA generate (192/512 any + 512 maskable + 180 apple) | ✅ | 4 icone PNG presenti in public/icons/ |
| I52 | sw-shared.js: fonte unica (parsing specchio, decisioni ADR-9, default ≡ ALERT_DEFAULTS) | ✅ | public/sw-shared.js: 8 pattern OK |
| I52 | sw.js: strategie di cache + snapshot fallback + periodicsync + message API | ✅ | public/sw.js: 11 pattern OK |
| I52 | sw.js NON duplica le soglie (fonte unica: le soglie arrivano da SETTINGS_SYNC/IDB) | ✅ | zero soglie hardcoded nel SW, default solo in sw-shared.js |
| I52 | sw.js cache snapshot SOLO per payload realmente validi (mai risposte di business-error come 1004) | ✅ | validazione parseRemainsPayload prima di cache.put |
| I52 | pwa-register.tsx: registrazione, sync config, hook ?nosw e ?mm-check, badge offline | ✅ | src/components/pwa-register.tsx: 9 pattern OK |
| I52 | page.tsx: wiring PwaRegister (sempre attivo) + OfflineBadge nello header + gestione from-cache senza transizioni | ✅ | src/app/page.tsx: 6 pattern OK |
| I52 | manifest.ts: standalone + icone 192/512 + maskable + tema scuro | ✅ | src/app/manifest.ts: 6 pattern OK |
| I52 | layout.tsx: manifest + icone locali + appleWebApp | ✅ | src/app/layout.tsx: 4 pattern OK |
| I52 | Test sw-shared: parità DEFAULT≈ALERT_DEFAULTS, parità parser, parità decisioni evaluateTransitions | ✅ | tests/lib/sw-shared.test.ts: 7 pattern OK |

**Totale**: 126/126 superate, 0 discordanze.
