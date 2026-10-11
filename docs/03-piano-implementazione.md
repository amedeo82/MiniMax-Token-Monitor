# 03 — Piano di implementazione e architettura

> **Scopo**: descrivere COME il dashboard è costruito (e perché), con la mappa del
> codice, i modelli dati, i flussi chiave, la gestione degli errori e le fasi di
> lavoro con i criteri di accettazione. È la guida operativa per qualsiasi nuova
> implementazione: nuova funzione → nuova voce nelle fasi (`docs/04`).
>
> Ultimo aggiornamento: 2026-10-11 (§5.13 batch 3 infrastruttura — design I80 endpoint summary / I81 test componente / I68 downsampling orario). Precedente: 2026-10-11 (§5.12 batch 2 analisi — design I70 anomalie ritmo / I71 qualità campionamento / I72 proiezione EWMA).

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
| `prisma` + SQLite (`db/custom.db`) | F7/F8 persistenza server-side: storico (UsagePoint, 10.000 punti/90 giorni) e archivio eventi (UsageEventRecord, 5.000/180 giorni) — `bun run db:push` |
| `Intl.*` nativo | fuso Europe/Rome + locale it-IT (nessuna lib di date necessaria) |
| `localStorage` | persistenza settings + mirror client di storico/eventi (fonte primaria per la UI, ADR-10/11) |

---

## 3. Mappa del codice

| File | Responsabilità |
|------|----------------|
| `src/lib/minimax.ts` | Tipi (`UsageSnapshot`, `ModelQuota`, `QuotaWindow`, `ApiError`), `REGION_ENDPOINTS`, **I18**: `CODING_PLAN_ENDPOINTS` (endpoint alternativo per regione), `FALLBACK_TRIGGER_HTTP` {404,405,410,501}, `PrimaryFailureKind`, `shouldTryFallback()` (decisione pura di fallback), `parseUsageResponse()` (tollerante: risposta piatta o sotto `data`, epoch s/ms, status numerici o testuali), `statusLabel()`, `consumedPercent()`, `inferServerTime()`, `quotaLevel()`, `modelLabel()`, `EXTRA_ENDPOINTS` |
| `src/lib/time.ts` | `TZ_ROME`, `LOCALE_IT`, `toDate()` (accetta epoch s/ms, ISO, Date), `formatFullRome/DateTimeRome/TimeRome/DateRome/ShortRome`, `romeZoneInfo()`, `formatCountdown()`, `formatDuration()`, `msUntil()`, `windowProgress()` |
| `src/lib/usage-events.ts` | Motore di monitoraggio: registro eventi (`mm-dash-events-v1`, max 200: `loadEvents/appendEvents/clearEvents/replaceEvents/makeEvent`), `deriveBanner()` (banner quota bassa stateless), `evaluateTransitions()` (soglie warn/crit + reset tra due snapshot), `canNotify()/notifyBrowser()` (Notification API), `AlertConfig` con **soglie per tipo di finestra** (I28: `AlertThresholds {h5,h24,weekly}`, `windowThresholdKey()` risolve il tipo dalla durata reale start→end, `migrateLegacyThresholds()` per il vecchio formato globale) |
| `src/lib/export.ts` | Esportazione locale: `historyToCsv()/eventsToCsv()` (CSV «;» + BOM UTF-8, Excel it-IT), `exportHistoryCsv/Json()`, `exportEventsCsv()`, `downloadTextFile()` |
| `src/lib/server-history.ts` | I16 sync client↔server dello storico: `pushPointToServer()` (fire-and-forget, con callback `onTotal`), `fetchServerHistory()`, `mergeHistories()` (dedup per timestamp, vince il punto locale), `serverPointsToHistory()`, `clearServerHistory()` |
| `src/lib/server-events.ts` | I27 sync client↔server del registro eventi (stesso schema di I16): `pushEventsToServer()` (fire-and-forget batch), `fetchServerEvents()`, `mergeEvents()` (dedup per id, vince il locale), `serverEventsToEvents()`, `clearServerEvents()` |
| `src/lib/cycles.ts` | I26 analisi di lungo periodo: `detectCycles()` (segmenta lo storico nei cicli di finestra: reset = salto ≥+15 punti che riporta a ≥85 — `RESET_JUMP`/`RESET_TARGET` — robusto contro sorgenti miste), `summarizeCycles()` (medie sui cicli completati), `weekdayConsumption()` (consumo per giorno Europe/Rome sul calo del minimo progressivo), `heatmapConsumption()` (I32: griglia 7×24 giorno × ora, stessa semantica drawdown, attribuzione alla cella del punto medio), `movingAverage()` (SMA) |
| `src/lib/demo.ts` | Generatore demo realistico: finestra 5h aperta 3,2h fa, weekly 2,7 giorni fa, video con finestra 24h allineata a mezzanotte UTC e stato 3, jitter per animare il grafico |
| `src/app/page.tsx` | Stato globale pagina: settings/history/events (localStorage + mirror server I16), fetch/polling, import JSON, demo, orologio 1s, transizioni avvisi (toast + notifiche), layout |
| `prisma/schema.prisma` | Modello `UsagePoint` (t unique, interval, weekly, source, region) — storico server-side, nessun dato sensibile |
| `src/app/api/minimax/usage/route.ts` | Proxy POST → GET MiniMax token_plan/remains; timeout 12s; mappatura errori HTTP/business in italiano; **I18**: campagna di fetch `tryEndpoint()` riusabile (ritenti transitori I51) per primario e fallback `coding_plan/remains` — sul fallimento definitivo per endpoint scomparso tenta l'alternativo e risponde con `fallback {used, primaryEndpoint, reason}` (o `fallbackTried: true`), mai su auth né su errori transitori |
| `src/app/api/history/route.ts` | I16 persistenza storico (SQLite/Prisma): POST (upsert per `t`, validazione input, pruning FIFO a 10.000 punti + cutoff 90 giorni), GET (`?limit=&since=`, ordinato per `t`), DELETE (svuota). La chiave API non transita mai qui |
| `src/app/api/events/route.ts` | I27 persistenza registro eventi (SQLite/Prisma): POST (upsert per `id`, validazione tipo/finestra/messaggio, max 500 eventi/richiesta, pruning a 5.000 eventi + cutoff 180 giorni), GET (`?limit=&since=&kind=`, ordinato per `t`), DELETE (svuota). Nessuna chiave API transita qui |
| `src/components/quota-cards.tsx` | `ModelCard` (card per modello: due finestre con barre, countdown, badge stato), `MainWindows` (riepilogo finestre general), `CountsRow` (residuo/totale/consumato + nota su percentuali), `windowKindLabel()` (5h vs 24h dinamica) |
| `src/components/quota-ring.tsx` | `QuotaRing`: anello SVG percentuale |
| `src/components/history-chart.tsx` | `HistoryChart` (Recharts ComposedChart, switch finestra interval/weekly, toggle «Media mobile» = SMA-10 tratteggiata, **I32 toggle «Cicli»**: fasce alternate per ciclo di finestra + marker rossi dei reset osservati — `detectCycles` ritagliato sull'arco visibile, dropdown Esporta: storico locale CSV/JSON + storico completo dal server), `computeTrend()`, `StatsPanel` (+ verdetto `ProjectionVerdict`: esaurimento stimato vs orario di reset; **I31 `computePace()`/`PaceInfo` + `PacePanel`**: ritmo attuale vs ritmo di pareggio %/h, quota sprecata prevista al reset, fermo tecnico se l'esaurimento anticipa il reset — tre stati visivi viola/ambra/verde; contatore punti server), `TrendBadge` |
| `src/components/model-table.tsx` | `PanoramicTable`: tabella comparativa di tutte le finestre del piano (modello × finestra: residuo con mini-barra, stato, countdown reset) |
| `src/components/analysis-panel.tsx` | I26 `LongTermAnalysis`: pannello «Analisi di lungo periodo» con 4 tab (Cicli 5 ore / Cicli settimanali / Per giorno / **Per ora — I32**) — KPI (cicli, durata media, consumo medio, ritmo %/h), tabella ultimi 8 cicli con ciclo in corso evidenziato, grafico a barre consumo medio per giorno della settimana (5h + settimanale), **heatmap 7×24 (I32)** con selettore finestra, KPI (consumo attribuito, ora di picco, celle attive su 168), scala viola con radice quadrata e tooltip per cella (consumo + n° cali attribuiti); scarica automaticamente fino a 10.000 punti dal server al mount e li fonde con lo storico locale |
| `src/components/event-log.tsx` | `EventLog`: timeline del registro eventi raggruppata per giorno (Europe/Rome), badge per tipo, menu Esporta (CSV/JSON locale + archivio COMPLETO dal server I27), svuotamento locale+server |
| `src/components/tech-panels.tsx` | `RawJsonPanel` (JSON grezzo con orario fetch), `TechInfo` (regione, modalità, endpoint, ora server dedotta, pannello "altri endpoint utili", avviso semantica `usage_count`) |
| `src/components/settings-dialog.tsx` | `DashboardSettings` { apiKey, region, refreshSeconds, demoMode, alertsEnabled, **thresholds** (AlertThresholds {h5,h24,weekly} — I28, matrice 3×2 nel tab «Avvisi» con migrazione legacy ADR-12), notifyReset, browserNotifications }, import JSON con validazione, richiesta permesso notifiche |

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

