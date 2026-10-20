# 01 — Ricerca API MiniMax: endpoint, autenticazione, regole

> **Scopo di questo documento**: raccogliere TUTTE le scoperte sulla API MiniMax fatte
> durante le ricerche (docs ufficiali + issue GitHub + progetti open-source), così da
> non doverle rifare. Ogni informazione è marcata con lo stato di affidabilità:
> ✅ *confermato* (fonte ufficiale o test empirico) · 🔶 *verosimile* (fonte secondaria/
> open-source) · ❓ *da verificare*.
>
> Ultimo aggiornamento: 2026-10-12 (ri-creato §11: verifica «demo ↔ API ufficiale» I48 con esito su file) · Fonti salvate in `scripts/` (vedi §9).

---

## 1. Come siamo arrivati a queste conclusioni

| Fonte | Tipo | Artifatto locale |
|-------|------|------------------|
| `platform.minimax.io/docs/m-plan/faq` | Docs ufficiali (M Plan) | `scripts/mplan_faq.md` |
| `platform.minimax.io/docs/m-plan/usage-rules` | Docs ufficiali (reset finestre) | `scripts/usagerules.md` |
| `platform.minimax.io/docs/token-plan/faq` | Docs ufficiali (Token Plan legacy) | `scripts/faq.md` |
| `platform.minimax.io/docs` Chat Completions (OpenAPI) | Docs ufficiali | `scripts/chatapi.md` |
| `platform.minimax.io/docs` List Models (OpenAPI) | Docs ufficiali | `scripts/listmodels.md` |
| GitHub `MiniMax-AI/MiniMax-M2` issue **#88** e **#99** | Conferme dal team MiniMax | issue pubbliche su GitHub (copie locali `scripts/issue88-99` rimosse 11/10 per sanificazione pre-push: contenevano token JWT) |
| **CreditGauge** (plugin statusline Claude Code) | Open-source | `scripts/cg_readme.md`, `scripts/cg_minimax.js` |
| **CodexBar** (macOS, provider MiniMax) | Open-source | `scripts/codexbar_minimax.md`, `scripts/minimax_fetcher.swift` |
| **dsh-provider-usage** (plugin DeepSeek Harness) | Open-source | `scripts/dsh_readme.md` |
| Risultati web search | — | `scripts/search1.json`, `scripts/search2.json`, `scripts/faq.json` |

**Conclusione chiave della ricerca**: l'endpoint che produce il JSON analizzato
dall'utente è il **§3** (`/v1/token_plan/remains`), confermato *dalla documentazione
ufficiale stessa* (metodo 3 di "How can I check M Plan usage?") e dall'issue #99.

---

## 2. Chiavi e autenticazione ✅

Esistono **due tipi di chiave NON intercambiabili**:

