# 03 — Piano di implementazione e architettura

> **Scopo**: descrivere COME il dashboard è costruito (e perché), con la mappa del
> codice, i modelli dati, i flussi chiave, la gestione degli errori e le fasi di
> lavoro con i criteri di accettazione. È la guida operativa per qualsiasi nuova
> implementazione: nuova funzione → nuova voce nelle fasi (`docs/04`).
>
> Ultimo aggiornamento: 2026-10-02 (I16 persistenza storico server-side: API /api/history, sync offline-first, export completo).

---

## 1. Architettura

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser (client)                                                         │
│                                                                          │
│  src/app/page.tsx  — orchestratore stato ("use client")                  │
│   ├─ tick orologio 1s (countdown vivi)                                   │
│   ├─ settings (localStorage "mm-dash-settings-v1")                       │
│   ├─ history  (localStorage "mm-dash-history-v1", max 600 punti)        │
│   ├─ events   (localStorage "mm-dash-events-v1", max 200)                │
│   ├─ modalità: API reale │ import JSON │ demo                            │
│   ├─ avvisi: banner soglie, toast, notifiche browser (usage-events.ts)   │
│   └─ componenti: quota-cards · history-chart · model-table · event-log   │
│                  quota-ring · tech-panels                                │
└───────────────▲──────────────────────────────────────────────────────────┘
                │  POST /api/minimax/usage  { apiKey, region }   (fetch)
┌───────────────┴──────────────────────────────────────────────────────────┐
│ Server (route handler Next.js)                                           │
│  src/app/api/minimax/usage/route.ts                                      │
│   ├─ timeout 12s (AbortController) · cache: no-store                     │
│   └─ GET https://www.minimax.io/v1/token_plan/remains                    │
│      Authorization: Bearer <apiKey>                                      │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ HTTPS
        ┌───────┴────────┐
        │ MiniMax API    │  → { base_resp, model_remains[] }  (docs/02)
        └────────────────┘
