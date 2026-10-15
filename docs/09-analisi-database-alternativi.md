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
> Stato: **2 proposte numerate I107–I108, 4 decisioni raccolte (§8, 15/10/2026)** —
> la strada primaria SQLite/libSQL è CONFERMATA (D1), I107 è il primo item
> dell'Ondata 4 (D2), I108 resta porta pronta in backlog (D3), l'osservatorio
> Turso Sync/MCP è confermato (D4).

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
2. **I107 — Pannello «Persistenza» in UI (proposta, piccola):** esporre nelle
   impostazioni/diagnostica ciò che `modalitaPersistenza()` già sa (modalità attiva
   locale/turso, URL diagnostica senza credenziali), un test di connessione e i conteggi
   righe per tabella. Dà all'utente la visibilità del database SCELTO dalle impostazioni
   ambiente — la versione onesta del requisito «impostare il database dall'app», senza
   mai mettere credenziali nel localStorage (vincolo di sicurezza del progetto: la chiave
   MiniMax resta l'unico segreto del browser).
3. **I108 — Provider Postgres opzionale Neon/Supabase (proposta, media):** doppio schema
   Prisma selezionato a build (`PRISMA_SCHEMA`/script), ramo PG in `db-factory` con
   `@prisma/adapter-pg` o `@prisma/adapter-neon`, variante `db-push` per PG, verifica
   dedicata + check audit. DA NON IMPLEMENTARE finché non arriva il bisogno concreto
   dell'ecosistema PG: il suo valore è la PORTA PRONTA, non l'apertura immediata.
4. **Backlog osservatorio:** Turso Sync/embedded replicas (ibrido, §6.3), PGlite
   (se l'adapter Prisma diventasse ufficiale), bridge MCP/Composio per export verso
   sistemi esterni (fuori dal percorso dati, valutato nella conversazione del 15/10 e
   NON raccomandato come persistenza primaria per latenza, transazioni, dipendenza da
   terzi e verificabilità CI).

## 8. Registro decisioni (clarify — RACCOLTE il 15/10/2026)

Come da convenzione `docs/08` §7: le proposte ricevono la decisione PRIMA
dell'implementazione. Decisioni espresse dall'utente il **15/10/2026**:
**D1–D4 chiuse**, l'Ondata 4 parte da I107.

| # | Domanda | Opzioni | Decisione |
|---|---|---|---|
| D1 | Confermi la strada primaria SQLite/libSQL (locale=SQLite nativo, cloud=Turso già implementato) senza migrazione? | (a) sì, confermata · (b) no, voglio la via Postgres come primaria | **(a) CONFERMATA** — zero migrazione, §7.1 in vigore |
| D2 | I107 pannello «Persistenza» in UI: si implementa come primo item dell'Ondata 4? | (a) sì, Ondata 4 · (b) sì, ma più avanti · (c) no | **(a) CONFERMATA** — I107 è il primo item dell'Ondata 4 |
| D3 | I108 provider Postgres (Neon o Supabase): si implementa ora o resta porta pronta documentata? | (a) ora, Neon · (b) ora, Supabase · (c) backlog | **(c) BACKLOG** — resta porta pronta documentata (§7.3) |
| D4 | Turso Sync/embedded replicas e bridge MCP/Composio: entrano nel backlog osservatorio (§7.4) o si scartano? | (a) backlog · (b) scartati | **(a) BACKLOG OSSERVATORIO** — confermato (§7.4) |

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

*Verifiche locali citate: `prisma/schema.prisma` (limiti 10k/5k), `src/lib/db-factory.ts`
(I106), `src/lib/server-model-history.ts` (SQL raw `ON CONFLICT`), `src/components/settings-dialog.tsx`
(refresh 60 s), `docs/08` §7 (convenzione registro decisioni).*
