# 08 — Analisi della codebase: miglioramenti proposti (I94–I106)

> **Storia**: creato il 14/10/2026 a valle della richiesta utente «analizzando la codebase
> del progetto, quali altri ulteriori miglioramenti possiamo apportare al progetto?» e della
> successiva istruzione «scrivi e documenta tutti questi suggerimenti all'interno di un file
> nel progetto in modo che non vadano persi, poi crea un piano di implementazione con clarify
> per ogni suggerimento proposto». L'analisi è condotta in SOLA LETTURA (ricognizione manuale
> + agente di esplorazione dedicato) senza toccare alcun file applicativo; le evidenze citate
> sono verificabili (file:linea). Numerazione prosegue il registro di `docs/04` §3 (ultimo
> item: I93) con la convenzione già usata in `docs/07`: le proposte ricevono un numero prima
> dell'implementazione, così il clarify e il piano parlano la stessa lingua del changelog.
>
> Stato: **13 proposte numerate I94–I106, nessuna implementata** — le priorità del §4 sono
> la proposta dell'analisi; la selezione definitiva è nel registro delle decisioni (§7).

---

## 1. Metodo, baseline e stato git

- **Metodo**: ricognizione read-only sistematica su repo hygiene, `next.config.ts`,
  `tsconfig.json`, `eslint.config.mjs`, dimensioni/complessità componenti, gestione chiave
  API, `localStorage`, PWA, persistenza Prisma, copertura test, i18n, a11y, versioning,
  file tracciati in git, gestione errori del poller — con verifiche eseguite a supporto:
  `bunx tsc --noEmit` (6 errori confermati, TUTTI in `examples/`+`skills/`), `bun test`
  (342 pass / 967 asserzioni / 34 file), `git ls-files` (720 file tracciati, 258 PNG),
  grep mirati su `src/`.
- **Baseline verde intatta** (nessuna modifica al codice in questa analisi): tsc 0 su
  `src/`+`tests/`, lint 0, suite 342/342, audit 331/331 PASS 0 scoperte.
- **Nota di stato git** (14/10): il branch locale è *ahead 2* di `origin/main` per due
  commit pre-esistenti con messaggio UUID (`42de701`, `b504b02`: solo rumore permessi +
  `db/custom.db` del poller — lezione I30). Il push del presente documento li includerà.
- **Vincolo trasversale**: nessuna proposta tocca ADR-8 (read-only: il dashboard non invoca
  mai modelli e non consuma la quota che misura); I95/I103 presidiano le route esistenti
  senza introdurre nuovi consumi.

## 2. Sintesi per aree (evidenze chiave)

