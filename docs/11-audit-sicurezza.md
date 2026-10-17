# 11 — Audit di sicurezza del progetto (I119)

> Audit white-box condotto il 17/10/2026 su richiesta dell'utente: «comportati da security
> agent, specialista in sicurezza informatica, code review e penetration test; analizza il
> codice alla ricerca di falle di sicurezza, bug latenti, segreti esposti o scopribili;
> verifica che il progetto in produzione non esponga credenziali, non sia attaccabile DDoS,
> SQL injection e tutto il possibile che possa creare danni». Questo documento è la
> registrazione COMPLETA di test intrapresi, analisi eseguita, soluzioni applicate e
> verifiche effettuate. Item di riferimento: **I119**.

---

## 1. Perimetro e contesto

Il deployment di produzione è **Vercel** (Next.js 16 standalone, serverless): nessun server
propriamente detto, nessun Caddy, nessun shell pubblico. La superficie analizzata:

- **8 route API**: `/api/minimax/usage` (proxy), `/api/history`, `/api/history/models`,
  `/api/events`, `/api/manutenzione` (GET+POST), `/api/manutenzione/cron` (GET),
  `/api/persistenza` (GET), `/api/summary` (GET);
- **lib server**: `db-factory`/`db` (Prisma 7 + adapter libsql/Turso), `schema-persistenza`
  (DDL incorporato), `manutenzione-db`, `server-model-history`, `api-protezione` (guard),
  `api-schemi` (zod), `http-validate`;
