# Worklog

---
Task ID: 1
Agent: Super Z (main agent)
Task: Creare dashboard interattiva per monitorare l'utilizzo del Token Plan MiniMax in Europa (interrogazione API, statistiche con orario italiano Europe/Rome, quota rimanente, tempi di reset, dettagli completi).

Work Log:
- Ricerca documentale: docs ufficiali MiniMax (platform.minimax.io/docs, formato .md di Mintlify) → endpoint ufficiale quota `https://www.minimax.io/v1/token_plan/remains` con `Authorization: Bearer <Subscription Key>`; finestre di reset 5 ore + settimanale (7 giorni), indipendenti; video solo settimanale.
- Analisi implementazioni open-source: plugin CreditGauge (npm creditgauge@1.2.4/query_plugins/minimax) e CodexBar (MiniMaxUsageFetcher.swift) → schema risposta JSON confermato: `base_resp.status_code`, `model_remains[]` con `model_name` ("general"/"video"), `current_interval_remaining_percent`, `current_weekly_remaining_percent`, `start_time`/`end_time`/`weekly_start_time`/`weekly_end_time` (epoch s o ms), `remains_time`, alias piano (`current_subscribe_title`, `plan_name`, …) e crediti (`points_balance`/`credits_balance`). status_code 1004 = chiave non valida.
- Test reale tramite dashboard: chiamata con chiave finta ha restituito status_code 1004 → pipeline proxy funzionante end-to-end.
- Init ambiente fullstack Next.js 16 + Tailwind 4 + shadcn/ui.
- Creati file:
  - `src/lib/time.ts` — utility Europe/Rome + it-IT (formattazioni data/ora, countdown, durate, offset CET/CEST, progresso finestra).
  - `src/lib/minimax.ts` — tipi + parser robusto risposta API (piatta o annidata sotto `data`, epoch s/ms, alias campi), mappatura etichette modelli, livelli quota.
  - `src/lib/demo.ts` — generatore dati demo realistici (finestre 5h/settimanale simulate, modello video, storico fittizio).
  - `src/app/api/minimax/usage/route.ts` — proxy POST server-side verso MiniMax (evita CORS, chiave mai loggata, timeout 12s, messaggi errore in italiano).
  - `src/components/quota-ring.tsx` — anelli SVG con gradiente + mini barre.
  - `src/components/quota-cards.tsx` — MainWindows (anelli 5h/settimanale + dettagli reset) e ModelCard per modello.
  - `src/components/history-chart.tsx` — grafico Recharts andamento quota (tab 5h/settimanale), pannello statistiche (consumo medio %/h, proiezione esaurimento, rilevamenti), TrendBadge.
  - `src/components/settings-dialog.tsx` — impostazioni: Subscription Key (password + toggle), regione EU/CN, refresh (manuale/30s/60s/5min), modalità demo.
  - `src/components/tech-panels.tsx` — pannello JSON grezzo con evidenziazione sintassi e copia; scheda dettagli tecnici.
  - `src/app/page.tsx` — dashboard client: header con orologio live Roma, badge piano/crediti/demo/stato, anelli quota, countdown reset live, grafico storico localStorage, card modelli, JSON, tech info, footer sticky.
  - `src/app/layout.tsx` — metadata italiani, lang="it", Toaster sonner.
- Storico locale in localStorage (max 600 punti, dedup <20s), statistiche da regressione lineare semplice.
- Verifica con agent-browser: rendering OK (desktop 1440px + mobile 390px), nessun errore console, interazioni testate (JSON expand, tab grafico, dialog impostazioni, salvataggio chiave finta → errore 1004 gestito in italiano), footer sticky OK, lint 0 problemi.

Stage Summary:
- Dashboard operativa in demo mode (dati simulati realistici) pronta per l'anteprima.
- Per uso reale: inserire la Subscription Key nelle Impostazioni (salvata solo in localStorage), regione Europa predefinita.
- Endpoint API verificato contro l'API reale MiniMax EU; gestione errori completa (1004, HTTP, timeout, rete).
