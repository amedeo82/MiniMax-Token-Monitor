# 09 — Analisi database alternativi: confronto locale/cloud e strada consigliata (I107–I108)

> **Storia**: creato il 15/10/2026 a valle della richiesta utente «effettuare delle ricerche
> su altri tipi di database alternativi, documentare i risultati di queste ricerche
> all'interno del progetto e aiutarmi a scegliere quale strada intraprendere per utilizzare
> il modello di database migliore per il nostro progetto. In questo modo, se il progetto
> verrà utilizzato in locale probabilmente avremo un database locale, se il progetto verrà
> utilizzato nel cloud sicuramente utilizzeremo un database cloud». Analisi condotta in
> SOLA LETTURA sul codice (nessuna modifica applicativa) più **ricerca web datata
> 15/10/2026**; le affermazioni di mercato (tier, prezzi, stato dei prodotti) citano fonte
> e data nel testo, l'elenco completo delle URL è in §9. La numerazione prosegue il
> registro di `docs/04` §3 (ultimo item: I106) con la convenzione di `docs/07`/`docs/08`:
> le proposte ricevono un numero prima dell'implementazione.
>
> Stato: **strada primaria confermata (D1), I107 IMPLEMENTATO il 15/10/2026 come
> primo item dell'Ondata 4 (D2)** — I108 resta porta pronta in backlog (D3),
> l'osservatorio Turso Sync/MCP è confermato (D4). **16/10/2026: Turso Sync/embedded
> replicas promosso a PROPOSTA DEDICATA I109 con verifica empirica locale (§10,
> 7/7 PASS) — decisione D5 APERTA in §8.** Registro completo in §8.

---

## 1. Il punto di partenza: cosa I106 ha già risolto

Dal 15/10/2026 (Ondata 3) la persistenza server del progetto è **portabile per
costruzione**: `src/lib/db-factory.ts` seleziona il motore dall'AMBIENTE — con
`TURSO_DATABASE_URL` presente il client Prisma parte con il driver adapter
`@prisma/adapter-libsql` verso Turso (o qualsiasi URL libsql, `file:` compreso); con le
env assenti usa il PrismaClient nativo su SQLite. Sviluppo locale e CI restano IDENTICI
al pre-I106, lo schema è unico e l'SQL raw parametrizzato (`server-model-history.ts`)
passa da entrambi i motori perché usa costrutti standard (`ON CONFLICT … DO UPDATE`,
identificatori quotati, segnaposto gestiti dal driver via `Prisma.sql`/`Prisma.join`).

Questa architettura è il criterio guida dell'intera analisi: **qualsiasi strada futura
deve insediarsi nella factory esistente** (un ramo in più guidato dall'ambiente), non
sostituirla. Il problema «Vercel + SQLite effimero» che motivava I106 è già risolto
sulla via Turso; la presente analisi risponde alla domanda successiva: *è il modello di
database giusto, o esiste una strada migliore per locale e per cloud?*

## 2. Profilo dati e vincoli del progetto (i criteri veri)

Un confronto di database senza il profilo del carico è retorica. Il profilo misurato
del monitor (fonte: `prisma/schema.prisma`, `settings-dialog.tsx`, `server-model-history.ts`):

| Dimensione | Valore nel progetto | Implicazione |
|---|---|---|
| Tabelle | 4 semplici (`UsagePoint`, `DownsampledPoint`, `UsageEventRecord`, `ModelUsagePoint`) | Nessun join complesso, nessuna relazione profonda |
| Volume | ≤ 10.000 punti + ≤ 5.000 eventi + storico per-modello, pruning 90 giorni | **~1–2 MB** di dati allo stato pieno: ogni tier gratuito è sovradimensionato |
| Scritture | default 1 rilevazione/minuto (≈ 1.440/giorno, ~200k/mese al massimo con multi-modello ed eventi) | ~0,02% del free tier Turso (10M scritture/mese) |
| Letture | burst da dashboard/export mentre la pagina è aperta | Nessun problema di throughput |
| Runtime | Next.js standalone su Vercel (serverless, connessioni effimere) + `bun`/node locale | La connessione deve reggere il serverless: driver HTTP o adapter |
| Utenti | monitor personale a singolo utente (chiave nel browser, `ADMIN_TOKEN` opzionale) | Zero multi-tenant: semplicità operativa > scalabilità |

Da qui i **sette criteri** usati nella matrice (§5), con il loro peso motivato:

- **C1 — Fit serverless**: connessioni che sopravvivono all'effimero (driver HTTP/adapter,
  pooling) o blocchi TCP gestiti. Peso massimo per la via cloud.
- **C2 — Delta di dialetto**: quanto codice/schema cambia rispetto all'attuale famiglia
  SQLite (schema unico, SQL raw incluso). Peso massimo per il costo di migrazione.
- **C3 — Supporto Prisma**: adapter ufficiale (stessa major del client 6.19) vs community.
- **C4 — Tier gratuito e trasparenza**: ampiezza rispetto al profilo (banale) MA anche
  comportamento (pause, sospensioni) — dove un monitor che dorme una settimana può
  trovarsi il database freddo.
- **C5 — Semplicità operativa**: backup, migrazioni, dashboard, zero config.
- **C6 — Via locale senza servizi esterni**: il requisito esplicito dell'utente
  («locale → database locale»): un file, nessun daemon obbligatorio.
- **C7 — Rischio di piattaforma**: longevità del prodotto, lock-in, direzione strategica
  (acquisizioni, riscritture, feature rimosse dai tier).

## 3. Mappa dei candidati esaminati