| Tipo | A cosa serve | Dove si ottiene |
|------|--------------|-----------------|
| **Subscription Key** | Piano a token (Token Plan / M Plan) e pacchetti Crediti. È quella che ci serve. | Console → [Plan Details](https://platform.minimax.io/console/plan) (per Token Plan: *Billing → Token Plan*) |
| **API Key standard** (pay-as-you-go) | Fatturazione a consumo sul saldo account. NON usa il piano. | Console → [Account Management → API Keys](https://platform.minimax.io/user-center/basic-information/interface-key) |

Regole autenticazione:

- Header: `Authorization: Bearer <Subscription Key>` ✅
- Con la chiave sbagliata l'endpoint quota risponde `base_resp.status_code: 1004`
  ("cookie is missing, log in again") invece di un classico HTTP 401 ✅ (issue #88/#99)
- Ogni utente ha una Subscription Key **per Team**; la chiave esiste anche prima di
  avere risorse attive (in quel caso non restituisce quota) ✅
- La CLI ufficiale `mmx` distingue le regioni: `mmx config set --key region --value global|cn` ✅

---

## 3. Endpoint primario: quota del piano ✅

> È l'endpoint che genera il JSON fornito dall'utente e analizzato in `docs/02`.

```
GET https://www.minimax.io/v1/token_plan/remains        ← regione EUROPA ✅
GET https://www.minimaxi.com/v1/token_plan/remains      ← regione CINA ✅
```

**Esempio (dalla FAQ ufficiale M Plan)**:

```bash
curl --location 'https://www.minimax.io/v1/token_plan/remains' \
  --header 'Authorization: Bearer <API Key>' \
  --header 'Content-Type: application/json'
```

Note operative:

- Metodo: **GET** (la FAQ mostra curl senza `-X POST`; il proxy del progetto usa GET) ✅
- Header minimi: `Authorization: Bearer …`; `Accept: application/json` consigliato 🔶
- La risposta può arrivare **piatta** oppure **annidata sotto `data`**: il parser del
  progetto gestisce entrambe le forme (vedi `docs/03` §5) 🔶
- Campi extra osservabili oltre a `model_remains`: `current_subscribe_title` /
  `plan_name` / `combo_title` (titolo piano), `points_balance` / `credits_balance`
  (saldo crediti) 🔶 (alias gestiti in `src/lib/minimax.ts`)
- Nessun CORS dal browser → serve proxy server-side ✅ (verificato nel progetto)

---

## 4. Endpoint alternativo/legacy: coding_plan/remains 🔶

Usato dai plugin open-source per i piani **Coding** (e talvolta dal web console):

```
GET https://api.minimax.io/v1/api/openplatform/coding_plan/remains    ← internazionale
GET https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains  ← Cina
```

- Citato in issue **#88** e implementato da **CodexBar** (`MiniMaxUsageFetcher.swift`)
  e **dsh-provider-usage** (kind `minimax`).
- Formato risposta: stesso schema 5h + weekly (percentuali).
- CodexBar supporta anche la via **cookie di sessione web** (`platform.minimaxi.com`)
  con override `MINIMAX_REMAINS_URL` — utile solo se l'API key non viene accettata.
- ❓ Da verificare: se con i piani attuali (M Plan) questo endpoint restituisce gli
  stessi dati di `/v1/token_plan/remains` o solo una sottocompatibilità → verifica **V4**
  (`docs/04` §4, runbook `docs/05` §6, comando `v4` del toolkit `scripts/verifiche/verifica.mjs`).
- 🔶 **Evidenza parziale (02/10/2026, chiave non valida, toolkit `v4`)**: entrambi gli
  endpoint rispondono `HTTP 200` con `base_resp.status_code = 1004`, ma con messaggi
  diversi: `token_plan` → «login fail: Please carry the API secret key in the
  'Authorization' field…», `coding_plan` → «cookie is missing, log in again». I due
  servizi gestiscono l'auth in modo distinto (coerente con l'origine console/web di
  coding_plan); la compatibilità dei **dati** resta da confermare con chiave reale.
- ✅ **Verdetto V4 = IDENTICI (09/10/2026, chiave reale — accettazione documentale, esiti
  persi col rollback dell'11/10)**: stessa struttura e stessi dati → il parser
  `parseUsageResponse` è condiviso senza modifiche. Da qui **I18**: il proxy
  (`api/minimax/usage`) sul fallimento definitivo del primario per endpoint scomparso
  (HTTP 404/405/410/501 o risposta non-JSON — `shouldTryFallback` in `lib/minimax.ts`)
  ripete il rilevamento su `coding_plan/remains` (`CODING_PLAN_ENDPOINTS`) e risponde con
  `fallback {used, primaryEndpoint, reason}`; nessun fallback su errori di autenticazione
  né transitori (retry I51). Dettagli in `docs/03` §5.9; una V4 fresca resta raccomandata
  (`docs/05` §6).

---

## 5. Endpoint complementari (per arricchire il monitoraggio) ✅

Base URL API: `https://api.minimax.io` (server dichiarato negli OpenAPI ufficiali).

| # | Endpoint | Metodo | A cosa serve | Informazioni utili restituite |
|---|----------|--------|--------------|-------------------------------|
| 5.1 | `/v1/models` | GET | Catalogo modelli (compatibile OpenAI) | `{object:"list", data:[{id:"MiniMax-M3", object:"model", created, owned_by}]}` |
| 5.2 | `/v1/chat/completions` | POST | Chat/testo (compatibile OpenAI) | **`usage`: {prompt_tokens, completion_tokens, total_tokens, total_characters, prompt_tokens_details.cached_tokens}** → consumo token reale per richiesta. ⚠️ **NON usata dal dashboard** (ADR-8): con la Subscription Key ogni chiamata consuma la quota del piano che il monitor deve solo OSSERVARE |
| 5.3 | `/v1/video_generation` | POST | Creazione task video (modelli H3) | `task_id`, stato |
| 5.4 | `/v1/query/video_generation?task_id=…` | GET | Stato/esito task video | Stato, file risultato |

**Modelli citati dalla documentazione** (ottobre 2026): `MiniMax-M3`,
`MiniMax-M3.1-Flash-Preview` (1M contesto, `reasoning_effort`: low/medium/high/xhigh/max),
`MiniMax-M2.7`, `MiniMax-M2.5`; video: famiglia **H3** / H3 Max.
Nel quota endpoint compaiono come categorie d'uso: `general`, `video`.

---

## 6. Come ottenere il CONSUMO in token ✅

**Il quota endpoint NON espone token assoluti** — espone percentuali (vedi `docs/02` §8).

> **Decisione ADR-8 (2026-10-02)**: il dashboard **NON misura** il consumo in token.
> L'unico metodo programmatico (`usage` di `/v1/chat/completions`) richiede di invocare
> un modello, consumando la quota stessa del piano: un monitor che consuma ciò che
> misura non è accettabile. Il dashboard resta quindi **read-only**: percentuali di
> `token_plan/remains` + analisi locale dello storico. Le strategie seguenti restano
> valide per usi MANUALI/esterni al progetto.

Strategie, in ordine di utilità:

1. **`usage` nelle risposte `/v1/chat/completions`** ✅ — ogni risposta riporta i token
   esatti: `prompt_tokens`, `completion_tokens`, `total_tokens`, `total_characters`,
   `prompt_tokens_details.cached_tokens`. **Non integrata** (era il pannello "Consumo
   token reale", rimosso con ADR-8): utile solo per test manuali fuori dal dashboard,
   con prompt brevi. Nota: con la Subscription Key consuma la quota del piano; con una
   API Key standard consuma il saldo pay-as-you-go.
2. **Console ufficiale** ✅ — <https://platform.minimax.io/console/usage> mostra usage bar
   e analytics ("source of truth" dichiarata dalla FAQ). Metodo consigliato per il
   dettaglio in token assoluti, senza consumare quota.
3. **CLI ufficiale** ✅ — `mmx quota` (MiniMax CLI).
4. ❓ Endpoint di billing/usage history della console web: i plugin (CodexBar) usano
   la via cookie/sessione per ricostruire "30-day token trend, top model breakdown".
   Non documentata ufficialmente → da ingegneria inversa se serve; fragile.
5. **Import manuale JSON** ✅ — già implementato nella dashboard (Impostazioni → incolla JSON):
   utile per analizzare snapshot presi da curl/console senza esporre la chiave all'app.

---

## 7. Regole del piano (docs ufficiali, sintesi) ✅

| Regola | Dettaglio |
|--------|-----------|
| Finestra 5 ore | Vale per modelli **non video** (testo, immagini, audio). Inizia col **primo utilizzo** (rolling). Alla scadenza reset al 100%; l'uso successivo apre la finestra nuova. |
| Finestra 7 giorni | Vale per **tutti i modelli, video incluso**. Stessa meccanica rolling. |
| Video | **Solo** finestra settimanale secondo le docs; nel JSON reale il modello `video` espone comunque un `interval` di **24h** allineato a mezzanotte UTC — vedi `docs/02` §6. |
| Doppia finestra | I modelli non video richiedono residuo in **entrambe** le finestre per essere utilizzabili. |
| Indipendenza | Il reset 5h **non** resetta il consumo settimanale. |
| No carry-over | Quota non usata non si accumula né tra finestre né tra cicli di fatturazione. |
| Rate limit (RPM/TPM) | Distinto dalla quota: si può essere throttled prima di esaurire la quota. Recupero tipico ~1 minuto. |
| Crediti | 1.000 Credits = 1 $. Coprono l'overflow dopo l'esaurimento del piano (stessa Subscription Key). Validità 1 anno. |
| Piani | M Plan: **Go / Explore / Build** — uso relativo a Go: **1× / 3× / 7,5×** (nessun tetto assoluto pubblicato: le statistiche viaggiano a percentuali — verificato 20/10/2026). Token Plan (legacy): **Plus 20$ / Max 50$ / Ultra 120$** (+ tier retired Starter/Plus-hs/Max-hs/Ultra-hs). |
| Modelli per tier (verificato 20/10/2026) | **M3.1 Flash Preview** (testo), generazione immagini e audio, web search e comprensione multimodale in TUTTI i tier; modello video **H3** solo **Explore e Build** (Go: nessun video). Tutti i modelli M Plan condividono GLI STESSI limiti («usage shared») ma consumano a velocità diverse (il video molto di più; contesto lungo, task agentici e thinking profondo accelerano il consumo). |
| Ordine di deduzione (verificato 20/10/2026) | Uso del piano PRIMA, poi credit pack (a partire dalla più prossima a scadenza); la Subscription Key NON tocca mai il saldo pay-as-you-go. Crediti: 1.000 = 1 $, validità 1 anno, senza carry-over. |
| A chi serve | Uso individuale interattivo; per produzione è consigliato pay-as-you-go. |

> **⚠️ Nota empirica (V8, 12/10)**: le regole «rolling al primo utilizzo» qui sopra sono la
> CITAZIONE delle docs ufficiali, ma per questo piano sono empiricamente SMENTITE: le finestre
> sono **blocchi fissi UTC** — start sempre sui confini di griglia (5h: 00/05/10/15/20 UTC del
> giorno, ancorate alla mezzanotte UTC; 24h video a mezzanotte; settimanale lunedì 00:00 UTC),
> pre-armati e NON riancorati dall'uso (205 campioni, offset 0 ms). Verdetto formale in
> `docs/02` §5, esiti `scripts/verifiche/esiti/v8-fuso-reset-latest.md`.
>
> **✅ Verifica fresca 20/10/2026 (I125)**: FAQ (`platform.minimax.io/docs/m-plan/faq`) e
> usage-rules (`/docs/m-plan/usage-rules`) ri-interrogate in tempo reale: la semantica
> «rolling al primo utilizzo» è ANCORA il testo ufficiale (invariata); tier e moltiplicatori
> 1×/3×/7,5× confermati; modelli per tier confermati (H3 video solo Explore/Build); endpoint
> `token_plan/remains` confermato (GET con `Authorization: Bearer`); **nessuno schema JSON
> documentato ufficialmente** (la pagina `/docs/m-plan/usage` citata dalle regole d'uso
> risponde 404) → la ricostruzione di `docs/02` resta IL riferimento de-facto.

---

## 8. Codici di stato osservati

### 8.1 `base_resp.status_code` (envelope) ✅

| Valore | Significato | Come reagire |
|--------|-------------|--------------|
| `0` | OK | Proseguire col parsing |
| `1004` | "cookie is missing, log in again" → **chiave mancante/errata o non di tipo Subscription Key** | Chiedere all'utente di verificare la chiave (messaggio già implementato nel parser) |
| altri | Errore generico | Mostrare `status_msg` |

### 8.2 `current_interval_status` / `current_weekly_status` (per finestra) 🔶

| Valore | Ipotesi (verificata sul JSON reale) | Nel dashboard |
|--------|-------------------------------------|----------------|
| `1` | Finestra **attiva / in uso** (general con consumo registrato) | Badge "Attiva · in uso" (tone ok) |
| `3` | Finestra **inattiva / mai usata** nel periodo (video inutilizzato) | Badge "Inattiva · mai usata" (tone idle) |
| `2` | ❓ Presumibilmente **esaurita** — da confermare empiricamente | Badge "Esaurita (ipotesi)" (tone crit) |
| stringhe (`normal`, `exhausted`, `throttled`, …) | Alcune versioni dell'endpoint usano testi | Mappate in `statusLabel()` |

> Il parser normalizza numeri e stringhe in `string` e applica `statusLabel()`
> (`src/lib/minimax.ts`). Procedura di verifica del codice `2`:
> verifica **V1** (`docs/04` §5) eseguibile con il toolkit
> `node scripts/verifiche/verifica.mjs v1` — runbook `docs/05` §3.

---

## 9. Archivio artefatti di ricerca (`scripts/`)

| File | Contenuto |
|------|-----------|
| `mplan_faq.md`, `usagerules.md` | Docs ufficiali M Plan (FAQ + regole reset) |
| `faq.md`, `faq.json` | Docs ufficiali Token Plan (FAQ completa, migrazione piani) |
| `chatapi.md` | OpenAPI Chat Completions (schema `usage`) |
| `listmodels.md` | OpenAPI List Models |
| *(rimossi 11/10, sanificazione pre-push)* `issue88.json`, `issue99.json`, `issue88.html`, `issue99.html` | Issue GitHub MiniMax-M2 (endpoint + semantica usage_count) — contenevano token JWT; fonte sostitutiva: le issue pubbliche su GitHub |
| `cg_readme.md`, `cg_minimax.js`, `cg_flat.json`, `cg_tree.json` | CreditGauge: mapping campi MiniMax |
| `codexbar_minimax.md`, `minimax_fetcher.swift`, `minimax_parser.swift`, `minimax_service.swift` | CodexBar: fetch/parse MiniMax (endpoint alternativo, cookie, diagnostiche) |
| `dsh_readme.md` | dsh-provider-usage: tabella endpoint di quota per tutti i provider |
| `usage_rules.json` | Regole d'uso (JSON estratto) |
| `search1.json`, `search2.json`, `s3.json`, `s4.json`, `llms.txt`, `dirlist.json` | Risultati delle ricerche web e indici docs |
| `gh88.json`, `gh99.json` | Payload grezzi GitHub API delle issue |
| `mus.swift`, `mms.swift`, `mcpp.swift`, `mufm.swift`, `mm_settings.swift` | Sorgenti Swift di riferimento (parser/adapter) |
| `verify_*.png`, `preview_*.png` | Screenshot di verifica della dashboard (agent-browser) |

## 10. Fonti online principali

- Docs index: <https://platform.minimax.io/docs/llms.txt>
- M Plan FAQ: <https://platform.minimax.io/docs/m-plan/faq>
- Usage rules: <https://platform.minimax.io/docs/m-plan/usage-rules>
- Token Plan FAQ: <https://platform.minimax.io/docs/token-plan/faq>
- Console usage: <https://platform.minimax.io/console/usage>
- Issue #88: <https://github.com/MiniMax-AI/MiniMax-M2/issues/88>
- Issue #99: <https://github.com/MiniMax-AI/MiniMax-M2/issues/99>

---

## 11. Verifica «demo ↔ API ufficiale» (I48)

> **Storia**: la verifica fu eseguita il 09/10 con esito «demo fedele al 100% sui campi
> osservati»; matrice e nota erano in §11.2 di questo file e sono **perse col secondo
> rollback dell'11/10**. Qui ri-eseguita il 12/10 con metodo rafforzato: la matrice è
> prodotta da uno script riproducibile (`scripts/verifiche/verifica-i48-demo-vs-api.ts`,
> bun, zero rete, zero chiavi) e l'esito è su **file** in `scripts/verifiche/esiti/`
> (lezione del rollback: nessun verdetto senza artefatto persistente).

### 11.1 Metodo e definizione di fedeltà

La risposta REALE dell'endpoint (riportata verbatim in `docs/02` §1, catturata il
02/10/2026 con Subscription Key) viene confrontata campo per campo con lo snapshot
demo di `src/lib/demo.ts` (`makeDemoSnapshot`), sia allo stato grezzo sia al livello
normalizzato (`parseUsageResponse` — lo stesso parser usato dal vivo).

**Fedeltà = stesso schema + stesse invarianti + semantica coerente con la storia
simulata.** I valori sono per costruzione simulati (curve di consumo con easing e
jitter): le differenze di valore attese sono registrate come «differenza dichiarata»,
mai come infedeltà. Le invarianti verificate programmaticamente:

- durate delle finestre: 18.000.000 ms (5h, general), 86.400.000 ms (24h, video),
  604.800.000 ms (7g, settimanale) — identiche su entrambe le sorgenti;
- `remains_time ≡ end_time − istante di lettura`: nel reale via triangolazione
  (`t_query = 1.790.939.878.714`, identico su 3 campi — `docs/02` §4.2), nella demo
  per costruzione;
- finestra settimanale condivisa tra i modelli (start/end/remains identici);
- finestra video allineata a mezzanotte UTC (02:00 Roma in CEST);
- conteggi a 0 su entrambe le sorgenti («non dichiarati», piano tracciato a
  percentuali — issue #99);
- codici di stato 1 (attiva) e 3 (inattiva/mai usata) coerenti con il consumo.

### 11.2 Matrice (esito 12/10/2026)

**Verdetto: demo fedele al 100% sullo schema e sulle invarianti osservate** —
29 campi: 23 fedeli, 6 differenze dichiarate, 0 falliti. La matrice completa
(29 righe con evidenze) è nell'esito su file `scripts/verifiche/esiti/i48-demo-vs-api-latest.md`;
sintesi delle differenze dichiarate:

| # | Campo | API reale (02/10) | Demo | Natura della differenza |
|---|-------|-------------------|------|-------------------------|
| R4 | `current_subscribe_title` / `credits_balance` | assenti nel campione (documentati come opzionali, alias gestiti dal parser) | sempre presenti («M Plan · Explore (Demo)», 42,75) | la demo esercita SEMPRE anche i campi opzionali |
| G2 | `current_interval_remaining_percent` (general) | 100 (nessun consumo nella finestra osservata) | calo simulato (finestra in corso da 3,2h su 5h) | valori simulati, semantica identica |
| G7 | `current_weekly_remaining_percent` (general) | 64 | calo simulato su 2,7 giorni | valori simulati, semantica identica |
| G9 | allineamento settimanale | lunedì 00:00 UTC esatto | rolling (start = now − 2,7g) | semplificazione dichiarata: l'ancoraggio è proprietà del SERVER (`docs/02` §5); parser e UI non ne dipendono |
| V7 | `current_weekly_remaining_percent` (video) | 100 (mai usato nel periodo) | uso settimanale simulato (consumo > general) | la demo racconta un video usato, per popolare le analisi per-modello (I82) |
| V8 | `current_weekly_status` (video) | 3 («Inattiva · mai usata», coerente: mai usato) | **1 («Attiva · in uso»)** — CORREZIONE DELLA VERIFICA | la demo aveva stato «3» CON consumo simulato (incoerente): corretto in `src/lib/demo.ts` il 12/10 |

La riga V8 è l'unico reperto attivo della verifica: una vera incoerenza della
simulazione (stato «mai usata» su una finestra con percentuale consumata) trovata
dalla matrice e corretta in itinere. Nessun test la definiva: suite invariata
(311/311, 897 asserzioni).

### 11.3 I125 — l'ancoraggio delle finestre demo (G9 CHIUSA, G13 NUOVA)

La richiesta dell'utente del 20/10/2026 — «anche in modalità demo occorre mostrare
dati fedeli alle specifiche delle API MiniMax» — chiude l'ultima semplificazione
dichiarata della matrice. Le due differenze di allineamento erano note dal 12/10:

- **G9 (settimanale)**: la demo partiva la settimana «2,7 giorni fa» (rolling) —
  il server la ancora a **lunedì 00:00 UTC** (triangolazione `docs/02` §5, conferma
  di produzione 18→19/10). Rischio reale: un tick demo attorno al confine non
  mostrava il reset settimanale.
- **(implicita, finestra breve)**: la finestra 5h partiva «3,2h fa» (rolling) —
  il server usa **blocchi fissi UTC {00,05,10,15,20}** (verdetto V8; l'ultimo
  blocco 20:00→mezzanotta dura 4h reali). Rischio reale: la demo non mostrava
  MAI il reset 5h (la finestra scivolava con «now»).

`src/lib/demo.ts` ora ancora le finestre con le STESSE funzioni dell'analisi
(`inizioFinestra5h`/`fineFinestra5h`/`inizioSettimanaUtc` di `src/lib/cycles.ts`):
un tick che attraversa un confine mostra il salto verso il 100% (come il server
reale: 17% alle 16:59 → 96% alle 17:04 Roma del 19/10), lo storico demo è una
**curva a sega** fedele ai reset, e le percentuali sono clampate in [0,100]
(l'API non sfora mai: nemmeno il jitter demo deve farlo).

Matrice RI-eseguita il 20/10/2026 (`verifica-i48-demo-vs-api.ts` aggiornata):
**30 campi — 25 fedeli, 5 differenze dichiarate, 0 falliti**; G9 ora FEDELE,
nuova riga G13 (finestra breve = blocco fisso corrente) FEDELE. Esito su file
`scripts/verifiche/esiti/i48-demo-vs-api-latest.md`. Test dedicati:
`tests/lib/demo-finestre.test.ts` (10 test con gli istanti deterministici
19–20/10/2026, incluso l'ultimo blocco da 4h reali).