| # | Area | Evidenza principale | Riferimenti |
|---|------|--------------------|-------------|
| 1 | CI/automazioni | Nessun `.github/` (workflow, ISSUE_TEMPLATE, dependabot assenti); tsc/lint/test/audit girano solo a mano; il build non verifica mai i tipi | `next.config.ts:6-8` (`typescript.ignoreBuildErrors: true`) |
| 2 | Baseline tipi | `include: ["**/*.ts", "**/*.tsx"]`, `exclude: ["node_modules"]` → `examples/` e `skills/` entrano nel tsc (6 errori noti) e «giustificano» `ignoreBuildErrors`; eslint invece li ignora già (`eslint.config.mjs:53`) | `tsconfig.json:32-41` |
| 3 | Performance render | Orologio con `setNow` ogni secondo → re-render dell'INTERO albero (page 1518 r.); `filteredHistory` dipende da `now` (ricalcolo al secondo anche senza dati); ZERO `React.memo` in `src/`; props Recharts inline ricreate a ogni render | `page.tsx:300-303`, `page.tsx:864-867`, `history-chart.tsx:365-383/1040-1052`, `analysis-panel.tsx:426-442` |
| 4 | Sicurezza API | Nessun rate limiting su ALCUNA route (nessun `middleware.ts`); DELETE degli archivi pubblici e senza guard; nessun header di sicurezza (CSP/XFO/HSTS…) né in `next.config.ts` né nel `Caddyfile`; validazione body manuale mentre **zod è già dipendenza ma mai importato** | `api/history/route.ts:275-286`, `api/events/route.ts:176-187`, `api/history/models/route.ts:121-134`, `api/minimax/usage/route.ts:198-208` |
| 5 | Storage locale | `QuotaExceededError` mai gestito: tutti i `setItem` sono in try/catch che IGNORANO in silenzio → perdita dati senza feedback | `page.tsx:263-267/367-371/478-482`, `usage-events.ts:57-63`, `model-history.ts:76-83` |
| 6 | PWA | Aggiornamento silenzioso: `SKIP_WAITING` automatico, nessun prompt «nuova versione disponibile»; il manifest è `portrait-primary` (nota UX, non proposta) | `pwa-register.tsx:79-86`, `manifest.ts:17` |
| 7 | Test | Route-level testato SOLO su 2 GET (`archive-recent.test.ts`, I93); POST/DELETE dei 3 archivi, proxy `/api/minimax/usage`, `/api/summary`, `/api/history/models` senza test; 10 moduli `lib/` senza test dedicato; componenti grandi (HistoryChart, AnalysisPanel, DiagnosticaPanel, SettingsDialog, quota-cards) non coperti | `tests/lib/` (34 file), `tests/components/` (7 file) |
| 8 | Poller | Nessun listener `online`/`offline`/`visibilitychange`: al rientro della rete il resync aspetta il prossimo tick di backoff (fino a 10 min); polling continua a tab nascosto | `page.tsx` (scheduler I51), solo `pwa-register.tsx:94` usa visibilitychange |
| 9 | Igiene repo | 720 file tracciati di cui ~440 artefatti di sessione: 245 PNG in `scripts/`, 149 esiti + 18 backup in `scripts/verifiche/esiti*/`, 25 file `tool-results/` tracciati NONOSTANTE il .gitignore (aggiunto dopo il commit), `db/custom.db` binario scritto a runtime, `upload/`; entry `.gitignore` ambigua `test` | `git ls-files`, `.gitignore:49,56` |
| 10 | Coerenza metadati | README §Struttura (l.246) dice «330 test / 932 asserzioni» — stale vs l.124 (342/967); `package.json` name generico `nextjs_tailwind_shadcn_ts` v0.2.1; mancano script `typecheck`/`audit`; il changelog vive solo in `docs/04` §8 | `README.md:246`, `package.json:2-3,5-16` |
| 11 | Dipendenze | Verificate senza import in `src/`: zod, next-intl, zustand, next-auth, @tanstack/react-query+table, @mdxeditor, react-markdown, react-syntax-highlighter, uuid, sharp, z-ai-web-dev-sdk, @dnd-kit/*, date-fns+react-day-picker (via `ui/calendar` inutilizzato), react-hook-form+resolvers (via `ui/form`), cmdk/vaul/input-otp/react-resizable-panels (via `ui/*` inutilizzati) + ~25 componenti `ui/` non referenziati; **ATTENZIONE: `framer-motion` È usato** (quota-ring) — non va toccato | `package.json:17-97`, `ui/` |
| 12 | A11y | Skip-link ASSENTE (nessun «Salta al contenuto», `<main>` senza id); il resto è coperto da I79/I83/I84 (0 FAIL su 74+ campioni, aria-live, sr-only, focus nav) | `layout.tsx`, `page.tsx` |
| 13 | Persistenza server | SQLite su file (`db/custom.db`) è effimero su Vercel serverless: l'archivio server del Live Demo può perdersi tra istanze/ridistribuzioni (caveat noto dal Task 41); zero commenti nel codice; merge/dedup client già robusti | `prisma/schema.prisma`, README badge Live Demo |

## 3. Le proposte (I94–I106)

Ogni proposta porta: problema con evidenza, proposta operativa, impatto/sforzo/rischio e
criteri di accettazione (per il protocollo fisso tsc → lint → test → audit → browser).

### I94 — CI GitHub Actions + baseline dei tipi onesta
- **Problema**: zero CI (Area 2.1): nessuna verifica automatica su push/PR; `ignoreBuildErrors: true` maschera i tipi al build; ogni `bunx tsc` manuale porta i 6 errori di `examples/`+`skills/` (scaffolding non-progetto) che rendono il segnale rumoroso.
- **Proposta**: (1) `tsconfig.json` → `exclude: ["node_modules", "examples", "skills"]` (allineato a eslint che già li ignora); (2) rimozione di `typescript.ignoreBuildErrors` (tsc torna 0 repo-wide); (3) `package.json`: script `typecheck` (`tsc --noEmit`) e `audit` (`node scripts/verifiche/audit-implementazioni.mjs`); (4) workflow `.github/workflows/ci.yml` (push/PR su main: setup Bun → `bun install` → `typecheck` → `lint` → `test` → `audit`); (5) badge CI nel README accanto a quelli esistenti; (6) opzionale `dependabot.yml` settimanale (npm + actions).
- **Impatto alto · Sforzo basso · Rischio basso** (i 6 errori spariscono per esclusioni dichiarate, non per fix mascherati).
- **Accettazione**: workflow verde su GitHub; `tsc --noEmit` exit 0 su TUTTO il repo; `next build` con `ignoreBuildErrors` rimosso; badge visibile.

### I95 — Hardening delle API pubbliche
- **Problema** (Area 2.4): il deployment Vercel è pubblico e le route archivio accettano POST/DELETE da chiunque senza guard; nessun rate limiting; nessun header di sicurezza; il widget `/api/summary` è senza auth per design (I80, accettabile: solo letture aggregate).
- **Proposta**: (1) header di sicurezza in `next.config.ts` `headers()`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minima, `X-Frame-Options: SAMEORIGIN`, HSTS solo se servito https; CSP in modalità **report-only** per una prima passata senza rischi (inline styles/JS del framework); (2) guard opzionale per le SCRITTURE (POST/DELETE di history/events/models) via variabile d'ambiente `ADMIN_TOKEN`: se impostata, richiede l'header `x-admin-token` — **default disattivata** per non rompere l'uso locale e le verifiche esistenti; (3) rate limiting leggero in-memory per-IP sulle route (deterrente base, documentato il limite: per-istanza su serverless).
- **Impatto alto (endpoint pubblici) · Sforzo medio · Rischio medio** (tocca tutte le route; default compatibili con l'uso attuale).
- **Accettazione**: con `ADMIN_TOKEN` impostato, DELETE senza header → 401/403 e con header → 200; header presenti su tutte le risposte; suite+audit aggiornati; uso locale senza token invariato.

### I96 — Performance del rendering client
- **Problema** (Area 2.3): il countdown vive nell'albero principale → ogni secondo re-render di page.tsx (1518 r.) con Grafico/Analisi/Diagnostica inclusi; `filteredHistory` (deps su `now`) ricalcolata ogni secondo anche a dati fermi; props Recharts (margin, tick, tickFormatter, tooltip content) ricreate a ogni render; zero `React.memo`.
- **Proposta**: (a) isolare orologio/countdown in un componente foglia memoizzato che consuma `now`, separando lo stato «secondo» da quello «minuto» usato dalle deps di `filteredHistory`; (b) `React.memo` sulle sezioni pesanti (HistoryChart, AnalysisPanel, DiagnosticaPanel, QuotaCards) con props stabilizzate; (c) costanti Recharts a livello modulo; (d) MISURARE prima/dopo (React Profiler / Performance API) e documentare i numeri in `docs/04`.
- **Nota di rischio**: I91 ha documentato la scelta di NON estrarre hook da page.tsx/history-chart.tsx (rischio-regressione > beneficio). Questa proposta resta sul PERIMETRO del render (memo/bordi), non riapre l'estrazione di hook.
- **Impatto alto (mobile/kiosk/TV: CPU e batteria) · Sforzo medio · Rischio medio**.
- **Accettazione**: suite+audit verdi; nessun cambiamento visibile al browser (dark/light, compact, kiosk); numero di render al minuto misurato e ridotto (prima ~60 sull'intero albero); zero overflow 390px.

### I97 — Igiene del repository git
- **Problema** (Area 2.9): ~440 artefatti di sessione tracciati (245 PNG, 167 esiti/backup, 25 tool-results) gonfiano clone e storia; `db/custom.db` binario scritto a runtime → worktree sempre sporco e commit DB separati a ogni sessione (lezione I30); `tool-results/` in .gitignore ma già tracciato (regola inefficace).
- **Proposta**: `git rm --cached` (i file RESTANO su disco) + `.gitignore` aggiornato (`scripts/verifiche/esiti/`, `esiti-backup/`, `scripts/verifiche/verify_*.png` e `scripts/verify_*.png`, `tool-results/`, `upload/`, `db/*.db`) + chiarimento dell'entry ambigua `test`; **punto di decisione**: gli esiti di audit sono evidenza citata nei changelog («esito fresco commesso») → opzione A: smettere di tracciarli tutti (repo leggero, l'evidenza resta nella storia git e nel testo dei changelog); opzione B: tracciare SOLO l'ultimo esito con nome fisso (`esiti/audit-latest.md`, pattern già usato per i48/i54); verifica preventiva che nessun documento referenzi file che smettono di essere tracciati in modo irrecuperabile (docs citano 4 file di `verifiche/esiti/`).
- **Impatto medio-alto (repo presentabile per la strada «pubblico», clone +radice) · Sforzo basso · Rischio basso** (solo index, nessun codice).
- **Accettazione**: `git status` pulito dopo un ciclo intero di poller; `git ls-files` senza artefatti di sessione (salvo eventuale `audit-latest.md`); docs intatti; nessun commit DB più necessario.

### I98 — Gestione esplicita della quota di storage locale
- **Problema** (Area 2.5): con localStorage pieno (storico 600 + eventi 200 + model-history 2000 + settings con chiavi) le scritture falliscono IN SILENZIO — l'utente scopre la perdita solo dai buchi nei dati; `QuotaExceededError` non appare mai nel codice.
- **Proposta**: helper centralizzato `persistJson(key, value)` in `src/lib/` (unico punto di scrittura) che: cattura l'errore quota, esegue il fallback documentato (riduzione FIFO dello storico coinvolto e retry, poi rinuncia), e notifica (toast una tantum per sessione + evento tecnico `error` nel registro); applicato ai 5 punti di scrittura esistenti; nessun cambio di chiavi/formati (retrocompatibilità totale).
- **Impatto medio · Sforzo basso · Rischio basso**.
- **Accettazione**: test con storage finto che solleva QuotaExceededError → avviso visibile + evento registrato + storico ridotto e salvato; check audit di assenza dei catch silenziosi.

### I99 — Copertura test: contratti delle API e moduli lib scoperti
- **Problema** (Area 2.7): i contratti HTTP che proteggono i dati (POST/DELETE archivi: validazione, dedup, pruning, limiti; proxy: mappa errori, fallback I18, Retry-After; summary) non hanno test; 10 moduli `lib/` senza test dedicato (http-validate, export, server-history, server-events, server-model-history, stats, utils, demo, version, db).
- **Proposta**: estendere il pattern `mock.module` + import dinamico introdotto da I93 (`archive-recent.test.ts`) a: POST/DELETE dei 3 archivi (validazione, dedup, pruning FIFO, cap batch 500, limit GET), `/api/minimax/usage` (fetch mockato: 1004 passthrough, 429 con Retry-After, timeout, fallback I18, `bad_json`), `/api/summary` (forme KPI, assenza scritture), `/api/history/models`; test mirati per `http-validate`, `export`, `server-history`, `server-events`, `stats`. NON inseguire il 100%: priorità ai contratti che proteggono dati e chiave.
- **Impatto medio · Sforzo medio · Rischio basso** — e apre la strada sicura a I103/I95.
- **Accettazione**: suite con i nuovi contratti (attese ~+40-60 test); audit con check di copertura aggiornato; nessuna modifica ai file di src se non per bug scoperti (registrazione in `docs/04` §6).

### I100 — Poller consapevole di rete e visibilità
- **Problema** (Area 2.8): al rientro della rete dopo un'interruzione, il monitor può restare cieco fino a 10 minuti (backoff in corsa); a tab nascosto il polling continua inutilmente (le notifiche a tab chiuso passano dal Service Worker, non dal poller).
- **Proposta**: listener `online` → tick immediato + reset del backoff; `visibilitychange` → al ritorno in visibilità, tick se l'ultimo rilevamento è più vecchio della metà dell'intervallo base; a tab nascosto dilata il polling (×4, NON sospende: coerenza con il badge/registri e con le verifiche V1–V6); Diagnostica mostra la causa dell'attesa (backoff / tab nascosto / offline).
- **Impatto medio · Sforzo basso · Rischio basso**.
- **Accettazione**: test scheduler aggiornati; browser: offline→online → nuovo punto entro ~1 s; tab nascosto → frequenza ridotta osservata in network; nessuna regressione del flusso I51.

### I101 — Prompt «nuova versione disponibile» per la PWA
- **Problema** (Area 2.6): `SKIP_WAITING` automatico silenzioso: l'utente resta sulla versione vecchia (e sulla vecchia cache) senza saperlo, finché non ricarica per caso — incomprensibile per chi usa la PWA installata.
- **Proposta**: su `updatefound`+`installed` mostrare toast/banner persistente «Nuova versione disponibile — Ricarica»: al click invia `SKIP_WAITING` e ricarica; nessun auto-skip (esplicito sempre, semplice da testare).
- **Impatto basso-medio · Sforzo basso · Rischio basso**.
- **Accettazione**: bump della cache `mm-dash-v2` → banner appare → click → pagina sulla nuova versione (verifica browser); test componente su stato in attesa.

### I102 — Skip-link e landmark di destinazione
- **Problema** (Area 2.12): nessuno skip-link: la navigazione da tastiera attraversa header + nav sticky (8 ancore) a ogni ciclo; `<main>` senza id di destinazione. (Tutto il resto dell'a11y è coperto da I79/I83/I84.)
- **Proposta**: «Salta al contenuto» come primo elemento focusabile della pagina verso `<main id="contenuto">`, visibile solo on-focus (stessa famiglia di stile dei focus-visible I79); etichetta in italiano, coerenza con il resto della UI.
- **Impatto medio (a11y) · Sforzo basso · Rischio nullo**.
- **Accettazione**: Tab dal carico → skip-link visibile → Enter sposta il focus sul contenuto; probe contrasto/focus I84 senza regressioni; suite+a11y test verdi.

### I103 — Validazione dei body con zod
- **Problema** (Area 2.4): validazione manuale sparsa e ripetuta nei body delle route (proxy: `typeof string`+trim; archivi: cap/limit fatti a mano) mentre **zod è già tra le dipendenze ma mai importato** in `src/`.
- **Proposta**: schemi zod per i body di proxy e archivi (`apiKey`, `region` enum, array di punti/eventi con cap 500, campi numerici con bound), messaggi d'errore uniformi in italiano, sostituzione dei check manuali; contratto esterno invariato (stesse risposte 400 per i payload invalidi di oggi).
- **Impatto medio · Sforzo basso · Rischio basso-medio** (tocca le route: fare DOPO o INSIEME a I99 per avere i contratti coperti).
- **Accettazione**: suite route-level verde; curl con payload invalidi (chiave non-stringa, array >500, punti malformati) → 400 uniformi con messaggio leggibile; check audit «zod in uso, validazione manuale rimossa».

### I104 — Potatura dipendenze e componenti inutilizzati
- **Problema** (Area 2.11): ~20+ pacchetti senza import in `src/` e ~25 componenti `ui/` non referenziati (scaffolding): più surface di audit/sicurezza, install più lento, diff di aggiornamento più ampio (il rischio I89 di rompere wrapper stock senza usarli è già accaduto).
- **Proposta**: rimozione a ONDATE verificate: (1) pacchetti sicuri (next-auth, @tanstack/react-query+table, @mdxeditor/editor, react-markdown, react-syntax-highlighter, uuid, sharp, z-ai-web-dev-sdk, @dnd-kit/*, zustand, next-intl se il rimando i18n resta fermo); (2) componenti `ui/` a zero import (dopo grep); (3) MANTENERE zod (I103 lo userà) e **framer-motion (USATO in quota-ring)**; ogni tappa con grep + tsc + suite + avvio dev.
- **Impatto medio (manutenibilità e audit surface) · Sforzo basso-medio · Rischio basso se a ondate**.
- **Accettazione**: `bun install` OK, tsc/lint/test/audit verdi, dev server e build funzionanti; audit con check sulle rimozioni.

### I105 — Coerenza di versione, README e metadati
- **Problema** (Area 2.10): README §Struttura dice «330 test / 932 asserzioni» mentre l.124 (e la realtà) dicono 342/967; `package.json` con name generico `nextjs_tailwind_shadcn_ts` e `version 0.2.1` disallineati dalla convenzione curata `APP_VERSION` («2026-10-13 · I93»); tre contatori di versione non coordinati.
- **Proposta**: fix della riga stale; `name: "minimax-usage-monitor"`; decisione sulla `version` npm (opzione A: allinearla a un semver semplice e aggiornarla a ogni item; opzione B: lasciarla ferma e dichiarare nel README che la versione di riferimento è il footer `APP_VERSION`); dichiarare nel README che il changelog canonico è `docs/04` §8 (evita di introdurre un CHANGELOG.md duplicato da mantenere); script `typecheck`/`audit` se non già coperti da I94.
- **Impatto basso · Sforzo basso · Rischio nullo**.
- **Accettazione**: nessun numero disallineato (nuovo check audit sui contatori); `name`/`version` coerenti con la decisione; README auto-consistente.

### I106 — Persistenza server portabile (serverless-ready)
- **Problema** (Area 2.13): il Live Demo su Vercel (ora in cima al README e nella About) gira su SQLite su file: effimero su serverless → l'archivio server (storico, eventi, modelli) può perdersi tra istanze/ridistribuzioni; il merge client mitiga per il singolo utente ma l'«archivio server» non è una promessa mantenibile su quel deployment; caveat solo nel changelog, non nel codice/README.
- **Proposta** (alternativa A consigliata, env-driven): Prisma driver adapter `@prisma/adapter-libsql` + Turso (tier gratuito): `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` su Vercel, **fallback automatico a SQLite locale in assenza di env** (stesso schema, route invariate, sviluppo locale identico); alternativa B (onesta e a costo zero): dichiarare il deployment serverless come «demo senza persistenza server» — nascondere le voci archivio server quando `NEXT_PUBLIC_SERVER_PERSISTENCE=false`; alternativa C: entrambe (B subito, A dopo).
- **Impatto alto (credibilità del Live Demo) · Sforzo medio-alto · Rischio medio** (adapter Prisma 6, `db push` remoto, secret su Vercel).
- **Accettazione**: deployment Vercel con archivio verificato persistente a 24 h (punto scritto → ridistribuzione → punto leggibile); sviluppo locale INVARIATO; suite route-level verde (già con db mockato, pattern I93); README aggiornato.

## 4. Piano di implementazione proposto (ondate)

Principi: protocollo fisso per ogni item (tsc → lint → test → audit → browser read-only,
rotte `**/api/history*` e `**/api/events*` bloccate per ADR-8); un commit per item (o batch
solo quando coesi); `docs/04` §3+§8 e `version.ts` aggiornati a ogni item; `bun.lock`/DB
commessi separatamente se toccati; nessuna violazione ADR-8.

| Ondata | Item | Logica d'ordine |
|--------|------|-----------------|
| **1 — quick-win** (7 item, basso rischio) | **I94** CI+tipi → **I97** igiene git → **I105** metadati → **I98** quota storage → **I100** poller rete/visibilità → **I101** PWA prompt → **I102** skip-link | I94 prima: le tappe successive vengono validate anche dal CI; I97 subito dopo: repo pulito PRIMA delle modifiche serie (e i commit futuri smettono di portare rumore); I105 chiude la faccia documentale; gli altri sono piccoli, indipendenti, ciascuno con test dedicato |
| **2 — corpo** (5 item) | **I96** perf render → **I99** test contratti → **I103** zod → **I95** hardening → **I104** potatura dipendenze | I96 da SOLO con misure prima/dopo (i componenti più grandi); I99 prima di I103/I95 perché i contratti testati rendono sicura la riscrittura delle validazioni e l'introduzione dei guard; I104 per ultimo così la potatura vede anche le dipendenze introdotte/consumate da I103 |
| **3 — infrastruttura deployment** | **I106** persistenza portabile | Sforzo maggiore e beneficio solo sul deployment pubblico: ha senso dopo la decisione sul repo pubblico e con il CI (I94) a presidio |

Dipendenze esplicite: I103 ← I99; I95 ← I103; I106 ← I94 (consigliata); tutto il resto è
indipendente e riordinabile senza domini.

## 5. Già implementate — da NON riproporre

Verificate a opera in questa analisi (con evidenza) e quindi ESCLUSE dal backlog: tema
chiaro/scuro (I78/I83/I84), export CSV/JSON locale+server+orario (I22/I68), downsampling
server (I68), a11y sistematica (I79: aria-live, sr-only, focus nav; probe 0 FAIL I84),
filtri registro eventi (I77), backoff esponenziale+jitter+Retry-After client (I51) e
ritenti transitori nel proxy, fallback `coding_plan` (I18), error boundary per sezione
(I76), modalità compatta `?compact=1` (I73) e kiosk `?kiosk=1` (I87), notifiche a tab
chiuso via SW con segreti solo in IndexedDB (I52/ADR-14), sync offline-first multi-livello
con merge dedup e pruning (I16/I27/I82), fix fetta recente GET (I93) e normalizzazione
risposte (I92), multi-regione (I53), pivot multi-modello (I82), EWMA A/B (I70/I72),
anomalie ritmo (I70), qualità campionamento (I71), pace/spreco (I31), report stampabile
(I75), nav sticky+scrollspy (I66/I85) e BottomNav mobile (I74), parità TS↔SW testata
(`sw-parity.test.ts`), test componente (I81), migrazione soglie (I28), `/api/summary`
read-only (I80), rimozione token counter (ADR-8, con check di assenza nell'audit).

## 6. Proposte valutate e RIMANDATE (non in backlog)

| Tema | Perché non ora |
|------|----------------|
| i18n con next-intl (~60+ literal IT per pagina) | Sforzo medio per un'audience primaria it-IT; un eventuale «raccordo dizionario» andrebbe progettato prima di qualunque apertura EN. Se il repo diventa pubblico e arrivano richieste EN, riaprire |
| `orientation: landscape` nel manifest | Decisione UX (kiosk/TV usano il browser, non la PWA installata); da riprendere solo con un caso d'uso reale |
| `reactStrictMode: true` | Utile per smascherare effect non idempotenti ma richiede una passata dedicata (nota I92 sul double-mount in `pwa-register`); rimandato a un refactor pianificato, non a una lista di migliorie |
| e2e Playwright in CI | Ha senso DOPO I94; per oggi le verifiche browser restano parte del protocollo manuale/agent |
| Documentare il motivo di ogni regola eslint `off` | Micro-debito reale (quasi tutte senza commento) ma non bloccante; I94 tocca solo tsc/CI per restare piccolo |
| GitHub LFS per `docs/assets/` (GIF+PNG ~3,5 MB) | Sotto le soglie di avviso; rivalutare se gli asset crescono |
| Postgres al posto di SQLite anche in locale | No: il locale resta SQLite (semplicità, zero servizio); I106 riguarda solo la portabilità del DEPLOYMENT |

## 7. Registro delle decisioni (clarify del 14/10/2026)

> Compilato subito dopo il clarify con l'utente (una domanda per proposta + domanda
> d'esecuzione); è la selezione che governa il §4 e i prossimi item di `docs/04` §3.

_In attesa del clarify — questa sezione viene completata prima del commit._

