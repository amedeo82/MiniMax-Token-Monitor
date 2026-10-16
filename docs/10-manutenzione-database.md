# 10 — Procedure di manutenzione del database (anti-rottura e quota Turso)

*Stato: implementato (I111, 17/10/2026). Riferimenti nel codice: `src/lib/manutenzione-db.ts`,
`src/app/api/manutenzione/route.ts`, `src/app/api/manutenzione/cron/route.ts`, `vercel.json`.*

## 1. Scopo

Dal 16/10/2026 (I110) la persistenza duratura del progetto è il database Turso cloud: i dati
sopravvivono a istanze, ridistribuzioni e restart. Questo documento definisce le procedure che
tengono quel database **sano** e **dentro la quota del piano gratuito**, perché ci sono due modi
concreti in cui «si rompe» senza manutenzione:

1. **Rottura per salute**: corruzione del file, schema incompleto su istanze fredda (la classe
   dei bug I107-fix/fix2/fix3/fix4) o guasti del motore non osservati — diventano 500 sulle API
   e pannelli in errore. La manutenzione misura integrità (`PRAGMA quick_check`) e dimensioni
   in modo continuativo, così un degrado si vede PRIMA che diventi un 500.
2. **Rottura per quota**: il free tier Turso limita storage, letture e scritture mensili;
   al superamento **le query falliscono** (errore `BLOCKED` — docs Turso «Usage & Billing»),
   cioè esattamente la classe di guasto vista su Vercel. La manutenzione misura lo storage
   (esatto), stima la velocità di scrittura (proiezione onesta) e preleva oltre la ritenuta
   con una pulizia programmata, così la quota non si esaurisce «in silenzio».

La manutenzione è una **rete di sicurezza che gira anche quando il traffico cessa**: le pruning
on-write delle route (I16/I27/I68/I82) puliscono solo quando arrivano nuove scritture; il cron
notturno (P1) pulisce e verifica comunque, ogni notte.

## 2. Limiti del piano gratuito Turso (fonti datate 16/10/2026)

Fonti: `turso.tech/pricing`, blog «Turso Cloud Debuts the New Developer Plan» (19/3/2025),
`freetiers.com/directory/turso` (25/12/2025), `docs.turso.tech/help/usage-and-billing`
(consultate 16–17/10/2026). **La fonte fa fede sul NUMERO, non sulla data di ricerca**: se Turso
cambia i limiti, aggiornare `LIMITI_TURSO_FREE` in `src/lib/manutenzione-db.ts` e questa tabella.

| Risorsa | Limite free | Note |
|---|---|---|
| Storage totale | **5 GB** | Misurato via `dbstat` a pagine di 4 KB; cancellare righe NON restituisce byte senza `VACUUM` |
| Row read / mese | **500 milioni** | Un `COUNT(*)`/aggregato scansiona ogni riga considerata; `SELECT 1` conta 1 read; full scan = 1 read/riga |
| Row write / mese | **10 milioni** | Insert E update; le righe toccate da una transazione ABORTITA contano comunque |
| Database / account | **100** | — |
| Embedded Sync / mese | 3 GB | Non usato dal progetto (repliche embedded in backlog, docs/09 §10) |
| Point-in-time restore | 1 giorno | Finestra di backup/ripristino piattaforma |

Fatti operativi rilevanti (stessa fonte «Usage & Billing»):

- **`VACUUM` è attualmente DISABILITATO su Turso**: dopo cancellazioni le pagine restano
  allocate nella freelist (riutilizzabili ma non restituite). La crescita si governa con la
  RITENUTA, non con il VACUUM: la ritenuta mantiene il footprint quasi costante perché le nuove
  righe riutilizzano le pagine liberate. Sul motore nativo (locale) il VACUUM funziona ed è
  verificato dalla suite; se un server lo rifiuta, l'errore torna onesto nel rapporto (P4).
- Le tabelle interne (`sqlite_*`, `dbstat`) NON generano row read: le misure della manutenzione
  via `PRAGMA` (page_count/page_size/freelist_count) sono praticamente gratuite in quota.
- Oltre quota una metrica, le query falliscono con `BLOCKED`: le altre metriche restano usabili.

## 3. Come è fatta nel progetto

Quattro pezzi, tutti già coperti da test (§8):

