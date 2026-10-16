/**
 * I107 — Contratto di GET /api/persistenza (diagnostica persistenza, SOLO LETTURA).
 *
 * Copre la FORMA della risposta (modalità, host sanificato, test connessione,
 * conteggi per tabella) e i due vincoli di sicurezza che motivano l'item:
 *
 * - le credenziali dell'URL Turso (userinfo e query) NON attraversano MAI
 *   la risposta: l'host è ridotto al solo hostname;
 * - i fallimenti del motore (SELECT 1 o conteggi) degradano in 500 con
 *   `error.code = "db_read"`, senza dettagli oltre il messaggio.
 *
 * Il mock di "@/lib/db" (pattern I99) sostituisce il modulo CANONICO: la
 * `modalitaPersistenza` fornita rispecchia quella reale (solo TURSO_DATABASE_URL,
 * lezione I106) e l'igiene dell'ambiente usa DELETE, mai undefined (lezione
 * Task 45: su CI «undefined» coerza nella stringa truthy "undefined").
 *
 * I107-fix2 — il mirror di `urlPersistenzaLocale` DEVE seguire la regola reale
 * (src/lib/modalita-persistenza.ts): default nel tmpdir con VERCEL=1. È il
 * motivo per cui db.test.ts (che gira DOPO questo file in suite completa e
 * vede questo mock — bun applica il primo mock per specificatore) verifica la
 * regola serverless: il mirror è la fonte vista in-process. Aggiornarli INSIEME.
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Mock del modulo canonico @/lib/db                                    */
/* ------------------------------------------------------------------ */

let conteggi: Record<string, number> = {
  usagePoint: 1234,
  downsampledPoint: 56,
  usageEventRecord: 7,
  modelUsagePoint: 89,
};
let queryRawOk = true;
let countOk = true;
/* I107-fix3 — registra gli statement DDL del gate `preparaSchema(db)`: il primo
   GET della suite li esegue (cache WeakMap per client — i GET successivi non
   li ripetono), i test verificano che il bootstrap preceda i conteggi. */
const ddlEseguiti: string[] = [];

const mockDb = {
  async $queryRaw() {
    if (!queryRawOk) throw new Error("database bloccato");
    return [[1]];
  },
  async $executeRawUnsafe(sql: string) {
    ddlEseguiti.push(sql);
    return 0;
  },
  get usagePoint() {
    return { count: async () => (countOk ? conteggi.usagePoint : Promise.reject(new Error("count fallito"))) };
  },
  get downsampledPoint() {
    return { count: async () => conteggi.downsampledPoint };
  },
  get usageEventRecord() {
    return { count: async () => conteggi.usageEventRecord };
  },
  get modelUsagePoint() {
    return { count: async () => conteggi.modelUsagePoint };
  },
};

const { mock } = await import("bun:test");
mock.module("@/lib/db", () => ({
  db: mockDb,
}));
/* La regola ambiente→modalità è mockata nel SUO modulo (pattern I106: unità
   pura in modulo proprio): il mock di "@/lib/db" resta minimale come negli
   altri test I99/I95 — bun applica il primo mock registrato per specificatore,
   quindi "@/lib/db" NON deve crescere di esportazioni richieste dalle route. */
mock.module("@/lib/modalita-persistenza", () => ({
  modalitaPersistenza: () => (process.env.TURSO_DATABASE_URL?.trim() ? "turso" : "locale"),
  // I107-fix/I107-fix2: mirror dell'helper reale (URL EFFETTIVO del ramo SQLite
  // nativo, unica fonte di verità per factory e host diagnostico). Default
  // ASSOLUTO dal CWD (Prisma risolve i file: relativi rispetto a
  // prisma/schema.prisma — probe empirica I107-fix); con VERCEL=1 il CWD è
  // read-only e il default vive nel tmpdir scrivibile (I107-fix2).
  urlPersistenzaLocale: () =>
    process.env.DATABASE_URL?.trim() ||
    (process.env.VERCEL === "1"
      ? `file:${join(tmpdir(), "db", "custom.db")}`
      : `file:${process.cwd()}/db/custom.db`),
}));

const getPersistenza = (await import("@/app/api/persistenza/route")).GET as unknown as () => Promise<Response>;

/* ------------------------------------------------------------------ */
/* Igiene dell'ambiente: ripristino con DELETE (lezione Task 45)        */
/* ------------------------------------------------------------------ */

const CHIAVI = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "DATABASE_URL", "VERCEL"] as const;
const origine = new Map<string, string | undefined>(CHIAVI.map((k) => [k, process.env[k]]));