// prisma/schema.prisma (I16 + I27 — SQLite)
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
model UsageEventRecord {
  id        String   @id        // id client (timestamp+contatore), dedup upsert
  t         DateTime            // momento dell'evento (epoch ms)
  kind      String              // reset | warn | crit | error | info
  model     String?             // modello coinvolto o null
  win       String?             // interval | weekly | null
  message   String              // descrizione in italiano
  value     Float?              // % residua all'evento, se rilevante
  createdAt DateTime @default(now())
  @@index([t])
  @@index([kind])
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
- **Soglie per finestra (I28)**: ogni finestra usa le soglie del proprio tipo —
  `h5` (5 ore, modelli testo), `h24` (giornaliera, video), `weekly` (settimanale);
  il tipo è risolto da `windowThresholdKey()` con la durata reale start→end
  (23–25h → h24, 4–6h → h5) e fallback sul nome modello; migrazione automatica
  dalle vecchie soglie globali (`migrateLegacyThresholds`, ADR-12);
- **Banner** (`deriveBanner`): stateless, derivato dallo snapshot corrente — ogni
  (modello, finestra) sotto la PROPRIA soglia produce una voce dell'Alert
  amber/rose (crit prevale su warn);
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

### 5.8 Sincronizzazione del registro eventi (I27)
Stesso schema offline-first del §5.7, applicato agli eventi (reset, soglie, errori):
- **Replica**: ogni evento creato da `addEvents()` (transizioni, errori di rilevamento)
  viene inviato a `POST /api/events` in fire-and-forget batch; la risposta aggiorna il
  contatore «N in archivio sul server» nella descrizione del pannello;
- **Merge all'avvio**: `GET /api/events?limit=5000` → `mergeEvents()` (dedup per **id**,
  vince la copia locale) → il registro locale resta limitato a 200 voci (diario di
  sessione), il server conserva l'archivio completo (5.000 eventi / 180 giorni);