| Pezzo | Ruolo |
|---|---|
| `src/lib/manutenzione-db.ts` | Unità pura (pattern I106/I107: il client arriva come parametro, nessun import del singleton): misura storage, statistiche per tabella, integrità, politica di ritenuta da ambiente con clamp, valutazione quota, proiezione scritture, pulizia con `dryRun`, VACUUM con degrado onesto, orchestratore `eseguiManutenzioneDb`, formato `formattaBytes` it-IT deterministico |
| `GET /api/manutenzione` | **Solo lettura, senza chiave** (stesso perimetro di `/api/persistenza`): rapporto completo — storage, quota (livello ok/attenzione/critica), integrità, statistiche con velocità 24 h, proiezione mensile scritture, politica attiva. Zero scritture dimostrato dalla suite |
| `POST /api/manutenzione` | Azioni protette dalla guardia I95 (`ADMIN_TOKEN` + rate limit): `{"azione":"pulizia"}` (DELETE ritenuta+cap, quota rivalutata a fine), `{"azione":"vacuum"}` (prima/dopo misurati, byte recuperati), `{"azione":"manutenzione"}` (ciclo completo, VACUUM automatico solo se la pulizia ha eliminato) |
| `GET /api/manutenzione/cron` + `vercel.json` | Cron notturno **02:30 UTC** (Vercel invia `Authorization: Bearer $CRON_SECRET`): ciclo completo con pulizia reale. Senza `CRON_SECRET` → **403 onesto** (un endpoint che cancella non può essere aperto al pubblico); Bearer sbagliato → 401 timing-safe |

Vincoli trasversali: il gate `preparaSchema(db)` (I107-fix4) precede ogni misura/scrittura; SQL
sempre parametrizzato; nomi di tabella SEMPRE literal (un identificatore interpolato in un tagged
template verrebbe trattato come parametro); nessun segreto attraversa mai le risposte (della
configurazione compaiono solo i numeri della politica).

## 4. Le due codifiche dei DateTime (lezione I111, probe empirica)

Nel database convivono DUE codifiche dei DateTime, e ignorarle è il bug più insidioso della
manutenzione (la prima stesura della lib lo conteneva; la suite e2e lo ha beccato):

- **INTEGER (epoch ms)** — scritto dal motore Prisma tramite client tipizzato:
  `UsagePoint`, `DownsampledPoint`, `UsageEventRecord` (upsert delle route I16/I27/I68).
- **TEXT ISO 8601** — scritto dall'SQL raw di produzione con `toISOString()` esplicito:
  `ModelUsagePoint` (lib I42) e le righe importate a mano.

In SQLite il confronto tra tipi mescola l'ordinamento: **numeric < text SEMPRE**. Con un solo
tipo di cutoff, quindi, o ogni riga INTEGER sembra vecchia (cutoff ISO) o ogni riga TEXT sembra
recente (cutoff ms). Tutti i confronti temporali della lib sono quindi **duali**:

```sql
("t" < ${cutoffMs} AND typeof("t") = 'integer') OR ("t" < ${cutoffIso} AND typeof("t") = 'text')
```

Probe di riferimento: `scripts/verifiche/probe-i111-datetime.ts` (dimostra le due codifiche e il
confronto corretto). Ogni tabella è omogenea in produzione (scritta da UN solo percorso), ma la
condizione duale copre anche il caso misto (import/backfill), coperto dalla suite e2e.

## 5. Le procedure

### P1 — Cron notturno automatico (anti-rottura + anti-quota)

`vercel.json` programma `GET /api/manutenzione/cron` alle **02:30 UTC ogni giorno**. Setup
(una tantum, dashboard Vercel): impostare `CRON_SECRET` (qualsiasi valore lungo casuale) nelle
Environment Variables e ridistribuire. Vercel invia l'header `Authorization: Bearer <CRON_SECRET>`
alle invocazioni del cron. Il ciclo notturno: misura → integrità → quota → statistiche →
**pulizia reale** di ritenuta+cap → VACUUM automatico solo se la pulizia ha eliminato righe.
Disattivare SOLO la cancellazione (lasciando la verifica di salute) con
`MANUTENZIONE_AUTO_PULIZIA="0"`: utile quando si sta importando storico vecchio che si vuole
conservare. Il cron gira anche con zero traffico: la dimensione resta delimitata comunque.

### P2 — Integrità del file (`PRAGMA quick_check`)

`quick_check` rileva corruzione strutturale prima che diventi un 500. È inclusa in OGNI
rapporto (GET, POST, cron) finché il database è sotto `SOGLIA_OMISSIONE_INTEGRITA_BYTES`
(512 MiB): oltre, la verifica è OMESSA nelle richieste interattive (legge l'intero file: sarebbe
lenta e costosa in row read) e il rapporto lo dichiara con il motivo. Esito atteso: `ok`.
Qualunque altro esito → §7 escalation.

### P3 — Ritenuta e cap FIFO (tenere le dimensioni delimitate)

