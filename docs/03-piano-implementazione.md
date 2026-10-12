# 03 — Piano di implementazione e architettura

> **Scopo**: descrivere COME il dashboard è costruito (e perché), con la mappa del
> codice, i modelli dati, i flussi chiave, la gestione degli errori e le fasi di
> lavoro con i criteri di accettazione. È la guida operativa per qualsiasi nuova
> implementazione: nuova funzione → nuova voce nelle fasi (`docs/04`).
>
> Ultimo aggiornamento: 2026-10-12 (**I54 — §5.22**: verifica di coerenza inversa «live ↔ demo» RI-eseguita come ricostruzione — matrice a 29 dimensioni con evidenze statiche su file, verdetto «live ⊇ demo», 0 fallimenti; la matrice originale a 23 dimensioni era persa col rollback). Precedente: 2026-10-12 (**I86 + I87 — §5.20**: riconciliazione dei residui dell'era 08/10 con decisioni utente — route Task 7 e scaffold rimossi, versione nel footer, campionatore conservato dormiente — e **modalità kiosk/TV riattivata come item proprio**: ?kiosk=1 + toggle header, viste Quote/Grafico/Analisi con rotazione e dimming notturno 22:00–06:59 Roma, KioskBar sticky al posto del footer, superficie barra rimappata nel tema chiaro). Precedente: 2026-10-12 (passata di allineamento documentale: §3 mappa integrata con i file delle estensioni I50–I85 e nota sui residui non cablati, §4 settings `thresholds` I28 e snippet Prisma a 4 modelli, §7 layout riportato alla pagina attuale, §9 nota sui residui della catena di verifica, §11 roadmap aggiornata — I18/I52 implementate). Precedente: 2026-10-12 (§5.19 generalizzazione multi-modello — I82: pivot parametrico a monte con contratto `HistoryPoint[]` invariato, storico per-modello su `ModelUsagePoint` ricreata, selettore general/video con etichette «24 ore», Diagnostica resta su general; schema ripristinato dalla corruzione latente di I68).

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
| `src/lib/minimax.ts` | Tipi (`UsageSnapshot`, `ModelQuota`, `QuotaWindow`, `ApiError`), `REGION_ENDPOINTS`, **I18**: `CODING_PLAN_ENDPOINTS` (endpoint alternativo per regione), `FALLBACK_TRIGGER_HTTP` {404,405,410,501}, `PrimaryFailureKind`, `shouldTryFallback()` (decisione pura di fallback), `parseUsageResponse()` (tollerante: risposta piatta o sotto `data`, epoch s/ms, status numerici o testuali), `statusLabel()`, `consumedPercent()`, `inferServerTime()`, `quotaLevel()`, `modelLabel()`, `EXTRA_ENDPOINTS`, **I53**: `regioneAlt()` + `chiaviPerRegione()` (coppie {region,key} per la campagna parallela eu+cn, dedup chiave doppia) |
| `src/lib/time.ts` | `TZ_ROME`, `LOCALE_IT`, `toDate()` (accetta epoch s/ms, ISO, Date), `formatFullRome/DateTimeRome/TimeRome/DateRome/ShortRome`, `romeZoneInfo()`, `formatCountdown()`, `formatDuration()`, `msUntil()`, `windowProgress()` |
| `src/lib/usage-events.ts` | Motore di monitoraggio: registro eventi (`mm-dash-events-v1`, max 200: `loadEvents/appendEvents/clearEvents/replaceEvents/makeEvent`), `deriveBanner()` (banner quota bassa stateless), `evaluateTransitions()` (soglie warn/crit + reset tra due snapshot), `canNotify()/notifyBrowser()` (Notification API), `AlertConfig` con **soglie per tipo di finestra** (I28: `AlertThresholds {h5,h24,weekly}`, `windowThresholdKey()` risolve il tipo dalla durata reale start→end, `migrateLegacyThresholds()` per il vecchio formato globale) |
| `src/lib/export.ts` | Esportazione locale: `historyToCsv()/eventsToCsv()` (CSV «;» + BOM UTF-8, Excel it-IT), `exportHistoryCsv/Json()`, `exportEventsCsv()`, `downloadTextFile()` |
| `src/lib/server-history.ts` | I16 sync client↔server dello storico: `pushPointToServer()` (fire-and-forget, con callback `onTotal`), `fetchServerHistory()`, `mergeHistories()` (dedup per timestamp, vince il punto locale), `serverPointsToHistory()`, `clearServerHistory()` |
| `src/lib/server-events.ts` | I27 sync client↔server del registro eventi (stesso schema di I16): `pushEventsToServer()` (fire-and-forget batch), `fetchServerEvents()`, `mergeEvents()` (dedup per id, vince il locale), `serverEventsToEvents()`, `clearServerEvents()` |
| `src/lib/cycles.ts` | I26 analisi di lungo periodo: `detectCycles()` (segmenta lo storico nei cicli di finestra: reset = salto ≥+15 punti che riporta a ≥85 — `RESET_JUMP`/`RESET_TARGET` — robusto contro sorgenti miste), `summarizeCycles()` (medie sui cicli completati), `weekdayConsumption()` (consumo per giorno Europe/Rome sul calo del minimo progressivo), `heatmapConsumption()` (I32: griglia 7×24 giorno × ora, stessa semantica drawdown, attribuzione alla cella del punto medio), `movingAverage()` (SMA) |
| `src/lib/demo.ts` | Generatore demo realistico: finestra 5h aperta 3,2h fa, weekly 2,7 giorni fa, video con finestra 24h allineata a mezzanotte UTC e stato 3, jitter per animare il grafico |
| `src/app/page.tsx` | Stato globale pagina: settings/history/events (localStorage + mirror server I16), fetch/polling **parallelo multi-regione (I53: `Promise.allSettled`, secondaria solo visualizzata)**, import JSON, demo, orologio 1s, transizioni avvisi (toast + notifiche), layout |
| `prisma/schema.prisma` | 4 modelli SQLite — `UsagePoint` (storico general: t unique, interval, weekly, source, region), `UsageEventRecord` (archivio eventi), `DownsampledPoint` (I68: bucket orari derivati, ricostruibili con backfill), `ModelUsagePoint` (I82: storico per-modello, chiave model+win+t) — nessun dato sensibile |
| `src/app/api/minimax/usage/route.ts` | Proxy POST → GET MiniMax token_plan/remains; timeout 12s; mappatura errori HTTP/business in italiano; **I18**: campagna di fetch `tryEndpoint()` riusabile (ritenti transitori I51) per primario e fallback `coding_plan/remains` — sul fallimento definitivo per endpoint scomparso tenta l'alternativo e risponde con `fallback {used, primaryEndpoint, reason}` (o `fallbackTried: true`), mai su auth né su errori transitori |
| `src/app/api/history/route.ts` | I16 persistenza storico (SQLite/Prisma): POST (upsert per `t`, validazione input, pruning FIFO a 10.000 punti + cutoff 90 giorni), GET (`?limit=&since=`, ordinato per `t`), DELETE (svuota). La chiave API non transita mai qui |
| `src/app/api/events/route.ts` | I27 persistenza registro eventi (SQLite/Prisma): POST (upsert per `id`, validazione tipo/finestra/messaggio, max 500 eventi/richiesta, pruning a 5.000 eventi + cutoff 180 giorni), GET (`?limit=&since=&kind=`, ordinato per `t`), DELETE (svuota). Nessuna chiave API transita qui |
| `src/components/quota-cards.tsx` | `ModelCard` (card per modello: due finestre con barre, countdown, badge stato), `MainWindows` (riepilogo finestre general), `CountsRow` (residuo/totale/consumato + nota su percentuali), `windowKindLabel()` (5h vs 24h dinamica) |
| `src/components/quota-ring.tsx` | `QuotaRing`: anello SVG percentuale |
| `src/components/history-chart.tsx` | `HistoryChart` (Recharts ComposedChart, switch finestra interval/weekly, toggle «Media mobile» = SMA-10 tratteggiata, **I32 toggle «Cicli»**: fasce alternate per ciclo di finestra + marker rossi dei reset osservati — `detectCycles` ritagliato sull'arco visibile, dropdown Esporta: storico locale CSV/JSON + storico completo dal server), `computeTrend()`, `StatsPanel` (+ verdetto `ProjectionVerdict`: esaurimento stimato vs orario di reset; **I31 `computePace()`/`PaceInfo` + `PacePanel`**: ritmo attuale vs ritmo di pareggio %/h, quota sprecata prevista al reset, fermo tecnico se l'esaurimento anticipa il reset — tre stati visivi viola/ambra/verde; contatore punti server), `TrendBadge` |
| `src/components/model-table.tsx` | `PanoramicTable`: tabella comparativa di tutte le finestre del piano (modello × finestra: residuo con mini-barra, stato, countdown reset) |
| `src/components/analysis-panel.tsx` | I26 `LongTermAnalysis`: pannello «Analisi di lungo periodo» con 4 tab (Cicli 5 ore / Cicli settimanali / Per giorno / **Per ora — I32**) — KPI (cicli, durata media, consumo medio, ritmo %/h), tabella ultimi 8 cicli con ciclo in corso evidenziato, grafico a barre consumo medio per giorno della settimana (5h + settimanale), **heatmap 7×24 (I32)** con selettore finestra, KPI (consumo attribuito, ora di picco, celle attive su 168), scala viola con radice quadrata e tooltip per cella (consumo + n° cali attribuiti); scarica automaticamente fino a 10.000 punti dal server al mount e li fonde con lo storico locale |
| `src/components/event-log.tsx` | `EventLog`: timeline del registro eventi raggruppata per giorno (Europe/Rome), badge per tipo, menu Esporta (CSV/JSON locale + archivio COMPLETO dal server I27), svuotamento locale+server |
| `src/components/tech-panels.tsx` | `RawJsonPanel` (JSON grezzo con orario fetch), `TechInfo` (regione, **seconda regione I53**, modalità, endpoint, ora server dedotta, pannello "altri endpoint utili", avviso semantica `usage_count`) |
| `src/components/region-alt-panel.tsx` | **I53** `RegionAltPanel`: panoramica della SECONDA regione (solo con 2ª chiave configurata): stato connessione, piano, crediti, ultimo rilevamento, errore con messaggio, `PanoramicTable` dei modelli della regione alternativa — solo visualizzazione, mai storico/analisi |
| `src/components/settings-dialog.tsx` | `DashboardSettings` { apiKey, **apiKeyAlt (I53)**, region, refreshSeconds, demoMode, alertsEnabled, **thresholds** (AlertThresholds {h5,h24,weekly} — I28, matrice 3×2 nel tab «Avvisi» con migrazione legacy ADR-12), notifyReset, browserNotifications }, import JSON con validazione, richiesta permesso notifiche |

**Mappa integrata — file aggiunti dalle estensioni (ottobre 2026, I50–I85).** La tabella sopra
descrive il nucleo originario (02/10) con le patch I18/I28/I31/I32; i file aggiunti dalle
estensioni successive sono riassunti qui (design dettagliato in §5.10–§5.19, stato in
`docs/04` §3):

| File | Responsabilità (item) |
|------|------------------------|
| `src/lib/backoff.ts` | Backoff esponenziale con jitter puro, `parseRetryAfterMs`, `delayAfterFailure` (I51) |
| `src/lib/rate.ts` | Serie ritmo %/h: gap >30 min e risalite → null, SMA-3 (I59) |
| `src/lib/rate-anomalies.ts` | Z-score robusto Iglewicz–Hoaglin (mediana+MAD) sui ritmi GREZZI (I70) |
| `src/lib/ewma.ts` | Proiezione esponenziale (mezza vita 2h) per il confronto A/B col verdetto lineare (I72) |
| `src/lib/health.ts` | Episodi di errore (7 giorni Roma, guasto più frequente) (I62) |
| `src/lib/sampling.ts` | Qualità del campionamento: copertura giornaliera DST-safe + gap >15 min (I71) |
| `src/lib/interval.ts` | Presetti intervallo 6h/24h/3g/7g/30g/tutto, filtro client-side (I69) |
| `src/lib/event-filters.ts` | Filtri registro eventi: kind multi-selezione, testo, periodo (I77) |
| `src/lib/compact.ts` | Parsing modalità compatta `?compact=1` (I73) |
| `src/lib/kiosk.ts` | Stato kiosk persistito (`mm-dash-kiosk-v1`), rotazione viste, finestra notturna `isNightRome` 22:00–06:59 Roma, parsing `?kiosk=1`, gestione URL (I87) |
| `src/lib/version.ts` | Marcatore `APP_VERSION` reso nel footer e nella barra kiosk — aggiornato a OGNI passata documentale, insieme ai docs (I46, riattivato da I86) |
| `src/lib/print.ts` | `stampaReportSettimanale()` — classe body + ripristino su afterprint (I75) |
| `src/lib/ring-color.ts` | Colore continuo HSL, glow dinamico, count-up con reduced-motion (I65) |
| `src/lib/tab-identity.ts` | Titolo/favicon dinamici con guard anti re-asserzione (I67) |
| `src/lib/downsample.ts` | Bucket orari puri: `mergeHourBucket`, `serverHourlyToHistory` (I68) |
| `src/lib/a11y.ts` | Descrizioni testuali heatmap/calendario/reset clock per screen reader (I79) |
| `src/lib/model-history.ts` | Storico per-modello: localStorage FIFO 2.000, dedup 20s per-modello, forward-fill, merge (I82) |
| `src/lib/server-model-history.ts` | Sync server per-modello su `ModelUsagePoint` (SQL raw parametrizzato) (I82) |
| `src/components/analysis-panel.tsx` | «Analisi di lungo periodo»: Cicli / Per giorno / Per ora (heatmap I32) / Calendario (I58) / Distribuzione (I61) + spreco (I57), prevedibilità (I63), oggi vs media (I64); fonte per-modello (I82) |
| `src/components/diagnostica-panel.tsx` | «Diagnostica»: ResetClock (I60), salute del monitor (I62), anomalie del ritmo (I70), qualità del campionamento (I71) |
| `src/components/section-nav.tsx` | Nav sezioni sticky con scrollspy condiviso `useScrollSpySezioni` (retry fino al montaggio delle sezioni) (I66/I74/I85) |
| `src/components/bottom-nav.tsx` | Barra navigazione fissa su mobile <md, stesso scrollspy (I74) |
| `src/components/section-boundary.tsx` | Error boundary per sezione con skeleton e «Riprova» (I76) |
| `src/components/theme-toggle.tsx` | Toggle sole/luna (tema chiaro/scuro/sistema, I78) |
| `src/components/kiosk-bar.tsx` | Barra di controllo kiosk/TV sticky a fondo pagina: cambio vista, rotazione con intervallo, dimming, uscita sempre disponibile (I87) |
| `src/components/print-report.tsx` | Report settimanale stampabile (I75) |
| `src/components/pwa-register.tsx` | Registrazione Service Worker + sync notifiche a tab chiuso (I52) |
| `src/app/api/summary/route.ts` | `GET /api/summary` read-only senza chiave: KPI aggregati per widget esterni (I80) |
| `src/app/api/history/models/route.ts` | GET/POST/DELETE storico per-modello su `ModelUsagePoint` (I82) |
| `src/app/manifest.ts` + `public/sw.js` + `public/sw-shared.js` | PWA: manifest, icone, cache offline, notifiche a tab chiuso (I52) |
| `scripts/verifiche/audit-implementazioni.mjs` | Audit dichiarativo codice↔documentazione (278 verifiche + coverage check) (I55, esteso a ogni item) |
| `tests/lib/` (24 file) + `tests/components/` (8 file) | Suite Bun: 324 test / 924 asserzioni (I50/I81 + ogni item) |

> **Campionatore I49 — CAMPAGNA V8 ESEGUITA E SMONTATA (12/10, §5.23)**: `src/lib/campione.ts`
> è stato ri-cablato nel proxy per la giornata di campagna con un blocco marcato (ADR-13-R2,
> chiave mai campionata) e riportato DORMIENTE a campagna chiusa (I56); l'audit verifica il
> dormiento con check condizionale (wiring ammesso solo col blocco marcato). Il file
> `campione-live.jsonl` (205 righe: 122 del 09/10 RECUPERATE su disco + 83 fresche) è
> commesso come prova della campagna; verdetto V8 «blocchi fissi UTC» in `docs/02` §5 e
> `docs/04` §4. Gli altri residui dell'era 08/10 sono stati riconciliati: route Task 7
> `api/verifiche` e scaffold `api/route.ts` RIMOSSI (coerenza ADR-13-R), versione I46
> riattivata nel footer, kiosk I45 riattivato come item proprio **I87**.

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
  apiKeyAlt: string;       // I53: chiave della SECONDA regione (regioneAlt), "" = singola regione
  region: "eu" | "cn";     // regione PRIMARIA (storico/avvisi/analisi)
  refreshSeconds: number;  // 0 = off
  demoMode: boolean;
  alertsEnabled: boolean;          // motore avvisi (banner + toast)
  thresholds: AlertThresholds;     // soglie per TIPO di finestra {h5,h24,weekly} — I28/ADR-12:
                                   // il tipo è risolto dalla durata reale start→end; le legacy
                                   // globali (alertThresholdWarn/Crit) sono migrate al load
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

// I68 — bucket orario DERIVATO (downsampling, ricostruibile al 100% con backfill)
model DownsampledPoint {
  id        Int      @id @default(autoincrement())
  hourStart DateTime           // inizio ora UTC coperta dal bucket
  source    String   @default("api")
  // min/max/somma/ultimo per interval e weekly + count + lastT
  @@unique([hourStart, source])
  @@index([hourStart])
}

// I82 — storico PER-MODELLO (formato LONG: una riga per finestra non null)
model ModelUsagePoint {
  id      Int    @id @default(autoincrement())
  model   String             // "general" | "video" | …
  win     String             // interval | weekly
  t       DateTime           // epoch ms, parte della chiave di dedup
  percent Float              // % residua osservata (0–100)
  source  String @default("api")
  region  String @default("eu")
  @@unique([model, win, t])
  @@index([model])
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

### 5.15 Correzione leggibilità del tema chiaro (I83) — 12/10

> **Segnalazione utente**: in tema chiaro molti avvisi non sono leggibili — scritte
> gialle dei warning, scritte info azzurre (EWMA), icone del registro eventi, e il tab
> attivo del menu impostazioni è bianco su bianco. Verifica con il browser richiesta.

**Analisi delle cause (tre buchi nel strato `html:not(.dark)` di I78, tutti della stessa
famiglia: nomi di CLASSE diversi non raggiunti dai selettori esistenti):**

1. **Utilities con prefisso variante e suffisso `!`** — es. `data-[state=active]:bg-white/[0.08]!`:
   nel DOM il nome della classe è la stringa INTERA (con prefisso e `!`), quindi i selettori
   per classe di I78 (`.bg-white\/\[0\.08\]`, `.text-zinc-100\!`) NON la raggiungono. Esito:
   tab attivo delle impostazioni = fondo `white/[0.08]` su bianco + testo `zinc-100` ≈ bianco →
   INVISIBILE; identico per le chips `data-[state=on]` del selettore intervallo I69 (page).
   Stessa famiglia: i tab finestra «5 ore/Settimanale» del grafico usano
   `data-[state=active]:text-zinc-100` SENZA `!` — anch'esso un nome di classe con prefisso.
   **Cura**: vincere per STATO, non per nome di classe — selettori attributo
   `[data-slot="tabs-trigger"][data-state="active"]` e
   `[data-slot="toggle-group-item"][data-state="on"]` con dichiarazioni `!important` unlayered
   (per le important l'ordine dei layer è invertito: l'implicit outer layer batte le utilities
   layered — Cascade 5 §6.4; da confermare empiricamente al browser).
2. **Varianti di colore con MODIFICATORE DI OPACITÀ** — `text-amber-200/70`, `text-amber-200/90`,
   `text-amber-200/80`, `text-amber-200/50`, `text-rose-200/90`, `text-rose-200/60`,
   `text-emerald-200/70`, `text-violet-200/70`, `text-sky-200/70`, `text-sky-300/80`:
   classi DISTINTE da quelle senza opacità → non rimappate → su bianco restano i toni 100–200
   quasi trasparenti (banner avvisi, card EWMA, PacePanel, boundary, nota tecnica).
   **Cura**: mappatura dedicata per ogni variante osservata (700/800 per le /70–/90,
   900 per la /50).
3. **Toni 400/500 usati come TESTO o ICONA** — `text-rose-400`, `text-amber-400`,
   `text-emerald-400`, `text-sky-400`, `text-orange-400`, `text-emerald-500` (badge del
   registro eventi con icona, valori grandi anelli, icone KPI, link chiave, errore connessione):
   su bianco contrasto insufficiente. **Cura**: rimappare 400/500 → 600 SOLO per il testo
   (le varianti `bg-*400/10` dei badge restano tinte chiare coerenti, i bordi /25–/30 restano).

**Cure di contorno (stessa passata):**
- `text-zinc-400!` (testo base dei tab impostazioni) e `bg-white/[0.03]!` (TabsList):
  varianti con `!` dei selettori già mappati → selettori dedicati.
- Hover illeggibili su bianco: `hover:text-rose-300` (+`!`), `hover:text-zinc-200` (+`!`),
  `hover:text-zinc-300` → toni 600/700/800; `hover:bg-white/[0.05]` (nav) e
  `hover:bg-white/[0.06]!` → black-alpha.
- `bg-amber-950/20` (card fallback SectionBoundary) → tinta ambra chiara come le /40 già mappate.
- INTATTO: blocco JSON grezzo (resta scuro di proposito — la regola `pre.bg-black/50 *` ha
  specificità superiore e il blocco non usa accent-400), tema scuro, grafici recharts,
  anelli canvas, toni `bg-*400/10`/bordi `/25–/30` decorativi, hover colorati 500/20.

> **Accettazione**: in tema chiaro (a) tab attivo impostazioni visibile (testo scuro su
> grigino, bordo), (b) tab attivo finestra grafico leggibile, (c) chips attive I69/I77
> leggibili, (d) banner crit/warn e card EWMA/Pace con testo leggibile, (e) icone badge
> registro eventi visibili, (f) desktop dark intatto. Screenshot per ciascuna.

> **Implementato 12/10** con una LEZIONE di cascade emersa solo al browser:
> 1. La prima versione vincere-per-stato usava `!important` UNLAYERED e NON ha funzionato
>    sulle chips I69 (ancora bianche su bianche al probe): le utilities con `!` di Tailwind
>    v4 sono emesse con `!important` DENTRO `@layer utilities`, e per le dichiarazioni
>    important un layer batte SEMPRE le regole unlayered (Cascade 5 §6.4 — l'ordine dei
>    layer per le important è invertito rispetto alle normali: l'implicit outer layer è
>    l'ultimo resort, non il primo). Le regole di I78 per le classi con `!`
>    (`.text-zinc-100\!`, `.bg-zinc-950\!`, gli hover `!`) erano quindi MORTE dalla
>    nascita — senza effetti visibili solo perché in dark le utilities già producono i
>    colori giusti. Cura definitiva: blocco `@layer utilities` dedicato in coda alla
>    sezione chiara (stesso layer, posizione successiva, specificità 0,3,1+ → vince).
> 2. Il probe con `querySelectorAll('.text-sky-200\\/70')` fallisce (`/` non escapabile
>    nel selettore CSS di querySelectorAll): i probe vanno scritti scandendo
>    `className.includes(...)` invece dei selettori di classe.
> Esiti (probe di colore calcolato + screenshot): tab attivo impostazioni e tab finestra
> grafico `rgb(24,24,27)` su `rgba(0,0,0,0.07)` con bordo `rgba(0,0,0,0.12)` (era bianco
> su bianco); chips I69 attive idem; card EWMA `text-sky-200[/70]` e badge `sky-300/80` in
> sky-700 scuro; avvisi `amber-200/70–90` in amber-800, `rose-100`/`rose-200/60` in
> rose-800, `rose-200/90` in rose-700; badge registro eventi (icona+testo) emerald-600 /
> amber-600 / rose-600 / orange-600; menu Esporta bianco con voci scure (era `bg-zinc-950!`);
> nota tecnica `amber-200/50` in amber-900; TabsList `bg-white/[0.03]!` grigina. Tema scuro
> INTATTO (chip/tab/badge/body con i valori originali al probe dopo reload in dark).
> Zero overflow 1280 in entrambi i temi, console senza errori. Screenshot
> `scripts/verify-i83-impostazioni-light.png`, `verify-i83-grafico-light.png`,
> `verify-i83-ewma-light.png`, `verify-i83-eventi-light.png`, `verify-i83-menu-light.png`.
> Suite invariata: tsc 0 errori su src/+tests/, lint OK, 249/249 (761 asserzioni),
> audit 203/203 PASS (fix solo CSS: nessun nuovo check di audit necessario).

### 5.16 Due famiglie di colore (tema chiaro + tema scuro revisionato) (I84) — 12/10

> **Richiesta utente**: «eseguire le stesse verifiche con il tema scuro ed implementare
> 2 famiglie di colori, una per il tema chiaro (già quella attuale corretta), una per il
> tema scuro che va rivista perché quella attuale è poco leggibile; verifiche nel browser
> per entrambi i temi».
>
> **Strumento di misura**: probe WCAG reale nel browser (`scripts/probe-contrast.js`,
> agent-browser su :3000) che per ogni elemento campionato calcola foreground e sfondo
> EFFETTIVO (alpha compositing: il fg con opacità viene fuso sullo sfondo prima del
> rapporto), risolvendo i colori calcolati di Chrome in qualunque formato (`oklab`,
> `oklch`, `lab`, `rgb`, `color(srgb)`) in sRGB, e valuta il contrasto WCAG 2.1 AA
> (4.5:1 testo piccolo, 3:1 testo grande). Rotta `/api/history` + `/api/events` bloccate
> con body `{}` (protocollo: nessuna scrittura demo sul DB).
>
> **Esito della misura (baseline)** — SCURO: tutti gli accent (amber/sky/rose/emerald/
> orange, con e senza opacità) passano con margine (5.5–15:1); gli UNICI FAIL sono il
> testo secondario: `text-zinc-500` 3.85–4.12:1 e `text-zinc-600` 2.26–2.58:1 (note
> tecniche, timestamp, etichette a 10–11px). CHIARO (definito «corretto» dall'utente):
> la misura smentisce parzialmente — 21 FAIL: i toni 600 scelti da I83 su tinte chiare
> misurano 2.5–3.6:1 (badge registro eventi, valori anelli, badge diagnostica, chip
> kind), `text-zinc-500`/`text-zinc-600` 4.24–4.33:1 su tinte grigie, etichette menu
> `text-zinc-500!` 4.33:1. Il giudizio visivo dell'utente resta rispettato: le cure
> non cambiano l'impianto, alzano solo il margine sotto le soglie AA.
>
> **Design: due famiglie esplicite** (token semantici in `globals.css`, un blocco
> `:root` + un blocco `.dark` affiancati):
> - `--mm-muted` / `--mm-muted-2` — testo secondario/tecnico. CHIARO: `rgb(95,95,104)`
>   (zinc-500/600 grezzi NON passavano su tinte grigie; il token misura 5.5–6:1). SCURO:
>   `rgb(150,150,160)` (≥6.3:1) e `rgb(138,138,148)` (≥5.4:1, gerarchia preservata).
> - L'aggiornamento dei token basta per ENTRAMBI i temi: le regole che li consumano
>   sono `html:not(.dark) .text-zinc-500/600` (chiaro) e le NUOVE `.dark .text-zinc-500`,
>   `.dark .text-zinc-600`, `.dark .placeholder\:text-zinc-600::placeholder` (scuro,
>   unlayered 0,2,0 → battono le utilities layered, tecnica I78/I83).
> - **Accent su tinte (chiaro)**: tono 600 → 700 per `rose/amber/sky/orange` (300, 400,
>   500 come testo/icone) e tono 800 per `emerald` (300/400/500) e `amber-200`; le
>   tinte forti `bg-*-400/10`, `bg-*-500/15`, `bg-*-500/20` → toni **50 pieni** solidi
>   (`#ecfdf5`, `#fffbeb`, `#fff1f2`, `#fff7ed`, `#f0f9ff`, `#f5f3ff`): il 700 sul 50
>   misura 4.8–5.7:1, sul translucido scendeva a 2.5–4.5. `violet-300→600` resta (già
>   5.2–5.5:1, unico tono 600 che passa). Bordi decorativi `/25–/30` e barre `/70`
>   invariati. Tinta banner `amber-950/40→amber-50` di I83 invariata.
> - **Accent (scuro)**: INTATTI — la misura li dà tutti ≥5.5:1; la famiglia scuro non
>   tocca i componenti, corregge solo il muted (+ il placeholder + `text-zinc-500!`
>   dei menu Esporta/Storico/Registro con un secondo blocco `@layer utilities` dedicato
>   a `.dark`, lezione cascade I83).
> - Tab/chip attivi: token `--mm-ink/--mm-panel/--mm-line` documentati in entrambe le
>   famiglie; il chiaro li consuma già (I83), lo scuro usa le utilities originali dei
>   componenti (misurate 13.3–13.6:1, nessuna cura necessaria).
>
> **Lezione di toolchain**: Turbopack (Next 16) ha servito per ~1h un CSS STALE e
> incoerente (regole presenti a metà: token sì, blocco tinte no) sia nel chunk linkato
> sia nell'HMR; la pipeline reale (`@tailwindcss/postcss` e LightningCSS puri) preserva
> il blocco. La pulizia di `.next` + restart risolve (precedente noto del progetto con
> il client Prisma rigenerato). Nuova regola operativa: se una modifica CSS «non prende»
> in modo selettivo, prima di indagare il CSS va cancellato `.next` e riavviato il dev
> server; l'audit ora copre I83/I84 con 8 check dedicati (211 totali).
>
> Esiti (probe dopo cure, entrambi i temi): CHIARO 36 campioni / 0 FAIL, SCURO 38
> campioni / 0 FAIL (era 21 e 6). Tab impostazioni verificati in entrambi i temi (attivo
> `rgb(24,24,27)` su `rgba(0,0,0,0.07)` in chiaro; quasi-bianco su white-alpha in scuro).
> Screenshot `scripts/verify-i84-impostazioni-light.png`, `verify-i84-impostazioni-dark.png`,
> `verify-i84-full-light.png`, `verify-i84-full-dark.png`. Suite: tsc 0 errori su
> src/+tests/, lint OK, 249/249 (761 asserzioni, fix solo CSS), audit 211/211 PASS
> 0 scoperte (era 203, +8 check I83/I84).

### 5.17 Nav sezioni sempre visibile durante lo scrolling (I85) — 12/10

Richiesta utente: il menù di navigazione delle sezioni (Quota, Grafico, Ritmo,
Panoramica, Analisi, Diagnostica, Tecnici, Eventi) deve restare **sempre visibile
durante lo scrolling**, fissato in alto.

**Causa del difetto**: la nav di I66 era già `position: sticky` con `top` corretto
(= altezza header), ma in `page.tsx` era avvolta da un `<div className="hidden
md:block">` contenente SOLO la barra. Un elemento sticky scorre dentro il proprio
**contenitore** (il parent nel box tree): un wrapper alto esattamente quanto la
barra non le dà alcuna corsa — la nav «sfila» col wrapper appena si supera la sua
posizione naturale. Nessun antenato ha `overflow` che blocca lo sticky, quindi la
cura è puramente strutturale.

**Cure**:
- `page.tsx`: la nav è **figlia diretta di `<main>`** (niente wrapper) — il suo
  contenitore sticky diventa tutta la pagina e la barra resta inchiodata sotto
  l'header per tutto lo scroll.
- `section-nav.tsx`: la classe `hidden md:block` (prima sul wrapper) si sposta
  **sulla nav stessa** — comportamento identico su <md (subentra la barra fissa
  I74), nessuna superfice toccata in modo diverso.

**Scoperta collaterale (bug pre-esistente I66, mai esploso prima)**: durante la
verifica il **scrollspy risultava morto** — `aria-current` inchiodato su «Quota»
per qualunque scroll. Diagnosi al browser: le 8 sezioni ancorate montano SOLO
quando arriva il primo snapshot (prima c'è lo skeleton), ma l'effect dell'
`IntersectionObserver` gira all'attivazione del componente — quando
`getElementById` trova **zero elementi**: l'observer nasce vuoto e non osserverà
mai più nulla (nessun re-observe quando le sezioni compaiono). Le verifiche
precedenti avevano sempre testato il **click** (che usa il `setAttiva` manuale),
mai la prosecuzione dello scroll — per questo non era mai emerso. Cure: l'
osservazione **riprova** finché le 8 sezioni non sono tutte nel DOM (250 ms × 120
= 30 s massimo; oltre: pagina senza sezioni, es. setup, si rinuncia in silenzio).
Il fix è nell'hook condiviso `useScrollSpySezioni`, quindi cura anche la barra
mobile I74. Verifica che il probe IO standalone FUNZIONAVA nell'ambiente: il
problema era esclusivamente l'ordine di montaggio, non l'API.

**Verifiche browser reali** (rotte `/api/history` + `/api/events` bloccate con
body `{}` — nessuna scrittura sul DB; scroll con `scrollIntoView` passo-passo):
desktop 1280 scuro — a riposo nav a 130px sotto header; a fondo pagina (scrollY
6071) nav **inchiodata a 106px = bordo inferiore header**, 8 ancore visibili;
scrollspy segue tutte le 7 transizioni (grafico→Grafico … eventi→Eventi); click
su «Diagnostica» → `aria-current` immediato e sezione a 162px **mai sotto il
chrome sticky**. Tema chiaro — nav `rgba(250,250,250,0.9)` (rimappa I78 attiva
anche sticky), link attivo `rgb(24,24,27)`, stesso comportamento sticky/spy.
Mobile 390 — nav superiore `display:none`, barra fissa I74 visibile a fondo
pagina con scrollspy vivo («Eventi»). Compact — nessuna delle due nav. Zero
overflow orizzontale (1280 e 390), console senza errori. Screenshot
`scripts/verify-i85-desktop-light.png`, `verify-i85-desktop-dark.png`,
`verify-i85-desktop-dark-scroll.png`.

**Lezione di verifica**: uno scrollspy va provato con lo **scorrimento reale**
(sequenza di scroll + lettura `aria-current`), non solo col click sul link — il
click bypassa tutta la catena observer→callback→state e maschera un observer
vuoto. Suite: tsc 0 errori su src/+tests/, lint OK, 250/250 (764 asserzioni,
+1 test I85 sul componente), audit 214/214 PASS 0 scoperte (+3 check I85, check
I74 aggiornato al nuovo domicilio della classe `hidden md:block`).

### 5.18 Audit di accessibilità sistematico (I79) — 12/10

Proposta docs/07 §5.12: «Contrasto misurato (WCAG AA), `aria-live` per aggiornamenti
polling, focus visibili, descrizioni `sr-only` per i grafici (heatmap, calendario,
reset clock)». Quattro pilastri, tutti client-side (ADR-8 intoccato).

**Pilastro 1 — Contrasto misurato (WCAG AA)**: già in gran parte conseguito da
I83/I84 (probe `scripts/probe-contrast.js`: conversione oklab/oklch/lab→sRGB,
alpha compositing, sfondo effettivo per antenati; esito attuale CHIARO 36 campioni
/ 0 FAIL, SCURO 38 / 0 FAIL). I79: il probe viene **esteso con le superfici della
nav** (I66/I85: link attivo `[aria-current="true"]` e inattivi, su sfondo
semi-trasparente `/85` con blur — lo sfondo effettivo viene fuso dal probe) e
ri-eseguito su entrambi i temi come parte della verifica I79.

**Pilastro 2 — `aria-live` per gli aggiornamenti del polling**: nell'header
aggiunta una regione live dedicata (`sr-only`, `aria-live="polite"`) che annuncia
«Dati aggiornati alle HH:MM:SS (Roma)» al cambio di `lastFetch` (ogni snapshot
riuscito). NB: esisteva già una live region con l'ora di Roma che si aggiornava
**ogni secondo** — spam per uno screen reader e annunci continui; viene
declassata a `aria-hidden` (l'ora è già visibile testualmente accanto). Il banner
soglia e l'errore API usano già `role="alert"` (shadcn Alert), i toast di sonner
annunciano nativamente: niente da aggiungere lì.

**Pilastro 3 — Focus visibili**: i link della nav (superiore I66/I85 e barra
inferiore I74) sono `<a>` nudi SENZA indicatore di focus (i componenti shadcn
Button/Tabs/ToggleGroup/DropdownMenu hanno già ring/bg di focus). Cure in
`globals.css`: `nav a:focus-visible` → outline 2px + offset 2px, bianco-alpha in
scuro e nero-alpha in chiaro (strato `html:not(.dark)`, tecnica I78/I84). Regola
volutamente SCOPERTA solo alla nav per non duplicare l'indicazione sui componenti
che già la possiedono.

**Pilastro 4 — Descrizioni testuali dei grafici**: nuovo modulo puro
`src/lib/a11y.ts` con tre generatori di descrizione (deterministici, testabili):
- `descrizioneHeatmap(grid, winLabel)` — consumo totale, ora di picco
  (giorno+ora Roma), celle attive su 168;
- `descrizioneCalendario(grid, winLabel)` — consumo totale e giorni con dati,
  giorno più intenso (data YYYY-MM-DD + valore), settimana corrente = ultima
  colonna;
- `descrizioneResetClock(osservati, ora)` — reset osservati negli ultimi 7 giorni
  per finestra, ultimo reset con data/ora Roma, blocchi teorici UTC (00/05/10/15/20).
Consumo: `<p className="sr-only">` dentro `HeatmapSection` e `CalendarSection`
(analysis-panel.tsx); `ResetClock` (diagnostica-panel.tsx) ha già `role="img"`
con label STATICa → l'`aria-label` diventa la descrizione DINAMICA generata dai
dati (i `<title>` per-i-punto restano per il tooltip mouse). Test in
`tests/lib/a11y.test.ts` (griglie fake deterministiche + casi vuoti totali).

**Audit**: check I79 nell'audit (modulo a11y con i 3 export, sr-only nelle due
sezioni, aria-label dinamico nel reset clock, regione live polling, focus-visible
nav in entrambi i temi). Verifica browser: probe contrasto esteso su entrambi i
temi (0 FAIL atteso), presenza DOM della live region e delle descrizioni,
focus visibile con navigazione da tastiera (Tab sulla nav + screenshot), console
pulita, zero overflow.

### 5.19 I82 — Generalizzazione multi-modello (pivot parametrico di cicli/storico)

**Problema**: tutte le analisi di lungo periodo (cicli, ritmo, proiezione, heatmap,
calendario, distribuzione) consumano lo storico FLAT `HistoryPoint[]`
`{ t, interval, weekly }` che registra SOLO il modello «general»: la sua struttura è
storicamente cresciuta attorno alle due finestre (5 ore / settimanale) del primo
modello osservato. Gli altri modelli del piano (es. «video» con finestra giornaliera
24h) appaiono nelle card «Altri modelli» e nella Vista panoramica, ma senza storico,
cicli o analisi.

**Decisione di progetto — contratto INVARIATO, pivot parametrico**: le funzioni di
analisi (`detectCycles`, `weekdayConsumption`, `heatmapConsumption`, `computeTrend`,
`ewmaProjection`, …) e i componenti (`HistoryChart`, `RateChart`, `StatsPanel`,
`LongTermAnalysis`) restano ESATTAMENTE com'eri su `HistoryPoint[]`. La
generalizzazione si ottiene a MONTE: chi costruisce lo storico decide il pivot.
Un modello diverso produce un `HistoryPoint[]` suo (le sue due finestre mappate su
`interval`/`weekly`) e le analisi funzionano senza toccare una riga. Vantaggi:
zero regressioni sulle analisi esistenti, test invariati, l'aggiunta di futuri
modelli è pura acquisizione dati.

**Componenti nuovi**:

1. `src/lib/model-history.ts` (puro, lato client) — lo storico per-modello:
   - `ModelHistoryPoint { t, model, interval: number|null, weekly: number|null }`
     (valori GREZZI, nullable: il forward-fill avviene alla lettura);
   - localStorage `mm-dash-modelhistory-v1` (FIFO 2.000 punti, tutti i modelli
     insieme, ordinati per `t`);
   - `appendModelPoints(prev, sample, max)` — da uno snapshot crea i punti di OGNI
     modello con almeno una finestra non null (dedup: stesso modello entro 20 s →
     sostituisce l'ultimo, come `pushHistory` per general);
   - `historyForModel(points, model)` — filtra, ordina e forward-fill
     (`?? prev ?? 100`, stesse sematiche di `pushHistory`) → `HistoryPoint[]`
     consumabile da tutte le analisi;
   - `modelNamesOsservati(points)` — distinti, «general» sempre primo, poi ordine
     di prima comparsa;
   - `mergeModelHistories(local, remote)` — dedup per `(model, t)`, vince il locale;
   - `modelRowsToPoints(rows)` — le righe server (una per `model+win+t`, la tabella
     I42 è long-format) tornano punti wide per la UI;
   - sync client: `fetchServerModelHistory`, `pushModelPointsToServer` (batch
     fire-and-forget), `clearServerModelHistory(model?)` — stesso pattern offline-first
     di `server-history.ts` (I16): localStorage primario, replica silenziosa.

2. `src/app/api/history/models/route.ts` — persistenza server dello storico
   per-modello sulla tabella `ModelUsagePoint` (lib I42 `server-model-history.ts`,
   SQL raw parametrizzato, finora senza route): `POST {points:[{t, model, interval,
   weekly, source, region}]}` (una riga per finestra, upsert + pruning 90g/10k),
   `GET ?model=&win=&since=&limit=`, `DELETE ?model=`. La chiave API non transita mai
   (solo percentuali e timestamp, come I16). ADR-8 intoccato: la route tocca solo
   SQLite, mai MiniMax.

3. **Schema Prisma — ripristino pregresso + modello mancante** (scoperto
   all'apertura della sessione, bloccante):
   - il file commesso aveva attributi corrotti in `DownsampledPoint`:
     `@@unique(ourStart, source])` / `@@index(ourStart])` (campo inesistente, parentesi
     squilibrate — corruzione entrata con il recovery I68 di 6c0a503; il DB reale era
     nato da uno schema valido, quindi il danno era LATENTE: qualsiasi `db push`
     futuro sarebbe fallito) → ripristinati `@@unique([hourStart, source])` e
     `@@index([hourStart])`;
   - il modello `ModelUsagePoint` (I42) NON era più nello schema né la tabella nel DB
     (rollback): la lib raw SQL sopravviveva ma inutilizzabile → modello ridefinito
     con le stesse colonne della lib (`model, win, t, percent, source, region,
     createdAt`, unica su `model+win+t`) e tabella ricreata con `db push`.

4. **UI — selettore del pivot** (page.tsx):
   - stato `selectedModel` (default «general»); chips modello accanto al selettore
     Intervallo, visibili solo se osservato più di un modello; modelli = storico
     per-modello ∪ modelli dello snapshot corrente;
   - `pivotHistory = selectedModel === "general" ? history : historyForModel(...)` —
     poi la pipeline I69 (`filterHistoryByPreset`) invariata: Grafico, Ritmo e Analisi
     seguono il pivot; la **Diagnostica resta deliberatamente sullo storico COMPLETO
     di «general»** (salute del MONITOR: guasti di rilevamento e blocchi teorici UTC
     del piano, non del modello scelto);
   - `StatsPanel`/verdetto: `selectedWindow` passa da `general` al **modello pivot**
     (proiezione coerente col grafico mostrato);
   - identità tab (I67), banner/avvisi, eventi: restano su «general» (il «primus»
     del piano; documentato, non è un dimenticatoio);
   - etichette finestre: per i modelli non-general la finestra `interval` può essere
     la giornaliera 24h (es. video) → prop opzionale `intervalLabel` (default «5 ore»)
     su `HistoryChart`, `StatsPanel`, `RateChart`, `LongTermAnalysis`; il valore da
     passare deriva dalla DURATA osservata della finestra del pivot
     (`windowShortLabel` in quota-cards: 4–6h → «5 ore», 23–25h → «24 ore», altrimenti
     durata formattata). Le chiavi interne restano `interval`/`weekly`.

5. **Ingestione** (page.tsx, dentro `pushHistory` — unico punto per demo/api/import):
   dopo il punto general, `appendModelPoints` + replica server dei soli punti nuovi.
   In demo, se lo storico per-modello è vuoto viene retro-popolato con
   `makeDemoModelHistory` (lib/demo.ts): rigenera 40 snapshot sintetici PASSATI con la
   stessa `makeDemoSnapshot(t)` e ne estrae TUTTI i modelli — curve coerenti con i
   tick demo dal vivo.

**Test**: `tests/lib/model-history.test.ts` (puri: append con dedup 20s, salto
modelli senza finestre, forward-fill, ordine modelli osservati, merge locale-vince,
modelRowsToPoints long→wide); audit +check I82 (lib, route, wiring page, schema con
`ModelUsagePoint`, etichette parametriche); verifica curl della route
(POST→GET→DELETE con pulizia) e browser in demo: switch pivot «general»↔«video» con
grafico/ritmo/analisi/etichette coerenti, Diagnostica invariata, console pulita,
zero overflow.

**Limiti onesti**: lo storico per-modello nasce con questa versione — i punti
passati di «video» non esistono (nessun backfill possibile: l'API espone solo
lo snapshot corrente); le analisi video diventano via più significative man mano
che il poller accumula. Eventi/avvisi per modelli non-general: fuori scope (restano
general-pivot).

---

### 5.20 I86 — Riconciliazione dei residui dell'era 08/10 + I87 — Modalità kiosk/TV — 12/10

**Contesto (I86)**: il commit UUID di piattaforma `1b78931` aveva reintroiettato nell'albero
codice dell'era 08/10 dichiarata persa, tutto ORFANO (zero wiring/test/audit). Le decisioni
dell'utente (clarify 12/10, quattro voci):

| Residuo | Decisione | Esito |
|---------|-----------|-------|
| `src/app/api/verifiche/route.ts` (Task 7) | **RIMOZIONE** | `git rm` — ripristina la coerenza con ADR-13-R (nessun endpoint che spawn di processi); il toolkit resta usabile da CLI (`node scripts/verifiche/verifica.mjs …`) |
| `src/app/api/route.ts` (scaffold «Hello, world!») | **RIMOZIONE** | `git rm` — dead code |
| `src/lib/version.ts` (I46) | **RIATTIVAZIONE** | `APP_VERSION` renderizzato nel footer della pagina (e nella barra kiosk); convenzione nell'header del file: aggiornare a OGNI passata documentale, insieme ai docs |
| `src/lib/campione.ts` (I49) | **DORMIENTE DI NUOVO (campagna V8 eseguita e smontata 12/10, §5.23)** | ri-cablato per la giornata di campagna con blocco marcato, riportato al dormiento a campagna chiusa (I56); l'audit verifica il dormiento con check condizionale (wiring ammesso solo col blocco marcato `CAMPAGNA V8`) |
| kiosk I45 (`kiosk.ts` + `kiosk-bar.tsx`) | **RIATTIVAZIONE CATALOGATA → item I87** | wiring completo con test e check audit (sotto) |

**Design (I87 — kiosk/TV)**: vista per monitor dedicato, riattivata dal codice superstite
dell'era 08/10 (moduli puri già scritti: `KioskState` con persistenza `mm-dash-kiosk-v1`,
`KIOSK_VIEWS` quote/grafico/analisi, `nextKioskView`, `isNightRome` 22:00–06:59 Roma,
`kioskHref`, `KioskBar`). Aggiunte per il cablaggio:

1. `readKioskMode(search)` in `src/lib/kiosk.ts` — pura, stessa semantica di
   `readCompactMode` (I73): attivano `?kiosk=1`, `?kiosk`, `?kiosk=true` (case-insensitive);
   non attivano `0/false/off/spazzatura`.
2. **Stato in `page.tsx`**: `kioskState` (caricato da localStorage al mount; il parametro
   URL `?kiosk=1` FORZA `enabled: true` al primo avvio), `kioskView` (default «quote»).
   Effetti: persistenza a ogni cambio; sincronizzazione URL via
   `history.replaceState(kioskHref(…))` (la barra indirizzi resta coerente senza navigazioni);
   listener `Escape` che esce; timer di rotazione `setInterval(nextKioskView, rotationSeconds·1000)`
   solo con rotazione attiva.
3. **Rendering**: `kioskAttivo = mounted && !compact && kioskState.enabled` — il kiosk è
   esclusivo con la vista compatta (parametri concorrenti: vince compact, il bottone di
   ingresso non esiste in widget). Con kiosk attivo: nav sezioni (I66/I85) e barra mobile
   (I74) nascoste, footer sostituito dalla `KioskBar` sticky bottom (uscita SEMPRE
   disponibile: bottone + Esc), il main mostra SOLO la vista selezionata:
   - **Quote**: banner soglie + `MainWindows` + data odierna Roma;
   - **Grafico**: selettore intervallo (I69) + modello pivot (I82) + `HistoryChart` +
     `StatsPanel` + `RateChart`;
   - **Analisi**: `LongTermAnalysis` (pivot I82).
   Errore API e schermata di setup restano visibili fuori dal branch (come in compatta I73).
4. **Toggle di ingresso** nell'header (icona Monitor, fuori da compact e kiosk).
5. **Dimming notturno**: overlay `fixed inset-0 z-[45] bg-black pointer-events-none`
   con opacità 0→0.55 (transizione 700 ms) quando `kioskAttivo && nightDim && isNightRome(now)` —
   sotto la KioskBar (z-50, resta leggibile) e sopra header (z-40) e contenuto; scelto
   l'overlay al posto di `filter: brightness()` perché il filtro su un antenato crea un
   containing block che sposterebbe i figli `fixed`/`sticky`.
6. **Zero consumo quota (ADR-8)**: il kiosk è una vista — non aggiunge alcuna chiamata;
   il polling e le regole esistenti non cambiano.

**Criteri di accettazione**: `?kiosk=1` attiva e sopravvive al reload (localStorage);
Esc e bottone escono (URL ripulito); rotazione cicla le 3 viste all'intervallo scelto;
barra kiosk sticky a fondo pagina su qualsiasi scroll; dimming disattivo di giorno con
overlay opacità 0 (percorso notturno coperto da test puri su `isNightRome`); zero overflow
desktop/mobile; console pulita; nav/footer/barra mobile assenti in kiosk.

### 5.21 I53 — Multi-regione simultanea (query parallela eu+cn, settings multi-chiave) — 12/10

**Contesto**: il piano MiniMax esiste in due regioni con host e console distinte —
Europa (`minimax.io`, chiavi europee) e Cina (`minimaxi.com`, chiavi cinesi); una
Subscription Key funziona SOLO nella regione che l'ha emessa (chiave sbagliata →
business `status_code 1004`). Chi possiede piani in ENTRAMBE le regioni doveva finora
sceglierne una e cambiare chiave a mano per vedere l'altra. I53 porta il monitoraggio
PARALLELO delle due regioni con una seconda chiave opzionale.

**Decisioni di design**:

1. **Settings multi-chiave simmetriche e retrocompatibili**: `DashboardSettings` guadagna
   `apiKeyAlt: string` (default `""`) — la chiave della SECONDA regione, cioè quella
   opposta a `region` (`regioneAlt`). La coppia esistente `apiKey`+`region` resta la
   PRIMARIA (sorgente di verità per storico, avvisi, titolo tab): chi non compila la
   seconda chiave vede la dashboard IDENTICA a prima (zero regressioni, nessuna
   migrazione necessaria — il campo manca solo nel localStorage vecchio ed è colto dal
   default). Scelta della forma simmetrica (`apiKeyAlt` invece di `apiKeyCn`): anche un
   utente con primaria cn può aggiungere l'eu senza eccezioni nel codice.
2. **Helper puri in `lib/minimax.ts`** (testati): `regioneAlt(region)` (eu↔cn) e
   `chiaviPerRegione(settings)` → lista di 1 o 2 coppie `{region, key}`:
   secondaria inclusa SOLO se `apiKeyAlt` non è vuota e DIVERSA dalla primaria
   (la stessa chiave incollata due volte produrrebbe 1004 sull'host sbagliato:
   dedup = una sola query, nessun rumore).
3. **Query parallela client-side, proxy INVARIATO**: `fetchData` esegue le chiamate al
   proxy `/api/minimax/usage` (una per coppia) con `Promise.allSettled` — il proxy
   per-regione non cambia un riga: fallback I18, ritenti transitori I51 e timeout
   12 s funzionano IDENTICI per entrambe le regioni perché vivono DENTRO ogni chiamata.
4. **Integrità delle analisi (decisione chiave)**: lo snapshot della SECONDA regione
   NON entra né nello storico flat `HistoryPoint[]` né nello storico per-modello
   (`ModelHistoryPoint`/`ModelUsagePoint` non hanno campo regione lato client:
   mescolare «general» eu e «general» cn corromperebbe trend, EWMA, cicli, ritmo e
   proiezioni). Lo storico e TUTTE le analisi restano narrativa della regione primaria;
   la secondaria è VISUALIZZATA (pannello dedicato) e basta. Solo lo snapshot primario
   alimenta `pushHistory`.
5. **Eventi di sola transizione (lezione I18)**: per la secondaria SI registra un evento
   tecnico SOLO sul cambio di stato connessione — prima riuscita («Seconda regione
   (Cina) connessa…»), passaggio ok→errore («Rilevamento secondaria fallito…»), ritorno
   ok. Nessuno spam a ogni poll; nessun avviso di soglia per la secondaria (il pannello
   mostra le percentuali con la scala colore di `quotaLevel`).
6. **Scheduler e backoff seguono SOLO la primaria**: il successo/fallimento complessivo
   del ciclo di polling resta deciso dalla regione primaria (una secondaria in errore
   NON rallenta il polling né arma il backoff I51 — eviterebbe di penalizzare la
   primaria per un guasto dell'altra regione).
7. **Avvisi soglia / banner / SW (I52) / titolo tab (I67) / Diagnostica: primaria
   soltanto** — il Service Worker legge `apiKey` per la sua poll a tab chiuso e segue la
   regione primaria per design (documento qui, nessun cambio al SW).
8. **Demo coerente**: con la secondaria configurata, la demo genera anche
   `makeDemoSnapshot(regioneAlt(region))` per il pannello (nessun backfill storico).

**Componenti**:

- `src/lib/minimax.ts` — `regioneAlt()`, `chiaviPerRegione()` (puri).
- `src/components/settings-dialog.tsx` — `apiKeyAlt` in `DashboardSettings` +
  `DEFAULT_SETTINGS` + campo password nel tab «Connessione» con etichetta DINAMICA
  («Seconda regione — Cina (minimaxi.com)» / «— Europa (minimax.io)») che segue la
  select regione; nota privacy (stessa coppia chiave→localStorage→solo proxy).
- `src/components/region-alt-panel.tsx` (NUOVO) — `RegionAltPanel`: card della seconda
  regione resa nella sezione «Panoramica» SOLO quando la secondaria è configurata:
  header con regione, endpoint, badge stato (connessa/errore/in attesa), piano,
  crediti, ultimo rilevamento (Roma), eventuale errore con messaggio, e la
  `PanoramicTable` dei modelli della seconda regione. Niente nuova sezione nella nav
  (le 8 sezioni I66/I85 restano tali): il pannello VIVE dentro «Panoramica» ed è
  assente in compatta/kiosk come il resto della sezione.
- `src/components/tech-panels.tsx` — riga «Seconda regione» in TechInfo (regione +
  stato; «—» se non configurata).
- `src/app/page.tsx` — stati `snapshotAlt`/`altError`/`altFetch` (+ ref transizione
  `prevOkAltRef`); `fetchData` riscritta a campagna parallela `Promise.allSettled`
  (esiti smistati per regione: primaria = comportamento storico INVARIATO fino al
  fallback/ref scheduler; secondaria = stati dedicati); `connKey` e `connChanged`
  includono `apiKeyAlt` (cambiare la chiave secondaria rifà UN fetch, come la primaria);
  rendering di `RegionAltPanel` nella sezione panoramica; `TechInfo` con la nuova prop.

**Criteri di accettazione**: con `apiKeyAlt` vuoto la dashboard è byte-identica al
comportamento precedente (una sola chiamata, stessi eventi); con secondaria configurata
le due chiamate partono IN PARALLELO ad ogni ciclo, il pannello seconda regione mostra
piano/modelli/percentuali (o l'errore con messaggio 1004 dedicato), gli eventi di
transizione compaiono una sola volta per cambiamento di stato, lo storico e le analisi
restano della primaria (verifica audit: nessun `pushHistory` sullo snapshot secondario);
demo coerente; tema chiaro leggibile (famiglia I78/I83/I84); zero overflow mobile;
console pulita.

### 5.22 I54 — Verifica di coerenza inversa «live ↔ demo» (matrice ricostruita) — 12/10

> **Storia**: la verifica fu eseguita il 09/10 con esito «live ⊇ demo su tutte le
> dimensioni»; la sezione con la matrice a 23 dimensioni era in §5.9 di questo file ed è
> **persa col secondo rollback dell'11/10** (§5.9 è ora la sezione del fallback I18).
> Qui RI-eseguita come RICOSTRUZIONE dal codice attuale, con esito su file
> (`scripts/verifiche/esiti/i54-live-vs-demo-latest.md`, prodotto da
> `scripts/verifiche/verifica-i54-live-vs-demo.mjs`) e conteggio onestamente aggiornato.

**Domanda della verifica**: ogni dimensione di comportamento visibile in demo ha una
controparte live con la STESSA logica condivisa, salvo le dimensioni live-only per
costruzione? **Verdetto: live ⊇ demo su tutte le 29 dimensioni ricostruite** —
27 condivise + 2 gruppi live-only per costruzione, 0 evidenze fallite.

- **Condivise (24)**: parser unico (`parseUsageResponse` su demo/live/import), envelope
  `base_resp`, normalizzazione stati 1/2/3 (`statusLabel` senza fork demo — assenza
  verificata), percentuali come fonte della verità, conteggi «non dichiarati»
  (`CountsRow`), etichette finestre per-modello (`windowShortLabel`), countdown vivi
  (tick `now` unico a 1 s), storico flat + replica server I16 (`pushHistory` nei DUE
  rami), storico per-modello I82 (backfill demo + ingestione live), registro eventi
  (`evaluateTransitions` su OGNI snapshot), avvisi di soglia, scheduler+backoff I51
  (il gate dello scheduler INCLUDE la demo), seconda regione I53 (stesso pannello,
  fork solo sulla fonte), import JSON (non gated), export CSV/JSON, grafico+ritmo I59,
  analisi lungo periodo/cicli/spreco/prevedibilità I26/I57/I63, calendario/distribuzione/
  oggi-vs-media I58/I61/I64, anomalie/EWMA/campionamento I70/I71/I72, diagnostica/salute
  I60/I62, kiosk I87 (assenza «demo» verificata), compatta I73, tema I78/I84, nav I66/I74/I85.
- **Condivise con marcatore (3)**: vista stampa I75 e titolo tab/favicon I67 (prop
  `demo` = dichiarazione di fonte, non fork logico), TechInfo (endpoint
  `demo://token_plan/remains` vs reale).
- **Live-only per costruzione (2)**: notifiche SW I52 (in demo DISISCRIZIONE esplicita
  in `pwa-register.tsx`: `demoMode → apiKey null` → il SW cancella — percorso gestito,
  non abbandonato) e percorsi d'errore (rete, fallback I18, Retry-After, ora server
  dedotta — in demo inesistenti: nessun guasto possibile). Sono i punti in cui
  «live ⊇ demo» è volutamente tautologico: il live è un SUPERINSIEME della demo.

**Lettura**: la demo non mostra nulla che il live non copra; ogni divergenza futura
tra i due percorsi richiederebbe di toccare un simbolo condiviso, sorvegliato
dall'audit I55 (check di presenza e di assenza).

### 5.23 I49 + V8 + I56 — Campagna campionatore con chiave reale (verdetto fuso reset) — 12/10

**Contesto**: ultimo filone ⬜ di `docs/04` — I49 (campionatore passivo) + V8 (fuso di
reset) + I56 (chiusura e smontaggio), tutti bloccati sulla chiave API reale; sbloccati
dall'utente («la chiave è già presente nella finestra di preview, utilizza quella chiave
per procedere con gli step mancanti del piano»). Già eseguiti il 09/10 con esiti persi
nel rollback: questa è la prima campagna con verdetti su ARTEFATTI COMMITTI.

**Scoperta decisiva all'apertura**: il file `scripts/verifiche/.chiave-sessione` del
05/10 (era ADR-13) è SOPRAVVISTO su disco (perms 0755 → riportate a 0600; difeso anche
da `.gitignore`); validato con V1 `--once` prima di qualunque uso. E soprattutto:
`campione-live.jsonl` conteneva ancora le **122 righe del 09/10** credute perse col
rollback (la piattaforma aveva ripristinato la history git, non il file su disco) — la
nuova campagna ha campionato APPENDENDO all'era storica, trasformando il verdetto
«superstite solo nel transcript» in verdetto su prova grezza commessa.

**Montaggio (I49, ADR-13-R2)**: blocco marcato `CAMPAGNA V8` in
`src/app/api/minimax/usage/route.ts` — import `campionaRisposta` + chiamate
`void campionaRisposta(...)` dopo ogni risposta OK del primario e del fallback I18;
cattura chiave ADR-13 ri-armata nello stesso blocco SOLO se `.chiave-sessione` manca
(idempotente: verificato in opera con una chiamata proxy con chiave finta DURANTE la
campagna — il file reale non è stato toccato). La chiave non entra MAI nel campione:
non compare nella firma della funzione (garanzia strutturale, testata).

**Esecuzione**: era fresca 12:50:38→14:05:19 UTC (83 campioni a ~1/min col poller del
browser; il poller si è fermato alle 14:05 con la chiusura dell'anteprima — la finestra
di transizione delle 15:00 UTC non è stata campionata in diretta, ma la transizione
in medias res del 09/10 nell'era recuperata copre la domanda). Rapide con chiave reale:
**V4 = IDENTICI** (esiti commessi), **V5 non applicabile** (M Plan senza conteggi),
**V6 nessun rate limit** (54/54 @10s in FOREGROUND — il primo tentativo in background
con `setsid` è morto a metà run senza esiti: lezione aggiornata di I30),
V1 `--once` non conclusiva (stato 2 resta da osservare in un consumo fino a esaurimento).

**Verdetto V8** (dettagli in `docs/02` §5): **blocchi fissi UTC con offset 0 ms** — start
sempre sui confini di griglia (blocchi 5h ANCORATI ALLA MEZZANOTTE UTC DEL GIORNO, non
multipli di 5h dall'epoca: le due ere su giorni diversi hanno discriminato la formula;
video 24h a mezzanotte; settimanale lunedì 00:00 UTC), start PRE-ARMATO non riancorato
all'uso (transizione 09/10: attivazione a 10:22:44 UTC con start 10:00:00.000Z esatto;
video mai usato con start già pre-armato). Risolve V2 (NO rolling) e V3 (start post-reset
= nuovo blocco di griglia). Analizzatore `analisi-reset-timezone.mjs` ri-creato con
filtri `--da/--a` per era ed esiti stabili `v8-fuso-reset-latest.md`.

**Smontaggio (I56)**: blocco marcato rimosso dal proxy (import incluso),
`.chiave-sessione` eliminata, `campione-live.jsonl` + esiti commessi, audit tornato al
dormiento (check condizionali I86/I49: wiring ammesso SOLO col blocco marcato).

**Test e audit**: `tests/lib/campione.test.ts` (13: envelope valide/invalide, JSONL,
append, mkdir ricorsivo, MAI eccezioni, cap 12 MB, no chiave nella riga, percorso);
audit +3 check I49/I56 (analizzatore, esiti stabili, campione commesso) e 2 check I86
resi condizionali (campionatore + riferimento file chiave tollerati SOLO con blocco
marcato presente).

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
┌ Header: titolo · stato dati (API/demo/importato) · ultimo aggiornamento (Roma) · refresh ·
│         toggle tema (I78) · settings                                                       │
│ Alert errori (autenticazione/HTTP/rete) · Banner avvisi soglia · regione aria-live (I79)   │
├ NAV sezioni sticky sotto l'header (I66/I85, ≥md): Quota · Grafico · Ritmo · Panoramica ·   │
│         Analisi · Diagnostica · Tecnici · Eventi — scrollspy con evidenza della sezione    │
│         visibile; su <md barra fissa in basso (I74); nessuna delle due in compatta (I73)   │
├ MainWindows: riepilogo grande delle due finestre del general (QuotaRing continui I65)      │
├ HistoryChart: switch finestra + selettore MODELLO pivot (I82, se >1) + selettore           │
│         Intervallo (I69) + media mobile SMA-10 + fasce cicli/reset (I32) + Esporta         │
│         (locale/server/orario I68) + «Stampa report settimanale» (I75)                     │
├ RateChart: ritmo di consumo %/h (I59, sotto il grafico)                                    │
├ StatsPanel: consumo medio · esaurimento previsto · rilevamenti · VERDETTO vs reset (I23)   │
│             · PACE + QUOTA SPRECATA (I31) · Proiezione EWMA A/B (I72)                      │
├ PanoramicTable: tutte le finestre del piano a confronto (modello × finestra, stato, reset) │
├ RegionAltPanel (I53, solo con 2ª chiave): panoramica della SECONDA regione — piano,        │
│         crediti, stato connessione, PanoramicTable dei suoi modelli (dentro «Panoramica»)  │
├ LongTermAnalysis (pivot I82): Cicli (+spreco I57, prevedibilità I63) · Per giorno           │
│         (+oggi vs media I64) · Per ora (heatmap I32) · Calendario (I58) · Distribuzione (I61)│
├ Altri modelli: ModelCard dinamica per ogni voce ≠ general                                  │
├ Diagnostica: orologio dei reset (I60) · salute del monitor (I62) · anomalie del ritmo (I70)│
│         · qualità del campionamento (I71) — SEMPRE sullo storico completo di general       │
├ TechInfo: regione, modalità, endpoint (primario/fallback I18), refresh, ora server         │
├ RawJsonPanel: JSON grezzo dell'ultima risposta (resta scuro anche in tema chiaro, I78)     │
└ EventLog: registro eventi (reset, soglie, errori) con filtri kind/testo/periodo (I77)      ┘
```

Le 8 sezioni sono ancorate (`.mm-anchor` + `scroll-margin-top` da `--nav-offset`) e avvolte in
error boundary indipendenti (I76). La modalità compatta (I73) mostra solo header ridotto +
MainWindows + RateChart + selettore intervallo. La modalità kiosk/TV (I87, `?kiosk=1`) mostra
SOLO la vista selezionata (Quote/Grafico/Analisi, con rotazione e dimming notturno opzionali)
e sostituisce footer e nav con la barra di controllo sticky.

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
- **Residui della catena di verifica — RICONCILIATI (I86, 12/10)**: la route temporanea
  `src/app/api/verifiche/route.ts` del Task 7 (ri-introdotta nell'albero da un commit UUID
  di piattaforma, inerte senza `scripts/verifiche/.chiave-sessione`) è stata **RIMOSSA**
  insieme allo scaffold `src/app/api/route.ts`: l'applicazione non espone più alcun endpoint
  che spawn di processi, in piena coerenza con ADR-13-R (il toolkit resta usabile da CLI con
  `node scripts/verifiche/verifica.mjs …` e la procedura di eventuale ri-armo è in `docs/05`
  §10). `src/lib/campione.ts` (campionatore I49) — AGGIORNAMENTO 12/10 pomeriggio: la
  campagna V8 è stata ESEGUITA (ri-cablaggio temporaneo con blocco marcato nel proxy,
  ADR-13-R2, chiave mai campionata) e il campionatore è tornato DORMIENTE con lo
  smontaggio I56 (nessuna scrittura su disco avviene ora; l'audit verifica il dormiento
  con check condizionale — wiring ammesso solo col blocco marcato); il file
  `campione-live.jsonl` è commesso come prova della campagna e il verdetto V8
  («blocchi fissi UTC») è registrato in `docs/02` §5 e `docs/04` §4.

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
2. ~~**Fallback automatico** su `coding_plan/remains`~~ — **implementato (I18, 11/10)**:
   trigger su 404/405/410/501 o risposta non-JSON, MAI su auth (401/403/1004) né su
   rete/timeout; evento tecnico solo sulla transizione primario↔fallback. Sbloccato
   dall'accettazione documentale del verdetto V4 = IDENTICI del 09/10 (`docs/04` §4);
   una V4 fresca con chiave reale può solo CONFERMARE l'equivalenza (runbook `docs/05` §6).
3. ~~**Multi-regione simultanea**~~ — **implementato (I53, 12/10)**: query parallela
   eu+cn con `Promise.allSettled` per chi possiede chiavi in entrambe le regioni
   (`apiKeyAlt` opzionale nelle impostazioni, simmetrica e retrocompatibile); la
   secondaria è visualizzata nel pannello `RegionAltPanel` dentro «Panoramica» e NON
   entra nello storico né nelle analisi (integrità: nessuna mescolanza di regioni —
   design completo in §5.21).
4. ~~**PWA/offline**~~ — **implementato (I52, 11/10)**: manifest + icone + shell e ultimo
   snapshot in cache offline; notifiche soglia anche a tab chiuso via Service Worker con
   chiave in IndexedDB (ADR-14). La modalità compatta per schermi secondari/widget è I73.
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
