# 13 — Analisi: raccolta dati in background e limiti dei tier free

**Data**: 05/11/2026 (Europe/Rome) · **Item**: I139 · **Tipo**: analisi — nessuna modifica al codice
**Origine**: domanda dell'utente sul funzionamento senza visitatori (verbatim in §8), resoconto consegnato in chat e qui formalizzato.

---

## §1 — Comportamento attuale: il browser è il motore della raccolta

Verificato nel codice (05/11/2026, HEAD `a6156f9`):

- la chiave MiniMax vive **solo nel browser** (localStorage, vincolo di sicurezza del
  progetto — docs/01, docs/04 I103);
- il client chiama `POST /api/minimax/usage` (proxy server-side con retry I51 e
  fallback I18): è il **proxy** a parlare con l'API MiniMax, ma lo fa **su richiesta
  del browser**;
- il client persiste i punti su `POST /api/history` (guard I95 + rate limit, upsert su
  `UsagePoint` in Turso);
- l'unico job server-side è il cron di manutenzione (`vercel.json`:
  `/api/manutenzione/cron` alle 02:30 UTC, I111) — **non raccoglie** dati di utilizzo.

**Conclusione**: se nessuno apre la pagina, nessuna rilevazione parte e nessun punto
viene salvato. La raccolta è pull-based, innescata dal polling del client (I100/I125).

## §2 — Limiti verificati dei servizi free (fonti datate 05/11/2026, §7)

### 2.1 Vercel (piano Hobby)

| Risorsa | Limite incluso | Impatto su SpazioTA |
|---|---|---|
| Cron Jobs per progetto | 100 (da 20/01/2026) | non è il vincolo |
| **Frequenza dei cron (Hobby)** | **una sola esecuzione al giorno**, precisione per-ora (±59 min), UTC | ⚠️ **il vero collo di bottiglia**: le espressioni sotto-daily falliscono al deploy |
| Function invocations | 1.000.000/mese | un collector a 5 min ≈ 0,9% (§3) |
| Fast Data Transfer | 100 GB/mese | irrilevante a questa scala |
| Active CPU | 4 CPU-hrs/mese | l'unica metrica da tenere d'occhio a cadenze alte (§3) |
| Durata massima funzione | 300 s | sufficiente (una rilevazione dura pochi secondi) |
| Superamento quota | **pausa** fino al reset (~30 giorni), nessun addebito a sorpresa | nessun rischio economico |
| Fair use | uso personale non commerciale | compatibile col progetto |

### 2.2 Turso (piano Free)

| Risorsa | Limite incluso | Impatto su SpazioTA |
|---|---|---|
| Righe scritte | **10.000.000/mese** | collector a 5 min ≈ 0,6% (§3) |
| Righe lette | 500.000.000/mese | dashboard + collector ≈ 0,3% (§3) |
| Storage | 5 GB | ~10 MB/mese a 5 min → decenni di margine (§3) |
| Database | 100 | ne usiamo uno |
| Cold start / sleeping | nessuno (sempre reattivo) | adatto a un collector sporadico |
| Overage | fatturazione extra solo se attivata esplicitamente | di default non ci sono addebiti |

Aggiornamento rispetto a docs/10 §2 (fonti datate 17/10): il piano Free oggi espone
100 database e 500M/10M righe lette/scritte al mese — la sostanza per questo progetto
non cambia.

### 2.3 GitHub

| Aspetto | Regola | Impatto su SpazioTA |
|---|---|---|
| Repo pubblico (hosting codice) | nessun limite di traffico rilevante per git; repo consigliato ≤ 1 GB | nessun impatto |
| Actions, repo pubblico | runner standard **gratuiti e illimitati**; max 6 h per job, 35 giorni per workflow | il collector via Actions è gratis |
| Actions, repo privato | consuma l'allowance incluso del piano Free (minuti/mese) | un motivo in più per il repo pubblico (docs/12 §5) |
| Workflow `schedule` | minimo **5 minuti**; **best-effort**: ritardi sotto carico (tipicamente 5–20 min, in punta di ora anche di più), run accodati possono essere persi | la cadenza reale è «almeno una rilevazione ogni ~15–30 min» |
| Workflow `schedule`, repo pubblico | **disattivazione automatica dopo 60 giorni di inattività** del repo | non un rischio: il repo è attivo (commit, CI, release) |
| GitHub Pages | **statico soltanto**; sito ≤ 1 GB, banda 100 GB/mese (soft), 10 build/h (soft), vietato per SaaS | ❌ **non adatto a questa app** (API route + server) — il sito resta su Vercel |

## §3 — Volumi: quanto peserebbe la raccolta in background

Ipotesi di calcolo (prudenziali): 1 riga `UsagePoint` + ~6 righe `ModelUsagePoint`
per rilevazione, ~150–200 B/riga; letture stimate = collector (~50 righe/rilevazione)
+ dashboard (~1M righe/mese per finestre storiche su ~100 aperture/mese).

| Cadenza | Corse/giorno | Corse/mese | Scritture Turso/mese | Letture stimate | Storage | Vercel invocazioni | Tempo Actions/mese |
|---|---|---|---|---|---|---|---|
| ogni 5 min | 288 | 8.755 | ~61.300 (**0,61%** di 10M) | ~1,4M (0,3% di 500M) | ~9,6 MB/mese → 5 GB = **43 anni** | 0,88% di 1M | ~14,6 h |
| **ogni 15 min** ⭐ | 96 | 2.918 | ~20.400 (**0,20%**) | ~1,1M (0,2%) | ~3,2 MB/mese → **130 anni** | 0,29% | ~4,9 h |
| ogni ora | 24 | 730 | ~5.100 (0,05%) | ~1,0M (0,2%) | ~0,8 MB/mese → **519 anni** | 0,07% | ~1,2 h |

