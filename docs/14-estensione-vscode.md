# 14 — Analisi: estensione VS Code per il monitoraggio del piano durante il coding

**Data**: 06/11/2026 (Europe/Rome) · **Item**: I143 · **Tipo**: analisi — nessuna modifica al codice
**Origine**: domanda dell'utente sull'implementazione di un plugin/componente per VS Code (verbatim in §9), resoconto consegnato in chat e qui formalizzato su autorizzazione esplicita.

---

## §1 — Obiettivo e perché ha senso

- L'utente programma usando il piano MiniMax (M Plan) dentro VS Code e vuole il monitor
  dell'«andamento del piano» **nello stesso posto dove il consumo avviene**, senza cambiare
  finestra (oggi il monitor esiste solo come PWA web).
- La FAQ ufficiale M Plan conferma che la quota è **condivisa tra tutti i tool** (MiniMax Code,
  Claude Code, Codex, Cursor, …): «Can I use my subscription in multiple tools at the same
  time? Yes… usage from all tools counts toward the same M Plan usage limits». Il consumo
  cresce proprio durante le sessioni di coding → la superficie giusta per il monitor è l'editor.
- Le due finestre che contano restano le stesse del progetto: **5 ore** e **settimanale**; il
  countdown al reset della finestra 5h (già calcolato con `inferServerTime`) è l'informazione
  più utile mentre si programma.

## §2 — Ricerca: come si integra un monitor in VS Code (fonti in §8)

### 2.1 Modello delle estensioni

- Un'estensione è un processo **Node.js** (extension host) con un manifest `package.json`
  (contribution points, activation events); attivazione consigliata `onStartupFinished`
  per non rallentare l'avvio dell'editor.
- **Nessun CORS nel lato estensione**: il meccanismo CORS è del browser; l'extension host
  non è un browser (vedi §4.2 — insight architetturale chiave).

### 2.2 Superfici UI utili al caso

| Superficie | Uso nel nostro caso | Vincoli dalle linee guida ufficiali |
|---|---|---|
| **Status bar item** | sempre visibile: `$(icon) 84%` (finestra 5h), click → dettagli/refresh | testo corto, niente colori custom (warning/error solo come ultima risorsa), un solo item discreto |
| **Tree view** (Activity Bar) | gerarchia: piano → finestra 5h (%, countdown reset) → settimanale → per-modello → ultimo rilevamento | vista dedicata o seconda vista nella sidebar Explorer |
| **Webview** | dashboard completa dentro l'editor (fase 2, non MVP) | risorse locali via `asWebviewUri`; CSP rigorosa |
| **Notifiche + comandi** | allerte alle soglie, «Aggiorna ora», «Imposta chiave», «Apri dashboard web» | le notifiche non sostituiscono lo status bar per il monitoraggio continuo |

### 2.3 AI extensibility: MCP (novità rilevante)

- VS Code implementa la **spec completa MCP**: un server MCP espone *tools*/*prompts*/*resources*
  per la agent mode di Copilot; l'annotazione `readOnlyHint` evita la conferma su tool di sola lettura.
- Un server MCP è **riusabile fuori da VS Code** (Cursor, Claude Code, …): un tool read-only
  `minimax_piano_usage` («quanta quota mi resta?») sarebbe un'estensione naturale a **fase 2**.
- Alternativa nativa: **Language Model Tool API** (`contributes.languageModelTools`) quando serve
  profonda integrazione con le API dell'editor e distribuzione via Marketplace. Per il nostro caso
  (nessuna API editor necessaria, riuso cross-editor) l'MCP è la scelta più adatta a fase 2.

### 2.4 Sicurezza delle chiavi

- **SecretStorage** (`context.secrets`): cifrato per installazione e **non sincronizzato tra
  macchine** — il posto giusto per la Subscription Key.
- Mai in `settings.json` (Settings Sync la replicherebbe tra macchine), mai nel codice:
  il repo è pubblico con push protection attiva (I141).

### 2.5 Packaging e distribuzione

- `vsce package` → `.vsix`; **installazione privata**: `code --install-extension file.vsix`
  (zero account) — sufficiente per uso personale.
- Marketplace = publisher ID (account Microsoft; i PAT «Marketplace·Manage» vanno in pensione
  il 01/12/2026 → per la CI di pubblicazione si passerà a **GitHub Actions Trusted Publishing**).