Default allineati alle pruning on-write già in produzione: punti/bucket/modelli **90 giorni**,
eventi **180 giorni**; cap FIFO **10.000** punti, **10.000** punti-modello, **5.000** eventi
(conservate le più recenti, stesso `ORDER BY t DESC, id DESC` delle pruning I16/I27/I82). La
pulizia elimina oltre ritenuta E oltre cap, è IDEMPOTENTE (seconda passata = zero righe) e ha
`dryRun` che conta senza eliminare (§7). Con i cap in vigore il footprint è limitato per
costruzione: ~25.000 righe × ~150 byte ≈ **pochi MB**, molto sotto i 5 GB (§9).

### P4 — Storage e freelist (cosa recupera davvero il VACUUM)

`misuraDimensioneDb` misura `page_count × page_size` (byte allocati, la base della quota
storage) e `freelist_count` (pagine libere riutilizzabili ma ANCORA allocate). Dopo cancellazioni
consistenti il VACUUM riscrive il file e restituisce i byte al servizio: sul motore nativo
funziona (verificato dalla suite e2e), **su Turso è dichiarato disabilitato dalla piattaforma
(§2)** — se il server lo rifiuta, l'errore è one-to-one nel rapporto e la manutenzione prosegue.
In ogni caso il POST «vacuum» misura prima/dopo e dichiara i byte recuperati: il numero dice
sempre la verità di quel database.

### P5 — Monitoraggio della quota storage (livelli ed escalation)

Il rapporto classifica lo storage: `ok` sotto l'80% del limite, `attenzione` 80–90%, `critica`
oltre il 90% (soglie configurabili, §6). Livelli nel GET del pannello → §7 escalation.

### P6 — Proiezione delle scritture (quota NON misurabile da dentro)

Letture e scritture reali del mese sono contatori DI PIATTAFORMA (dashboard Turso → Usage):
nessuna query interna può leggerli. La manutenzione STIMA la velocità di scrittura dalle righe
create nelle ultime 24 h × 30, con nota onesta: è una **sotto-stima** (esclude upsert in
conflitto e merge dei bucket, che contano come write). Serve come allarme di TENDENZA: se la
proiezione cresce verso il milione/mese, ridurre la frequenza di campionamento (il dedup via
upsert già evita i duplicati). Escalation: attenzione → verificare il campionamento e la
ritenuta; critica → pulizia immediata (POST «manutenzione») e lettura dei contatori reali nel
dashboard Turso prima di ogni altra azione.

## 6. Configurazione (env, default e clamp)

Tutte le politiche si leggono dall'ambiente con default sicuri e clamp: un valore insensato non
può disarmare la manutenzione né svuotare l'archivio (mai «cancella tutto»).

| Variabile | Default | Limiti (clamp) | Significato |
|---|---|---|---|
| `MANUTENZIONE_RETENTION_PUNTI_GIORNI` | 90 | 1–3650 | Ritenuta `UsagePoint` |
| `MANUTENZIONE_RETENTION_BUCKET_GIORNI` | 90 | 1–3650 | Ritenuta `DownsampledPoint` |
| `MANUTENZIONE_RETENTION_EVENTI_GIORNI` | 180 | 1–3650 | Ritenuta `UsageEventRecord` |
| `MANUTENZIONE_RETENTION_MODELLI_GIORNI` | 90 | 1–3650 | Ritenuta `ModelUsagePoint` |
| `MANUTENZIONE_MAX_PUNTI` | 10.000 | 100–1.000.000 | Cap FIFO `UsagePoint` |
| `MANUTENZIONE_MAX_EVENTI` | 5.000 | 100–1.000.000 | Cap FIFO `UsageEventRecord` |
| `MANUTENZIONE_MAX_MODELLI` | 10.000 | 100–1.000.000 | Cap FIFO `ModelUsagePoint` |
| `MANUTENZIONE_QUOTA_STORAGE_BYTES` | 5.368.709.120 (5 GiB) | 1 MiB–1 TiB | Limite per la valutazione quota |
| `MANUTENZIONE_SOGLIA_ATTENZIONE` | 80 | 1–100 (% ) | Livello «attenzione» |
| `MANUTENZIONE_SOGLIA_CRITICA` | 90 | 1–100 (%) | Livello «critica» |
| `MANUTENZIONE_AUTO_PULIZIA` | 1 (attiva) | `"0"` = off | Disarma SOLO la cancellazione del cron (P1) |
| `CRON_SECRET` | — | consigliato ≥ 32 caratteri casuali | Abilita il cron (Vercel lo invia come Bearer) |

## 7. Runbook operativo

Verifica puntuale (pannello o CLI):

