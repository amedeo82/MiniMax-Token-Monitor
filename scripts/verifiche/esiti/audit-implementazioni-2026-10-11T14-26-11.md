# Audit implementazioni — 2026-10-11T14:26:11.212Z

- Verifiche totali: **86** · PASS: **86** · FAIL: **0**
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

Verdetto: **PASS** (86 pass, 0 fail, 0 scoperte)