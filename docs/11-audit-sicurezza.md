# 11 — Audit di sicurezza del progetto (I119 · sintesi pubblica I136)

> Audit white-box condotto il 17/10/2026 (item **I119**) su richiesta dell'utente:
> analisi del codice alla ricerca di falle di sicurezza, bug latenti, segreti
> esposti o scopribili; verifica che il progetto in produzione non esponga
> credenziali né sia attaccabile (DDoS, SQL injection, superfici d'attacco).
> **Questa è la versione pubblica ridotta (I136)**: registra perimetro, esiti e
> remediation senza i dettagli operativi interni. La preparazione alla
> pubblicazione pubblica del repository (riscrittura storia, igiene artefatti,
> checklist di rotazione) è in `docs/12-pubblicazione-github.md`.

---

## 1. Perimetro e contesto

Deployment di produzione **Vercel** (Next.js 16 standalone, serverless): nessun
server proprio, nessun shell pubblico. La superficie analizzata:

- **8 route API** (proxy usage, storico, eventi, manutenzione GET/POST + cron, persistenza, summary);
- **lib server**: factory DB (Prisma 7 + adapter libsql/Turso), schema, manutenzione, guard di protezione, schemi zod;
- **client**: dashboard, PWA (service worker), chiave MiniMax in `localStorage` (vincolo di progetto documentato: è l'unico segreto del browser, per design);
- **configurazioni**: header di sicurezza, cron, `.gitignore`, reverse proxy di sviluppo;
- **storia git e remote** (repo GitHub).

La piattaforma fornisce per conto suo TLS a edge, mitigazione DDoS volumetrica di
rete, isolamento delle istanze serverless e segreti di ambiente non leggibili
dopo l'impostazione. L'audit si concentra su ciò che CODICE e CONFIGURAZIONE
possono guastare.

## 2. Test eseguiti (sintesi)

24 aree di test coperte: inventario della superficie d'attacco; pattern di
segreti nel codice, nei file tracciati e nella STORIA git; fuga segreti via
bundle client; SQL injection su TUTTI i siti di SQL raw; XSS (unico
`dangerouslySetInnerHTML`); command/code injection; path traversal; SSRF;
matrice di autenticazione/autorizzazione per ogni route; timing attack sui
confronti di token; rate limiting/DoS; CORS/CSRF; uso di crypto debole;
esposizione nei log; fingerprinting server; service worker e segreti browser;
dipendenze; versioni di framework; visibilità del repo; fuga di segreti nei
tool di verifica; penetration test manuale dei contratti HTTP.

## 3. Sintesi dei risultati

| Area | Gravità | Esito |
|------|---------|-------|
| Credenziali DB nella storia git | **CRITICO** (repo privato al momento dell'audit) | **RISOLTO in I136**: storia riscritta + rotazione token (checklist `docs/12` §3) |
| Guard delle scritture in produzione | **ALTO** (se env assenti) | supporto client completo (I120+I121): 7 scritture con header, sonda di identità; azione operativa su Vercel eseguita |
| Log query con parametri in produzione | MEDIO | **FIXATO in I119** (log dipendente dall'ambiente) |
| Fingerprinting `X-Powered-By` | MEDIO | **FIXATO in I119** (header disattivato, test dedicato) |
| Reverse proxy di sviluppo (SSRF loopback se esposto) | BASSO (dev-only) | avvertimento esplicito nel file; non parte del deployment |
| Messaggi d'errore 500 verbatim | BASSO | rischio accettato e documentato (monoutente) |
| `quick_check` sull'endpoint pubblico di diagnostica | BASSO | mitigato da soglia dimensionale |
| Rate limit in-memory per-istanza | BASSO | limite strutturale documentato (il vero volumetrico è dell'edge) |
| SQL injection / XSS / injection / SSRF | — | **VERIFICATI SICURI** |
| Segreti hard-coded / nel bundle / nei file tracciati | — | **VERIFICATI SICURI** |
| Dipendenze di produzione | — | **ZERO vulnerabilità** (le advisory note vivono solo in catene dev) |
| Header di sicurezza, HSTS, CSP | — | presenti; CSP enforcing raccomandato (hardening futuro) |

## 4. Esiti principali per area

- **SQL injection — sicuro**: solo tagged template parametrizzati e `Prisma.sql`/
  `Prisma.join`; i due usi di stringhe dinamiche sono DDL e `VACUUM` costanti,
  presidiati da test anti-drift. Gli input HTTP entrano solo dopo schemi zod con
  taglio e enum chiuse.
- **XSS — sicuro**: l'unico `innerHTML` (highlight JSON) escapa `&` e `<` prima
  di ogni inserimento di markup; la via di injection è chiusa per costruzione.
  Raccomandata la migrazione futura a renderer React a nodi.
- **Command/path/SSRF — sicuro**: nessun `eval`/`exec`/`spawn`; nessun percorso
  filesystem da input HTTP; ogni `fetch` server-side verso allowlist fissa.
- **Auth — conforme**: guard timing-safe (SHA-256 + `timingSafeEqual`) sulle
  scritture con rate limit 120/min/IP; cron protetto da secret obbligatorio;
  letture pubbliche solo read-only senza segreti (host DB sanificato).
- **Segreti — sicuri nel codice**: nessun pattern segreto; nessuna env pubblica
  al client; chiave MiniMax solo in `localStorage`/IndexedDB (mai nel service
  worker cache né nei log); PAT solo nel remote locale.
- **Dipendenze — produzione a ZERO**: le advisory note (dal I136: `happy-dom`
  risolto con update; `fast-uri`/`minimatch` residue) vivono SOLO in catene
  dev-tooling (eslint, CLI prisma) senza percorso in produzione; `bun audit`
  è parte del protocollo a ogni consegna.

## 5. Presidi permanenti

I check dell'audit dichiarativo (`bun run audit`) falliscono se qualcuno
riattiva i log di query incondizionati, riattiva il fingerprinting, rimuove
l'avvertimento del proxy di sviluppo o elimina questo report; i test di
configurazione bloccano regressioni sugli header. Dal I136 presidiano anche
licenza e politiche di pubblicazione (`docs/12` §7).

## 6. Checklist di ripetizione (prossimi audit)

1. `bun audit` a OGNI consegna (già nel protocollo);
2. grep segreti su `src/` + file tracciati + verifica `.env` NON tracciato;
3. nessuna nuova env sotto `NEXT_PUBLIC_` senza revisione;
4. ogni nuovo endpoint: aggiornare matrice guard/rate-limit;
5. SQL raw: solo tagged template/`Prisma.sql` — mai stringhe dinamiche con input;
6. ogni nuovo `dangerouslySetInnerHTML`: rivedere questo documento prima;
7. dopo la rotazione del token Turso (`docs/12` §3): archiviare l'azione.

## 7. Re-audit completo pre-apertura (05/11/2026, I140)

Seconda passata completa su TUTTE le 24 aree di §2, eseguita il 05/11/2026
(I140) come controllo finale prima dell'eventuale apertura del repo al
pubblico — richiesta dell'utente: «controllami se il repo è sicuro per poter
essere reso pubblico». Metodologia identica all'audit I119/I136 (white-box:
pattern di segreti sui file tracciati, storia git, siti SQL, XSS, injection,
matrice guard, header, probe HTTP read-only in produzione, dipendenze), con
verifica anche delle protezioni GitHub del repo (`docs/12` §8).

| Esito | Area | Dettaglio |
|-------|------|-----------|
| ✅ | Superficie d'attacco | invariata: 8 route API, nessun nuovo endpoint da I119 |
| ✅ | Segreti nei file tracciati | 0 pattern (unico hit: hash di integrità sha512 in `bun.lock`, falso positivo) |
| ✅ | Storia git | nessun commit tocca `.env`/`.pem`/`.key`; artefatti rimossi in I136 mai ricomparsi |
| ✅ | Env pubbliche al client | nessuna `NEXT_PUBLIC_*` |
| ✅ | SQL injection | nessun `$queryRawUnsafe`/`$executeRawUnsafe` con input; DDL e `VACUUM` costanti; filtri con `Prisma.sql`/`Prisma.join` |
| ✅ | XSS | unico `dangerouslySetInnerHTML` (highlight JSON) con escape `&`/`<` a monte, confermato |
| ✅ | Command/path injection | nessun `eval`/`exec`/`spawn`; nessun `fs` nelle route API |
| ✅ | SSRF | l'unico `fetch` server-side usa la allowlist fissa degli endpoint MiniMax (eu/cn) |
| ✅ | Auth/authz | guard `ADMIN_TOKEN`+timing-safe su tutte le scritture; cron con `CRON_SECRET`; letture read-only |
| ✅ | Rate limit / DoS | `sottoLimiteScritture` 120/min/IP attivo; il volumetrico resta dell'edge |
| ✅ | Crypto | nessun md5/sha1; `Math.random` solo in demo e jitter backoff (mai in contesti di sicurezza) |
| ✅ | CORS/CSRF | nessun header CORS custom (same-origin di default) |
| ✅ | Header di sicurezza | confermati in produzione (probe): nosniff, frame SAMEORIGIN, referrer, permissions-policy, HSTS; `X-Powered-By` assente; CSP Report-Only |
| ✅ | Log | log Prisma dipendenti dall'ambiente (I119, intatto) |
| ✅ | Service worker | nessun segreto in cache; dati offline dal `localStorage` di pagina (per design) |
| ⚠️→✅ | **Dipendenze** | **1 SCOPERTA E FIXATA in I140**: `bun audit --production` segnalava 4 advisory (2 moderate, 2 low) in `fast-uri` 3.1.8 via `prisma` CLI → `@prisma/dev` → `ajv` (catena di BUILD, mai importata dal runtime — verificato). Fix: `overrides` `fast-uri@^3.1.9` (versione patchata del 19/10/2026) in `package.json` → **0 vulnerabilità** |
| ✅ | Versioni framework | Next 16.4.2, React 19.3.1, TypeScript 5.9.3, Prisma 7.10.1 — correnti |
| ✅ | Probe contratti HTTP | GET `/api/summary` 200 (read-only), POST `/api/history` senza token **401**, cron senza secret **401** |
| ✅ | PII nei file tracciati | solo l'identità git dell'autore (worklog Task 30/31, `package.json` author) — già pubblica per design |
| ✅ | Igiene gitignore | `.env*`, chiave di sessione, esiti (tranne `audit-latest.md`) — intatti |

**Esito complessivo: PASS** — nessuna scoperta residua; l'unico riscontro
(advisory `fast-uri` in catena di build) è stato fixato nella stessa consegna
con override dichiarato. Le protezioni del repository GitHub (branch protection,
secret scanning, PVR) sono documentate in `docs/12` §8: tre di esse diventano
disponibili solo al passaggio a repo pubblico.
