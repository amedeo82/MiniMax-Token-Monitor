/**
 * I111 — Manutenzione del database di persistenza (unità pura in modulo
 * proprio, pattern I106/I107): presidio della SALUTE (anti-rottura) e della
 * QUOTA del free tier Turso.
 *
 * PERCHÉ ESISTE: dal 16/10/2026 la persistenza duratura è il database Turso
 * (I110). Il piano gratuito Turso ha quote MENSILI/ASSOLUTE (fonti datate
 * 16/10/2026: turso.tech/pricing + blog «Developer Plan» + freetiers.com):
 *
 *   - 5 GB di storage totale;
 *   - 500 milioni di row read / mese;
 *   - 10 milioni di row write / mese;
 *   - 100 database per account.
 *
 * Docs Turso (Usage & Billing): al superamento di una quota le query
 * FALLISCONO — cioè esattamente la classe di «rottura» (500 su Vercel)
 * già vista con i bug I107-fix/fix2/fix3/fix4. Le procedure qui sotto
 * misurano ciò che è misurabile DENTRO il database (storage via PRAGMA,
 * righe, velocità di crescita, integrità) e tengono le dimensioni sotto
 * controllo con ritenuta + VACUUM, così la quota non si supera «in silenzio».
 *
 * COME È FATTO:
 * - le funzioni prendono il CLIENT come parametro (come `preparaSchema`):
 *   nessun import del singleton `db` — la route passa `db`, i test passano
 *   client reali o finti senza collisioni con i mock di processo I99/I95
 *   (bun applica il primo mock per specificatore: "@/lib/db" resta `{ db }`);
 * - SQL SEMPRE parametrizzato (tagged template / $executeRawUnsafe senza
 *   interpolazioni di stringhe): nessun rischio injection;
 * - le politiche (ritenuta, soglie quota) si leggono dall'AMBIENTE con
 *   default sicuri e clamp: un valore insensato non può disarmare la
 *   manutenzione né cancellare tutto l'archivio;
 * - la pulizia ha `dryRun`: sulla produzione si può VERIFICARE quante righe
 *   verrebbero eliminate senza eliminare nulla (probe e runbook, docs/10 §7);
 * - il degrado è ONESTO: un VACUUM rifiutato dal server non è mascherato —
 *   l'errore arriva nel rapporto e nelle risposte delle route.
 *
 * ONESTÀ DEI LIMITI (documentata anche in docs/10): letture e scritture
 * reali del mese sono contatori DI PIATTAFORMA (dashboard Turso / API
 * piattaforma) e NON misurabili da dentro il database; qui si misura lo
 * storage (esatto, via PRAGMA page_count × page_size) e si STIMA la
 * velocità di scrittura dalle righe create nelle ultime 24 h (proiezione,
 * sotto-stimata: esclude le amplificazioni di upsert/merge del downsample).
 */

/* ------------------------------------------------------------------ */
/* Limiti del free tier Turso (fonti datate 16/10/2026)                */
/* ------------------------------------------------------------------ */

export interface LimiteFreeTierTurso {
  /** Storage totale incluso nel piano free (byte). */
  storageBytes: number;
  /** Row read incluse al mese. */
  lettureMese: number;
  /** Row write incluse al mese. */
  scrittureMese: number;
  /** Numero massimo di database per account. */
  databases: number;
}

/** 5 GiB = 5 × 1024³ byte. */
const GIB = 1024 * 1024 * 1024;

/**
 * Limiti del piano Free Turso (16/10/2026): 5 GB storage, 500M row read/mese,
 * 10M row write/mese, 100 database. La fonte fa fede sul NUMERO, non sulla
 * data di ricerca: se Turso cambia i limiti, aggiornare qui (fonti in docs/10 §2).
 */
export const LIMITI_TURSO_FREE: LimiteFreeTierTurso = {
  storageBytes: 5 * GIB,
  lettureMese: 500_000_000,
  scrittureMese: 10_000_000,
  databases: 100,
};

/* ------------------------------------------------------------------ */
/* Superficie SQL minima richiesta al client                           */
/* ------------------------------------------------------------------ */

/** Come `schema-persistenza`: il client arriva come `object` e qui si verifica
    la superficie raw — un mock senza SQL esce dal percorso manutenzione senza
    rovesciamenti (le route reali passano sempre il PrismaClient completo). */
function superficieSql(client: object):
  | {
      $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>;
      $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number>;
      $executeRawUnsafe: (sql: string) => Promise<number>;
    }
  | null {
  const c = client as {
    $queryRaw?: unknown;
    $executeRaw?: unknown;
    $executeRawUnsafe?: unknown;
  };
  const ok =
    typeof c.$queryRaw === "function" &&
    typeof c.$executeRaw === "function" &&
    typeof c.$executeRawUnsafe === "function";
  return ok ? (c as NonNullable<ReturnType<typeof superficieSql>>) : null;
}

/* ------------------------------------------------------------------ */
/* Misura dello storage (la quota che il free tier espone in byte)     */
/* ------------------------------------------------------------------ */

export interface MisuraDimensione {
  /** Dimensione logica del database (page_count × page_size, byte). */
  bytes: number;
  /** Numero di pagine allocate (incluse quelle libere). */
  pagine: number;
  /** Dimensione della pagina (byte, tipicamente 4096). */
  dimPagina: number;
  /** Byte su pagine libere (riutilizzabili ma ancora allocate): ciò che un
      VACUUM può restituire. È una SOVRASTIMA del recuperabile. */
  bytesLiberi: number;
}