- **client**: dashboard, PWA (`sw.js`, `sw-shared.js`), storage `localStorage` della chiave
  MiniMax (vincolo di progetto documentato: è l'unico segreto del browser, per design);
- **configurazioni**: `next.config.ts` (header di sicurezza I95), `vercel.json` (cron),
  `Caddyfile` (SOLO sviluppo), `.gitignore`, `package.json`;
- **storia git e remote** (repo GitHub privato).

La piattaforma Vercel fornisce per conto suo: TLS terminato a edge, mitigazione DDoS
volumetrica di rete, isolamento delle istanze serverless, segreti di ambiente non leggibili
dopo l'impostazione. L'audit si concentra su ciò che il CODICE e la CONFIGURAZIONE possono
guastare.

---

## 2. Test eseguiti (elenco completo)

| # | Test / tecnica | Come | Esito |
|---|----------------|------|-------|
| T1 | Inventario superficie d'attacco | lettura integrale di tutte le 8 route + lib di rete/DB + config | completato |
| T2 | Pattern di segreti hard-coded | grep su `src/` per `sk-…`, `AKIA…`, `ghp_/gho_…`, `xox…`, `AIza…`, `-----BEGIN … PRIVATE KEY-----` | 0 occorrenze |
| T3 | Fuga segreti via bundle client | grep `NEXT_PUBLIC_` su `src/` | 0 occorrenze (nessuna env server esposta al client) |
| T4 | Segreti nei file tracciati | `git grep` per JWT `eyJ…`, URL `libsql://user:token@…`, `postgres://…:…@` | 0 occorrenze |
| T5 | `.env` tracciato? | `git check-ignore` + `git log --all -- .env` | gitignored CORRETTAMENTE, MA la storia contiene un commit con le credenziali (§5.1) |
| T6 | Storia git: segreti | `git log --all -- .env .env.local *.pem` + ispezione commit individuato | 1 commit critico trovato: `dd03d16` (§5.1) |
| T7 | SQL injection | lettura di OGNI uso `$queryRaw`/`$executeRaw`/`$executeRawUnsafe`/`Prisma.sql` (42 siti) | tutti parametrizzati o costanti (§4.1) |
| T8 | XSS | analisi dell'unico `dangerouslySetInnerHTML` (tech-panels.tsx) | safe per costruzione (§4.2) |
| T9 | Command injection / code injection | grep `exec(`, `execSync`, `spawn`, `eval(`, `new Function` su `src/` | 0 usi (l'unico match è `RegExp.exec` su header Bearer) |
| T10 | Path traversal | verifica di ogni tocco al filesystem (`mkdirSync` della factory su URL env, mai da input HTTP) | nessun percorso da input utente |
| T11 | SSRF | verifica destinazioni di ogni `fetch` server-side: solo allowlist fissa MiniMax (`REGION_ENDPOINTS`/`CODING_PLAN_ENDPOINTS`) | non costruibili da input |
| T12 | Autenticazione/autorizzazione | matrice route×metodo vs guard I95 + CRON_SECRET (§4.3) | conforme al design; azione utente su env (§5.2) |
| T13 | Timing attack sui confronti di token | revisione `tokenUguale` (SHA-256 + `timingSafeEqual`) | corretto |
| T14 | Rate limiting / DoS applicativo | revisione `api-protezione` (120 scritture/min/IP, 429 + Retry-After), clamp di TUTTI i limiti GET (1–5.000/10.000), batch cap 500, taglio stringhe, soglia 512 MiB su `quick_check` | deterrente presente; limiti documentati (§5.4) |
| T15 | CORS / CSRF | nessun header CORS esplicito (default same-origin per le letture cross-origin); corpi JSON-only con `Content-Type: application/json`; nessun cookie di sessione | CSRF non applicabile in modo significativo |
| T16 | Criptografia e generazione ID | grep `Math.random` (solo jitter demo/backoff, mai token); ID evento = dedup client non segreto | nessun uso debole a fini di sicurezza |
| T17 | Esposizione nei log | grep `console.*` con apiKey (0); revisione `log: ["query"]` del client Prisma → **VULNERABILITÀ trovata e fixata** (§5.3) | fix I119 |
| T18 | Fingerprinting server | header `X-Powered-By` (default Next attivo) → **VULNERABILITÀ trovata e fixata** (§5.4) | fix I119 |
| T19 | Service worker e segreti browser | revisione `sw.js`/`sw-shared.js`: chiave SOLO in IndexedDB, mai Cache Storage/codice/log; cache SOLO GET 2xx di shell+`/api/history`; controllo `url.origin === self.location.origin` | conforme |
| T20 | Dipendenze | `bun audit` | 1 high DEV-ONLY (braces, senza fix upstream); produzione ZERO (§4.6) |
| T21 | Versioni di framework | Next 16.4.2, React 19.3.1, Prisma 7.10.1, zod 4.6.7: tutte correnti | nessun advisory noto |
| T22 | Visibilità del repo remoto | probe HTTP non autenticato su `github.com/amedeo82/MiniMax-Token-Monitor` | 404 = **privato** (riduce l'impatto del §5.1) |
| T23 | Fuga di segreti nei tool di verifica | revisione `ci-status.sh` (estrae il token dal remote SENZA mai stamparlo), PAT GitHub presente SOLO in `.git/config` locale (mai tracciato) | conforme |
| T24 | Penetration test manuale dei contratti | verifica delle risposte 400/401/403/429 e del clamp dei parametri (limit, since, kind, win, azione) attraverso i test I99/I103/I95 (536 test) | conforme |

---

## 3. Sintesi dei risultati

| Area | Gravità | Esito |
|------|---------|-------|
| Credenziali Turso nella storia git (`dd03d16`) | **CRITICO** (mitigato: repo privato) | azione utente: **rotazione token** (§5.1) |
| `ADMIN_TOKEN`/`CRON_SECRET` da verificare nell'env di produzione | **ALTO** (se assenti) | **I120+I121**: supporto client completo — 7 scritture protette (archivi + proxy usage) + sonda; resta l'azione operativa su Vercel (§5.2) |
| Log query Prisma (con parametri) in produzione | **MEDIO** | **FIXATO in I119** (§5.3) |
| Fingerprinting `X-Powered-By` | **MEDIO** | **FIXATO in I119** (§5.4) |
| `Caddyfile` dev: proxy a porta localhost da query param | **BASSO** (dev-only) | commento di avvertimento (§5.5) |
| Messaggi d'errore 500 verbatim dal motore | BASSO | rischio accettato e documentato (§5.6) |
| `GET /api/manutenzione` esegue `quick_check` per richiesta | BASSO | mitigato dalla soglia 512 MiB (§5.7) |
| Rate limit in-memory per-istanza | BASSO | limite strutturale documentato (§5.8) |
| SQL injection | — | **VERIFICATO SICURO** (§4.1) |
| XSS | — | **VERIFICATO SICURO** (§4.2) |
| Command/code injection, path traversal, SSRF | — | **VERIFICATO SICURO** (§4.4) |
| Segreti hard-coded / nel bundle client / nei file tracciati | — | **VERIFICATO SICURO** (§4.5) |
| Dipendenze di produzione | — | **VERIFICATO SICURO** (§4.6) |
| Header di sicurezza I95, HSTS, CSP | — | presenti; enforcing CSP raccomandato (§5.9) |

---

## 4. Analisi per area (con evidenze)

### 4.1 SQL injection — VERIFICATO SICURO

Tutti i 42 siti di SQL raw sono stati letti uno a uno (test T7). Il progetto usa SOLO:

- **tagged template** Prisma (`db.$queryRaw\`… ${valore}\``, `db.$executeRaw\`…\``): il driver
  parametrizza i valori — nessuna concatenazione di stringhe da input;
- **`Prisma.sql` + `Prisma.join`** per comporre filtri opzionali (`server-model-history.ts`,
  `findModelPoints`): i valori restano segnaposto gestiti dal driver;
- **`$executeRawUnsafe`** in SOLO DUE contesti, entrambi con stringhe COSTANTI non derivanti
  da input: i DDL statici di `schema-persistenza.ts` (array `SCHEMA_PERSISTENZA`, esatti per
  costruzione e presidiati dal test anti-drift su `prisma migrate diff`) e `VACUUM`
  (letterale, in `manutenzione-db.ts`).

Gli input HTTP entrano nel DB solo dopo gli schemi zod di `api-schemi.ts` (taglio a 16/32/64/
500 caratteri, enum chiuse per `kind`/`win`/`azione`/`region`, epoch e percentuali
normalizzati) e i clamp dei limiti GET (`Math.min(GET_LIMIT_MAX, …)`). I modelli Prisma
tipizzati (`usagePoint`, `usageEventRecord`, …) parametrizzano per costruzione. **Verdetto:
nessuna via di injection trovata.**

### 4.2 XSS — VERIFICATO SICURO (con raccomandazione)

L'unico `dangerouslySetInnerHTML` del progetto è l'evidenziazione sintattica del JSON nel
pannello tecnico (`tech-panels.tsx`). La catena è: `JSON.stringify` → escape di `&` e `<`
**prima** di qualsiasi inserimento di markup → sostituzioni regex che inseriscono `<span>`
con il contenuto GIÀ escaped in posizione di TESTO (mai dentro un attributo). Senza `<`
non-escaped non è possibile aprire un tag: la via di injection è chiusa per costruzione.
Raccomandazione (non bloccante): in una futura iterazione sostituire con un renderer a nodi
React (senza innerHTML) quando si toccherà quel componente.

Il resto dell'UI rende testo/numeri via React (auto-escaping). La chiave MiniMax vive in
`localStorage` (vincolo di progetto: l'utente usa la SUA chiave); un XSS riuscito potrebbe
leggerla — motivo in più per cui il CSP (§5.9) deve passare da Report-Only a enforcing.

### 4.3 Autenticazione/autorizzazione — matrice finale

| Route | Metodo | Protezione |
|-------|--------|------------|
| `/api/history`, `/api/events`, `/api/history/models` | POST/DELETE | guard I95: `ADMIN_TOKEN` (se impostato, confronto timing-safe via `x-admin-token`) + rate limit 120/min/IP |
| `/api/minimax/usage` | POST | rate limit I95 (guard ADMIN_TOKEN non applicata per design: è il canale della chiave dell'utente); upstream allowlist |
| `/api/manutenzione` | POST | guard I95 completa (azioni distruttive: pulizia/vacuum) |
| `/api/manutenzione/cron` | GET | `CRON_SECRET` OBBLIGATORIO: 403 se env assente, 401 se Bearer errato, confronto timing-safe, token mai restituito |
| `/api/manutenzione` GET, `/api/persistenza` GET, `/api/summary` GET | GET | pubblici READ-ONLY per design (I80/ADR-8): nessun segreto, solo aggregati/diagnostica con host sanificato |

Note di design verificate: il confronto dei token passa da SHA-256 + `timingSafeEqual`
(lunghezza normalizzata: nessun leak di lunghezza); il token non compare mai nei messaggi di
errore; l'IP per il rate limit deriva da `x-forwarded-for` impostato DALLA PIATTAFORMA
Vercel (il client non può spoofarlo direttamente).

### 4.4 Command injection, path traversal, SSRF — VERIFICATO SICURO

Nessun uso di `eval`, `new Function`, `exec`/`spawn` di processo (test T9: l'unico match è
`RegExp.exec` sul parsing dell'header Bearer). Nessun percorso filesystem derivante da input
HTTP: l'unico tocco al FS è `mkdirSync` della directory padre dell'URL SQLite che viene
dalle variabili d'ambiente del server (mai dal client). Ogni `fetch` server-side ha
destinazione da allowlist costante MiniMax (test T11): l'endpoint di destinazione NON è
costruibile dall'attaccante.

### 4.5 Segreti — VERIFICATO SICURO nel codice, 1 problema nella STORIA (§5.1)

- Nessun pattern segreto nel codice (test T2): chiavi/URL/token vivono SOLO nell'ambiente;
- nessuna variabile `NEXT_PUBLIC_*` (test T3): il bundle client non può contenere env server;
- `git grep` sui file tracciati: zero token JWT/URL con credenziali (test T4);
- `.env` locale (contiene SOLO `DATABASE_URL` di sviluppo) è gitignored e il check audit
  `nonTracciato` presidia la regola dal I110;
- il PAT GitHub di push esiste SOLO nella configurazione locale del remote (`.git/config`,
  mai tracciato); `ci-status.sh` lo estrae senza mai stamparlo (test T23);
- la route `/api/persistenza` sanifica l'host Turso (solo hostname: schema, userinfo, porta,
  percorso e query scartati — dove un token può nascondersi) con test dedicato;
- `sw.js`: chiave MiniMax SOLO in IndexedDB (mai Cache Storage, mai log), cache SOLO di GET
  2xx shell/storico (test T19).

### 4.6 Dipendenze — produzione a ZERO

`bun audit` (test T20): 1 vulnerabilità **high** su `braces ≤3.0.3`, raggiungibile SOLO
dalla catena dev `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch →
braces` (richiede pattern di glob ostili a build-time): **nessun percorso in produzione**,
nessuna fix upstream disponibile (stato noto e già documentato nelle iterazioni precedenti).
Le dipendenze di runtime (next 16, react 19, prisma 7, zod 4, libsql) non hanno advisory.
Presidio: `bun audit` è parte del protocollo a ogni consegna.

---

## 5. Vulnerabilità e rischi: dettaglio, soluzioni, azioni

### 5.1 [CRITICO → AZIONE UTENTE] Credenziali Turso nella storia git

**Trovato.** Il commit `dd03d16` («Add database URL and auth token to .env file») ha
aggiunto `.env` con `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` REALI alla storia (il file fu
poi rimosso dal tracciamento in I110 con `git rm --cached`, commit `9c793b7`, che raccomandò
la rotazione). `git filter` non è mai stato applicato: **il blob resta recuperabile da chi
abbia accesso alla storia** (cloni locali, fork, eventuali leak futuri del remote).

**Mitigazioni attuali**: il repo GitHub è **privato** (probe non autenticata → 404, test
T22); l'audit di I110 introdusse il check `nonTracciato` che impedisce la ricaduta.

**Azione richiesta (in ordine di efficacia):**

1. **ROTARE il token Turso** (console Turso → database → Tokens → nuovo token → aggiornare
   `TURSO_AUTH_TOKEN` nell'env di Vercel e nel `.env` locale → redeploy). È la contromisura
   decisiva: un token ruotato rende INOFFENSIVO il blob storico. Se possibile generare un
   token **read-only** per le letture diagnostica e tenere il write-token solo dove serve.
2. (Opzionale, solo dopo la rotazione) riscrittura della storia con `git filter-repo`
   o BFG per rimuovere il blob + force push coordinato: in un repo privato monoutente il
   beneficio è marginale rispetto alla rotazione.

### 5.2 [ALTO → MITIGATO CON I120+I121, AZIONE OPERATIVA RESIDUA] Variabili di guardia nell'ambiente di produzione

Il design I95 è onesto: **senza `ADMIN_TOKEN` impostato, le scritture degli archivi restano
aperte** (limitate dal rate limit) — scelta voluta per l'uso locale, che in produzione
esporrebbe a *data poisoning* (punti/eventi finti) e `DELETE` d'archivio da chiunque.

**Aggiornamento I120 — il blocker è rimosso.** Alla chiusura dell'audit impostare
`ADMIN_TOKEN` avrebbe UCCISO la replica in silenzio: il WRITER dei dati è il browser
(replica fire-and-forget di storico/eventi/per-modello) e le sue 6 scritture non allegavano
alcun header, con errori taciuti per design. Il I120 porta il token nel browser (stesso
modello della chiave MiniMax): nuovo `lib/admin-token.ts` (storage `mm-dash-admin-token-v1`,
header `x-admin-token` allegato alle 6 scritture SOLO quando salvato, SSR-safe), sezione
«Sicurezza scritture» nel dialog Impostazioni → Dati con **sonda di identità** —
POST `/api/manutenzione` con azione inesistente: la guardia gira PRIMA del parsing del body,
quindi la sonda NON scrive nulla e distingue 401 (token rifiutato) da 400 (accettato) /
429 (accettato, budget esaurito). Contratto presidiato da 23 test nuovi.

**Aggiornamento I121 — buco di perimetro beccato sul campo.** Attivando davvero
`ADMIN_TOKEN` in produzione (17/10/2026) l'utente riporta: sonda verde ma **ogni
aggiunta falliva con 401** «Scrittura protetta: serve l'header x-admin-token». Causa:
il I120 aveva dichiarato il proxy `/api/minimax/usage` «fuori per design», ma la
guardia I95 protegge ANCHE la POST proxy (api-protezione.ts: «POST/DELETE degli
archivi, POST proxy»; la route chiama `bloccoScrittura`) — la fetch del client in
`page.tsx` non allegava l'header. Correzione: `headerAdmin()` allegato anche a quella
fetch (sette scritture protette, zero eccezioni), perimetro fissato da verifica
statica nel test (`admin-token-scritture.test.ts`, describe I121) + 2 check audit.
Lezione registrata in docs/04: **il perimetro di una guardia si legge DOVE la guardia
è chiamata, non dove si spera che lo sia.**

**Azione operativa residua (solo configurazione, più codice da scrivere):**

1. generare un valore lungo casuale (es. `openssl rand -hex 32`);
2. Vercel → progetto → Settings → Environment Variables (ambito **Production**):
   `ADMIN_TOKEN` = quel valore; verificare `CRON_SECRET` (per il cron I111/I117 — il run
   del 17/10 con `esito=ok` lo dà per impostato), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`;
3. redeploy;
4. nel browser: dashboard → Impostazioni → Dati → «Sicurezza scritture» → incollare lo
   stesso valore → «Salva token» → «Verifica col server» → messaggio verde;
5. verifica empirica aggiuntiva da terminale:
   `curl -i -X POST https://<url>/api/manutenzione -H "Content-Type: application/json" -d '{"azione":"__x__"}'`
   deve dare **401** SENZA header e **400** con `-H "x-admin-token: <valore>"`.

Nota onesta: il token nel localStorage protegge le SCRITTURE ma è visibile a chi ha accesso
fisico/al profilo del browser — stesso perimetro di rischio già accettato per la chiave
MiniMax (design single-user, docs/09 §Utenti).

### 5.3 [MEDIO → FIXATO] Log query Prisma in produzione

**Trovato.** `db-factory.ts` passava `log: ["query"]` SEMPRE: ogni query con i valori dei
parametri (inclusi i messaggi degli eventi inseriti dagli utenti) finiva nei runtime logs
della piattaforma — noise, superficie di esposizione, overhead per query.

**Soluzione I119**: nuova regola PURA `livelloLogPrisma()` in `modalita-persistenza.ts`
(ambiente iniettabile, testabile): `NODE_ENV=production` → `["warn","error"]`; dev/test →
`["query"]` come prima. La factory la usa. I guasti reali del motore restano nei log.

### 5.4 [MEDIO → FIXATO] Fingerprinting `X-Powered-By`

**Trovato.** Next.js invia `X-Powered-By: Next.js` di default: conferma gratuita della
tecnologia a chi mappa le superfici d'attacco (test T18).

**Soluzione I119**: `poweredByHeader: false` in `next.config.ts`, presidiato dal test di
configurazione in `tests/lib/header-sicurezza.test.ts`.

### 5.5 [BASSO → MITIGATO CON DOCUMENTAZIONE] `Caddyfile` di sviluppo

Il blocco `@transform_port_query` inoltra a `localhost:{query.XTransformPort}`: chiunque
raggiunga Caddy può raggiungere QUALSIASI porta del loopback (SSRF verso servizi interni).
Non fa parte del deployment Vercel (che non usa Caddy): rischio reale SOLO se il file venisse
riusato per un self-hosting pubblico. **Soluzione I119**: avvertimento esplicito in testa al
file con l'istruzione di rimozione del blocco in quel caso.

### 5.6 [BASSO → ACCETTATO] Messaggi d'errore 500 verbatim

Le route rispondono 500 con `e.message` del motore (scelta di design «onestà degli errori»,
usata dalla diagnostica). Possono rivelare nomi di tabelle/internals, NON segreti (token mai
in DB né nei messaggi). Rischio accettato per un'app monoutente; da rivedere (sanitizzazione)
se il progetto diventerà multiutente.

### 5.7 [BASSO → MITIGATO] `GET /api/manutenzione` e `quick_check`

L'endpoint pubblico esegue `PRAGMA quick_check` (scansione completa del DB) per richiesta
sotto i 512 MiB. Il costo su Turso (row-read) è reale ma proporzionato: il DB reale è
≈150 KB e la soglia `SOGLIA_OMISSIONE_INTEGRITA_BYTES = 512 MiB` disarma la scansione sulle
dimensioni che contano. Protezione addizionale consigliata per il futuro: rate limit edge
Vercel (WAF) sulle GET pesanti.

### 5.8 [BASSO → DOCUMENTATO] Rate limit in-memory per-istanza

Il contatore 120/min/IP vive nel processo: su serverless ogni istanza ha il suo (limite
già documentato in I95). Rimane un DETERRENTE, non una policy rigorosa; la protezione
volumetrica vera è della piattaforma (edge Vercel). Da non confondere con l'assenza di
protezione: le scritture abusive rimangono rumorose e tracciabili nei log.

### 5.9 [INFO → RACCOMANDAZIONE] CSP da Report-Only a enforcing

Il CSP I95 è in modalità `Report-Only` (prima passata prudente: il framework usa stili/
script inline). La traiettoria corretta è: raccogliere i report, rimuovere `unsafe-eval`,
passare a enforcing (eventualmente con nonce). Non applicato in I119 per non rompere la UI
senza una finestra di osservazione dedicata: è il naturale candidato per una futura
iterazione di hardening.

---

## 6. Verifiche post-remediation (protocollo di consegna)

Tutte eseguite con exit code REALE in questa iterazione:

- `tsc --noEmit` → **0 errori** (exit 0);
- `eslint .` → **0 scoperte** (exit 0);
- `bun test` → **536/536 PASS, 1.810 asserzioni** (includono i 4 nuovi test I119);
- `bun run audit` → **590/590 PASS, 0 scoperte** (includono i 7 check I119);
- `bun audit` → 1 vulnerabilità attesa (braces, dev-only, senza fix upstream — produzione a ZERO);
- `bun run build` → verde (exit 0, `prisma generate && next build`);
- commit + push + CI GitHub → verde su `scripts/verifiche/ci-status.sh`.

I presidi RESTANO attivi nel tempo: i check audit I119 falliscono se qualcuno riattiva
`log: ["query"]` incondizionato, riattiva `X-Powered-By`, rimuove l'avvertimento del
Caddyfile o cancella il report; i test di configurazione bloccano regressioni sugli header.

---

## 7. Checklist di ripetizione (prossimi audit)

1. `bun audit` e confronto con la nota braces (dev-only) — a OGNI consegna (già nel protocollo);
2. grep segreti su `src/` + `git grep` sui tracciati + verifica `.env` NON tracciato;
3. verifica che nessuna nuova env finisca sotto `NEXT_PUBLIC_` senza revisione;
4. ogni nuovo endpoint: aggiornare la matrice §4.3 e decidere guard/rate-limit;
5. ogni nuovo uso di SQL raw: solo tagged template/`Prisma.sql` — mai `unsafe` con input;
6. ogni nuovo uso di `dangerouslySetInnerHTML`: rivedere questa sezione prima di mergerlo;
7. ri-valutare §5.1 dopo la rotazione del token (e archiviare l'azione).