Esaminati **10 candidati in 3 famiglie**; le schede dettagliate sono in §4, la matrice
in §5. Esclusi a priori (fuori profilo, con motivazione a margine di §4.9): DuckDB
(analitico OLAP, non OLTP), RxDB/IndexedDB (client-side, il browser ha già localStorage),
Xata (non approfondito: pivot di prodotto recente, nessun vantaggio rispetto ai PG
serverless già in lista).

| Famiglia | Candidato | Ruolo candidato nel progetto |
|---|---|---|
| SQLite/libSQL | 1. SQLite nativo | Locale (DEFAULT ATTUALE) |
| SQLite/libSQL | 2. libSQL `file:` via adapter | Locale (alternativo già supportato da I106) |
| SQLite/libSQL | 3. **Turso Cloud** | Cloud (GIÀ IMPLEMENTATO, I106) |
| SQLite/libSQL | 4. Turso Sync / embedded replicas | Ibrido locale↔cloud |
| SQLite/libSQL | 5. Cloudflare D1 | Cloud (alternativo, vincolato a Workers) |
| Postgres | 6. PGlite (Postgres in WASM) | Locale (innovativo, adapter community) |
| Postgres | 7. **Neon** | Cloud (alternativo primario tra i PG) |
| Postgres | 8. **Supabase** | Cloud + ecosistema (auth/storage/realtime) |
| Postgres | 9. Vercel Postgres / PG gestito (Railway, Render) | Cloud (nota di mercato) |
| Altri | 10. PlanetScale (MySQL), MongoDB Atlas | Cloud (confronto di completamento) |

## 4. Schede dei candidati (stato 2026 con fonti)

### 4.1 SQLite nativo — la via locale di default (GIÀ ATTIVA)

Il default pre-I106 e tuttora attivo in locale/CI: un file (`db/custom.db`), zero daemon,
zero servizi, backup = copia del file. Con il profilo del progetto (§2) SQLite è
sovradimensionato in prestazioni e affidabilità: è il database più diffuso al mondo,
testato oltre ogni ragionevole dubbio, e Prisma lo supporta in modo nativo senza adapter.
Il suo unico limite — l'effimero su Vercel — è esattamente ciò che I106 ha aggirato con
la factory. Per lo scenario locale richiesto dall'utente NON esiste oggi una ragione
oggettiva per sostituirlo: ogni alternativa locale (PGlite compreso) aggiunge dipendenze
e superficie di errore per lo stesso servizio. **Verdetto: confermato per il locale.**

### 4.2 libSQL `file:` via adapter — locale alternativo, già supportato

Il ramo adattato I106 accetta qualunque URL libsql, `file:` compreso: la stessa via
Turso può puntare a un file locale con il driver `@libsql/client`. Utile come banco di
prova dell'adapter in locale (la verifica I106 scenario A lo fa già su file temporaneo),
ma in produzione locale il client nativo resta preferibile: nessun adapter, nessuna
dipendenza WASM/driver JS a parità di risultato. **Verdetto: già presente, nessuna
azione; resta il meccanismo di test della portabilità.**

### 4.3 Turso Cloud — la via cloud implementata (GIÀ ATTIVA SU I106)

Turso è il servizio cloud di libSQL (SQLite compatibile): schema unico del progetto
INALTERATO, stesso dialetto, driver adapter ufficiale `@prisma/adapter-libsql` allineato
alla major del client (lezione I106: adapter 7.x richiede Prisma 7 — le versioni vanno
allineate a 6.19.3). Tier gratuito 2026: **100 database, 5 GB storage, 500 milioni di
letture e 10 milioni di scritture/mese** (turso.tech/pricing, consultato 15/10/2026);
piano Developer a $4,99/mese. Confronto col profilo: ~200k scritture/mese al massimo ≈
2% del free tier. Due avvertenze di mercato documentate: (a) nel 2025 il free tier ha
perso edge replication, schema databases e attach (r/nextjs) — nessuna delle tre usata
dal progetto; (b) la roadmap è movimentata: riscrittura di SQLite in Rust («Limbo»,
dicembre 2024) e **acquisizione di Turso da parte di Supabase annunciata il 21/1/2025**
(turso.tech). L'acquisizione, paradossalmente, RIDUCE il rischio di questa strada: converge
esattamente verso l'ecosistema Supabase che l'utente citava, mantenendo il dialetto
SQLite. **Verdetto: confermato come via cloud primaria.**

### 4.4 Turso Sync / embedded replicas — l'ibrido locale↔cloud

Gli embedded replicas mantengono una copia locale in lettura del database Turso Cloud:
letture dal file in microsecondi, scritture inoltrate al primario cloud (docs.turso.tech).
Da aprile 2026 Turso raccomanda la successiva API «Turso Sync» (turso.tech, 24/4/2026).
Per il progetto è la risposta naturale alla domanda «locale O cloud?»: **è entrambi** —
sviluppo locale velocissimo sul file, sincronizzazione col cloud quando si è online.
COSTO: riportare la logica nel ramo libsql della factory (l'adapter libsql client
supporta `sync()`), gestione dei conflitti offline→online da documentare, e feature
storicamente soggetta a cambiamenti di tier (vedi 4.3). **Verdetto: candidato valido
per un futuro I11x, NON bloccante ora: la via Turso semplice già risolve il cloud.**

### 4.5 Cloudflare D1 — scartato (vincolo di piattaforma)

D1 è SQLite serverless di Cloudflare con replica globale in lettura e «time travel»
backup: tecnicamente affascinante e sulla NOSTRA famiglia di dialetto, con adapter
Prisma ufficiale `@prisma/adapter-d1` (provider sqlite; docs Prisma v6; tutorial
Cloudflare 10/8/2026). Ma è progettato per il runtime Workers: usarlo da Next.js su
Vercel significherebbe interrogare D1 via HTTP REST con criticità documentate — senza
transazioni interattive e con limitazioni SQL (no ENUM; dev.to, 6/12/2024) — oppure
migrare l'intera app su Workers (cambio di piattaforma non richiesto). **Verdetto:
scartato; rivalutabile solo se il deployment migrasse su Cloudflare.**