- Open VSX opzionale per i fork (VSCodium/Cursor); un'estensione senza API proprietarie funziona
  sui fork via VSIX.

## §3 — Il lato MiniMax (fonti ufficiali, consultate il 06/11/2026)

- **M Plan**: tier Go / Explore / Build; i modelli testo/immagini/audio condividono le stesse
  finestre di quota, il video (H3, Explore/Build) è soggetto solo alla finestra settimanale.
- **Verifica dell'uso**: pagina usage della console; API `GET /v1/token_plan/remains`
  (`Authorization: Bearer <Subscription Key>`) — è il metodo ufficiale di verifica, già
  implementato e testato nel progetto (docs/01 §2–§4: regioni eu/cn, alias di campo,
  `base_resp.status_code` 1004 con chiave sbagliata).
- **Precedenti open-source** che validano il pattern «monitor nel flusso di lavoro»:
  **CreditGauge** (statusline per Claude Code) e **CodexBar** (menu bar macOS) — già citati
  in docs/01 §1 come fonti della ricerca originale.

## §4 — Che cosa abbiamo già e che cosa cambia

### 4.1 Riuso dal progetto

- `src/lib/minimax.ts`: `parseUsageResponse` + tipi (`UsageSnapshot`, `ModelQuota`, `QuotaWindow`)
  + `inferServerTime` + `quotaLevel` (soglie 60/30/10) + `REGION_ENDPOINTS`/`CODING_PLAN_ENDPOINTS` —
  **TypeScript puro senza dipendenze**, riutilizzabile quasi verbatim nell'estensione.
- La semantica di polling/retry/backoff del client (I51) e le soglie di `quotaLevel` sono già
  definite e testate: l'estensione le replica per coerenza col web.

### 4.2 L'insight architetturale chiave

- Il proxy `/api/minimax/usage` esiste **solo per aggirare il CORS del browser** (docs/01 §3)
  e per non esporre la chiave nei referer di rete.
- **L'estensione può interrogare MiniMax direttamente**: l'extension host è Node.js, non un
  browser — nessun CORS. L'MVP **non richiede modifiche al progetto web**.

### 4.3 Backend e sinergia con la raccolta background (docs/13 §5)

- Il backend offre `/api/history` (upsert su Turso con guard I95) e `/api/summary`.
- Se la raccolta in background (collector GitHub Actions, docs/13 §5) verrà autorizzata,
  l'estensione può diventare la **terza fonte** di rilevazione: browser (dashboard aperta),
  Actions (nessuno online), estensione (mentre si programma) → copertura continua della
  giornata senza toccare i limiti Vercel. Le due decisioni si completano a vicenda.

## §5 — Opzioni di integrazione

| Opzione | Flusso dati | Pro | Contro |
|---|---|---|---|
| **A. Via backend** | estensione → proxy/summary su Vercel → MiniMax/Turso | riusa retry/fallback e storico Turso; zero logica nuova lato API | dipende da Vercel; la chiave viaggia comunque nel body; nessun vantaggio per il live |
| **B. Diretta MiniMax** ⭐ MVP | estensione → `https://www.minimax.io/v1/token_plan/remains` (Bearer) | zero dipendenze; stesso contratto già testato; **nessuna modifica al progetto web**; continua a funzionare anche senza backend | solo live, niente storico (fino a eventuale persistenza su `/api/history`) |
| **C. Ibrida** (evoluzione) | B per il live + A per lo storico (+ collector Actions di docs/13 §5) | vista completa live + serie storiche | due sorgenti da coordinare |

**Raccomandazione**: partire con **B** (MVP), evolvere verso **C** se/Quando la raccolta
background di docs/13 §5 verrà autorizzata. In B la chiave vive solo nel SecretStorage locale
dell'editor — lo stesso modello di sicurezza del progetto (chiave in localStorage, mai lato server).

## §6 — Che cosa sviluppare (proposta per implementazione futura)

### 6.1 Struttura

- **Monorepo**: cartella `estensione-vscode/` con `package.json` (manifest), `tsconfig`,
  bundle esbuild — fuori da `src/`, quindi l'audit e la suite esistenti restano intatti;
  la CI attuale può aggiungere un job che esegue `vsce package` e pubblica il `.vsix` come artefatto.
- Parser condiviso: copia sincronizzata con test di parità, oppure estrazione in modulo comune —
  decisione tecnica al momento dell'implementazione.