function impostaEnv(valori: Partial<Record<(typeof CHIAVI)[number], string>>) {
  for (const k of CHIAVI) {
    const v = valori[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterAll(() => {
  for (const k of CHIAVI) {
    const originale = origine.get(k);
    if (originale === undefined) delete process.env[k];
    else process.env[k] = originale;
  }
});

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  conteggi = { usagePoint: 1234, downsampledPoint: 56, usageEventRecord: 7, modelUsagePoint: 89 };
  queryRawOk = true;
  countOk = true;
  impostaEnv({ TURSO_DATABASE_URL: undefined, TURSO_AUTH_TOKEN: undefined, DATABASE_URL: undefined, VERCEL: undefined });
});

describe("I107 — GET /api/persistenza (diagnostica, solo lettura)", () => {
  test("modalità locale: forma completa della risposta e totale = somma dei conteggi", async () => {
    const res = await getPersistenza();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["modalita"]).toBe("locale");
    // I107-fix3 — il gate del bootstrap è arrivato PRIMA dei conteggi: le 4
    // CREATE TABLE idempotenti sono state richieste al client (cache WeakMap:
    // i GET successivi in questa suite non le ripetono).
    expect(ddlEseguiti.filter((s) => s.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(4);
    // I107-fix: DATABASE_URL assente → default ASSOLUTO risolto dal CWD
    // (prima del fix il display mostrava «db/custom.db» ma il client, senza
    // URL esplicito — allora datasourceUrl, oggi la config dell'adapter I115 —
    // esigeva env("DATABASE_URL") ed esplodeva «Environment variable not
    // found» in ambienti senza file .env).
    expect(body["host"]).toBe(`file:${process.cwd()}/db/custom.db`);
    expect((body["test"] as Record<string, unknown>)["ok"]).toBe(true);
    expect(typeof (body["test"] as Record<string, unknown>)["latenzaMs"]).toBe("number");
    const tabelle = body["tabelle"] as Array<{ tabella: string; etichetta: string; righe: number }>;
    expect(tabelle).toHaveLength(4);
    expect(tabelle.map((t) => t.tabella)).toEqual(["UsagePoint", "DownsampledPoint", "UsageEventRecord", "ModelUsagePoint"]);
    expect(tabelle[0]?.righe).toBe(1234);
    expect(body["totale"]).toBe(1234 + 56 + 7 + 89);
    expect(typeof body["generatoIl"]).toBe("string");
    expect(new Date(body["generatoIl"] as string).getTime()).not.toBeNaN();
  });

  test("DATABASE_URL impostato → host = percorso del file SQLite", async () => {
    impostaEnv({ DATABASE_URL: "file:/percorso/archivio.db" });
    const res = await getPersistenza();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["host"]).toBe("file:/percorso/archivio.db");
    expect(body["modalita"]).toBe("locale");
  });

  test("I107-fix2 — VERCEL=1 senza DATABASE_URL → host = default serverless nel tmpdir (pannello su Vercel senza env)", async () => {
    impostaEnv({ DATABASE_URL: undefined, VERCEL: "1" });
    const res = await getPersistenza();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["modalita"]).toBe("locale");
    expect(body["host"]).toBe(`file:${join(tmpdir(), "db", "custom.db")}`);
  });

  test("modalità turso: TURSO_DATABASE_URL decide e l'host è il solo hostname", async () => {
    impostaEnv({ TURSO_DATABASE_URL: "libsql://monitor-org.turso.io" });
    const res = await getPersistenza();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["modalita"]).toBe("turso");
    expect(body["host"]).toBe("monitor-org.turso.io");
  });

  test("SICUREZZA: userinfo e query dell'URL Turso non attraversano mai la risposta", async () => {
    impostaEnv({ TURSO_DATABASE_URL: "libsql://utente:segreto@monitor-org.turso.io:8080/percorso?token=abc123" });
    const res = await getPersistenza();
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("segreto");
    expect(raw).not.toContain("abc123");
    expect(raw).not.toContain("utente");
    expect(raw).not.toContain("percorso");
    expect(raw).not.toContain("8080");
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body["host"]).toBe("monitor-org.turso.io");
  });

  test("URL file: (libsql locale) → modalità turso, host = percorso (diagnostica, non segreto)", async () => {
    impostaEnv({ TURSO_DATABASE_URL: "file:/tmp/i106-prova.db" });
    const res = await getPersistenza();
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["modalita"]).toBe("turso");
    expect(body["host"]).toBe("file:/tmp/i106-prova.db");
  });

  test("SELECT 1 fallita → 500 con error.code db_read (nessun dettaglio sensibile oltre il messaggio)", async () => {
    queryRawOk = false;
    const res = await getPersistenza();
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("db_read");
    expect((body["error"] as Record<string, unknown>)["message"]).toContain("bloccato");
  });

  test("conteggio fallito → 500 db_read (l'endpoint non maschera i guasti del motore)", async () => {
    countOk = false;
    const res = await getPersistenza();
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("db_read");
  });

  test("la modalità segue SOLO TURSO_DATABASE_URL (token da solo non basta — semantica I106)", async () => {
    impostaEnv({ TURSO_AUTH_TOKEN: "tok-segreto" });
    let res = await getPersistenza();
    let body = (await res.json()) as Record<string, unknown>;
    expect(body["modalita"]).toBe("locale");
    expect(JSON.stringify(body)).not.toContain("tok-segreto");

    impostaEnv({ TURSO_AUTH_TOKEN: undefined, TURSO_DATABASE_URL: "libsql://monitor-org.turso.io" });
    res = await getPersistenza();
    body = (await res.json()) as Record<string, unknown>;
    expect(body["modalita"]).toBe("turso");
  });
});