### 4.6 PGlite — Postgres in WASM: il candidato tecnologico di punta per il locale

PGlite è un build WASM di Postgres 17 che gira in-process in browser/Node/Bun/Deno
(github.com/electric-sql/pglite; pglite.dev): un Postgres VERO in un file, con estensioni
(pgvector incluse). Adozione 2026 rilevante: **10 milioni di download npm a settimana**
(electric.ax, 25/6/2026). Il suo vantaggio teorico massimo per noi: **un solo dialetto
(Postgres) per locale E cloud** — locale su PGlite, cloud su Neon/Supabase, fine del
doppio schema. Perché NON lo raccomandiamo (per ora): (a) l'integrazione Prisma passa
da adapter di community, non dal set ufficiale — su un progetto il cui protocollo di
verifica è la firma stessa (audit 489 check) è un rischio di manutenzione non proporzionato;
(b) aggiunge un bundle WASM a un'app PWA attenta alle dimensioni; (c) risolve un problema
che il progetto NON ha (SQLite locale funziona benissimo per 1–2 MB). **Verdetto:
candidato serio da tenere sotto osservazione; non selezionato.**

### 4.7 Neon — il PG serverless più aderente al progetto

Postgres serverless «scale to zero» con branching: free tier permanente **0,5 GB di
storage, ~10 branch, 100 compute-hours/mese per progetto** (srvrlss.io, 18/6/2026;
encore.dev, 19/3/2026) e — differenza chiave con Supabase — **nessuna pausa per
inattività documentata sul free tier** (reddit/community 2026): il compute si spegne e
riparte, con cold start breve, senza l'annullamento dei dati. Driver serverless HTTP
via `@prisma/adapter-neon` (preview dietro `driverAdapters` da Prisma 5.4; GitHub
28/8/2026) o `@prisma/adapter-pg` con pooling (stesso adapter usato con Hyperdrive,
docs Cloudflare 21/4/2026). Nota di mercato utile: **il «Vercel Postgres» del
marketplace Vercel è Neon sotto il cofano** — la via Neon è anche la via più «nativa»
per il nostro deployment. COSTO per il progetto: doppio schema Prisma (provider sqlite
↔ postgresql selezionato a build) + porting dell'SQL raw (già quasi portatile, §1) +
variante `db-push` per PG. **Verdetto: il miglior alternativo PG; documentato come
proposta I108, da attivare solo a bisogno.**

### 4.8 Supabase — l'ecosistema, non solo il database

Supabase offre Postgres gestito + auth, storage, realtime, edge functions, dashboard
eccellente. Free tier 2026: **500 MB di database, 1 GB storage, 50k MAU, 5 GB egress,
max 2 progetti attivi** (jetadmin.io, 24/7/2026; supabase.com/pricing) con Pro a $25/mese.
L'avvertenza operativa concreta, multiplo font 2026: **i progetti free si SOSPENDONO
dopo ~1 settimana di inattività del database** (supabase.com/pricing; levelup.gitconnected,
22/4/2026) — per un monitor personale significa: una settimana senza polling e il cloud
si congela; la ripresa richiede un intervento (dashboard o ping). Con il poller attivo
il problema non si manifesta, ma il progetto è pensato anche per dormire (tab nascosta
×4, I100). Come DATABASE puro per il nostro profilo, Neon ha un fit migliore; come
ECOSISTEMA Supabase è insostituibile — e ora è anche la casa di Turso (§4.3). **Verdetto:
alternativo PG documentato (I108, stessa meccanica di Neon), scelto se l'obiettivo
reale è l'ecosistema.**

### 4.9 Vercel Postgres / PG gestito (Railway, Render) e gli esclusi

**Vercel Postgres** è un marketplace integration (Neon/Supabase) con fatturazione
Vercel: comodo, ma non aggiunge nulla a Neon diretto tranne la bolletta integrata —
rilevante solo se si vuole un fornitore unico. **PG gestito** (Railway/Render, TCP)
funziona con Prisma ma soffrirebbe di più sui cold start serverless senza pooling.
**PlanetScale (MySQL)**: tier gratuito Hobby rimosso nell'aprile 2024 e NON ripristinato,
partenza da $5/mese (srvrlss.io, 18/6/2026; dbpro.app, 20/2/2026) + dialetto MySQL =
doppio schema E doppio dialetto: escluso. **MongoDB Atlas**: modello documentale per
dati relazionali per natura relazionali (punti dedup su chiave (model, win, t)) +
dialetto completamente nuovo: escluso. **DuckDB**: analitico OLAP, non per scritture
OLTP al minuto: fuori profilo.

## 5. Matrice di confronto

Valutazione per i criteri del §2 (✅ favorevole · ⚠️ con riserve · ❌ sfavorevole):