```

**Perché un proxy server-side** (e non fetch dal browser): ① l'endpoint MiniMax non
espone CORS; ② la chiave viaggia nel body POST verso il NOSTRO server, non in URL/
referer verso terze parti; ③ centralizza timeout, User-Agent e mappatura errori.

---

## 2. Stack e dipendenze rilevanti

| Libreria | Uso nel progetto |
|----------|------------------|
| `next` 16 (App Router) | framework + route handler `/api/minimax/usage` |
| `react` 19 | UI client-side |
| `tailwindcss` 4 + `shadcn/ui` (Radix) | componenti e stili |
| `recharts` | grafico storico percentuali |
| `lucide-react` | icone |
| `sonner` | toast (errori/successi import, refresh) |
| `Intl.*` nativo | fuso Europe/Rome + locale it-IT (nessuna lib di date necessaria) |
| `localStorage` | persistenza settings + history (no DB) |

---

## 3. Mappa del codice

| File | Responsabilità |
|------|----------------|
| `src/lib/minimax.ts` | Tipi (`UsageSnapshot`, `ModelQuota`, `QuotaWindow`, `ApiError`), `REGION_ENDPOINTS`, `parseUsageResponse()` (tollerante: risposta piatta o sotto `data`, epoch s/ms, status numerici o testuali), `statusLabel()`, `consumedPercent()`, `inferServerTime()`, `quotaLevel()`, `modelLabel()`, `EXTRA_ENDPOINTS` |
| `src/lib/time.ts` | `TZ_ROME`, `LOCALE_IT`, `toDate()` (accetta epoch s/ms, ISO, Date), `formatFullRome/DateTimeRome/TimeRome/DateRome/ShortRome`, `romeZoneInfo()`, `formatCountdown()`, `formatDuration()`, `msUntil()`, `windowProgress()` |
| `src/lib/usage-events.ts` | Motore di monitoraggio: registro eventi (`mm-dash-events-v1`, max 200: `loadEvents/appendEvents/clearEvents/makeEvent`), `deriveBanner()` (banner quota bassa stateless), `evaluateTransitions()` (soglie warn/crit + reset tra due snapshot), `canNotify()/notifyBrowser()` (Notification API), `AlertConfig` |
| `src/lib/export.ts` | Esportazione locale: `historyToCsv()/eventsToCsv()` (CSV «;» + BOM UTF-8, Excel it-IT), `exportHistoryCsv/Json()`, `exportEventsCsv()`, `downloadTextFile()` |
| `src/lib/server-history.ts` | I16 sync client↔server: `pushPointToServer()` (fire-and-forget, con callback `onTotal`), `fetchServerHistory()`, `mergeHistories()` (dedup per timestamp, vince il punto locale), `serverPointsToHistory()`, `clearServerHistory()` |
| `src/lib/demo.ts` | Generatore demo realistico: finestra 5h aperta 3,2h fa, weekly 2,7 giorni fa, video con finestra 24h allineata a mezzanotte UTC e stato 3, jitter per animare il grafico |
| `src/app/page.tsx` | Stato globale pagina: settings/history/events (localStorage + mirror server I16), fetch/polling, import JSON, demo, orologio 1s, transizioni avvisi (toast + notifiche), layout |
| `prisma/schema.prisma` | Modello `UsagePoint` (t unique, interval, weekly, source, region) — storico server-side, nessun dato sensibile |
| `src/app/api/minimax/usage/route.ts` | Proxy POST → GET MiniMax token_plan/remains; timeout 12s; mappatura errori HTTP/business in italiano |
| `src/app/api/history/route.ts` | I16 persistenza storico (SQLite/Prisma): POST (upsert per `t`, validazione input, pruning FIFO a 10.000 punti + cutoff 90 giorni), GET (`?limit=&since=`, ordinato per `t`), DELETE (svuota). La chiave API non transita mai qui |
| `src/components/quota-cards.tsx` | `ModelCard` (card per modello: due finestre con barre, countdown, badge stato), `MainWindows` (riepilogo finestre general), `CountsRow` (residuo/totale/consumato + nota su percentuali), `windowKindLabel()` (5h vs 24h dinamica) |
| `src/components/quota-ring.tsx` | `QuotaRing`: anello SVG percentuale |
| `src/components/history-chart.tsx` | `HistoryChart` (Recharts, switch finestra interval/weekly, dropdown Esporta: storico locale CSV/JSON + storico completo dal server), `computeTrend()`, `StatsPanel` (+ verdetto `ProjectionVerdict`: esaurimento stimato vs orario di reset; contatore punti server), `TrendBadge` |
| `src/components/model-table.tsx` | `PanoramicTable`: tabella comparativa di tutte le finestre del piano (modello × finestra: residuo con mini-barra, stato, countdown reset) |
| `src/components/event-log.tsx` | `EventLog`: timeline del registro eventi raggruppata per giorno (Europe/Rome), badge per tipo, export CSV, svuotamento |
| `src/components/tech-panels.tsx` | `RawJsonPanel` (JSON grezzo con orario fetch), `TechInfo` (regione, modalità, endpoint, ora server dedotta, pannello "altri endpoint utili", avviso semantica `usage_count`) |
| `src/components/settings-dialog.tsx` | `DashboardSettings` { apiKey, region, refreshSeconds, demoMode, alertsEnabled, alertThresholdWarn, alertThresholdCrit, notifyReset, browserNotifications }, import JSON con validazione, richiesta permesso notifiche |

---

## 4. Modelli dati (TypeScript)

```ts
// src/lib/minimax.ts (estratto essenziale)
interface QuotaWindow {
  remainingPercent: number | null;  // fonte della verità (0–100)
  totalCount: number | null;        // di solito 0 = non dichiarato
  remainingCount: number | null;    // ⚠️ quando popolato = RESIDUO (docs/02 §3)
  status: string | null;            // "1" | "2" | "3" | "normal" | "exhausted" | …
  start: number | null;             // epoch ms
  end: number | null;               // epoch ms = reset
  remainsTimeMs: number | null;     // durata residua ms
}
interface ModelQuota { modelName: string; label: string; interval: QuotaWindow | null; weekly: QuotaWindow | null; }
interface UsageSnapshot { planTitle: string | null; credits: number | null; models: ModelQuota[]; fetchedAt: number; source: "api" | "demo"; region: "eu" | "cn"; }

// src/components/settings-dialog.tsx
interface DashboardSettings {
  apiKey: string;
  region: "eu" | "cn";
  refreshSeconds: number;  // 0 = off
  demoMode: boolean;
  alertsEnabled: boolean;          // motore avvisi (banner + toast)
  alertThresholdWarn: number;      // % residua, 0 = disattivata (default 25)
  alertThresholdCrit: number;      // % residua, 0 = disattivata (default 10)
  notifyReset: boolean;            // avviso al reset finestre
  browserNotifications: boolean;   // Notification API (richiede permesso)
}

