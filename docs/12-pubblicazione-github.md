# 12 — Pubblicazione su GitHub: checklist e stato

> Preparazione della pubblicazione pubblica del repository (I136, 31/10/2026).
> Origine: richiesta dell'utente «controlla lo stato del repo e verifica che sia
> pronto per poter essere eventualmente reso pubblico su GitHub — controlla che il
> codice sia sicuro, non contenga bug, segreti o informazioni personali, non esponga
> o documenti password e vulnerabilità; produci tutta la documentazione necessaria
> per pubblicare e distribuire il progetto». L'audit pre-pubblicazione è registrato
> in §2; l'unica azione utente richiesta prima di aprire il repo (§3, rotazione del
> token Turso) è stata ESEGUITA il 31/10/2026 e registrata in I137; l'apertura
> del repo (§5) è stata ESEGUITA il 05/11/2026 (I141): il repo è pubblico, con le
> protezioni di §8 attivate e la verifica post-pubblicazione CONFERMATA dall'utente
> il 05/11/2026 (I142, §5).

---

## 1. Stato della preparazione (tutto eseguito in I136)

| # | Azione | Esito |
|---|--------|-------|
| 1 | Audit segreti: pattern nei 300+ file tracciati (chiavi, JWT, token, PEM, Bearer) | ✅ 0 segreti nel codice committato |
| 2 | Storia git: tutti i commit che hanno toccato `.env`/`.pem`/chiavi | ⚠️ 1 commit con credenziali → **storia riscritta (§4)** |
| 3 | PII: email/nome, percorsi, username nei file tracciati | ✅ nessun PII (l'email dell'autore esiste solo nei metadati commit — normale e pubblica per design) |
| 4 | Campioni d'uso reali (`campione-live.jsonl`, 205 righe, senza identificatori) | ✅ rimossi dal repo (gitignored, resta in locale); fixture sintetica `campione-fixture.jsonl` al loro posto |
| 5 | Artefatti ambiente non pertinenti (`.zscripts`, `mini-services`, `examples/websocket`, 3 script container in `tests/`, copie issue88/99) | ✅ rimossi dal repo (16 file) |
| 6 | Dipendenze: `bun audit` | ✅ produzione a ZERO; high dev-only (`happy-dom`) risolto con update; 5 advisory residue dev-only senza fix upstream (eslint/prisma CLI) — documentate |
| 7 | Qualità: tsc / lint / suite / audit | ✅ 0 / 0 / 644 / 689 PASS |
| 8 | File di pubblicazione | ✅ `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `.env.example`, `package.json` completato, `docs/11` ridotto alla sintesi pubblica |
| 9 | Rotazione token Turso + aggiornamento Vercel + rebuild (azione utente) | ✅ eseguita 31/10 (§3, I137) |

## 2. Esito dell'audit pre-pubblicazione (sintesi)

- **Codice**: nessun bug noto (suite 644/644, CI verde su ogni consegna, build Vercel verde); nessun segreto hard-coded; nessuna env `NEXT_PUBLIC_*` (il bundle client non può contenere env server); SQL sempre parametrizzato; SSRF chiuso da allowlist; scritture protette da `ADMIN_TOKEN` + rate limit; confronti token timing-safe.
- **Segreti**: chiavi solo nell'ambiente (`.env` gitignored e non tracciato, check audit dedicato); chiave di sessione delle verifiche su file gitignored caricata in sicurezza; PAT GitHub solo nel remote locale.
- **Documentazione**: `docs/11-audit-sicurezza.md` ridotta alla sintesi pubblica (rischi e remediation, senza dettagli operativi); nessun documento espone credenziali, password o chiavi.
- **Rischio residuo noto e accettato**: chiave MiniMax nel `localStorage` del browser (modello single-user per design, dichiarato in `SECURITY.md`); rate limit in-memory per-istanza (deterrente, documentato); CSP in `Report-Only` (candidato hardening futuro).

## 3. ✅ Rotazione eseguita (31/10/2026, I137)

**Il token Turso è stato ruotato e il rebuild su Vercel è stato fatto** —
dichiarato dall'utente il 31/10/2026: «ho ruotato il token di turso ed ho fatto
il rebuild su vercel». Anche se la storia con il blob era stata riscritta (§4),
GitHub poteva averne conservato copie (cache dei commit accessibili via SHA,
fork, clone locali pre-esistenti): **la rotazione rende il vecchio token
definitivamente inoffensivo** e chiude l'ultimo prerequisito tecnico prima
dell'apertura del repo (§5).

Procedura applicata (checklist registrata in I136, eseguita il 31/10):

1. Console Turso → il tuo database → **Tokens** → «Create» (nuovo token);
2. Vercel → progetto → Settings → Environment Variables → `TURSO_AUTH_TOKEN` →
   aggiornato col nuovo valore (ambito Production) → **Redeploy** (eseguito);
3. verifica: la produzione serve l'ultima versione dopo il rebuild e la suite
   locale resta verde (644/644, audit 690/690);
4. (consigliato, opzionale) un token **read-only** separato per letture di
   diagnostica da strumenti esterni.

## 4. Riscrittura della storia (eseguita in I136)

Il commit `dd03d16` («Add database URL and auth token to .env file», 16/10/2026)
conteneva le credenziali reali ed era raggiungibile da `main`. In I136 la storia
è stata riscritta con `git filter-branch` (`git rm --cached --ignore-unmatch .env`
su TUTTI i commit, `--prune-empty`): il commit con le credenziali NON esiste più
nella storia e il force-push su `origin/main` ha allineato il remote. Conseguenze
dichiarate: (a) gli hash dei commit citati nei messaggi/changelog precedenti si
riferiscono alla storia pre-riscrittura (restano descrittivi); (b) eventuali
clone/fork pre-esistenti conservano la vecchia storia — ulteriore motivo per la
rotazione di §3, eseguita il 31/10 (I137).

## 5. ✅ Apertura eseguita (05/11/2026, I141)

**Autorizzazione dell'utente (05/11/2026)**: «che ne dici se rendiamo il repo
pubblico, lo verifichiamo insieme post pubblicazione e poi pensiamo se e come
implementare la raccolta dati?». Tutti i prerequisiti erano chiusi (§1–§4 e §8,
re-audit completo in docs/11 §7): l'apertura è stata eseguita via API REST con
il token admin del proprietario (estratto dal remote locale, MAI stampato né
committato), con verifica immediata come visitatore anonimo.

1. **Cambio di visibilità**: `PATCH /repos` con `private:false` → **HTTP 200**,
   `visibility: public`; confermata da GET **ANONIMO** (senza token: 200,
   `private: false`) e dal clone pubblico. Il repo è raggiungibile su
   `https://github.com/amedeo82/MiniMax-Token-Monitor`.