/**
 * Misura la dimensione del database con le PRAGMA di SQLite/libSQL
 * (page_count × page_size; freelist_count per le pagine libere).
 * Una pagina cancellata NON torna al servizio senza VACUUM: resta nella
 * freelist e il file non si accorcia — per questo la manutenzione misura
 * anche i byte liberi (docs/10 §5 P4).
 */
export async function misuraDimensioneDb(client: object): Promise<MisuraDimensione> {
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: dimensione non misurabile.");
  const righePagine = (await c.$queryRaw`PRAGMA page_count`) as Array<Record<string, unknown>>;
  const righeDim = (await c.$queryRaw`PRAGMA page_size`) as Array<Record<string, unknown>>;
  const righeLiberi = (await c.$queryRaw`PRAGMA freelist_count`) as Array<Record<string, unknown>>;
  const prendi = (righe: Array<Record<string, unknown>>): number => {
    const prima = righe[0];
    if (!prima) return 0;
    const valore = Object.values(prima)[0];
    return Number(valore) || 0;
  };
  const pagine = prendi(righePagine);
  const dimPagina = prendi(righeDim);
  const pagineLibere = prendi(righeLiberi);
  return {
    bytes: pagine * dimPagina,
    pagine,
    dimPagina,
    bytesLiberi: pagineLibere * dimPagina,
  };
}

/* ------------------------------------------------------------------ */
/* Statistiche per tabella (righe + velocità di crescita 24 h)         */
/* ------------------------------------------------------------------ */

export interface StatisticaTabella {
  tabella: string;
  righe: number;
  /** Righe create nelle ultime 24 h (campo `createdAt`): base della
      proiezione di scritture mensili. */
  ultime24h: number;
}

export interface StatisticheTabelle {
  tabelle: StatisticaTabella[];
  totaleRighe: number;
  /** Somma delle righe delle ultime 24 h su tutte le tabelle. */
  nuove24h: number;
}

const TABELLE_MANUTENZIONE = ["UsagePoint", "DownsampledPoint", "UsageEventRecord", "ModelUsagePoint"] as const;

/**
 * Conta le righe per tabella (COUNT(*)) e quante sono nate nelle ultime 24 h.
 *
 * NB (fix I111 — probe `scripts/verifiche/probe-i111-datetime.ts`): nel
 * database convivono DUE codifiche dei DateTime. Il motore Prisma (client
 * tipizzato: UsagePoint, DownsampledPoint, UsageEventRecord) scrive INTEGER
 * (epoch ms); l'SQL raw di produzione (lib I42 per ModelUsagePoint) scrive
 * TEXT ISO 8601. In SQLite un confronto con UN solo tipo di cutoff è
 * SBAGLIATO sull'altra codifica (numeric < text SEMPRE: davanti a un cutoff
 * ISO ogni riga INTEGER sembra vecchia; davanti a un cutoff ms ogni riga TEXT
 * sembra recente). Ogni confronto temporale della lib è quindi DUALE: ms per
 * la codifica INTEGER e ISO per quella TEXT, scelti con `typeof(colonna)`.
 * La velocità resta una STIMA: le righe nate solo dal DEFAULT
 * CURRENT_TIMESTAMP del DDL (formato «spazio») cadono fuori da entrambe le
 * forme — lo dichiara anche il rapporto (docs/10 §9).
 */