**Conclusione**: né Turso né Vercel sono un problema — anche a 5 minuti si consuma
meno dell'1% di ogni budget mensile. La gestione della ritenuta/downsampling esiste
già (I68 bucket orari, I111 manutenzione con ritenuta). **L'unico vincolo duro è
chi fa lo scheduling**: il cron Hobby gira una volta al giorno, quindi la raccolta
continua richiede uno schedulatore esterno.

## §4 — Opzioni di scheduling

| Opzione | Costo | Precisione | Note |
|---|---|---|---|
| **A. GitHub Actions `schedule`** ⭐ | gratis (repo pubblico) | min 5 min, best-effort (ritardi sotto carico, run persi possibili) | log pubblici (secrets mascherati da GitHub); disattivazione a 60 giorni di inattività — il repo è attivo; `workflow_dispatch` come fallback manuale |
| **B. cron-job.org** | gratis (fino a 60 esecuzioni/ora, cioè 1 al minuto) | più puntuale di Actions | dipendenza da servizio esterno; endpoint pubblico + secret |
| **C. Vercel Cron Hobby** | gratis | 1 volta/giorno (±59 min) | resta per la manutenzione (I111) e per un eventuale recupero giornaliero |
| D. Vercel Pro | $20/mese per utente | al minuto | non necessario per questo caso |

La raccomandazione è **A (o A+C)**: lo scheduler vive nel repo stesso, gratis nel
repo pubblico già previsto da docs/12 §5, e la cadenza a 15 minuti è più che
sufficiente per la risoluzione dei grafici (bucket orari I68).

## §5 — Architettura consigliata (per una futura implementazione, es. I140+)

1. **Nuova route `/api/raccolta`**: riusa la logica del proxy esistente (retry I51 +
   fallback I18), chiama MiniMax e scrive su Turso riutilizzando l'upsert già
   presente in `/api/history`.
2. **Decisione di progetto**: la chiave MiniMax dovrebbe esistere anche **lato
   server** (variabile d'ambiente Vercel) — oggi vive solo nel browser per scelta di
   sicurezza. Il segreto non attraversa mai le risposte; l'endpoint è protetto da
   header con token dedicato (stile guard I95: `RACCOLTA_TOKEN`).
3. **Idempotenza**: controllo del timestamp dell'ultimo punto (skip se troppo
   recente) — assorbe ritardi e doppi trigger di Actions, e rende il cron giornaliero
   un fallback innocuo.
4. **Workflow GitHub Actions** (`.github/workflows/raccolta.yml`): `*/15 * * * *` →
   `curl` con `Authorization: Bearer ${{ secrets.RACCOLTA_TOKEN }}` — pochi secondi
   reali per corsa, ~5 h/mese complessivi (§3): gratis in repo pubblico.
5. **Polling client invariato**: con l'upsert su chiave temporale, browser e
   collector sono fonti complementari senza duplicati.

## §6 — Risposta alla domanda «ospitare su GitHub»

- **Repo pubblico per il codice**: nessun limite di traffico rilevante; la
  pubblicazione è già pronta (docs/12 §5 — resta la decisione dell'utente).
- **GitHub Pages non c'entra**: l'app è dinamica (API route, proxy, Turso) — Pages
  è hosting statico e vieta il SaaS. Il sito resta su Vercel.
- **GitHub Actions**: nei repo pubblici i runner standard sono gratuiti e
  illimitati (6 h/job); in un repo privato il collector consumerebbe l'allowance
  incluso del piano Free — un motivo in più per il repo pubblico.

## §7 — Fonti (consultate il 05/11/2026)

- Vercel — Cron Jobs usage & pricing: <https://vercel.com/docs/cron-jobs/usage-and-pricing>
- Vercel — Hobby Plan: <https://vercel.com/docs/plans/hobby>
- Vercel — changelog cron 100/progetto (20/01/2026): <https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan>
- Turso — pricing: <https://turso.tech/pricing>
- Turso — blog «The New Developer Plan»: <https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan>
- GitHub — Actions limits: <https://docs.github.com/en/actions/reference/limits>
- GitHub — Actions billing and usage: <https://docs.github.com/en/actions/concepts/billing-and-usage>
- GitHub — Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- GitHub — community discussion #210044 (schedule best-effort, disattivazione a 60 giorni):
  <https://github.com/orgs/community/discussions/210044>
- cron-job.org: <https://cron-job.org/en/>

## §8 — Provenienza e autorizzazione

**Domanda dell'utente (verbatim, 05/11/2026)**:

> «se nessuno consulta la pagina web del progetto, i dati di utilizzo non si
> aggiornano da soli in bakground al momento, giusto? cosa bisognerebbe fare per
> poter fare in modo di raccogliere i dati in background senza riempire i servizi
> tier free del database oppure i limiti free di vercel? se il progetto lo ospito su
> github in un repo pubblico ho dei limiti di funzionamento / traffico. fai una
> ricerca e forniscimi un resocondo»

**Autorizzazione a documentare (verbatim, 05/11/2026)**:

> «documenta questa analisi in docs/13-analisi-raccolta-background.md ed aggiorna la
> documentazione del progetto»

I139 documenta l'analisi e allinea la mappa della documentazione (README, docs/04 §8);
**non introduce alcun codice di raccolta**: l'eventuale implementazione (route +
workflow + segreti) resta descritta in §5 e sarà un item futuro su autorizzazione
dell'utente — coerente col ciclo «suggerimento → autorizzazione → implementazione».