| Candidato | C1 serverless | C2 delta dialetto | C3 Prisma | C4 free tier | C5 operatività | C6 via locale | C7 rischio piattaforma | Verdetto |
|---|---|---|---|---|---|---|---|---|
| SQLite nativo (locale) | n/a | ✅ zero | ✅ nativo | n/a | ✅ un file | ✅ ideale | ✅ pubblico dominio | **Confermato locale** |
| libSQL `file:` (locale) | n/a | ✅ zero | ✅ ufficiale | n/a | ✅ | ⚠️ adapter per lo stesso risultato | ⚠️ guida dalla community libSQL | Già presente, test only |
| **Turso Cloud (cloud)** | ✅ HTTP/adapter | ✅ zero | ✅ ufficiale 6.x | ✅ 5 GB / 10M writes | ✅ CLI + dashboard | ✅ (con Sync) | ⚠️ acquisizione Supabase, riscrittura Limbo | **Confermato cloud** |
| Turso Sync/embedded | ✅ | ✅ zero | ⚠️ via libsql client | ✅ | ⚠️ conflitti offline | ✅ ideale | ⚠️ feature in evoluzione | Futuro I11x |
| Cloudflare D1 | ⚠️ REST/Workers | ✅ SQLite | ✅ adapter-d1 | ✅ | ⚠️ | ❌ | ❌ vincolato a Workers | Scartato |
| PGlite (locale) | n/a | ⚠️ PG | ⚠️ community | n/a | ⚠️ WASM | ⚠️ valido ma pesante | ✅ ElectricSQL attiva | Osservatorio |
| **Neon (cloud alt.)** | ✅ driver HTTP | ❌ doppio schema | ⚠️ adapter-neon preview / adapter-pg | ✅ 0,5 GB, no pause | ✅ branching | ❌ (non serve) | ✅ solido, backed Vercel | **I108 documentato** |
| **Supabase (cloud alt.)** | ✅ pooled 6543 | ❌ doppio schema | ✅ adapter-pg | ⚠️ 500 MB + PAUSA 7 gg | ✅ ecosistema ricco | ❌ | ✅ forte, acquisisce Turso | **I108 documentato** |
| Vercel PG / gestito | ⚠️/❌ TCP | ❌ doppio schema | ✅ | ⚠️ | ⚠️ | ❌ | ✅ | Non necessario |
| PlanetScale / Atlas | ✅ | ❌ doppio dialetto | ✅ | ❌ / ⚠️ | ⚠️ | ❌ | ⚠️ | Esclusi |

## 6. I tre scenari d'uso, risolti

### 6.1 Locale (self-host node/bun, Docker, desktop) → database locale

Risposta: **SQLite nativo (già attivo, nessuna azione)**. Il file `db/custom.db` con il
client Prisma senza adapter è la configurazione con meno dipendenze possibile, backup con
un `cp`, e tutte le route/test/audit già la presidiano. Le alternative esaminate non
portano benefici proporzionati: PGlite aggiunge un runtime WASM per offrire Postgres
dove SQLite basta, libSQL `file:` aggiunge un adapter a parità di risultato. Il
requisito utente «locale → database locale» è dunque già soddisfatto dalla
configurazione di default e va DIFESO come default: qualsiasi provider remoto deve
restare opt-in via ambiente, mai precondizione di avvio.

### 6.2 Cloud (Vercel serverless) → database cloud

Risposta: **Turso (già implementato con I106, nessuna azione)** per il percorso
primario; **Neon o Supabase come alternativa PG documentata (I108)** quando — e solo
quando — servisse l'ecosistema Postgres (auth/storage/realtime di Supabase, branching di
Neon, tooling PG). La scelta tra i due PG in un'eventuale attivazione di I108: **Neon** se il
criterio è la continuità del monitor (no pause sul free tier, driver HTTP serverless,
coesistenza naturale con Vercel); **Supabase** se il criterio è la piattaforma completa
(accettando la pausa a 7 giorni sul free, mitigabile con un ping pianificato).
PlanetScale, D1, MongoDB, Vercel-PG diretto: nessun vantaggio netto per questo profilo (§4.9).

### 6.3 Ibrido locale↔cloud (il «sia locale che cloud»)

Risposta futura: **Turso Sync / embedded replicas** (§4.4) — file locale che legge in
microsecondi e replica sul cloud. È l'unico candidato che rende la domanda «locale O
cloud» obsoleta, ed è sulla via già implementata (stesso adapter, stesso dialetto). Va
tenuto nel backlog NON per completezza ma perché il suo costo (gestione offline/conflitti)
merita una proposta dedicata con verifica empirica, quando il bisogno reale si presenterà.

**Nota strategica trasversale** — l'acquisizione di Turso da parte di Supabase
(21/1/2025, turso.tech) compone le due strade apparentemente alternative (SQLite-family
e Postgres-family) in una convergenza: la via primaria del progetto (Turso) e la via
alternativa documentata (Supabase) appartengono ormai allo stesso gruppo. Ciò riduce il
rischio di dover scegliere «contro» un ecosistema: si può partire Turso e, se un giorno
servirà il Postgres pieno, migrare verso Supabase/Neon con I108 senza cambiare fornitore
di fiducia.

## 7. Raccomandazione