export async function statisticaTabelle(client: object): Promise<StatisticheTabelle> {
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: statistiche non disponibili.");
  const cutoffMs = Date.now() - 24 * 3600_000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  /* NB: i nomi di tabella NON si interpolano in un tagged template (Prisma
     tratterebbe l'identificatore come PARAMETRO): le 4 tabelle sono una lista
     fissa e chiusa — una coppia di statement ESPliciti per ciascuna. */
  const estrai = (righe: Array<{ v: number | bigint }>): number => Number(righe[0]?.v ?? 0);
  const tabelle: StatisticaTabella[] = [
    {
      tabella: "UsagePoint",
      righe: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint"`) as Array<{ v: number | bigint }>),
      ultime24h: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE ("createdAt" >= ${cutoffMs} AND typeof("createdAt") = 'integer') OR ("createdAt" >= ${cutoffIso} AND typeof("createdAt") = 'text')`) as Array<{ v: number | bigint }>),
    },
    {
      tabella: "DownsampledPoint",
      righe: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "DownsampledPoint"`) as Array<{ v: number | bigint }>),
      ultime24h: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "DownsampledPoint" WHERE ("createdAt" >= ${cutoffMs} AND typeof("createdAt") = 'integer') OR ("createdAt" >= ${cutoffIso} AND typeof("createdAt") = 'text')`) as Array<{ v: number | bigint }>),
    },
    {
      tabella: "UsageEventRecord",
      righe: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsageEventRecord"`) as Array<{ v: number | bigint }>),
      ultime24h: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsageEventRecord" WHERE ("createdAt" >= ${cutoffMs} AND typeof("createdAt") = 'integer') OR ("createdAt" >= ${cutoffIso} AND typeof("createdAt") = 'text')`) as Array<{ v: number | bigint }>),
    },
    {
      tabella: "ModelUsagePoint",
      righe: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "ModelUsagePoint"`) as Array<{ v: number | bigint }>),
      ultime24h: estrai((await c.$queryRaw`SELECT COUNT(*) AS v FROM "ModelUsagePoint" WHERE ("createdAt" >= ${cutoffMs} AND typeof("createdAt") = 'integer') OR ("createdAt" >= ${cutoffIso} AND typeof("createdAt") = 'text')`) as Array<{ v: number | bigint }>),
    },
  ];
  void TABELLE_MANUTENZIONE; // (lista documentale: i nomi restano fissi negli statement qui sopra)
  const totaleRighe = tabelle.reduce((s, t) => s + t.righe, 0);
  const nuove24h = tabelle.reduce((s, t) => s + t.ultime24h, 0);
  return { tabelle, totaleRighe, nuove24h };
}

/* ------------------------------------------------------------------ */
/* Integrità (PRAGMA quick_check — rileva corruzione PRIMA che rompa)  */
/* ------------------------------------------------------------------ */

export interface EsitoIntegrita {
  /** false = omessa (database troppo grande per farla a ogni richiesta). */
  eseguito: boolean;
  ok: boolean;
  /** Risposta del motore (「ok」 quando tutto va). */
  esito?: string;
  /** Motivo dell'omissione (onesta: nessuna mascheratura). */
  motivo?: string;
}

/** Sopra questa dimensione quick_check è OMESSA nelle richieste interattive
    (legge l'intero database: su 512+ MiB diventerebbe lenta e costosa in
    row read di piattaforma). Il cron può comunque forzarla esplicitamente. */
export const SOGLIA_OMISSIONE_INTEGRITA_BYTES = 512 * 1024 * 1024;

/**
 * PRAGMA quick_check: verifica rapida della coerenza del file (variante
 * leggera di integrity_check). `dimensioneBytes` (se passato) applica la
 * soglia di omissione: oltre, il rapporto dichiara l'omissione invece di
 * far pagare la scansione a ogni apertura del pannello.
 */
export async function verificaIntegritaDb(
  client: object,
  dimensioneBytes?: number,
): Promise<EsitoIntegrita> {
  if (typeof dimensioneBytes === "number" && dimensioneBytes > SOGLIA_OMISSIONE_INTEGRITA_BYTES) {
    return {
      eseguito: false,
      ok: true,
      motivo: `omessa: database ${(dimensioneBytes / (1024 * 1024)).toFixed(0)} MiB oltre la soglia ${SOGLIA_OMISSIONE_INTEGRITA_BYTES / (1024 * 1024)} MiB (docs/10 §5 P2)`,
    };
  }
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: integrità non verificabile.");
  const righe = (await c.$queryRaw`PRAGMA quick_check`) as Array<Record<string, unknown>>;
  const esito = String(Object.values(righe[0] ?? { v: "assente" })[0] ?? "assente");
  return { eseguito: true, ok: esito === "ok", esito };
}

/* ------------------------------------------------------------------ */
/* Politica di ritenuta (da ambiente, con default e clamp)             */
/* ------------------------------------------------------------------ */

export interface PoliticaRitenuta {
  /** Giorni di conservazione dei punti grezzi (UsagePoint). */
  giorniPunti: number;
  /** Giorni dei bucket orari derivati (DownsampledPoint). */
  giorniBucket: number;
  /** Giorni dell'archivio eventi (UsageEventRecord). */
  giorniEventi: number;
  /** Giorni dei punti per-modello (ModelUsagePoint). */
  giorniModelli: number;
  /** Cap FIFO punti (come il pruning on-write di /api/history). */
  maxPunti: number;
  /** Cap FIFO eventi (come il pruning on-write di /api/events). */
  maxEventi: number;
  /** Cap FIFO punti per-modello (come il pruning on-write di /api/history/models). */
  maxModelli: number;
}

/**
 * DEFAULT allineati alle pruning on-write già in produzione: punti/bucket/
 * modelli 90 giorni + FIFO 10.000, eventi 180 giorni + FIFO 5.000 (I16/I27/I68/
 * I82). La manutenzione è la RETE DI SICUREZZA: il pruning on-write gira solo
 * quando arrivano nuove scrittura, questa gira anche quando il traffico cessa
 * (cron notturno) — la dimensione resta delimitata comunque.
 */
export const RETENZIONE_DEFAULT: PoliticaRitenuta = {
  giorniPunti: 90,
  giorniBucket: 90,
  giorniEventi: 180,
  giorniModelli: 90,
  maxPunti: 10_000,
  maxEventi: 5_000,
  maxModelli: 10_000,
};

/** Giorni ammessi: almeno 1 (mai «cancella tutto»), al massimo 10 anni. */
const GIORNI_MIN = 1;
const GIORNI_MAX = 3_650;
/** Cap FIFO ammessi: da 100 righe a 1 milione. */
const CAP_MIN = 100;
const CAP_MAX = 1_000_000;

function numeroDaEnv(
  env: Record<string, string | undefined>,
  chiave: string,
  def: number,
  min: number,
  max: number,
): number {
  const grezzo = env[chiave]?.trim();
  if (grezzo === undefined || grezzo === "") return def;
  const n = Number(grezzo);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Soglie di quota storage (limite + frazioni di attenzione/critica). */
export interface SoglieQuota {
  limite: number;
  sogliaAttenzione: number;
  sogliaCritica: number;
}

/** Default: i limiti del free tier con attenzione all'80% e critica al 90%. */
export const SOGLIE_QUOTA_DEFAULT: SoglieQuota = {
  limite: LIMITI_TURSO_FREE.storageBytes,
  sogliaAttenzione: 0.8,
  sogliaCritica: 0.9,
};

/**
 * Politica di ritenuta letta dall'AMBIENTE (env mancante/insensata → default;
 * sempre in clamp: una env sbagliata non può disarmare la manutenzione né
 * svuotare l'archivio — docs/10 §6).
 */
export function politicaRitenutaDaEnv(
  env: Record<string, string | undefined> = process.env,
): PoliticaRitenuta {
  return {
    giorniPunti: numeroDaEnv(env, "MANUTENZIONE_RETENTION_PUNTI_GIORNI", RETENZIONE_DEFAULT.giorniPunti, GIORNI_MIN, GIORNI_MAX),
    giorniBucket: numeroDaEnv(env, "MANUTENZIONE_RETENTION_BUCKET_GIORNI", RETENZIONE_DEFAULT.giorniBucket, GIORNI_MIN, GIORNI_MAX),
    giorniEventi: numeroDaEnv(env, "MANUTENZIONE_RETENTION_EVENTI_GIORNI", RETENZIONE_DEFAULT.giorniEventi, GIORNI_MIN, GIORNI_MAX),
    giorniModelli: numeroDaEnv(env, "MANUTENZIONE_RETENTION_MODELLI_GIORNI", RETENZIONE_DEFAULT.giorniModelli, GIORNI_MIN, GIORNI_MAX),
    maxPunti: numeroDaEnv(env, "MANUTENZIONE_MAX_PUNTI", RETENZIONE_DEFAULT.maxPunti, CAP_MIN, CAP_MAX),
    maxEventi: numeroDaEnv(env, "MANUTENZIONE_MAX_EVENTI", RETENZIONE_DEFAULT.maxEventi, CAP_MIN, CAP_MAX),
    maxModelli: numeroDaEnv(env, "MANUTENZIONE_MAX_MODELLI", RETENZIONE_DEFAULT.maxModelli, CAP_MIN, CAP_MAX),
  };
}

/** Soglie di quota lette dall'ambiente (stessa tolleranza della ritenuta). */
export function soglieQuotaDaEnv(env: Record<string, string | undefined> = process.env): SoglieQuota {
  return {
    limite: numeroDaEnv(env, "MANUTENZIONE_QUOTA_STORAGE_BYTES", SOGLIE_QUOTA_DEFAULT.limite, 1024 * 1024, 1024 * GIB),
    sogliaAttenzione: numeroDaEnv(env, "MANUTENZIONE_SOGLIA_ATTENZIONE", 80, 1, 100) / 100,
    sogliaCritica: numeroDaEnv(env, "MANUTENZIONE_SOGLIA_CRITICA", 90, 1, 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/* Valutazione della quota storage                                     */
/* ------------------------------------------------------------------ */

export type LivelloQuota = "ok" | "attenzione" | "critica";

export interface ValutazioneQuota {
  bytes: number;
  limite: number;
  frazione: number;
  /** Percentuale arrotondata (0–100+, può superare 100: è il CAMpanello). */
  percento: number;
  livello: LivelloQuota;
}

/**
 * Confronta i byte misurati col limite configurato: livello «attenzione»
 * oltre la prima soglia, «critica» oltre la seconda. È il segnale che guida
 * l'escalation della P6 (docs/10): attenzione → ridurre ritenuta; critica →
 * pulizia immediata + VACUUM.
 */
export function valutazioneQuotaStorage(
  bytes: number,
  soglie: SoglieQuota = SOGLIE_QUOTA_DEFAULT,
): ValutazioneQuota {
  const limite = soglie.limite > 0 ? soglie.limite : SOGLIE_QUOTA_DEFAULT.limite;
  const frazione = bytes / limite;
  const percento = Math.round(frazione * 1000) / 10;
  const livello: LivelloQuota =
    frazione >= soglie.sogliaCritica ? "critica" : frazione >= soglie.sogliaAttenzione ? "attenzione" : "ok";
  return { bytes, limite, frazione, percento, livello };
}

/* ------------------------------------------------------------------ */
/* Proiezione delle scritture (la quota NON misurabile da dentro)      */
/* ------------------------------------------------------------------ */

export interface ProiezioneScritture {
  /** Righe scritte/duplicate nelle ultime 24 h × 30. */
  stimateMese: number;
  limite: number;
  frazione: number;
  percento: number;
  /** Nota ONESTA inclusa nel rapporto: cosa non copre la stima. */
  nota: string;
}

/**
 * Proiezione mensile delle scritture a partire dalle righe create nelle
 * ultime 24 h (× 30). SOTTOSTIMA dichiarata: ogni upsert in conflitto conta
 * come scrittura anche se non crea righe, e il merge dei bucket orari
 * (DownsampledPoint) aggiorna la stessa riga più volte — i contatori reali
 * sono nella dashboard Turso (docs/10 §5 P6). Serve come allarme di TENDENZA,
 * non come fatturato.
 */
export function proiezioneScrittureMese(nuove24h: number): ProiezioneScritture {
  const stimateMese = Math.max(0, Math.round(nuove24h)) * 30;
  const limite = LIMITI_TURSO_FREE.scrittureMese;
  const frazione = stimateMese / limite;
  const percento = Math.round(frazione * 1000) / 10;
  return {
    stimateMese,
    limite,
    frazione,
    percento,
    nota: "proiezione da righe create nelle ultime 24 h × 30: sotto-stimata (esclude upsert in conflitto e merge dei bucket); i contatori reali sono nella dashboard Turso",
  };
}

/* ------------------------------------------------------------------ */
/* Pulizia di ritenuta (DELETE parametrizzati, con dryRun)             */
/* ------------------------------------------------------------------ */

export interface EliminatiPulizia {
  punti: number;
  bucket: number;
  eventi: number;
  modelli: number;
}

export interface EsitoPulizia {
  eseguita: boolean;
  /** true = solo CONTEGGIO di ciò che verrebbe eliminato (zero DELETE). */
  dryRun: boolean;
  eliminati: EliminatiPulizia;
  totale: number;
}

/**
 * Elimina (o, con dryRun, conta soltanto) le righe oltre la ritenuta e i cap
 * FIFO. Semantica IDENTICA alle pruning on-write delle route (I16/I27/I82):
 * - punti/bucket/modelli: oltre i loro giorni;
 * - eventi: oltre i loro giorni;
 * - cap FIFO: conserva le righe PIÙ RECENTI fino al cap (stesso ORDER BY delle
 *   pruning di produzione: t DESC, id DESC — eventi solo t DESC, come lì).
 * Con `dryRun: true` nessun DELETE parte: le stesse condizioni girano in
 * COUNT — è la modalità con cui si verifica la pulizia senza toccare i dati
 * (probe e runbook, docs/10 §7).
 *
 * I confronti temporali sono DUALI (probe `probe-i111-datetime.ts`): ms per
 * le righe scritte dal motore Prisma (INTEGER), ISO per quelle scritte da
 * SQL raw (TEXT — lib I42); vedi la nota in statisticaTabelle.
 */
export async function eseguiPuliziaRitenuta(
  client: object,
  politica: PoliticaRitenuta = RETENZIONE_DEFAULT,
  opzioni: { dryRun?: boolean; ora?: number } = {},
): Promise<EsitoPulizia> {
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: pulizia non eseguibile.");
  const dryRun = opzioni.dryRun === true;
  const ora = opzioni.ora ?? Date.now();
  /* Cutoff in ENTRAMBE le codifiche (probe I111): ms per le righe del motore
     Prisma (INTEGER), ISO per le righe dell'SQL raw (TEXT — lib I42). */
  const taglio = (giorni: number) => {
    const ms = ora - giorni * 24 * 3600_000;
    return { ms, iso: new Date(ms).toISOString() };
  };

  const puntiCut = taglio(politica.giorniPunti);
  const bucketCut = taglio(politica.giorniBucket);
  const eventiCut = taglio(politica.giorniEventi);
  const modelliCut = taglio(politica.giorniModelli);

  /* Tutti i nomi di tabella sono LITERAL negli statement (un identificatore
     interpolato in un tagged template verrebbe trattato come parametro): le
     condizioni variabili (cutoff, cap) sono invece SEMPRE parametrizzate. */
  const estraiConteggio = (righe: Array<{ v: number | bigint }>): number => Number(righe[0]?.v ?? 0);
  const esegui = async (operazione: Promise<number>): Promise<number> => Number(await operazione);

  if (dryRun) {
    /* ZERO DELETE: le stesse condizioni della modalità reale girano in COUNT. */
    const eliminati: EliminatiPulizia = {
      punti: estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE ("t" < ${puntiCut.ms} AND typeof("t") = 'integer') OR ("t" < ${puntiCut.iso} AND typeof("t") = 'text')`) as Array<{ v: number | bigint }>) +
        estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${politica.maxPunti})`) as Array<{ v: number | bigint }>),
      bucket: estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "DownsampledPoint" WHERE ("hourStart" < ${bucketCut.ms} AND typeof("hourStart") = 'integer') OR ("hourStart" < ${bucketCut.iso} AND typeof("hourStart") = 'text')`) as Array<{ v: number | bigint }>),
      eventi: estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsageEventRecord" WHERE ("t" < ${eventiCut.ms} AND typeof("t") = 'integer') OR ("t" < ${eventiCut.iso} AND typeof("t") = 'text')`) as Array<{ v: number | bigint }>) +
        estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "UsageEventRecord" WHERE "id" NOT IN (SELECT "id" FROM "UsageEventRecord" ORDER BY "t" DESC LIMIT ${politica.maxEventi})`) as Array<{ v: number | bigint }>),
      modelli: estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "ModelUsagePoint" WHERE ("t" < ${modelliCut.ms} AND typeof("t") = 'integer') OR ("t" < ${modelliCut.iso} AND typeof("t") = 'text')`) as Array<{ v: number | bigint }>) +
        estraiConteggio((await c.$queryRaw`SELECT COUNT(*) AS v FROM "ModelUsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "ModelUsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${politica.maxModelli})`) as Array<{ v: number | bigint }>),
    };
    return {
      eseguita: false,
      dryRun: true,
      eliminati,
      totale: eliminati.punti + eliminati.bucket + eliminati.eventi + eliminati.modelli,
    };
  }

  /* Modalità reale: ritenuta per scadenza + cap FIFO (stesso ORDER BY delle
     pruning on-write di produzione: t DESC, id DESC — eventi solo t DESC). */
  const eliminati: EliminatiPulizia = {
    punti:
      (await esegui(c.$executeRaw`DELETE FROM "UsagePoint" WHERE ("t" < ${puntiCut.ms} AND typeof("t") = 'integer') OR ("t" < ${puntiCut.iso} AND typeof("t") = 'text')`)) +
      (await esegui(
        c.$executeRaw`DELETE FROM "UsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "UsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${politica.maxPunti})`,
      )),
    bucket: await esegui(
      c.$executeRaw`DELETE FROM "DownsampledPoint" WHERE ("hourStart" < ${bucketCut.ms} AND typeof("hourStart") = 'integer') OR ("hourStart" < ${bucketCut.iso} AND typeof("hourStart") = 'text')`,
    ),
    eventi:
      (await esegui(c.$executeRaw`DELETE FROM "UsageEventRecord" WHERE ("t" < ${eventiCut.ms} AND typeof("t") = 'integer') OR ("t" < ${eventiCut.iso} AND typeof("t") = 'text')`)) +
      (await esegui(
        c.$executeRaw`DELETE FROM "UsageEventRecord" WHERE "id" NOT IN (SELECT "id" FROM "UsageEventRecord" ORDER BY "t" DESC LIMIT ${politica.maxEventi})`,
      )),
    modelli:
      (await esegui(c.$executeRaw`DELETE FROM "ModelUsagePoint" WHERE ("t" < ${modelliCut.ms} AND typeof("t") = 'integer') OR ("t" < ${modelliCut.iso} AND typeof("t") = 'text')`)) +
      (await esegui(
        c.$executeRaw`DELETE FROM "ModelUsagePoint" WHERE "id" NOT IN (SELECT "id" FROM "ModelUsagePoint" ORDER BY "t" DESC, "id" DESC LIMIT ${politica.maxModelli})`,
      )),
  };
  return {
    eseguita: true,
    dryRun: false,
    eliminati,
    totale: eliminati.punti + eliminati.bucket + eliminati.eventi + eliminati.modelli,
  };
}

