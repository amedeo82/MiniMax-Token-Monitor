# 03 — Piano di implementazione e architettura

> **Scopo**: descrivere COME il dashboard è costruito (e perché), con la mappa del
> codice, i modelli dati, i flussi chiave, la gestione degli errori e le fasi di
> lavoro con i criteri di accettazione. È la guida operativa per qualsiasi nuova
> implementazione: nuova funzione → nuova voce nelle fasi (`docs/04`).
>
> Ultimo aggiornamento: 2026-10-02.

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
│   ├─ modalità: API reale │ import JSON │ demo                            │
│   └─ componenti: quota-cards · quota-ring · history-chart · tech-panels  │
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
| `src/lib/demo.ts` | Generatore demo realistico: finestra 5h aperta 3,2h fa, weekly 2,7 giorni fa, video con finestra 24h allineata a mezzanotte UTC e stato 3, jitter per animare il grafico |
| `src/app/page.tsx` | Stato globale pagina: settings/history (localStorage), fetch/polling, import JSON, demo, orologio 1s, layout |
| `src/app/api/minimax/usage/route.ts` | Proxy POST → GET MiniMax; timeout 12s; mappatura errori HTTP/business in italiano |
| `src/components/quota-cards.tsx` | `ModelCard` (card per modello: due finestre con barre, countdown, badge stato), `MainWindows` (riepilogo finestre general), `CountsRow` (residuo/totale/consumato + nota su percentuali), `windowKindLabel()` (5h vs 24h dinamica) |
| `src/components/quota-ring.tsx` | `QuotaRing`: anello SVG percentuale |
| `src/components/history-chart.tsx` | `HistoryChart` (Recharts, switch finestra interval/weekly), `computeTrend()`, `StatsPanel`, `TrendBadge` |
| `src/components/tech-panels.tsx` | `RawJsonPanel` (JSON grezzo con orario fetch), `TechInfo` (regione, modalità, endpoint, ora server dedotta, pannello "altri endpoint utili", avviso semantica `usage_count`) |
| `src/components/settings-dialog.tsx` | `DashboardSettings` { apiKey, region, refreshSeconds, demoMode }, import JSON con validazione |

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
interface DashboardSettings { apiKey: string; region: "eu" | "cn"; refreshSeconds: number /* 0 = off */; demoMode: boolean; }

// src/components/history-chart.tsx
interface HistoryPoint { t: number; interval: number; weekly: number; }  // epoch ms + percentuali general
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
├ Riga piano: titolo piano + saldo crediti + fuso corrente (romeZoneInfo)                            │
├ ModelCard "general": Finestra 5h [barra % · countdown reset · badge stato]                        │
│                      Finestra 7g [barra % · countdown reset · badge stato]                        │
│                      CountsRow (residuo/totale/consumato, nota "percentuali")                     │
├ ModelCard "video":   Finestra 24h (allineata mezzanotte UTC) + Finestra 7g                         │
├ MainWindows: riepilogo grande delle due finestre del general (QuotaRing)                           │
├ HistoryChart: andamento % nel tempo (switch interval/weekly) + StatsPanel + TrendBadge             │
├ TechInfo: regione, modalità, endpoint usato, refresh, ora server dedotta, altri endpoint           │
└ RawJsonPanel: JSON grezzo dell'ultima risposta                                                     ┘
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
| **F6** Estensioni | vedi §11 | — | ⬜ |

Verifiche effettuate con agent-browser (screenshot in `scripts/verify_*.png`,
`preview_*.png`): render desktop/mobile, import JSON reale, coincidenza dei countdown
con i calcoli manuali, pannello endpoint, console pulita.

---

## 11. Estensioni future (roadmap candidate)

1. **Persistenza storica server-side** (Prisma/SQLite già disponibile nel repo):
   storico multiplo giorni/settimane, confronto tra finestre, sopravvivenza al cambio browser.
2. **Contatore token reale**: mini-passerella `/api/chat` che chiama
   `/v1/chat/completions` e registra `usage.total_tokens` per richiesta (docs/01 §6.1).
3. **Notifiche soglie**: browser notification quando `remaining_percent < 10/25%`
   o al reset della finestra.
4. **Endpoint alternativo** `coding_plan/remains` come fallback automatico se
   `token_plan/remains` fallisse (V4 in `docs/04`).
5. **Multi-regione simultanea**: query parallela eu+cn per chi ha chiavi in entrambe.
6. **PWA/offline**: installazione e ultima snapshot cache.
7. **Confronto modelli**: breakdown percentuali per ogni voce `model_name` in un'unica vista settimanale.