- Alternativa (repo separato) scartata per ora: riuso del parser e CI comune pesano più
  dell'indipendenza; da rivalutare se l'estensione prende vita propria.

### 6.2 MVP (fase 1) — componenti

1. **Client MiniMax**: GET + Bearer, timeout 12s, fallback `coding_plan/remains`, riuso di
   `parseUsageResponse`/`inferServerTime`/`quotaLevel`.
2. **Status bar item**: `$(pulse) 84%` (finestra 5h), tooltip ricco (settimanale, countdown reset,
   ultimo rilevamento), colore crit solo come ultima risorsa, click → dettagli + refresh.
3. **Tree view** «MiniMax Piano»: titolo piano, finestra 5h (% + countdown), finestra settimanale,
   righe per modello, ultimo rilevamento, stato chiave.
4. **Comandi**: «Aggiorna ora», «Imposta Subscription Key» (→ SecretStorage), «Apri dashboard web»
   (`openExternal`).
5. **Impostazioni**: regione eu/cn, intervallo di polling (default 5 min = 12/h — migliaia di
   volte sotto ogni limite), soglie allineate al web (60/30/10).
6. **Test**: unitari del client con le fixture del progetto + `@vscode/test-electron`; job CI
   che produce il `.vsix` come artefatto.

### 6.3 Fase 2

- **Server MCP** read-only (`minimax_piano_usage`) per la chat agent di Copilot, riusabile
  fuori da VS Code.
- Notifiche alle soglie (default coerenti con `quotaLevel`).
- Webview dashboard.

### 6.4 Fase 3 (opzionale)

- Pubblicazione Marketplace / Open VSX — solo se si vorrà distribuire l'estensione;
  per uso personale il VSIX basta.

### 6.5 Effort stimato

- MVP ≈ 1 intervento (mezza giornata); fase 2 ≈ 1 altro intervento; fase 3 solo su richiesta.

## §7 — Sicurezza e vincoli

- Subscription Key **solo in SecretStorage**; mai loggata, mai nel repo (push protection attiva).
- Rate: 12 richieste/h di default — prudenziale anche rispetto ai limiti dell'API MiniMax.
- Linee guida status bar rispettate (testo corto, colori di tema, niente colori custom continui).
- Niente proposed API → compatibilità con le versioni stabili di VS Code e con i fork.

## §8 — Fonti (consultate il 06/11/2026)

- VS Code — Status bar UX guidelines: <https://code.visualstudio.com/api/ux-guidelines/status-bar>
- VS Code — Tree View API: <https://code.visualstudio.com/api/extension-guides/tree-view>
- VS Code — Webview API: <https://code.visualstudio.com/api/extension-guides/webview>
- VS Code — Publishing extensions (vsce, publisher, Trusted Publishing): <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
- VS Code — MCP developer guide: <https://code.visualstudio.com/api/extension-guides/ai/mcp>
- VS Code — Language Model Tool API: <https://code.visualstudio.com/api/extension-guides/ai/tools>
- VS Code — API reference (SecretStorage): <https://code.visualstudio.com/api/references/vscode-api>
- MiniMax — M Plan intro: <https://platform.minimax.io/docs/m-plan/intro>
- MiniMax — M Plan FAQ (quota condivisa tra tool, verifica uso): <https://platform.minimax.io/docs/m-plan/faq>
- Progetto — docs/01 §2–§4 (endpoint, chiavi, fallback), docs/13 §5 (raccolta background)

## §9 — Provenienza e autorizzazione

**Domanda dell'utente (verbatim, 06/11/2026)**:

> «una funzionalità che vorrei discutere con te è quella riguardante l'implementazione di un
> plugin / componente per VS Code del progetto da usare all'interno di VS Code per monitorare
> l'andamento del piano durante il coding. come potremmo fare? che cosa dovremmo sviluppare?
> in che modo possiamo integrare il progetto dentro a VS Code? fai una ricerca online ed una
> analisi, poi mostrami il risultato ed i tuoi consigli»

**Autorizzazione a documentare (verbatim, 06/11/2026)**:

> «documenta tutta questa analisi nel progetto per implementazione futura»

I143 documenta l'analisi e allinea la mappa della documentazione (README, docs/04 §8);
**non introduce alcun codice di estensione**: l'eventuale implementazione (MVP §6.2) sarà un
item futuro su autorizzazione dell'utente — coerente col ciclo
«suggerimento → autorizzazione → implementazione».