// src/lib/usage-events.ts
type UsageEventKind = "reset" | "warn" | "crit" | "error" | "info";
interface UsageEvent { id; t: number; kind: UsageEventKind; model: string | null; win: "interval" | "weekly" | null; message: string; value: number | null; }
// src/components/history-chart.tsx
interface HistoryPoint { t: number; interval: number; weekly: number; }  // epoch ms + percentuali general

// prisma/schema.prisma (I16 — SQLite)
model UsagePoint {
  id        Int      @id @default(autoincrement())
  t         DateTime @unique   // momento del rilevamento (dedup upsert)
  interval  Float?             // % residua finestra 5h (general)
  weekly    Float?             // % residua settimanale (general)
  source    String   @default("api")  // api | demo | import
  region    String   @default("eu")   // eu | cn
  createdAt DateTime @default(now())
  @@index([t])
}
```

**Regole di parsing** (`parseUsageResponse`): risposta piatta o annidata sotto `data`;
`base_resp.status_code ≠ 0` → throw (1004 → messaggio dedicato chiave errata); epoch
normalizzato (`>1e12` ms, altrimenti ×1000); durate normalizzate (`durationMs`);
window creata solo se ha almeno un campo utile; modelli senza alcun dato scartati.

---

## 5. Flussi chiave

### 5.1 API reale (polling)
`Impostazioni` → chiave salvata in localStorage → `fetchData()` POST al proxy →
`parseUsageResponse()` → `setSnapshot` + `pushHistory()` (dedup < 20s, trim 600) →
aggiornamento UI. Polling automatico ogni `refreshSeconds` (default 60, 0 = off).

### 5.2 Import JSON manuale
`Impostazioni → "Incolla una risposta JSON"` → validazione → `parseUsageResponse(raw, {source:"demo-raw"})` →
stessa pipeline; badge "JSON importato manualmente" + `sourceLabel` nel TechInfo.
Utile per analizzare snapshot catturati con curl/CLI senza esporre la chiave.

### 5.3 Demo
`makeDemoSnapshot()` genera curve di consumo plausibili con jitter → alimenta anche
lo storico (`makeDemoHistory`) per mostrare il grafico senza chiave.

### 5.4 Countdown vivi
Un tick `setInterval` 1s aggiorna `now`; i countdown sono `msUntil(end_time, now)`.
`inferServerTime()` (dal JSON: `end_time − remains_time`) è mostrata nel TechInfo come
"ora del server dedotta" per confronto con l'ora locale.

### 5.5 Avvisi di soglia, reset e registro eventi (F6b)
Il motore (`lib/usage-events.ts`) lavora SOLO sugli snapshot già ricevuti (zero chiamate
extra, zero consumo quota):
- **Banner** (`deriveBanner`): stateless, derivato dallo snapshot corrente — se una delle
  due finestre di «general» è sotto le soglie configurate appare l'Alert amber/rose;
- **Transizioni** (`evaluateTransitions`): confronta lo snapshot precedente col nuovo
  (ref interno di `page.tsx`); genera toast + notifiche browser solo sugli
  ATTRAVERSAMENTI (prev ≥ soglia > next; reset = salto ≥ +25 punti fino a ≥ 90%);
  nessuno spam a ogni polling;
- **Registro eventi**: ogni transizione, errore di rilevamento (ok → errore) e nota
  viene accodato in `mm-dash-events-v1` (max 200) e mostrato in `EventLog`
  (timeline raggruppata per giorno Roma, badge per tipo, export CSV, svuotamento).

### 5.6 Esportazione dati (F6b)
`lib/export.ts` genera CSV («;» + BOM UTF-8, compatibile Excel it-IT) e JSON con i dati
GIÀ presenti nel browser: storico quota (dal pannello grafico) e registro eventi
(dal pannello Registro eventi). Nessun dato lascia il dispositivo se non col download
esplicito richiesto dall'utente.

### 5.7 Sincronizzazione storico server-side (I16)
Strategia **offline-first**: il localStorage resta la fonte primaria per la UI; il server
(SQLite via Prisma) è la copia durevole.
- **Replica**: ogni punto registrato da `pushHistory()` viene inviato a `POST /api/history`
  in fire-and-forget (`keepalive`); errori silenziosi (offline → la UI continua uguale);
  la risposta aggiorna il contatore «punti salvati sul server» (grafico + statistiche);
- **Merge all'avvio**: `GET /api/history?limit=2000` → `mergeHistories()` (dedup per
  timestamp, vince il punto locale) → il risultato (trim 600) sostituisce lo storico:
  la cronologia sopravvive a cache svuotate e cambio dispositivo; in demo il backfill
  simulato si FONDE con i punti server (non li sovrascrive);
- **Dedup server**: upsert su `t` unique (il client dedup < 20 s, il server conserva
  tutta la granularità ricevuta);
- **Pruning**: dopo ogni POST eliminati i punti più vecchi di 90 giorni e oltre
  10.000 (FIFO);
- **Export completo**: menu «Esporta» del grafico → CSV/JSON dell'intero storico
  server (fino a 10.000 punti) oltre alle voci dello storico locale in memoria;
- **Privacy**: su DB arrivano solo timestamp e percentuali residue (+ source/region);
  la Subscription Key resta nel browser e non tocca mai `/api/history`.

---

## 6. Gestione del tempo (Europe/Rome) — regole d'oro

1. **Sempre** `Intl.DateTimeFormat` con `timeZone: "Europe/Rome"` e locale `it-IT`
   (funzioni di `src/lib/time.ts`). **Mai** offset fissi (CET/CEST cambia da solo).
2. Epoch accettato in **secondi o ms** (`toDate()` normalizza), perché versioni diverse
   dell'API/endpoint alternativo potrebbero usare secondi.
3. Countdown **ricalcolati localmente** da `end_time`, non da `remains_time` (che è
   congelato al momento della query).
4. Le date mostrano sempre anche il giorno della settimana quando rilevanti
   (il reset settimanale cade di **lunedì**, alle 02:00 Roma in CEST / 01:00 in CET).

---

## 7. UI — layout della dashboard

```
┌ Header: titolo · stato dati (API/demo/importato) · ultimo aggiornamento (Roma) · refresh · settings ┐
│ Alert errori (autenticazione/HTTP/rete) quando presenti                                            │
│ Banner avvisi soglia (amber/rose) quando una finestra «general» è sotto le soglie                   │
├ MainWindows: riepilogo grande delle due finestre del general (QuotaRing + countdown + badge)       │
├ HistoryChart: andamento % nel tempo (switch interval/weekly) + export CSV/JSON                      │
├ StatsPanel: consumo medio · esaurimento previsto · rilevamenti · VERDETTO esaurimento vs reset     │
├ PanoramicTable: tutte le finestre del piano a confronto (modello × finestra, stato, reset)         │
├ Altri modelli: ModelCard dinamica per ogni voce ≠ general                                          │
├ TechInfo: regione, modalità, endpoint usato, refresh, ora server dedotta, altri endpoint           │
├ RawJsonPanel: JSON grezzo dell'ultima risposta                                                     │
└ EventLog: registro eventi (reset, soglie, errori) raggruppato per giorno · export CSV · svuota     ┘
```

Principi: percentuali come metrica primaria; ogni numero temporale esplicitamente
etichettato "ora di Roma"; stati con badge colorati (ok/idle/warn/crit).

---

## 8. Gestione errori (mappatura italiana)

| Errore | Origine | Messaggio/azione |
|--------|---------|------------------|
| `missing_key` | chiave vuota | 400 — apre le impostazioni |
| `unauthorized` | HTTP 401/403 | "Autenticazione rifiutata… deve essere la Subscription Key, non una chiave pay-as-you-go" |
| `base_resp.status_code = 1004` | business | "Chiave API non valida o non autenticata (1004)…" |
| altri `status_code ≠ 0` | business | mostra `status_msg` |
| `bad_json` | risposta non JSON | segnalazione + RawJsonPanel per ispezione |
| `timeout` | >12s | "l'API MiniMax non ha risposto entro 12 secondi" |
| `network` | fetch fallita | messaggio con endpoint |
| localStorage pieno/assente | storico | silenzioso (degrada senza storico) |

---

## 9. Sicurezza e privacy

- La chiave vive **solo nel localStorage del browser** e viene inviata **solo** al
  proxy `/api/minimax/usage` (che la usa per la singola chiamata server→MiniMax).
- Nessun logging della chiave; `User-Agent` dedicato (`MiniMax-Usage-Dashboard/1.0`).
- `cache: "no-store"` + `dynamic = "force-dynamic"`: nessuna risposta quota in cache.
- Nessun dato utente esce dal dispositivo (storico solo in localStorage).

---

## 10. Fasi di implementazione (registro + criteri di accettazione)

> Stato dettagliato per attività in `docs/04`. Qui la definizione delle fasi.

| Fase | Contenuto | Criteri di accettazione | Stato |
|------|-----------|-------------------------|-------|
| **F0** Setup | Progetto Next 16 + Tailwind + shadcn/ui, struttura lib/ | `bun run dev` OK, lint pulito | ✅ |
| **F1** Dati | Tipi + parser tollerante + proxy API + gestione errori | Demo JSON reale → snapshot corretto; errori 1004/401 mappati | ✅ |
| **F2** UI quota | ModelCard, barre, QuotaRing, badge stato, countdown | Valori del JSON reale mostrati correttamente (100% / 64% / stati) | ✅ |
| **F3** Tempo Roma | lib/time.ts, countdown vivi 1s, formati it-IT | Reset mostrati: 17:00 (5h), 03/10 02:00 (video), 05/10 02:00 (weekly); ora server dedotta 13:17:58 | ✅ |
| **F4** Storico | pushHistory localStorage, HistoryChart, StatsPanel, trend | Grafico renderizzato; dedup <20s; cap 600 punti | ✅ |
| **F5** Robustezza | Import JSON, modalità demo, TechInfo/RawJson, screenshot verify desktop+mobile | Import JSON reale OK; zero errori console; lint pulito | ✅ |
| ~~**F6a** Token reali~~ | ~~Route `/api/minimax/chat`, lib/token-log.ts, TokenTracker~~ | **RIMOSSA 2026-10-02 (ADR-8)**: ogni chiamata chat con Subscription Key consumava la quota del piano; il monitor resta read-only | 🚫 |
| **F6b** Estensioni | Avvisi soglia + registro eventi (I17/I21), export CSV/JSON (I22), verdetto esaurimento vs reset (I23), panoramica modelli (I24) | Banner soglia verificato in demo; transizione → toast + evento; verdetto corretto su dati demo; lint pulito; mobile OK | ✅ |
| **F7** Persistenza server (I16) | `prisma/schema.prisma` (UsagePoint), `api/history` (POST/GET/DELETE + pruning), `lib/server-history.ts`, sync in `page.tsx`, export completo, badge «punti sul server» | curl: upsert dedup (3→2 punti), GET since, DELETE, validazione; browser: replica demo → badge corretto; storage svuotato → storico ripristinato dal server (merge); demo backfill non sovrascrive il merge; lint+tsc puliti | ✅ |

Verifiche effettuate con agent-browser (screenshot in `scripts/verify_*.png`,
`preview_*.png`): render desktop/mobile, import JSON reale, coincidenza dei countdown
con i calcoli manuali, pannello endpoint, console pulita.

---

## 11. Estensioni future (roadmap candidate)

> Aggiornata al 2026-10-02: rimossi il contatore token reale (ADR-8) e la correlazione
> token↔quota che ne dipendeva; implementate le estensioni F6b di analisi/monitoraggio
> e la persistenza storica server-side (I16, punto 1 della vecchia roadmap).

1. **Confronto tra finestre consecutive**: con lo storico server ora disponibile
   (I16), confrontare weekly corrente vs precedente, consumo per ciclo 5h, medie
   mobili sui dati persistenti.
2. **Fallback automatico** su `coding_plan/remains` se `token_plan/remains` fallisse (V4 in `docs/04`).
3. **Multi-regione simultanea**: query parallela eu+cn per chi ha chiavi in entrambe.
4. **PWA/offline**: installazione e ultima snapshot cache; notifiche soglia anche a tab
   chiuso via Service Worker (oggi: banner + toast + Notification API solo a tab aperto).
5. **Statistiche aggregate di lungo periodo**: consumo medio per giorno della settimana,
   medie mobili e calendario dell'uso sui punti già persistiti (I16 fornisce i dati).
6. **Soglie personalizzate per finestra**: oggi le soglie sono globali (warn/crit);
   potrebbe avere senso differenziarle tra finestra 5h e settimanale.
7. **Storico eventi oltre 200**: oggi il registro è un diario di sessione; con il
   DB server-side può diventare storico completo con filtri (stesso schema di I16).

### Rimosse dalla roadmap

- ~~Contatore token reale via `/v1/chat/completions`~~ — **rimosso** (era F6a, ADR-8):
  con la Subscription Key ogni chiamata consuma la quota del piano che il monitor deve
  solo osservare. Alternativa senza consumo: lettura manuale della console ufficiale
  (docs/01 §6).
- ~~Correlazione token ↔ calo percentuale quota~~ — **rimossa** (dipendeva dal contatore,
  ADR-8).