**Strada consigliata (a firma dell'analisi): confermare la famiglia SQLite/libSQL come
strada unica, locale e cloud, con i provider PG documentati come alternativa a chiamata.**

Concretamente, in ordine di priorità:

1. **Nessuna migrazione del database.** Locale = SQLite nativo (default attuale),
   cloud = Turso (già implementato I106 e già documentato nel README con i passi
   Vercel). Zero doppio schema, zero doppio dialetto, SQL raw già portabile dentro la
   famiglia, tier gratuiti sovradimensionati per il profilo (§2). Questa risposta
   «non fare» è la scelta a costo zero più robusta dell'intera lista.
2. **I107 — Pannello «Persistenza» in UI — IMPLEMENTATO 15/10/2026 (Ondata 4):**
   esposto nelle impostazioni (tab Dati → «Persistenza server») ciò che
   `modalitaPersistenza()` già sa (modalità attiva locale/turso, URL diagnostica
   senza credenziali), un test di connessione reale (`SELECT 1` con latenza) e i
   conteggi righe per tabella, via `GET /api/persistenza` (read-only, senza
   chiave; host ridotto al solo hostname — mai token nel localStorage né nella
   risposta). Dà all'utente la visibilità del database SCELTO dalle impostazioni
   ambiente — la versione onesta del requisito «impostare il database dall'app»,
   senza mai mettere credenziali nel localStorage (vincolo di sicurezza del
   progetto: la chiave MiniMax resta l'unico segreto del browser). Dettagli in
   `docs/04` §3 (I107). **Fix 15/10 (due ondate, entrambe da report utente sul
   pannello)**: (a) senza `.env` il client nativo esigeva `env("DATABASE_URL")`
   («Environment variable not found») → `urlPersistenzaLocale()` come unica
   fonte di verità con default incorporato assoluto; (b) su Vercel il default
   dal CWD atterrava su filesystem read-only con `db/` assente («Error code 14:
   Unable to open the database file», SQLITE_CANTOPEN — SQLite non crea le
   cartelle) → con `VERCEL=1` il default va in `/tmp/db/custom.db`, la factory
   prepara la directory padre e il pannello dichiara l'EFFIMERO del file locale
   su serverless: la persistenza duratura su Vercel resta la via Turso (env
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`, README §Persistenza); (c) il file
   `/tmp` appena creato era VUOTO («The table `main.DownsampledPoint` does not
   exist») → **schema incorporato nel codice** (I107-fix3): DDL idempotente
   delle 4 tabelle applicato all'avvio su ENTRAMBE le branche con gate
   `preparaSchema` — la D1 «zero migrazione» ora vale ANCHE per un Turso
   appena creato (il db-push esplicito resta documentato ma non è più
   indispensabile); il file resta comunque effimero su serverless. **Fix 4,
   16/10 (report utente: 500 su /api/events, /api/history, /api/history/models)**:
   il gate del bootstrap era atteso SOLO dalla diagnostica e il DDL
   fire-and-forget perdeva la corsa (o veniva rifiutato da un motore freddo:
   «Engine is not yet connected») SENZA riprove — schema parziale per l'intera
   vita dell'istanza, ogni rotta DB a 500. Ora TUTTE le rotte DB attendono
   `preparaSchema(db)` e il bootstrap è RIPROVATO a passate intere (probe
   `verifica-i107-fix4-gate.mjs`: 0/8 senza gate, 8/8 col gate — dettagli in
   docs/04 §3 Fix 4).
3. **I108 — Provider Postgres opzionale Neon/Supabase (proposta, media):** doppio schema
   Prisma selezionato a build (`PRISMA_SCHEMA`/script), ramo PG in `db-factory` con
   `@prisma/adapter-pg` o `@prisma/adapter-neon`, variante `db-push` per PG, verifica
   dedicata + check audit. DA NON IMPLEMENTARE finché non arriva il bisogno concreto
   dell'ecosistema PG: il suo valore è la PORTA PRONTA, non l'apertura immediata.
4. **Backlog osservatorio:** Turso Sync/embedded replicas (ibrido, §6.3 — **promosso
   il 16/10/2026 a proposta dedicata I109 con verifica empirica locale: §10, decisione
   D5 in §8**), PGlite (se l'adapter Prisma diventasse ufficiale), bridge MCP/Composio
   per export verso sistemi esterni (fuori dal percorso dati, valutato nella
   conversazione del 15/10 e NON raccomandato come persistenza primaria per latenza,
   transazioni, dipendenza da terzi e verificabilità CI).

## 8. Registro decisioni (clarify — RACCOLTE il 15/10/2026)

Come da convenzione `docs/08` §7: le proposte ricevono la decisione PRIMA
dell'implementazione. Decisioni espresse dall'utente il **15/10/2026**:
**D1–D4 chiuse**, l'Ondata 4 parte da I107. **16/10/2026: D5 APERTA** —
Turso Sync/embedded replicas promosso a proposta dedicata I109 (§10), in attesa
di decisione utente.

| # | Domanda | Opzioni | Decisione |
|---|---|---|---|
| D1 | Confermi la strada primaria SQLite/libSQL (locale=SQLite nativo, cloud=Turso già implementato) senza migrazione? | (a) sì, confermata · (b) no, voglio la via Postgres come primaria | **(a) CONFERMATA** — zero migrazione, §7.1 in vigore |
| D2 | I107 pannello «Persistenza» in UI: si implementa come primo item dell'Ondata 4? | (a) sì, Ondata 4 · (b) sì, ma più avanti · (c) no | **(a) CONFERMATA** — I107 è il primo item dell'Ondata 4 (**implementato il 15/10/2026**, docs/04 §3) |
| D3 | I108 provider Postgres (Neon o Supabase): si implementa ora o resta porta pronta documentata? | (a) ora, Neon · (b) ora, Supabase · (c) backlog | **(c) BACKLOG** — resta porta pronta documentata (§7.3) |
| D4 | Turso Sync/embedded replicas e bridge MCP/Composio: entrano nel backlog osservatorio (§7.4) o si scartano? | (a) backlog · (b) scartati | **(a) BACKLOG OSSERVATORIO** — confermato (§7.4) |
| D5 | **I109** — Turso Sync/embedded replicas (ibrido locale↔cloud, verifica empirica §10): si implementa ora o resta in backlog? | (a) implementa ora (design §10.4) · (b) resta in backlog osservatorio · (c) scartare | **⏳ APERTA (16/10/2026)** — in attesa di decisione utente |

## 9. Fonti della ricerca web (consultate il 15/10/2026)

- Turso pricing (free tier 100 DB / 5 GB / 500M reads / 10M writes; Developer $4,99):
  <https://turso.tech/pricing> — «Turso - Millions of Databases. One Architecture.»:
  <https://turso.tech>
- Turso free tier changes 2025 (edge replication, schema databases, attach):
  <https://www.reddit.com/r/nextjs/> (thread «Turso Update to free tier»)
- «Turso is joining Supabase» (21/1/2025) e roadmap piattaforma:
  <https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap>
- «Introducing Limbo: A complete rewrite of SQLite in Rust» (10/12/2024):
  <https://turso.tech/blog/introducing-limbo> — stato progetto (GitHub, 2026):
  <https://github.com/tursodatabase/turso>
- «Turso Sync: a much, much, much better way to sync» (24/4/2026):
  <https://turso.tech/blog> — Embedded Replicas (docs):
  <https://docs.turso.tech/features/embedded-replicas>
- Prisma — Database drivers / driver adapters come via standard (ORM v7):
  <https://www.prisma.io/docs/orm/overview/databases/database-drivers>
- Prisma × Neon (adapter-neon, preview driverAdapters): docs
  <https://neon.com/docs/guides/prisma> — issue GitHub 28/8/2026:
  <https://github.com/prisma/prisma/issues>
- Prisma × Cloudflare D1 (adapter-d1, provider sqlite): docs Prisma v6
  <https://www.prisma.io/docs> — tutorial Cloudflare (10/8/2026):
  <https://developers.cloudflare.com/d1/build-with-d1/prisma-orm/> — adapter-pg +
  Hyperdrive (21/4/2026): <https://developers.cloudflare.com/hyperdrive/>
- Limitazioni D1 (no ENUM, no transazioni interattive; 6/12/2024):
  <https://dev.to/> («Cloudflare D1 and Prisma: Not a Good Combination»)
- Neon pricing/free tier (0,5 GB, 10 branch, 100 compute-h/mese; recensioni 2026):
  <https://neon.com/pricing> — <https://www.srvrlss.io/neon-review> (18/6/2026) —
  <https://encore.dev/blog> (19/3/2026)
- Supabase pricing/free tier (500 MB, 2 progetti, pausa ~7 giorni inattività):
  <https://supabase.com/pricing> — <https://www.jetadmin.io/blog/supabase-pricing>
  (24/7/2026) — <https://uibakery.io/blog/supabase-pricing> (19/2/2026) —
  workflow anti-pausa (22/4/2026): <https://levelup.gitconnected.com/>
- PGlite (Postgres in WASM; browser/Node/Bun/Deno): <https://github.com/electric-sql/pglite>
  — <https://pglite.dev> — «PGlite reaches 10 million weekly downloads» (25/6/2026):
  <https://electric.ax/blog>
- PlanetScale pricing (Hobby gratuito rimosso 4/2024, da $5/mese):
  <https://planetscale.com/pricing> — <https://www.srvrlss.io/planetscale-review>
  (18/6/2026) — <https://www.dbpro.app/blog> (20/2/2026)

**Fonti aggiunte per la proposta I109 (consultate il 16/10/2026):**

- «Turso Sync: a much, much, much better way to sync» — benchmark CDC, 312× sync
  più veloci, 18× meno traffico, raccomandazione di migrare da libSQL `sync()` (24/4/2026):
  <https://turso.tech/blog/sync-benchmark>
- «Introducing Databases Anywhere with Turso Sync» (8/10/2025):
  <https://turso.tech/blog/introducing-databases-anywhere-with-turso-sync> —
  guida d'uso Turso Sync: <https://docs.turso.tech/sync/usage>
- `@tursodatabase/sync-browser` (npm, ALPHA «only use for development», 4/9/2025):
  <https://www.npmjs.com/package/@tursodatabase/sync-browser>
- React Native Bindings for Turso — sync cloud via URL+token (29/1/2026):
  <https://turso.tech/blog/react-native-bindings-for-turso>
- «Turso Cloud Debuts the New Developer Plan» — modifiche free tier dal 31/3/2025,
  embedded replicas banda sync 3 GB→10 GB/mese (19/3/2025):
  <https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan>
- `libsql` npm (client nativo: «Embedded, in-app replica that syncs with a remote
  libSQL database», Bun/Deno/Node; 25/3/2026): <https://www.npmjs.com/package/libsql>
- Embedded Replicas (docs ufficiali: letture locali, scritture al primario, `sync()`):
  <https://docs.turso.tech/features/embedded-replicas/introduction> —
  riferimento TS `@libsql/client`: <https://docs.turso.tech/sdk/ts/reference> —
  client repo: <https://github.com/tursodatabase/libsql-client-ts>
- Prisma × Turso (adapter e embedded replicas, ORM v6):
  <https://www.prisma.io/docs/orm/v6/overview/databases/turso> —
  <https://docs.turso.tech/sdk/ts/orm/prisma>

## 10. Proposta I109 — Turso Sync / embedded replicas: l'ibrido locale↔cloud (16/10/2026)

Il §6.3 rinviava Turso Sync a «una proposta dedicata con verifica empirica, quando
il bisogno reale si presenterà». Questa è la proposta: ricerca web datata (§9, fonti
16/10/2026) + **verifica empirica locale senza credenziali** sullo stack già installato.
Numerata **I109** per convenzione (I108 è preso); la decisione è la **D5** (§8) e
l'implementazione parte SOLO dopo il via dell'utente.

### 10.1 Cosa risolverebbe per il progetto

Il requisito utente originario («se il progetto verrà utilizzato in locale avremo un
database locale, se nel cloud un database cloud») è già soddisfatto D1/I106 nei due
scenari separati. L'embedded replica risponde allo scenario RESTANTE: **entrambi
contemporaneamente** — un file SQLite locale che legge in microsecondi e si sincronizza
col primario Turso. Per il monitor: sviluppo locale SUI DATI REALI del cloud (non più
sul solo storico locale), e self-host sempre acceso (VPS/desktop) con latenza di
lettura da file e durabilità del cloud. Profilo dati compatibile per costruzione
(§2: ~1–2 MB, ~200k scritture/mese ≈ 2% del free tier).

### 10.2 Stato dell'arte al 16/10/2026: DUE API in campo, una sola attuabile

1. **Embedded Replicas (libSQL `sync()`)** — la via matura: letture locali dal file,
   scritture inoltrate al primario cloud (write-through, docs.turso.tech). Il client
   TS `@libsql/client` (GIÀ nel progetto via I106) la supporta per costruzione, e il
   client nativo `libsql` 0.3.19 (dipendenza transitiva di @libsql/client 0.8.1,
   verificata in node_modules) porta l'implementazione reale. **Prisma è compatibile
   senza modifiche**: l'adapter ufficiale `@prisma/adapter-libsql` 6.19.3 ha
   `constructor(config: Config)` con `Config` = il Config COMPLETO di `@libsql/client`
   (typings verificati in node_modules — `syncUrl`/`syncInterval` passano dritti).
2. **Turso Sync (nuova API CDC)** — tecnica superiore (blog 24/4/2026: sincronizza
   cambi logici e non pagine fisiche, fino a 312× più veloce e 18× meno traffico) e
   Turso RACCOMANDA la migrazione da libSQL `sync()`. MA: i client JS della nuova
   generazione sono giovani (`@tursodatabase/sync-browser`, 4/9/2025, ALPHA «only use
   for development») e **Prisma non ha adapter per il runtime Turso Database**
   (riscrittura Rust di SQLite): usarla oggi significherebbe uscire dallo stack Prisma,
   violando il criterio C3 (§2) che ha guidato tutta l'analisi. **Verdetto di questa
   scheda: embedded replicas via `@libsql/client` è l'unica via attuabile ORA; Turso
   Sync (CDC) resta il riferimento futuro da rivalutare quando Prisma offrirà un
   adapter per il runtime Turso.**

Nota di tier: edge replication è stata RIMOSSA dal free tier (gen 2025, §4.3) ma gli
embedded replicas NO — il Developer Plan (19/3/2025) ne ha anzi alzato la banda sync
da 3 a 10 GB/mese. La feature è viva e supportata; resta storicamente «in movimento»
(R2 in §10.5).

### 10.3 Verifica empirica locale (16/10/2026, zero credenziali) — 7/7 PASS

Script: `scripts/verifiche/verifica-i109-turso-sync.mjs` (run: `node
scripts/verifiche/verifica-i109-turso-sync.mjs`), stack misurato: `@libsql/client`
0.8.1, `@libsql/core` 0.8.1, nativo `libsql` 0.3.19, `@prisma/adapter-libsql` 6.19.3,
Prisma 6.19.3. Risultati:

| # | Prova | Esito |
|---|---|---|
| 1 | Ramo `file:` locale intatto (baseline I106): `SELECT 1` su file temporaneo | PASS |
| 2 | `client.sync` esposto dal client creato | PASS (funzione) |
| 3 | Typings `@libsql/core`: `syncUrl?: string`, `syncInterval?: number`, `sync(): Promise<void>` | PASS |
| 4 | `sync()` su file aperto SENZA `syncUrl` | errore DETERMINISTICO: «Sync is not supported in databases opened in File mode» |
| 5 | `createClient` CON `syncUrl` verso primario irraggiungibile (dominio fittizio, token finto) | creazione RIUSCITA: il primario è contattato PIGRAMENTE, l'errore rinvia |
| 6 | `sync()` verso primario irraggiungibile (delimitato a 20 s) | fallimento NON uniforme (vedi sotto) |
| 7 | Query su replica MAI sincronizzata | fallimento: la prima sync è OBBLIGATORIA prima di qualunque lettura |

Le tre lezioni di design (la sostanza della verifica):

- **L4.1 — la replica si configura SOLO ALLA CREAZIONE.** L'esito 4 (guard
  deterministico «Sync is not supported in databases opened in File mode») dice che
  non si può «aggiungere» la sync a un client già aperto: il ramo I109 nasce come
  configurazione DISTINTA della factory (createClient con `url: file:<replica>` +
  `syncUrl: <primario>`), non come re-config del ramo Turso diretto I106.
- **L4.2 — i fallimenti verso il primario non sono deterministici.** Due run della
  STESSA probe: nel primo `sync()` è rimasta APPESA oltre 90 s (retry lunghi del
  driver, il timeout del tool di sessione ha ucciso il processo); nel secondo è
  fallita in fretta con errori JS interni confusi («Cannot read properties of
  undefined (reading 'sync')»). Conseguenze obbligatorie per la factory: (a) la
  prima sync va delimitata da un TIMEOUT esplicito, (b) nessun errore nudo del driver
  in UI (mapping alla maniera I107-fix2), (c) degrado onesto a «nessuna» con causa
  dichiarata. Un attimo di attenzione onesto: il serverless Vercel ha un budget
  temporale per invocazione — un hang di rete non delimitato è esattamente il tipo di
  guasto che la fabbrica non può permettersi.
- **L4.3 — prima sync = parte del percorso dati.** L'esito 7 dice che la replica
  appena creata NON risponde alle query finché la prima sync non è riuscita: il gate
  «prima sync con timeout» non è un ottimizzo, è prerequisito funzionale (stessa
  filosofia del gate `preparaSchema` di I107-fix3).

### 10.4 Design dell'integrazione (da attuare SOLO dopo D5-a)

Criterio §1: si insedia nella factory esistente come ramo guidato dall'ambiente.

- **Env**: `TURSO_SYNC_URL` (primario `libsql://…` — nome DISTINTO da
  `TURSO_DATABASE_URL` per non sovrapporre le due semantiche) + `TURSO_AUTH_TOKEN`
  (riusato così com'è) + `TURSO_REPLICA_PATH` opzionale (default: `db/replica.db` in
  locale, `tmpdir()/db/replica.db` su serverless come da regola VERCEL di I107-fix2).
- **Factory** (`db-factory.ts`): terzo ramo «`TURSO_SYNC_URL` presente» →
  `new PrismaLibSQL({ url: file:<replica>, authToken, syncUrl: TURSO_SYNC_URL })`
  (passthrough Config verificato in §10.2) → `new PrismaClient({ adapter })`;
  `preparaDirectoryFile` copre già il file della replica; `preparaSchema` si applica
  IDENTICO (stesso dialetto, DDL idempotente I107-fix3 — anche una replica appena
  creata ha le tabelle al primo avvio); gate di prima sync con timeout (L4.2/L4.3),
  guasti su stderr e degrado a modalità «nessuna» con causa, MAI mascherati.
- **Modalità** (`modalita-persistenza.ts`): quarta modalità «replica» (regola
  ambiente→modalità come unità pura: priorità `TURSO_SYNC_URL` > `TURSO_DATABASE_URL`
  > locale, documentata); `hostDiagnostico()` mostra primario SANIFICATO (solo
  hostname, come I107) + percorso del file replica.
- **Pannello I107**: badge aggiuntivo «Replica locale (Turso)»; test di connessione
  = `SELECT 1` + `sync()` con latenza misurata e timeout; nota onesta sull'effimero
  su serverless (§10.5 R5).
- **Test** previsti: unità pura della nuova regola di modalità; contract della factory
  (ramo replica con client mock: config passthrough, gate prima-sync, timeout, degrado);
  component (badge/nota); mock mirror già previsti dalla lezione I107/fix2. Stima:
  +8/10 test, +6/8 check audit.

### 10.5 Rischi e mitigazioni

- **R1 — spinta di Turso verso Turso Sync (24/4/2026)**: gli embedded replicas restano
  documentati e supportati dal client in uso; il ramo è ISOLATO in factory e
  disattivabile rimuovendo l'env, senza tocchi al resto. Rivalutazione CDC quando
  Prisma supporterà il runtime Turso (monitoraggio in osservatorio).
- **R2 — feature storicamente soggetta a tier** (edge replication rimossa 2025):
  banda sync 10 GB/mese vs profilo del monitor (~1–2 MB, §2) = margine enorme; il
  degrado è comunque onesto (L4.2).
- **R3 — fallimenti non deterministici verso il primario** (L4.2): timeout espliciti
  + mapping errori + degrado a «nessuna» con causa; nessun hang non delimitato.
- **R4 — offline puro**: la replica inoltra le scritture al primario (write-through):
  offline le LETTURE funzionano dal file, le SCRITTURE falliscono — coerente col
  pattern del progetto (replica eventi fire-and-forget con merge, I27/F8) e da
  documentare nella nota del pannello.
- **R5 — Vercel serverless**: la replica vive in `/tmp` = EFFIMERA per istanza
  (sync a ogni cold start, nessun beneficio di stato locale tra invocazioni): su
  Vercel il valore dell'embedded replica è ~NULLO rispetto al ramo Turso diretto
  I106 (che resta la via cloud primaria). **Il valore reale di I109 è per lo
  sviluppo locale sui dati reali e per il self-host sempre acceso** — va detto
  nella UI per non vendere un benefit che su serverless non esiste.

### 10.6 Runbook verifica e2e (richiede credenziali Turso reali)

1. `turso db create i109-prova` + `turso db tokens create i109-prova`;
2. env locali: `TURSO_SYNC_URL=libsql://i109-prova-<org>.turso.io`,
   `TURSO_AUTH_TOKEN=<token>` (SENZA `TURSO_DATABASE_URL` — la priorità è §10.4);
3. avvio app → pannello «Persistenza» mostra modalità «Replica locale (Turso)»,
   host sanificato, test ok con sync iniziale entro il timeout;
4. scrivere un punto DAL CLOUD (seconda istanza con `TURSO_DATABASE_URL` diretto o
   dashboard) → `sync()` → lettura locale aggiornata (verifica la direzione
   primario→replica);
5. scrivere in LOCALE → dato visibile al primario (write-through, direzione
   replica→primario);
6. misurare latenze: letture da file vs remote (attesa: microsecondi vs decine di ms);
7. test di resilienza: primario irraggiungibile (firewall) → letture da file ok,
   scritture fallite con evento tecnico, pannello onesto sulla causa (L4.2).

### 10.7 Costo stimato e domanda

Costo (da design §10.4): ramo factory + modalità + pannello + runbook + test (+8/10)
+ audit (+6/8) — stessa forma dell'Ondata 4 fin qui, nessun tocco a schema/route
esistenti oltre il pannello. La domanda è la **D5** (§8): **(a)** implementa ora ·
**(b)** resta in backlog osservatorio (stato attuale, nessun lavoro) · **(c)** scartare.

*Verifiche locali citate: `prisma/schema.prisma` (limiti 10k/5k), `src/lib/db-factory.ts`
(I106), `src/lib/server-model-history.ts` (SQL raw `ON CONFLICT`), `src/components/settings-dialog.tsx`
(refresh 60 s), `docs/08` §7 (convenzione registro decisioni),
`scripts/verifiche/verifica-i109-turso-sync.mjs` (probe I109, §10.3),
`node_modules/@prisma/adapter-libsql/dist/index-node.d.ts` (contratto `constructor(config: Config)`).*