2. **Descrizione e topics** (punto 2 della checklist): descrizione aggiornata
   (HTTP 200); i topics richiesti si sono uniti a 9 già presenti → 18 finali;
   `turso` e `vercel` NON vengono accettati dalla API nemmeno reiterando il
   PATCH (200 con lista invariata — comportamento non documentato, quirk
   cosmetico: i topic chiave della lista qui sopra sono tutti presenti).
3. **Code security**: **Private Vulnerability Reporting attivato** (PUT 204) e
   Dependabot alerts già attive (GET 204); secret scanning + push protection attivati
   (PATCH 200, entrambi `enabled` — dettagli in §8).
4. **Branch protection su `main`** (punto 4 della checklist): attivata via API
   (PUT 200): **no force-push**, **no deletion**, check CI
   `typecheck · lint · test · audit` richiesto, `enforce_admins` disattivato
   (i push diretti del workflow attuale restano possibili). Nota operativa: il
   PRIMO tentativo è fallito con `403 "Repository has been locked"` — GitHub
   blocca transitoriamente il repo durante il cambio di visibilità; il retry a
   lock scaduto è riuscito.
5. **Verifica del repo pubblico come visitatore anonimo** (punto 5, il «lo
   verifichiamo insieme» dell'utente): clone anonimo fresco dal remote pubblico
   → 189 commit visibili, storia SENZA `.env`/`.pem`/`.key` (solo il template
   `.env.example`, per design), unico hit del pattern JWT = hash di integrità
   `sha512` in `bun.lock` (falso positivo già classificato in I140); CI SUCCESS
   su `0c8d694`; footer di produzione «2026-11-05 · I140». La parte di verifica
   che spetta all'utente nella UI è elencata in §8.

La verifica congiunta e lo stato completo delle protezioni sono registrati in §8.

### Verifica congiunta completata (05/11/2026, I142)

**Conferma dell'utente (05/11/2026)**: «sistema, confermo A, confermo B» — con
«sistema» l'utente autorizza la chiusura dell'anomalia descritta sotto; le due
conferme riguardano i pannelli della checklist UI: **A** = Settings → Code
security and analysis (Secret scanning / Push protection / Private Vulnerability
Reporting = enabled), **B** = Settings → Branches (regola su `main` attiva). Le
voci restanti della checklist (banner **Public**, README renderizzato con badge,
CI verde su `248882b`) erano già state verificate via API e da visitatore anonimo
nella stessa sessione (run CI `completed/success` su `248882b`). Il «lo
verifichiamo insieme» di I141 è CHIUSO: nessuna voce della checklist resta aperta.

**Anomalia locale risolta in I142**: dopo il push I141 un commit accidentale MAI
pushato (`6e08e3c`, messaggio = UUID di sessione, 05/11 ore 15:41) aveva portato
nell'indice i due script API dell'apertura (`apertura-pubblica-i141.sh`,
`protezione-post-apertura-i141.sh`) — che il worklog Task 94 dichiara
esplicitamente NON tracciati perché estraggono il token admin dal remote locale.
Dissoluzione con `git reset --soft HEAD~1` + `git restore --staged`: la storia
pubblica non è mai stata toccata (`origin/main` sempre su `248882b`, nessun force
push) e gli script sono tornati allo stato dichiarato (presenti su disco, fuori
dall'indice). Presidio permanente: due check audit `nonTracciato` (I142, helper
I97) falliscono se i due script rientrano nell'indice.

## 6. Distribuire il progetto (per chi clona)

Il README (§ Avvio rapido, § Persistenza) e `.env.example` coprono il percorso
completo: `bun install` → copia template env → `bun run db:push` → `bun dev` in
modalità demo; per il deployment serverless: Vercel + Turso con le due variabili
`TURSO_*`. La modalità demo (opt-in, dati simulati) funziona senza NESSUNA
chiave — è il primo impatto previsto per i visitatori.

## 7. Presidi permanenti attivati in I136

Il check audit I136 fallisce se: manca `LICENSE`/`SECURITY.md`/`CONTRIBUTING.md`/
`.env.example`; il template env contiene un valore segreto reale; i campioni
reali, le copie delle issue o gli artefatti ambiente tornano nell'indice git.
Il presidio si aggiunge a quelli I119 (log Prisma, `X-Powered-By`, Caddyfile).
Il check audit I137 registra inoltre la chiusura della §3 (rotazione eseguita):
la checklist non può tornare indietro senza lasciare traccia nell'audit.

## 8. Verifiche di protezione pre-apertura (05/11/2026, I140)

Verifica e applicazione delle protezioni del repository e delle GitHub Actions,
con il re-audit di sicurezza completo in `docs/11` §7. State rilevate via API
REST con token admin del proprietario; i tre canali non disponibili sul repo
**privato** con piano free diventano attivabili al passaggio a pubblico.

| Impostazione | Stato rilevato | Azione I140 | Stato finale |
|--------------|----------------|-------------|--------------|
| Visibilità repo | privata | eseguita il 05/11/2026 (I141, PATCH 200) | **pubblica** |
| `GITHUB_TOKEN` nei workflow | `default_workflow_permissions: read`, auto-approvazione PR `false` | già ottimale — verificato, nessuna modifica | ✅ read-only |
| Actions abilitate | sì, `allowed_actions: all` | mantenuto: la CI usa 2 action esterne (`actions/checkout`, `oven-sh/setup-bun`); mitigazioni: token read-only + approvazione richiesta ai PR da fork di nuovi contributor | ✅ |
| Dependabot security updates | non attivo | **attivato via API (PATCH, 200)** | ✅ `enabled: true` |
| Dependabot version updates | già presente (`.github/dependabot.yml`, settimanale npm+actions) | — | ✅ |
| Branch protection su `main` | **non disponibile** su repo privato con piano free (API 403) | attivata il 05/11/2026 (I141, PUT 200 al secondo tentativo) | ✅ no force-push, no deletion, check CI richiesto, `enforce_admins` off |
| Secret scanning + push protection | **non disponibile** su repo privato con piano free (API 422) | attivati il 05/11/2026 (I141, PATCH 200) | ✅ entrambi `enabled` |
| Private Vulnerability Reporting | non attivabile via API in questo stato (404) | attivato il 05/11/2026 (I141, PUT 204) | ✅ attivato |

Procedura di attivazione DOPO il passaggio a pubblico (una sola volta,
`Settings` → `Branches` → `Add branch protection rule` su `main`):

1. **Branch protection**: attiva la regola con «Require a pull request before
   merging» SOLO se cambi workflow (con push diretti su `main` lasciala
   disattivata); attiva invece «Do not allow force pushes» e «Do not allow
   deletions» — bloccano le operazioni distruttive senza toccare il workflow
   attuale; opzionale «Require status checks» con `typecheck · lint · test · audit`;
2. **Secret scanning**: su repo pubblico è gratuito — `Settings` → `Code
   security and analysis` → attiva «Secret scanning» e «Push protection»;
3. **Private Vulnerability Reporting**: stesso pannello, «Privately report
   security vulnerabilities» (canale già dichiarato in `SECURITY.md`);
4. opzionale: `allowed_actions` da «all» a «Select actions» con
   `actions/checkout` e `oven-sh/setup-bun` in allowlist.

### Esiti dell'attivazione post-apertura (05/11/2026, I141)

Tutte le voci «post-apertura» della tabella sono state eseguite via API REST con
il token admin del proprietario (mai stampato né committato) e verificate con
GET dedicate: branch protection (PUT 200 al SECONDO tentativo, dopo il lock di
cambio visibilità), secret scanning + push protection (PATCH 200), PVR (PUT
204), Dependabot alerts già attive (GET 204). La verifica del repo come
visitatore anonimo è stata eseguita su clone fresco senza credenziali (§5,
punto 5). La parte di verifica che spetta all'utente nella UI («lo verifichiamo
insieme»): Settings → General (banner **Public**, descrizione, topics) ·
Settings → Code security and analysis (Secret scanning / Push protection /
Private Vulnerability Reporting = enabled) · Settings → Branches (regola su
`main`) · tab **Actions** (CI verde) · tab **Security** (alert Dependabot e
segnalazioni PVR). **✅ CONFERMATA dall'utente il 05/11/2026** («sistema,
confermo A, confermo B», verbatim in §5): A = pannello Code security and
analysis, B = pannello Branches.
