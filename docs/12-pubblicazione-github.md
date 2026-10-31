# 12 — Pubblicazione su GitHub: checklist e stato

> Preparazione della pubblicazione pubblica del repository (I136, 31/10/2026).
> Origine: richiesta dell'utente «controlla lo stato del repo e verifica che sia
> pronto per poter essere eventualmente reso pubblico su GitHub — controlla che il
> codice sia sicuro, non contenga bug, segreti o informazioni personali, non esponga
> o documenti password e vulnerabilità; produci tutta la documentazione necessaria
> per pubblicare e distribuire il progetto». L'audit pre-pubblicazione è registrato
> in §2; ciò che resta ALL'UTENTE prima di aprire il repo è in §3 (una sola azione).

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

## 2. Esito dell'audit pre-pubblicazione (sintesi)

- **Codice**: nessun bug noto (suite 644/644, CI verde su ogni consegna, build Vercel verde); nessun segreto hard-coded; nessuna env `NEXT_PUBLIC_*` (il bundle client non può contenere env server); SQL sempre parametrizzato; SSRF chiuso da allowlist; scritture protette da `ADMIN_TOKEN` + rate limit; confronti token timing-safe.
- **Segreti**: chiavi solo nell'ambiente (`.env` gitignored e non tracciato, check audit dedicato); chiave di sessione delle verifiche su file gitignored caricata in sicurezza; PAT GitHub solo nel remote locale.
- **Documentazione**: `docs/11-audit-sicurezza.md` ridotta alla sintesi pubblica (rischi e remediation, senza dettagli operativi); nessun documento espone credenziali, password o chiavi.
- **Rischio residuo noto e accettato**: chiave MiniMax nel `localStorage` del browser (modello single-user per design, dichiarato in `SECURITY.md`); rate limit in-memory per-istanza (deterrente, documentato); CSP in `Report-Only` (candidato hardening futuro).

## 3. ⚠️ Azione dell'utente PRIMA di rendere pubblico il repo

**Rotazione del token Turso** — il token committato per errore nel 2026 (poi
rimosso dal tracciamento) è stato dichiarato NON ancora ruotato. Anche se la
storia con il blob è stata riscritta (§4), GitHub può averne conservato copie
(cache dei commit accessibili via SHA, fork, clone locali pre-esistenti):
**la rotazione rende il vecchio token definitivamente inoffensivo**.

1. Console Turso → il tuo database → **Tokens** → «Create» (nuovo token);
2. Vercel → progetto → Settings → Environment Variables → `TURSO_AUTH_TOKEN` →
   aggiorna col nuovo valore (ambito Production) → **Redeploy**;
3. `.env` locale: aggiorna `TURSO_AUTH_TOKEN` (se usi Turso in locale);
4. verifica: apri la dashboard di produzione, dati in arrivo; `bun test` in
   locale rimane verde;
5. (consigliato) crea anche un token **read-only** separato se intendi usare
   letture diagnostica da strumenti esterni.

## 4. Riscrittura della storia (eseguita in I136)

Il commit `dd03d16` («Add database URL and auth token to .env file», 16/10/2026)
conteneva le credenziali reali ed era raggiungibile da `main`. In I136 la storia
è stata riscritta con `git filter-branch` (`git rm --cached --ignore-unmatch .env`
su TUTTI i commit, `--prune-empty`): il commit con le credenziali NON esiste più
nella storia e il force-push su `origin/main` ha allineato il remote. Conseguenze
dichiarate: (a) gli hash dei commit citati nei messaggi/changelog precedenti si
riferiscono alla storia pre-riscrittura (restano descrittivi); (b) eventuali
clone/fork pre-esistenti conservano la vecchia storia — ulteriore motivo per la
rotazione di §3.

## 5. Aprire il repository al pubblico (passi GitHub)

1. `Settings` → `General` → `Danger Zone` → **Change repository visibility** →
   `Make public` (dopo la rotazione di §3);
2. `Settings` → `General` → dettagli: descrizione, topics (es. `nextjs`,
   `typescript`, `minimax`, `quota-monitor`, `pwa`, `turso`);
3. `Settings` → `Code security`: attiva **Private Vulnerability Reporting**
   (canale dichiarato in `SECURITY.md`) e Dependabot alerts (il repo ha già
   `.github/dependabot.yml`);
4. (consigliato) `Settings` → `Branches` → branch protection su `main`:
   richiedi i check CI (`typecheck · lint · test · audit`) per il merge;
5. (consigliato) verifica del repo pubblico come visitatore anonimo: la pagina
   README, i badge, l'assenza di riferimenti a dati personali.

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