/* ------------------------------------------------------------------ */
/* VACUUM (restituisce le pagine libere: riduce i byte fatturati)      */
/* ------------------------------------------------------------------ */

export interface EsitoVacuum {
  eseguito: boolean;
  /** Rifiuto del server / del client: ONESTO nel rapporto, mai mascherato. */
  errore?: string;
}

/**
 * VACUUM riscrive il file accorciandolo alle pagine realmente usate: dopo
 * cancellazioni consistenti è l'unico modo per RESTITUIRE byte al servizio
 * (la freelist li riusa ma non li restituisce — docs/10 §5 P4). Sul motore
 * nativo è verificato dalla suite (e2e su file); su Turso la piattaforma
 * dichiara VACUUM DISABILITATO (docs/10 §2): se il server lo rifiuta
 * l'errore NON è mascherato — torna nel rapporto e la manutenzione prosegue
 * (VACUUM è un'ottimizzazione, non un prerequisito: la crescita si governa
 * con la ritenuta, che riutilizza le pagine già liberate).
 */
export async function eseguiVacuum(client: object): Promise<EsitoVacuum> {
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: VACUUM non eseguibile.");
  try {
    await c.$executeRawUnsafe("VACUUM");
    return { eseguito: true };
  } catch (e) {
    return { eseguito: false, errore: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------ */
/* Orchestratore (cron notturno, POST «manutenzione», GET report)      */
/* ------------------------------------------------------------------ */

export interface RapportoManutenzione {
  misura: MisuraDimensione;
  quota: ValutazioneQuota;
  integrita: EsitoIntegrita;
  statistiche: StatisticheTabelle;
  proiezione: ProiezioneScritture;
  /** null = la passata non includeva la pulizia (GET read-only). */
  pulizia: EsitoPulizia | null;
  /** null = VACUUM non richiesto in questa passata. */
  vacuum: EsitoVacuum | null;
  /** Byte prima/dopo il VACUUM quando eseguito (misura ripetuta). */
  bytesPrimaVacuum?: number;
  bytesDopoVacuum?: number;
  politica: PoliticaRitenuta;
  generatoIl: string;
}

export interface OpzioniManutenzione {
  /** Esegue la pulizia di ritenuta (default: false — GET resta read-only). */
  pulizia?: boolean;
  /** Solo CONTEGGIO invece di DELETE (usato sulla produzione reale). */
  dryRunPulizia?: boolean;
  /** "auto" (default) = VACUUM solo se la pulizia ha eliminato righe; "mai";
      "sempre". */
  vacuum?: "auto" | "mai" | "sempre";
  /** Politica esplicita (default: dalla ambiente). */
  politica?: PoliticaRitenuta;
  /** Soglie di quota esplicite (default: dalla ambiente). */
  soglie?: SoglieQuota;
}

/**
 * Ciclo completo di manutenzione: misura → integrità → quota → (pulizia) →
 * (VACUUM) → rapporto. Senza `pulizia` NON esegue alcuna scrittura: è la
 * forma usata dal GET read-only e dal primo passo del cron.
 * Ordine VOLUTO: la pulizia precede il VACUUM (le pagine liberate dai DELETE
 * sono quelle che il VACUUM restituisce).
 */
export async function eseguiManutenzioneDb(
  client: object,
  opzioni: OpzioniManutenzione = {},
): Promise<RapportoManutenzione> {
  const politica = opzioni.politica ?? politicaRitenutaDaEnv();
  const soglie = opzioni.soglie ?? soglieQuotaDaEnv();
  const modalitaVacuum = opzioni.vacuum ?? "auto";

  const misura = await misuraDimensioneDb(client);
  const integrita = await verificaIntegritaDb(client, misura.bytes);
  const statistiche = await statisticaTabelle(client);
  let quota = valutazioneQuotaStorage(misura.bytes, soglie);

  let pulizia: EsitoPulizia | null = null;
  if (opzioni.pulizia === true) {
    pulizia = await eseguiPuliziaRitenuta(client, politica, { dryRun: opzioni.dryRunPulizia === true });
  }

  const vacuuma =
    modalitaVacuum === "sempre" ||
    (modalitaVacuum === "auto" && pulizia !== null && pulizia.eseguita && pulizia.totale > 0);

  let vacuum: EsitoVacuum | null = null;
  let bytesPrimaVacuum: number | undefined;
  let bytesDopoVacuum: number | undefined;
  if (vacuuma) {
    bytesPrimaVacuum = (await misuraDimensioneDb(client)).bytes;
    vacuum = await eseguiVacuum(client);
    bytesDopoVacuum = (await misuraDimensioneDb(client)).bytes;
    // La quota è rivalutata DOPO il VACUUM: il rapporto mostra l'effetto reale.
    quota = valutazioneQuotaStorage(bytesDopoVacuum, soglie);
  }

  return {
    misura,
    quota,
    integrita,
    statistiche,
    proiezione: proiezioneScrittureMese(statistiche.nuove24h),
    pulizia,
    vacuum,
    bytesPrimaVacuum,
    bytesDopoVacuum,
    politica,
    generatoIl: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Registro delle esecuzioni (I117: la prova duratura del cron)        */
/* ------------------------------------------------------------------ */

/**
 * Cap FIFO del registro: quante esecuzioni conservare. Il registro è quasi
 * DIARIO (una riga a notte per il cron, più le azioni manuali): 100 righe
 * coprono oltre 3 mesi di storia — oltre, le righe più vecchie vengono
 * eliminate ALLA SCRITTURA (mai crescita senza limite, stessa filosofia dei
 * cap FIFO della ritenuta P3).
 */
export const REGISTRO_CAP = 100;

/** Massimo di righe restituibili da leggiUltimeEsecuzioni (clamp). */
const REGISTRO_LETTURA_MAX = 50;

export interface RigaRegistro {
  id: number;
  /** Momento dell'esecuzione (ISO 8601, come scritto dalla lib). */
  t: string;
  /** Chi ha innescato il ciclo: "cron" | "post". */
  innesco: string;
  /** Esito del ciclo: "ok" | "fallito". */
  esito: string;
  /** Durata del ciclo in ms (null se non misurata). */
  durataMs: number | null;
  /** Dettaglio compatto (JSON parsato; contenuto non-JSON → { grezzo }). */
  dettaglio: Record<string, unknown>;
}

export interface EsitoRegistrazione {
  registrato: boolean;
  /** Presente quando la scrittura NON è riuscita: mai mascherato. */
  errore?: string;
}

export interface NuovaEsecuzione {
  /** Chi ha innescato il ciclo: "cron" (notturno) | "post" (manuale). */
  innesco: "cron" | "post";
  /** Esito del ciclo: "ok" | "fallito". */
  esito: "ok" | "fallito";
  durataMs?: number | null;
  dettaglio?: Record<string, unknown>;
  /** Momento da registrare (default: ora) — parametro dei test. */
  ora?: number;
}

/**
 * Registra UNA esecuzione della manutenzione (cron notturno o azione POST
 * «manutenzione»). BEST-EFFORT per contratto: NON lancia mai — un problema
 * del registro non deve mascherare né degradare l'esito reale della
 * manutenzione (che resta nella risposta HTTP); il risultato dichiara
 * onestamente registrato/errore e la route lo riporta a log. SQL SEMPRE
 * parametrizzato; `t` in ISO TEXT (questa tabella NON subisce confronti
 * temporali: l'ordine è l'id AUTOINCREMENT — il problema delle due codifiche
 * I111 non la riguarda). Cap FIFO applicato ALLA SCRITTURA.
 */
export async function registraEsecuzione(
  client: object,
  dati: NuovaEsecuzione,
): Promise<EsitoRegistrazione> {
  const c = superficieSql(client);
  if (!c) return { registrato: false, errore: "Client senza superficie SQL: registro non aggiornabile." };
  const t = new Date(dati.ora ?? Date.now()).toISOString();
  const durataMs =
    dati.durataMs === undefined || dati.durataMs === null ? null : Math.max(0, Math.round(dati.durataMs));
  const dettaglio = JSON.stringify(dati.dettaglio ?? {});
  try {
    await c.$executeRaw`INSERT INTO "RegistroManutenzione" ("t", "innesco", "esito", "durataMs", "dettaglio") VALUES (${t}, ${dati.innesco}, ${dati.esito}, ${durataMs}, ${dettaglio})`;
  } catch (e) {
    return { registrato: false, errore: e instanceof Error ? e.message : String(e) };
  }
  // Cap FIFO alla scrittura: oltre REGISTRO_CAP sopravvivono le più recenti
  // (stesso ordine FIFO dei cap P3; eventi solo per id qui: la t è diagnostica).
  try {
    const conteggio = (await c.$queryRaw`SELECT COUNT(*) AS v FROM "RegistroManutenzione"`) as Array<{
      v: number | bigint;
    }>;
    if (Number(conteggio[0]?.v ?? 0) > REGISTRO_CAP) {
      await c.$executeRaw`DELETE FROM "RegistroManutenzione" WHERE "id" NOT IN (SELECT "id" FROM "RegistroManutenzione" ORDER BY "id" DESC LIMIT ${REGISTRO_CAP})`;
    }
  } catch (e) {
    // L'INSERT è riuscito (registrato: true): il cap può riprovarci alla
    // prossima esecuzione — l'errore è segnalato su stderr, non mascherato.
    console.error("[manutenzione-db] cap del registro non applicato:", e instanceof Error ? e.message : e);
  }
  return { registrato: true };
}

/**
 * Le ultime `quanti` esecuzioni registrate (la più recente prima), esposte
 * dal GET read-only /api/manutenzione: la verifica del cron che NON dipende
 * dalla breve retention dei log della piattaforma. Righe malformate (id non
 * numerico: mock, contenuti inattesi) sono SALTATE — mai presentate come
 * dati validi; `dettaglio` non-JSON arriva come { grezzo }.
 */
export async function leggiUltimeEsecuzioni(client: object, quanti = 10): Promise<RigaRegistro[]> {
  const c = superficieSql(client);
  if (!c) throw new Error("Client senza superficie SQL: registro non leggibile.");
  const limite = Math.min(REGISTRO_LETTURA_MAX, Math.max(1, Math.floor(quanti)));
  const righe = (await c.$queryRaw`SELECT "id", "t", "innesco", "esito", "durataMs", "dettaglio" FROM "RegistroManutenzione" ORDER BY "id" DESC LIMIT ${limite}`) as Array<Record<string, unknown>>;
  const estratte: RigaRegistro[] = [];
  for (const r of righe) {
    const id = Number(r["id"]);
    if (!Number.isFinite(id)) continue; // riga malformata: saltata, non mascherata
    const grezzo = typeof r["dettaglio"] === "string" ? (r["dettaglio"] as string) : "";
    let dettaglio: Record<string, unknown> = { grezzo };
    if (grezzo) {
      try {
        const parsato = JSON.parse(grezzo) as unknown;
        if (parsato && typeof parsato === "object" && !Array.isArray(parsato)) {
          dettaglio = parsato as Record<string, unknown>;
        }
      } catch {
        // resta { grezzo }: onesto anche sul contenuto imprevisto
      }
    }
    const durata = r["durataMs"] === null || r["durataMs"] === undefined ? null : Number(r["durataMs"]);
    /* Lezione I111 estesa ALLA LETTURA (visto nell'e2e motore reale): anche
       scritta come TEXT ISO, la colonna DATETIME può tornare dal driver come
       oggetto Date (deserializzazione della raw query sul tipo dichiarato) —
       normalizzare SEMPRE: Date → toISOString(), stringa → invariata. */
    const tGrezzo: unknown = r["t"];
    const t = tGrezzo instanceof Date ? tGrezzo.toISOString() : String(tGrezzo ?? "");
    estratte.push({
      id,
      t,
      innesco: String(r["innesco"] ?? ""),
      esito: String(r["esito"] ?? ""),
      durataMs: durata !== null && Number.isFinite(durata) ? durata : null,
      dettaglio,
    });
  }
  return estratte;
}

/**
 * Dettaglio compatto del rapporto per il registro: SOLO numeri ed esiti del
 * motore (mai URL, token o variabili d'ambiente — stessa regola delle route).
 * Consumato dal cron (I117) e dall'azione POST «manutenzione».
 */
export function dettaglioManutenzione(
  rapporto: RapportoManutenzione,
  opzioni: { puliziaAutomatica?: boolean } = {},
): Record<string, unknown> {
  return {
    bytes: rapporto.misura.bytes,
    quota: rapporto.quota.livello,
    integrita: rapporto.integrita.eseguito ? (rapporto.integrita.ok ? "ok" : "ko") : "omessa",
    eliminati: rapporto.pulizia ? rapporto.pulizia.totale : null,
    vacuum: rapporto.vacuum ? (rapporto.vacuum.eseguito ? "eseguito" : "rifiutato") : "omesso",
    ...(opzioni.puliziaAutomatica === undefined ? {} : { puliziaAutomatica: opzioni.puliziaAutomatica }),
  };
}

/* ------------------------------------------------------------------ */
/* Formattazione (it-IT, per UI e rapporti testuali)                   */
/* ------------------------------------------------------------------ */

/**
 * Byte → «812 B» / «2,00 KB» / «3,40 MB» / «5,00 GB» (it-IT).
 * Formattazione MANUALE con virgola decimale (lezione I107: su CI i dati ICU
 * di toLocaleString non sono garantiti — qui il formato è deterministico).
 */
export function formattaBytes(n: number): string {
  const valore = Math.max(0, Number(n) || 0);
  const unita: Array<[string, number]> = [
    ["B", 1],
    ["KB", 1024],
    ["MB", 1024 ** 2],
    ["GB", 1024 ** 3],
    ["TB", 1024 ** 4],
  ];
  let scelta = unita[0];
  for (const u of unita) if (valore >= u[1]) scelta = u;
  const q = valore / scelta[1];
  const dec = scelta[0] === "B" ? 0 : q >= 100 ? 0 : q >= 10 ? 1 : 2;
  return `${q.toFixed(dec).replace(".", ",")} ${scelta[0]}`;
}