- **Dedup server**: upsert su `id` (l'id client è `timestamp-contatore`, unico per evento);
- **Pruning**: dopo ogni POST eliminati gli eventi più vecchi di 180 giorni e oltre 5.000 (FIFO);
- **Export completo**: menu «Esporta» del registro → CSV/JSON locale (eventi in memoria)
  + CSV/JSON dell'archivio COMPLETO dal server (`fetchServerEvents(5000)`);
- **Svuota**: cancella SEMPRE locale + server (altrimenti il merge all'avvio risusciterebbe
  gli eventi cancellati dal dispositivo);
- **Privacy**: su DB arrivano solo timestamp, tipo, messaggio e % residua dell'evento;
  nessuna chiave API transita su `/api/events`.

### 5.9 Fallback automatico sull'endpoint alternativo (I18)
Resilienza contro lo scenario «l'endpoint primario `token_plan/remains` viene ritirato o
smette di rispondere come API JSON»: il monitor non si ferma, ma continua a rilevare
dall'endpoint alternativo `coding_plan/remains` (stessa struttura e stessi dati — verdetto
V4 = IDENTICI del 09/10, accettazione documentale dopo la perdita degli esiti col secondo
rollback; `docs/01` §4, `docs/05` §6):

- **Decisione pura** (`lib/minimax.ts`): `shouldTryFallback(kind, httpStatus)` risponde SI
  solo su HTTP 404/405/410/501 (`FALLBACK_TRIGGER_HTTP`: endpoint assente/rimosso/metodo
  non accettato) e su `bad_json` (il primario risponde ma non è più JSON — es. pagina di
  login HTML: segnale tipico di dismissione); NO su `auth` (401/403 o chiave rifiutata:
  il fallback userebbe la stessa chiave), su `network`/`timeout` (transitori: interviene
  il retry I51 con backoff) e su errori HTTP non catalogati;
- **Proxy** (`api/minimax/usage/route.ts`): la campagna di fetch è estratta in
  `tryEndpoint()` (1 tentativo + 2 ritenti transitori I51, timeout 12s per tentativo)
  usata identicamente per primario e fallback; sul fallimento definitivo del primario con
  trigger valido viene interrogato `CODING_PLAN_ENDPOINTS[region]` — successo → risposta
  `ok:true` con `endpoint` = URL alternativo e `fallback {used: true, primaryEndpoint,
  reason}`; fallback fallito a sua volta → prevale l'errore del PRIMARIO (più rilevante
  per la diagnosi) con annotazione `fallbackTried: true`;