```bash
# Rapporto completo, solo lettura, senza chiave:
curl -s https://<deployment>/api/manutenzione | python3 -m json.tool

# Cosa eliminerebbe la pulizia, SENZA eliminare nulla (dryRun a livello lib):
# la probe scripts/verifiche/verifica-i111-*.ts mostra il percorso; su produzione
# il POST è l'azione reale — usare il GET per il rapporto e i conteggi.

# Pulizia reale (richiede ADMIN_TOKEN se impostato sul server):
curl -s -X POST https://<deployment>/api/manutenzione \
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"azione":"manutenzione"}'

# Solo VACUUM (byte recuperati dichiarati):
curl -s -X POST https://<deployment>/api/manutenzione \
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"azione":"vacuum"}'
```

Checklist:

- **Ogni giorno (automatico)**: il cron P1 gira alle 02:30 UTC; in Vercel → Deployments →
  Functions si vede l'invocazione e l'esito (un 401/403 ripetuto = `CRON_SECRET` mancante o
  ruotato solo da una parte).
- **Ogni settimana**: leggere il rapporto GET — `quota.livello` deve stare «ok»,
  `integrita.esito` = `ok`, `proiezione.stimateMese` sotto il 10% del limite mensile.
- **Se livello = attenzione**: verificare il campionamento (P6), valutare di stringere la
  ritenuta (§6), post «pulizia».
- **Se livello = critica**: POST «manutenzione» immediato; leggere i contatori REALI nel
  dashboard Turso (Usage); se `integrita.esito` ≠ `ok`, smettere di scrivere e ripristinare dal
  point-in-time restore della piattaforma (finestra 1 giorno sul free).
- **Backup**: sul free la piattaforma offre point-in-time restore a 1 giorno; per una copia
  fuori piattaforma, `turso db export`/dump periodico documentato nella sessione di riga di
  comando (il file esportato è un SQLite normale, riapribile in locale).

## 8. Verifiche (cosa dimostra la suite)

- `tests/lib/database-manutenzione.test.ts` (14 test): funzioni pure (soglie, clamp, proiezione,
  formato it-IT deterministico senza dipendere dai dati ICU — lezione I107), semantica su client
  finto (dryRun = zero DELETE; DELETE di ritenuta+cap con i cutoff giusti; VACUUM riuscito e
  rifiutato con errore onesto; orchestratore con VACUUM auto/mai/sempre), e **motore reale** su
  file temporaneo (pattern I107-fix3): ritenuta che elimina davvero le righe vecchie di ENTRAMBE
  le codifiche (INTEGER del motore + TEXT dell'SQL raw), cap FIFO che conserva le più recenti,
  PRAGMA misurabili, quick_check ok, ciclo completo end-to-end e idempotenza.
- `tests/lib/api-manutenzione.test.ts` (12 test): contratto del GET (rapporto completo e prova
  dimostrabile di assenza scritture: zero `$executeRaw`, `$executeRawUnsafe` solo DDL del gate —
  mai VACUUM/DELETE), POST con zod (400 su corpo/azione invalidi), guard I95 (401 senza header
  quando `ADMIN_TOKEN` è attivo), le tre azioni (DELETE per tabella, VACUUM prima/dopo con
  `recuperati`, ciclo completo), degrado onesto del VACUUM rifiutato; cron con 403 onesto senza
  `CRON_SECRET`, 401 con Bearer sbagliato (token mai restituito), 200 con pulizia automatica e
  kill-switch `MANUTENZIONE_AUTO_PULIZIA="0"` che disarma solo la cancellazione.

## 9. Stime e onestà dei limiti

- **Letture/scritture reali del mese**: contatori di PIATTAFORMA (dashboard Turso → Usage) —
  nessuna query interna può leggerli. La proiezione della lib (24 h × 30) è una stima di
  tendenza, SOTTOSTIMATA per costruzione (esclude upsert in conflitto e merge dei bucket).
- **Velocità di crescita (righe ultime 24 h)**: stima anch'essa — le righe nate solo dal DEFAULT
  `CURRENT_TIMESTAMP` del DDL (formato «spazio», senza «T») cadono fuori da entrambe le forme del
  confronto duale; nel progetto tutte le righe passano da Prisma o da SQL raw con ISO, quindi la
  copertura è completa, ma il rapporto la dichiara comunque come stima.
- **Scala reale**: con i cap P3 l'archivio è limitato a ~25.000 righe (pochi MB): la quota
  storage è marginale al 99%+, e la frequenza di campionamento attuale (punti al minuto, dedup
  via upsert) vale ~0,5% delle scritture mensili. Le procedure esistono perché i limiti si
  avvicinano in silenzio: il cron li tiene osservati ogni notte, senza fiducia implicita.
- **Cosa NON copre la manutenzione**: la quota row READ delle query della dashboard (limit alti
  sulle GET di archivio scansionano righe reali) — mitigata dai limit di default e monitorabile
  solo nel dashboard Turso; e le write di piattaforme esterne (nessuna: il progetto è l'unico
  scrivente sul database).
