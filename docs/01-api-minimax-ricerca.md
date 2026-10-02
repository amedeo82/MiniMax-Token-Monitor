# 01 — Ricerca API MiniMax: endpoint, autenticazione, regole

> **Scopo di questo documento**: raccogliere TUTTE le scoperte sulla API MiniMax fatte
> durante le ricerche (docs ufficiali + issue GitHub + progetti open-source), così da
> non doverle rifare. Ogni informazione è marcata con lo stato di affidabilità:
> ✅ *confermato* (fonte ufficiale o test empirico) · 🔶 *verosimile* (fonte secondaria/
> open-source) · ❓ *da verificare*.
>
> Ultimo aggiornamento: 2026-10-02 (rimozione del contatore token reale — ADR-8) · Fonti salvate in `scripts/` (vedi §9).

---

## 1. Come siamo arrivati a queste conclusioni

| Fonte | Tipo | Artifatto locale |
|-------|------|------------------|
| `platform.minimax.io/docs/m-plan/faq` | Docs ufficiali (M Plan) | `scripts/mplan_faq.md` |
| `platform.minimax.io/docs/m-plan/usage-rules` | Docs ufficiali (reset finestre) | `scripts/usagerules.md` |
| `platform.minimax.io/docs/token-plan/faq` | Docs ufficiali (Token Plan legacy) | `scripts/faq.md` |
| `platform.minimax.io/docs` Chat Completions (OpenAPI) | Docs ufficiali | `scripts/chatapi.md` |
| `platform.minimax.io/docs` List Models (OpenAPI) | Docs ufficiali | `scripts/listmodels.md` |
| GitHub `MiniMax-AI/MiniMax-M2` issue **#88** e **#99** | Conferme dal team MiniMax | `scripts/issue88.json`, `scripts/issue99.json` + note |
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
  stessi dati di `/v1/token_plan/remains` o solo una sottocompatibilità.

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
| Piani | M Plan: **Go / Explore / Build**. Token Plan (legacy): **Plus 20$ / Max 50$ / Ultra 120$** (+ tier retired Starter/Plus-hs/Max-hs/Ultra-hs). |
| A chi serve | Uso individuale interattivo; per produzione è consigliato pay-as-you-go. |

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
> vedi `docs/04` §5 (V1).

---

## 9. Archivio artefatti di ricerca (`scripts/`)

| File | Contenuto |
|------|-----------|
| `mplan_faq.md`, `usagerules.md` | Docs ufficiali M Plan (FAQ + regole reset) |
| `faq.md`, `faq.json` | Docs ufficiali Token Plan (FAQ completa, migrazione piani) |
| `chatapi.md` | OpenAPI Chat Completions (schema `usage`) |
| `listmodels.md` | OpenAPI List Models |
| `issue88.json`, `issue99.json`, `issue88.html`, `issue99.html` | Issue GitHub MiniMax-M2 (endpoint + semantica usage_count) |
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