- **Client** (`page.tsx`): `fallbackActiveRef` traccia la sorgente dell'ultimo rilevamento;
  eventi tecnici «info» SOLO sulla transizione (attivazione: «Endpoint primario non
  disponibile (motivo): dati da coding_plan/remains»; ritorno: «Ritorno all'endpoint
  primario token_plan/remains») — nessuno spam a ogni poll; il ritorno al primario con
  errore è silenzioso (lo copre già l'evento «Rilevamento fallito»); il pannello TechInfo
  mostra comunque l'endpoint effettivamente usato (campo `endpoint` della risposta);
- **Parser condiviso**: nessuna modifica a `parseUsageResponse` (V4 = IDENTICI); test
  dedicati in `tests/lib/minimax-fallback.test.ts` (endpoint, trigger, decisione, parità
  parser) + check I18 nell'audit (`docs/04` §3).

### 5.10 PWA / offline e notifiche a tab chiuso (I52, ADR-14)
I52 rende la dashboard **installabile** e capace di avvisare anche a tab chiuso, senza
mai esporre la Subscription Key né consumare chiamate extra fuori dai polling richiesti:

- **Componenti**: `public/sw.js` (Service Worker) + `public/sw-shared.js` (fonte unica
  della logica condivisa, vedi sotto) + `src/app/manifest.ts` (manifest webmanifest) +
  icone PNG generate da `scripts/genera-icone-pwa.mjs` (sharp: 192/512 + apple 180) +
  `src/components/pwa-register.tsx` (registrazione + passaggio segreti);
- **ADR-14 — passaggio segreti via postMessage → IndexedDB**: la Subscription Key resta
  nel localStorage della pagina; `pwa-register.tsx` la invia al SW via `postMessage`
  (messaggio `SECRETS`, insieme a regione, soglie e flag avvisi) e il SW la conserva
  SOLO in IndexedDB (db `mm-dash-sw`, store `secrets`) — mai in Cache Storage, mai nel
  codice del SW, mai nei log; in demo mode o chiave rimossa il messaggio porta
  `apiKey: null` e il SW cancella segreto e stato;
- **sw-shared.js — fonte unica testata**: il SW (classico script, `importScripts`)
  non può importare i moduli TS, quindi `sw-shared.js` duplica in JS puro la logica
  essenziale: `parseUsagePayload` (specchio di `parseUsageResponse`), `quotaKeyFor`
  (specchio di `windowThresholdKey`), `evaluate` (specchio di `evaluateTransitions`);
  la garanzia di equivalenza sono i **test di parità** (`tests/lib/sw-parity.test.ts`,
  14 test): le stesse fixture passano da entrambe le implementazioni e gli output
  vengono confrontati;
- **Notifiche a tab chiuso**: messaggio `CHECK_NOW` (al focus/visibilità della pagina)
  o evento `periodicsync` (tag `mm-check`, dove il browser lo supporta) → il SW legge i
  segreti da IndexedDB, chiama il PROXY (stessa rotta della pagina: la chiave non tocca
  MiniMax direttamente da terze parti), parsa lo snapshot con la logica condivisa,
  confronta con lo stato precedente (store `state`) e notifica warn/crit/reset con
  `registration.showNotification` (tag univoco per modello+finestra, `renotify`);
- **Cache offline**: shell (`/`, manifest, icone) in cache all'installazione; GET
  rete-prima con fallback cache per navigazioni, `/_next/static` e `GET /api/history`;
  POST `/api/minimax/usage` passa attraverso e viene cachato MANUALMENTE **solo se
  `ok: true`** (BUG CORRETTO «1004 cachato»: un errore di autenticazione non deve mai
  diventare l'«ultimo dato noto» offline); BUG CORRETTO «base_resp annidato» coperto
  dal parser condiviso (base_resp letto a radice o dentro `data`);
- **Ciclo di vita**: `skipWaiting` a installazione, pulizia cache vecchie a attivazione,
  messaggio `SKIP_WAITING` dal nuovo SW quando la pagina ne rileva uno in attesa
  (aggiornamento immediato senza aspettare la chiusura di tutti i tab).

### 5.11 Batch 1 client-only: selettore intervallo, filtri eventi, error boundary, modalità compatta (I69/I77/I76/I73)
Quattro miglioramenti **puramente client-side** da `docs/07` (§5.2, §5.10, §5.9, §5.6) —
basso rischio, nessuna modifica a proxy, DB o protocollo di polling:

- **I69 — Selettore intervallo temporale**: preset `6h · 24h · 3g · 7g · 30g · tutto`
  con filtro client-side sullo storico già in memoria. Logica pura in `lib/interval.ts`
  (`RANGE_PRESETS`, `filterHistoryByPreset(history, preset, nowMs)`: finestra
  `[now − ampiezza, +∞)` inclusiva, ordine cronologico preservato, `tutto` restituisce
  l'array originale). Lo stato `rangePreset` vive in `page.tsx` e il filtro si applica a
  **grafico + StatsPanel/trend + ritmo (RateChart) + analisi di lungo periodo**;
  la Diagnostica (I60/I62) resta deliberatamente sullo storico COMPLETO (i guasti e i
  blocchi teorici vanno giudicati sull'intera osservazione, non sull'ultimo tratto);
  default «tutto» = comportamento identico al passato. Selettore UI a chips (ToggleGroup)
  sopra il grafico, dentro l'àncora `#grafico`;
- **I77 — Filtri del registro eventi**: logica pura in `lib/event-filters.ts`
  (`filterEvents(events, filtri, nowMs)`): chips multi-selezione per `kind`
  (nessuna selezionata = tutti), ricerca testuale case-insensitive su messaggio e
  modello, periodo (`tutto` / `oggi` a Roma / `24h` / `7g`). Filtri applicati PRIMA del
  raggruppamento per giorno; contatore «N di M eventi» e empty state dedicato quando i
  filtri escludono tutto; l'export (CSV/JSON) resta sull'archivio COMPLETO (i filtri sono
  una vista, non una cancellazione) e il menu Esporta lo dichiara;
- **I76 — Error boundary per sezione + fix del bug noto**: (a) fix in `event-log.tsx`:
  il suffisso «· NN% residuo» è stampato solo con `typeof e.value === "number"` — la
  vecchia condizione `e.value !== null` lascava passare `undefined` (evento senza
  `value`, es. da fonti esterne/archivio) e crashava `.toFixed(1)` portando giù l'intera
  pagina (evidenza empirica `docs/07` §5.9); (b) nuovo `components/section-boundary.tsx`:
  error boundary React (class component, `componentDidCatch`) con skeleton di fallback
  animato, messaggio tecnico e pulsante «Riprova» (reset dello stato interno); ogni
  sezione principale della pagina (anelli, grafico+stats, ritmo, panoramica, analisi,
  diagnostica, tecnici, eventi, altri modelli) è avvolta in modo indipendente: un crash
  in un pannello non elimina più l'intera dashboard;
- **I73 — Modalità compatta / widget**: `?compact=1` (helper puro `readCompactMode` in
  `lib/compact.ts`, parsing robusto del querystring) trasforma la pagina in un widget:
  header ridotto (titolo, orologio Roma, aggiorna, uscita dalla modalità), solo
  **anelli principali + countdown (MainWindows) + ritmo (RateChart)**, senza nav,
  banner sezioni, panoramica, analisi, diagnostica, tecnici, registro, footer; errore
  API e schermata di setup restano visibili (servono alla funzione). Compatibile con la
  PWA installata (I52): è la stessa pagina, apribile con URL `/?compact=1` da shortcut
  o schermo secondario.

---

### 5.12 Batch 2 analisi: anomalie del ritmo, qualità del campionamento, proiezione EWMA (I70/I71/I72)
Tre miglioramenti **puramente client-side di analisi** da `docs/07` (§5.3, §5.4, §5.5) —
nessuna modifica a proxy, DB o protocollo di polling; tre nuove librerie pure con
rispettiva suite di test, agganciate alla Diagnostica (I70/I71) e al pannello pace (I72):

- **I70 — Anomalie del ritmo**: logica pura in `lib/rate-anomalies.ts`
  (`detectRateAnomalies(history, win, opts)`): z-score ROBUSTO secondo
  **Iglewicz–Hoaglin** sui ritmi GREZZI di `rateSeries(history, win, { sma: 1 })`
  (la SMA-3 di default va evitata: smorzerebbe proprio i picchi da segnalare).
  Statistiche: mediana `m` dei ritmi validi, `MAD = mediana(|x − m|)`,
  `z = 0.6745·(x − m)/MAD`; anomalia se `|z| > 3.5` (soglia classica, opzione
  `threshold`). Con **meno di 8 campioni validi** (`minValidi`) le statistiche non
  sono affidabili: nessuna anomalia riportata. Fallback documentato quando
  `MAD = 0` (serie quasi tutta sullo stesso valore): si usa la media degli scarti
  assoluti come scala; se anche quella è 0 (tutti identici) non ci sono anomalie.
  Esito: `{ mediana, mad, scala, soglia, validi, anomalie: [{ i, t, valore, z }] }`
  (anomalie in ordine cronologico, z con segno per distinguere scoppi `>` e pause `<`).
  UI: nuova sezione «Anomalie del ritmo» nel **pannello Diagnostica** (storico
  COMPLETO, coerente con la filosofia I60/I62: il regime va giudicato sull'intera
  osservazione) — regime atteso (mediana %/h), soglia usata, elenco delle anomalie
  (max 8, dalla più recente) con data Roma, ritmo e z; empty state dedicato;
- **I71 — Qualità del campionamento**: logica pura in `lib/sampling.ts`
  (`samplingQuality(history, opts)`): quanto lo storico è «buono» PRIMA di fidarsi
  delle analisi (complementare alla campagna V8). (a) **Mediana dell'intervallo**
  campionario osservato (robusta ai buchi, esclusi i dt ≤ 0); (b) **copertura per
  giorno Roma**: i punti sono attribuiti al giorno Europe/Rome via chiave
  `YYYY-MM-DD` (Intl `en-CA`, DST-safe come `startOfTodayRome` I77); per ogni giorno
  `atteso = arco coperto / medianaIntervallo` (l'arco coperto va dal primo all'ultimo
  punto del giorno e l'ultimo punto copre un intervallo suo) e
  `osservati/atteso` limitato al 100%; (c) **gap > 15 min** (`gapMin`, default 15:
  esattamente 15 min NON è un gap) con inizio, fine e durata. Esito:
  `{ medianaIntervMs, totalePunti, giorni: [{ key, osservati, attesi, copertura }], gaps: [{ from, to, ms }] }`
  (giorni in ordine cronologico, gap dal più recente). UI: nuova sezione «Qualità del
  campionamento» nella Diagnostica — badge di copertura complessiva (media delle
  coperture giornaliere), tabella degli ultimi 7 giorni con barra di copertura,
  elenco dei gap con durata; empty state con meno di 2 punti;
- **I72 — Proiezione EWMA (confronto A/B)**: logica pura in `lib/ewma.ts`
  (`ewmaProjection(history, win, opts)`): alternativa **esponenzialmente pesata** al
  verdetto lineare di I23/I31. Ritmi istantanei calcolati con le STESSE regole di
  `lib/rate.ts` (gap > 30 min → scartato, risalita/reset → scartato), ciascuno pesato
  con `w = exp(−(tUltimo − t_i)/halfLife)` dove `t_i` è il tempo del SECONDO
  rilevamento della coppia (quando il ritmo è stato misurato); `halfLifeMs` default
  **2h** (la finestra 5h dura 5 ore: una mezza vita di 2h pesa l'ultimo tratto ~1,6×
  il precedente e reagisce prima dei 60 punti a corda di `computeTrend`, al prezzo
  di più rumore — è esattamente il trade-off da rendere visibile). `ritmoEWMA =
  Σ w·r / Σ w`; esaurimento stimato solo se `ritmoEWMA > 0.01` (stessa soglia di
  `computeTrend`). Esito: `{ ritmo, esaurimentoAt, esaurimentoMs, campioni, halfLifeMs }`.
  UI: card «Proiezione EWMA (A/B)» in `StatsPanel` **affiancata al verdetto, NON
  sostitutiva** (badge «sperimentale»): esaurimento lineare vs EWMA con la differenza,
  e una riga di lettura (EWMA anticipa o conferma il lineare); wiring: `page.tsx`
  calcola `ewmaProjection(filteredHistory, chartWindow)` (segue l'intervallo I69) e la
  passa come prop; con meno di 2 ritmi validi → N/D spiegato.

---

### 5.13 Batch 3 infrastruttura: endpoint summary, test di componente, downsampling orario (I80/I81/I68)
Tre miglioramenti di **infrastruttura/integrazione** da `docs/07` (§5.13, §5.14, §5.1) —
l'unico che tocca il DB è I68 e riguarda SOLO dati derivati (aggregati orari), non i
punti grezzi:

- **I80 — Endpoint read-only `/api/summary`**: nuova route `GET /api/summary` SENZA
  chiave e senza parametri, per widget esterni (statusline, home assistant, script
  cron). Restituisce SOLO numeri aggregati: `punti` (totale/api/demo/altro),
  `arco` (primo/ultimo timestamp), `ultimoRilevamento` (t, interval, weekly, source),
  `eventi` (totale, per kind, ultimo) e `downsample` (ore, prima, ultima — I68).
  Tutte le query sono di lettura (`count`/`findMany`/`groupBy`): **ADR-8 intoccato**,
  nessuna scrittura, nessun dato sensibile (sono le stesse percentuali già mostrate
  nella UI pubblica); errori mappati in italiano come le altre route;
- **I81 — Test di componente UI**: prima tornata in `tests/components/` con
  `@testing-library/react` v16 + `happy-dom` (GlobalRegistrator: il pattern ufficiale
  di Bun per il DOM nei test — **jsdom scartato** perché sotto Bun il suo
  `requestAnimationFrame`/`act` è meno affidabile con React 19; nota anche in
  `docs/07` §5.14). Casi: `quota-ring` (render del valore e del N/D, classe colore),
  `section-nav` (8 ancore con label, IntersectionObserver mockato — non serve al
  render), `event-log` (contatore «N di M eventi», filtro per kind via click sulla
  chip, empty state), `section-boundary` (un figlio che lancia → fallback con
  «Riprova», console.error silenziata). Le librerie pure restano coperte dalla suite
  `tests/lib/` (già 212 test);
- **I68 — Archivio con downsampling orario**: nuova tabella Prisma
  `DownsampledPoint` (bucket per `(hourStart UTC, source)`: min/max/somma/ultimo per
  interval e weekly + `count` + `lastT`; media = somma/count). La tabella è
  **dato derivato**: viene mantenuta nella stessa `POST /api/history` che salva il
  punto grezzo (merge incrementale del bucket via `mergeHourBucket()` pura in
  `lib/downsample.ts`) e ripulita dallo stesso pruning a 90 giorni; il dato GREZZO
  (`UsagePoint`) resta intatto — nessuna informazione persa, ADR-8 invariato.
  Lettura: `GET /api/history?granularity=hour` restituisce i bucket (limit/since
  come il fine grain). Backfill: `scripts/verifiche/backfill-downsample.mjs`
  ricostruisce l'intera tabella dai punti esistenti (idempotente, upsert). Consumo
  client minimo e sicuro: due nuove voci nel menu Esporta («storico ORARIO dal
  server» CSV/JSON, via `fetchServerHourly()` + `serverHourlyToHistory()` che usa
  l'ultimo valore del bucket per continuità col grafico). Il passaggio AUTOMATICO
  del grafico principale alla grana oraria oltre soglia resta candidato (documentato
  in `docs/07` §5.1): la UI client lavora sui 600 punti locali e le analisi
  scaricano il fine grain — cambiare quel comportamento non era parte del batch.

### 5.14 Batch 4 UX: navigazione mobile, vista stampa, tema chiaro (I74/I75/I78)
Tre miglioramenti **client-only** dal backlog di `docs/07` (§5.7, §5.8, §5.11) —
proxy, DB e protocollo di polling intoccati; nessuna dipendenza nuova (`next-themes`
è già presente ma inutilizzato):

- **I74 — Navigazione inferiore su mobile**: nuova `BottomNav` (`components/bottom-nav.tsx`)
  fissa al fondo (`fixed inset-x-0 bottom-0 z-40 md:hidden`, safe-area iOS gestita con
  `pb-[env(safe-area-inset-bottom)]`) come ALTERNATIVA alla nav sticky I66 su telefono:
  su <md la nav sticky superiore è nascosta (`hidden md:block` nel wrapper di page.tsx) e
  la barra inferiore mostra le stesse 8 ancore di `SEZIONI` con target touch più grandi
  (`px-3 py-2 text-xs`), scroll orizzontale come la superiore e lo stesso scrollspy
  (IntersectionObserver con la medesima radice di rootMargin). `--nav-offset` NON cambia:
  il salto alle ancore resta header+56px anche su mobile (respiro volontario, la barra
  sta sul fondo). Per evitare che il footer resti coperto dalla barra: spaziatore
  `h-16 md:hidden` dopo il footer (solo fuori dalla vista compatta I73 — il widget non
  ha né nav né barra). Aria: `aria-label="Navigazione sezioni (mobile)"`, `aria-current`
  come la nav superiore;
- **I75 — Vista stampa / report settimanale**: due livelli.
  (1) **Foglio di stampa generico** (`@media print` in globals.css): pagina su bianco
  (testo scuro, niente sfondi decorativi né glow), nascosti header/footer/nav superiore/
  inferiore/banner azioni/bottoni, `break-inside: avoid` sulle card — Ctrl+P produce
  comunque un documento leggibile.
  (2) **Report settimanale dedicato**: `components/print-report.tsx` — blocco
  `hidden print:block` composto SOLO per la carta con: intestazione (titolo, data/ora
  Roma, arco dati), verdetto lineare + EWMA (I23/I72), riepilogo cicli (detectCycles +
  summarizeCycles), spreco per ciclo (sprecoPerCiclo — I57), consumo per giorno della
  settimana (weekdayConsumption) e calendario consumo ultime settimane
  (consumoGiornaliero — I58) in tabelle testuali. Lancio: voce «Stampa report
  settimanale» in cima al menu Esporta del grafico (prop `onStampaReport` opzionale —
  in vista compatta il menu non c'è e la voce non esiste); il flusso usa
  `lib/print.ts` → `stampaReportSettimanale()`: aggiunge `print-report` a `<body>`,
  chiama `window.print()` e rimuove la classe su `afterprint` (regole print:
  `body.print-report` nasconde TUTTO il main tranne il blocco report, così la stampa
  contiene SOLO il report);
- **I78 — Tema chiaro opzionale**: `next-themes` (già dipendenza) con strategia
  `class`, `defaultTheme="dark"` e `enableSystem={true}`: nessun cambiamento per gli
  utenti esistenti (senza preferenza salvata resta il dark; il localStorage `theme`
  di next-themes decide solo dopo una scelta esplicita). `layout.tsx` avvolge l'app
  nel `ThemeProvider` (già `suppressHydrationWarning` su `<html>`); il Toaster usa il
  wrapper shadcn che già legge `useTheme` (rimossa la forzatura `theme="dark"`).
  Scelta tema in DUE punti: toggle icona nel header
  (`components/theme-toggle.tsx`, Sun/Moon — se `theme` è esplicito alterna chiaro/scuro)
  e Select «Tema» (Sistema/Chiaro/Scuro) nel NUOVO tab «Aspetto» delle impostazioni
  (grid-cols-3 → grid-cols-4). La palette chiara NON tocca i componenti: nuovo strato
  di override in globals.css sotto `html:not(.dark)` (stessa tecnica già usata per gli
  hover dark: regole unlayered con specificità maggiore) che ri-mappa le superfici
  hardcoded — `bg-[#09090b]`→bianco, `text-zinc-100/200/300`→toni scuri,
  `text-zinc-500/600`→grigi medi, `border-white/[0.06..0.10]`→`black/8..12`,
  `bg-white/[0.02..0.10]`→`black/3..8`, `bg-zinc-950`→bianco, badge/scritte
  `-300`→`-600/700` leggibili su bianco, più `color-scheme: light` per scroll e form.
  I grafici recharts e gli SVG usano colori espliciti scelti per il dark: le griglie
  `rgba(255,255,255,0.06)` e i tick `#71717a` restano leggibili su bianco (grigio su
  grigio chiaro), i colori serie (emerald/amber/sky/rose) sono saturi e leggibili su
  entrambi i fondi — nessun intervento richiesto, nota onesta in `docs/07` §5.11.
  Favicon e ring (I65/I67) sono canvas/SVG colorati: invariati per costruzione.

> **Implementato 11/10** con due lezioni emerse in itinere:
> 1. **I75**: l'header del report era un `<header>` e la regola print generica
>    (`header { display: none }`) lo nascondeva ANCHE lui — il PDF di prova iniziava
>    direttamente dal verdetto. Corretto: l'header del report è un `<div>` (nota nel
>    componente). La verifica del flusso di stampa è stata fatta con un PDF REALE
>    (`Page.printToPDF`, media print): con `print-report` attivo il foglio contiene
>    SOLO il report, intestazione inclusa; in headless `afterprint` è emesso subito,
>    quindi la classe viene rimossa da sola (flusso di `lib/print.ts` confermato).
> 2. **I74**: `getComputedStyle(nav).display` su un discendente di un wrapper
>    `display:none` restituisce comunque `block` — la nascosta effettiva della nav
>    superiore su mobile va verificata con `offsetParent === null` (e per la barra
>    fissa, che per `position:fixed` ha SEMPRE offsetParent null, con il rect:
>    bottom = altezza viewport).
> Esiti: tsc 0 errori su src/+tests/ (4 baseline esterne), lint OK, suite
> 249/249 (761 asserzioni, +10), audit 203/203 PASS (183→203, +20 check);
> browser: tema chiaro leggibile (screenshot `scripts/verify-batch4-tema-chiaro.png`),
> tab Aspetto funziona (light→dark), voce stampa nel menu con classe transitoria,
> PDF report `scripts/verify-batch4-report.pdf`, mobile 390 con barra fissa e top
> nav assente (`verify-batch4-mobile390.png`), desktop dark intatto
> (`verify-batch4-desktop-dark.png`), zero overflow 1280/390, console pulita.

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
│ Banner avvisi soglia (amber/rose) quando una finestra è sotto la propria soglia                       │
├ MainWindows: riepilogo grande delle due finestre del general (QuotaRing + countdown + badge)       │
├ HistoryChart: andamento % nel tempo (switch interval/weekly) + fasce cicli/reset (I32) + export CSV/JSON  │
├ StatsPanel: consumo medio · esaurimento previsto · rilevamenti · VERDETTO esaurimento vs reset     │
│             · PACE + QUOTA SPRECATA (I31: ritmo vs pareggio, residuo al reset, fermo tecnico)       │
├ PanoramicTable: tutte le finestre del piano a confronto (modello × finestra, stato, reset)         │
├ LongTermAnalysis: cicli · per giorno · heatmap ore × giorno (I32, fino a 10.000 punti server)     │
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
- **Cattura chiave rimossa (I30, 2026-10-06)**: durante la campagna verifiche del
  04–05/10 il proxy scriveva TEMPORANEAMENTE la chiave su un file protetto per
  delegare le V1–V6 all'agente (ADR-13); il blocco è stato rimosso e il meccanismo
  chiuso (ADR-13-R): il proxy non scrive più nulla su disco. La procedura per
  ri-armarla, se mai necessaria, è documentata in `docs/05` §10.

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
| **F8** Persistenza eventi (I27) | `prisma/schema.prisma` (UsageEventRecord), `api/events` (POST upsert per id / GET con filtri / DELETE + pruning), `lib/server-events.ts`, `addEvents()` in `page.tsx`, menu Esporta in `EventLog` con archivio server, «Svuota» locale+server | curl: upsert dedup (3→2, aggiornamento messaggio), filtri `since`/`kind`, evento invalido scartato, pruning 180 giorni; browser: transizione import → evento warn replicato (POST 200), badge «1 in archivio sul server», storage svuotato → evento ripristinato (merge), export archivio OK, Svuota → locale+server a 0, mobile 390px OK, zero errori console; lint+tsc puliti | ✅ |

Verifiche effettuate con agent-browser (screenshot in `scripts/verify_*.png`,
`preview_*.png`): render desktop/mobile, import JSON reale, coincidenza dei countdown
con i calcoli manuali, pannello endpoint, console pulita.

---

## 11. Estensioni future (roadmap candidate)

> Aggiornata al 2026-10-02: rimossi il contatore token reale (ADR-8) e la correlazione
> token↔quota che ne dipendeva; implementate le estensioni F6b di analisi/monitoraggio,
> la persistenza storica server-side (I16, punto 1 della vecchia roadmap) e l'analisi di
> lungo periodo (I26: punti 1 e 5 di questa roadmap).

1. ~~**Confronto tra finestre consecutive**~~ — **implementato (I26)**: cicli di finestra
   5h e settimanali rilevati dai salti di reset nello storico, con durata/consumo/ritmo
   medi e tabella comparativa (`lib/cycles.ts` + `analysis-panel.tsx`).
2. **Fallback automatico** su `coding_plan/remains` se `token_plan/remains` fallisse (V4 in `docs/04`).
   *Toolkit verifiche pronto (I29): `scripts/verifiche/verifica.mjs v4` con runbook `docs/05` §6;
   evidenza parziale senza chiave → entrambi gli endpoint HTTP 200 + 1004 con messaggi di auth diversi
   (dettagli in `docs/01` §4). La campagna con chiave reale del 04–05/10 è stata interrotta dal
   riavvio del workspace (I30) e i verdetti non sono recuperabili: **V4 resta l'unico sblocco di I18**
   (vedi nota in `docs/04` §4 e piano `docs/05` §9).*
3. **Multi-regione simultanea**: query parallela eu+cn per chi ha chiavi in entrambe.
4. **PWA/offline**: installazione e ultima snapshot cache; notifiche soglia anche a tab
   chiuso via Service Worker (oggi: banner + toast + Notification API solo a tab aperto).
5. ~~**Statistiche aggregate di lungo periodo**~~ — **implementato (I26)**: consumo medio
   per giorno della settimana (Europe/Rome, drawdown del minimo progressivo) e media
   mobile (SMA-10) attivabile sul grafico principale.
6. ~~**Soglie personalizzate per finestra**~~ — **implementato (I28)**: matrice soglie
   (attenzione/critica) indipendente per finestra 5 ore / 24 ore (video) / settimanale
   nel tab «Avvisi»; il motore risolve il tipo di finestra dalla durata reale
   start→end; migrazione automatica dalle soglie globali legacy (ADR-12).
7. ~~**Storico eventi oltre 200**~~ — **implementato (I27)**: il registro locale resta un
   diario di 200 voci, ma ogni evento è replicato su SQLite (`/api/events`, upsert per id,
   pruning 5.000 eventi / 180 giorni) con export CSV/JSON dell'archivio completo e filtri
   `kind`/`since` già disponibili lato API.
8. ~~**Pace di consumo + quota sprecata (I31)**~~ — **implementato (2026-10-07)**: dallo
   stesso modello lineare del verdetto I23 (`computePace()`/`PaceInfo` in
   `history-chart.tsx`) si derivano ritmo attuale vs **ritmo di pareggio** (%/h che
   azzererebbe la quota esattamente al reset), **quota sprecata** (residuo previsto al
   reset, con equivalenza in ore di consumo) e **fermo tecnico** (quando l'esaurimento
   anticipa il reset); `PacePanel` nel `StatsPanel` con tre stati visivi (viola =
   sprecata, ambra = fermo tecnico, verde = pareggio) e KPI affiancati.
9. ~~**Heatmap ore × giorno + overlay cicli (I32)**~~ — **implementato (2026-10-07)**:
   heatmap 7×24 (Europe/Rome) con la stessa semantica drawdown di
   `weekdayConsumption` (`heatmapConsumption()` in `lib/cycles.ts`, tab «Per ora» in
   `analysis-panel.tsx`: selettore finestra, KPI consumo attribuito/picco/celle
   attive, scala viola con radice quadrata, tooltip con n° cali, scroll orizzontale
   su mobile) e overlay dei cicli sul grafico storico (toggle «Cicli»: fasce
   alternate per ciclo + marker rossi dei reset osservati, sempre attivo di default).

### Rimosse dalla roadmap

- ~~Contatore token reale via `/v1/chat/completions`~~ — **rimosso** (era F6a, ADR-8):
  con la Subscription Key ogni chiamata consuma la quota del piano che il monitor deve
  solo osservare. Alternativa senza consumo: lettura manuale della console ufficiale
  (docs/01 §6).
- ~~Correlazione token ↔ calo percentuale quota~~ — **rimossa** (dipendeva dal contatore,
  ADR-8).
