/**
 * I111 — Contratti di /api/manutenzione (GET report read-only + POST azioni
 * protette I95) e /api/manutenzione/cron (GET con Bearer CRON_SECRET).
 * I117 — il GET espone «ultimeEsecuzioni» (registro della manutenzione) e il
 * ciclo completo (cron + POST «manutenzione») si REGISTRA: il mock cattura
 * anche i PARAMETRI delle $executeRaw per asserire innesco/esito.
 *
 * Il mock di "@/lib/db" (pattern I99) è un CLIENT CON SUPERFICIE SQL COMPLETA
 * (bisogno della lib manutenzione-db: $queryRaw per PRAGMA/COUNT, $executeRaw
 * per le DELETE, $executeRawUnsafe per il gate DDL e VACUUM) — registra tutto:
 * il test del GET read-only può DIMOSTRARE l'assenza di scritture (zero
 * $executeRaw, $executeRawUnsafe solo DDL del gate, mai VACUUM/DELETE).
 *
 * Igiene ambiente con DELETE, mai undefined (lezione Task 45); ripristino
 * nell'afterAll; ripulisciProtezione a ogni test (rate limit in-memory I95).
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test";

/* ------------------------------------------------------------------ */
/* Client finto con superficie SQL completa e registrazione            */
/* ------------------------------------------------------------------ */

const reg = {
  query: [] as string[],
  queryParams: [] as unknown[][],
  exec: [] as string[],
  /* I117 — i PARAMETRI delle $executeRaw (innesco, esito, durata, dettaglio). */
  execParams: [] as unknown[][],
  unsafe: [] as string[],
};
/* Cumulativo per l'intera sessione del file: il gate DDL è cached per client
   (WeakMap), quindi le sue scritture compaiono SOLO alla prima chiamata — la
   prova «nessuna scrittura indesiderata» deve valere su TUTTO ciò che il file
   ha mai inviato a $executeRawUnsafe, non sull'ultimo test. */
const unsafeTotale: string[] = [];
let eliminatiPerDelete = 3;
let vacuumFallisce = false;
/* I122 — stato del finto archivio demo: conteggio e righe restituite dal mock. */
let conteggioDemo = 0;
let righeDemo: unknown[] = [];

const mockDb = {
  async $queryRaw(q: TemplateStringsArray, ...vals: unknown[]): Promise<unknown[]> {
    const sql = q.join("");
    reg.query.push(sql);
    reg.queryParams.push(vals);
    if (sql.includes("page_count")) return [{ page_count: 64 }];
    if (sql.includes("page_size")) return [{ page_size: 4096 }];
    if (sql.includes("freelist_count")) return [{ freelist_count: 4 }];
    if (sql.includes("quick_check")) return [{ quick_check: "ok" }];
    /* I122 — COUNT e SELECT di backup dell'azione «rimuovi-demo» (l'ordine dei
       controlli conta: il COUNT contiene ANCHE la clausola sulla source). */
    if (sql.includes("COUNT(*)") && sql.includes('"source"')) return [{ v: conteggioDemo }];
    if (sql.includes('FROM "UsagePoint" WHERE "source"')) return righeDemo;
    return [{ v: 0 }];
  },
  async $executeRaw(q: TemplateStringsArray, ...vals: unknown[]): Promise<number> {
    const sql = q.join("");
    reg.exec.push(sql);
    reg.execParams.push(vals);
    return eliminatiPerDelete;
  },
  async $executeRawUnsafe(sql: string): Promise<number> {
    reg.unsafe.push(sql);
    unsafeTotale.push(sql);
    if (vacuumFallisce && sql === "VACUUM") throw new Error("VACUUM disabled");
    return 0;
  },
};

const { mock } = await import("bun:test");
mock.module("@/lib/db", () => ({ db: mockDb }));
/* NB: "@/lib/modalita-persistenza" NON è mockato qui — la lezione I110/I107:
   chi lo mocka deve fornire il mirror COMPLETO della regola reale (default
   assoluto dal CWD, VERCEL → tmpdir) perché db.test.ts verifica la regola
   attraverso il primo mock registrato. Le route di manutenzione usano solo
   `modalitaPersistenza()` (regola ambiente→modalità), che il modulo reale
   risponde correttamente anche in test (env TURSO_* ripulita → "locale"). */

const getManutenzione = (await import("@/app/api/manutenzione/route")).GET as unknown as (req?: Request) => Promise<Response>;
const postManutenzione = (await import("@/app/api/manutenzione/route")).POST as unknown as (req: Request) => Promise<Response>;
const getCron = (await import("@/app/api/manutenzione/cron/route")).GET as unknown as (req: Request) => Promise<Response>;
const { ripulisciProtezione } = await import("../../src/lib/api-protezione");

/* ------------------------------------------------------------------ */
/* Igiene ambiente e stato                                             */
/* ------------------------------------------------------------------ */

const CHIAVI = [
  "ADMIN_TOKEN",
  "CRON_SECRET",
  "MANUTENZIONE_AUTO_PULIZIA",
  "TURSO_DATABASE_URL",
  "TURSO_AUTH_TOKEN",
  "DATABASE_URL",
  "VERCEL",
] as const;
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

beforeEach(() => {
  ripulisciProtezione();
  reg.query = [];
  reg.queryParams = [];
  reg.exec = [];
  reg.execParams = [];
  reg.unsafe = [];
  eliminatiPerDelete = 3;
  vacuumFallisce = false;
  conteggioDemo = 0;
  righeDemo = [];
  impostaEnv({ ADMIN_TOKEN: undefined, CRON_SECRET: undefined, MANUTENZIONE_AUTO_PULIZIA: undefined });
});

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request("http://localhost:3000/api/manutenzione", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers },
  });

/* ------------------------------------------------------------------ */
/* GET read-only                                                        */
/* ------------------------------------------------------------------ */

describe("I111 — GET /api/manutenzione (solo lettura)", () => {
  test("forma completa del rapporto: misura, quota, integrità, statistiche, proiezione, politica", async () => {
    const res = await getManutenzione();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["modalita"]).toBe("locale");
    const m = body["manutenzione"] as Record<string, unknown>;
    expect((m["misura"] as Record<string, unknown>)["bytes"]).toBe(64 * 4096);
    expect((m["misura"] as Record<string, unknown>)["bytesLiberi"]).toBe(4 * 4096);
    expect((m["quota"] as Record<string, unknown>)["livello"]).toBe("ok");
    expect((m["integrita"] as Record<string, unknown>)["esito"]).toBe("ok");
    expect(m["statistiche"] as unknown).toBeDefined();
    expect(m["proiezione"] as unknown).toBeDefined();
    expect((m["politica"] as Record<string, unknown>)["giorniPunti"]).toBe(90);
    // read-only: nessuna pulizia né VACUUM nel rapporto del GET
    expect(m["pulizia"]).toBeNull();
    expect(m["vacuum"]).toBeNull();
    // I117 — il GET espone il registro delle esecuzioni (con il finto le righe
    // senza id sono MALFORMATE: saltate, mai presentate come dati validi)
    expect(body["ultimeEsecuzioni"]).toEqual([]);
  });

  test("il GET NON scrive nulla: zero $executeRaw, $executeRawUnsafe solo DDL del gate (mai VACUUM/DELETE)", async () => {
    await getManutenzione();
    await getManutenzione(); // seconda passata: gate cached, nessuna novità
    expect(reg.exec).toHaveLength(0);
    // Il gate è cached per client (WeakMap): le sue 4 CREATE TABLE sono
    // richieste alla PRIMA chiamata della suite (test precedente) — la prova
    // di assenza vale sul CUMULATIVO dell'intero file.
    expect(unsafeTotale.length).toBeGreaterThan(0);
    expect(unsafeTotale.some((s) => s.includes("VACUUM"))).toBe(false);
    expect(unsafeTotale.some((s) => s.toUpperCase().startsWith("DELETE"))).toBe(false);
    expect(unsafeTotale.every((s) => s.startsWith("CREATE"))).toBe(true);
    // I117 — il registro è letto con una SELECT ($queryRaw), mai con scritture.
    expect(reg.query.some((s) => s.includes('FROM "RegistroManutenzione"'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* POST azioni (guard I95 + zod)                                        */
/* ------------------------------------------------------------------ */

describe("I111 — POST /api/manutenzione (azioni protette)", () => {
  test("corpo non JSON → 400 bad_request; azione invalida → 400 con contratto nell'errore", async () => {
    const nessunJson = await postManutenzione(post("non-json"));
    expect(nessunJson.status).toBe(400);
    const invalida = await postManutenzione(post({ azione: "formattazione" }));
    expect(invalida.status).toBe(400);
    const body = (await invalida.json()) as Record<string, unknown>;
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("bad_request");
    expect(JSON.stringify(body)).toContain("pulizia");
  });

  test("ADMIN_TOKEN attivo senza header → 401 (guard I95: qui la guardia conta doppio)", async () => {
    impostaEnv({ ADMIN_TOKEN: "tok-manutenzione" });
    const res = await postManutenzione(post({ azione: "pulizia" }));
    expect(res.status).toBe(401);
    expect(reg.exec).toHaveLength(0); // nessun DELETE prima del blocco
  });

  test("azione «pulizia»: DELETE di ritenuta + cap su tutte le tabelle, quota rivalutata dopo", async () => {
    const res = await postManutenzione(post({ azione: "pulizia" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    const pulizia = body["pulizia"] as Record<string, unknown>;
    expect(pulizia["eseguita"]).toBe(true);
    expect(pulizia["dryRun"]).toBe(false);
    expect((pulizia["eliminati"] as Record<string, unknown>)["punti"]).toBe(6); // 2 DELETE × 3 (finto)
    expect(body["quota"] as unknown).toBeDefined();
    const deleteSql = reg.exec.filter((s) => s.startsWith("DELETE"));
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "UsagePoint"'))).toHaveLength(2);
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "DownsampledPoint"'))).toHaveLength(1);
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "UsageEventRecord"'))).toHaveLength(2);
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "ModelUsagePoint"'))).toHaveLength(2);
    expect(reg.unsafe.some((s) => s === "VACUUM")).toBe(false); // «pulizia» non fa VACUUM
    // I117 — le azioni PARZIALI non si registrano (interattive, visibili al chiamante)
    expect(reg.exec.some((s) => s.includes("RegistroManutenzione"))).toBe(false);
  });

  test("azione «vacuum»: prima/dopo misurati, recuperati dichiarati, riepilogo it-IT", async () => {
    const res = await postManutenzione(post({ azione: "vacuum" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect((body["vacuum"] as Record<string, unknown>)["eseguito"]).toBe(true);
    expect(body["bytesPrima"]).toBe(64 * 4096);
    expect(body["bytesDopo"]).toBe(64 * 4096);
    expect(body["recuperati"]).toBe(0);
    expect(body["riepilogo"]).toContain("VACUUM eseguito");
    expect(reg.unsafe).toContain("VACUUM");
    // I117 — anche «vacuum» è un'azione parziale: nessuna riga nel registro
    expect(reg.exec.some((s) => s.includes("RegistroManutenzione"))).toBe(false);
  });

  test("azione «manutenzione»: ciclo completo — con eliminazioni il VACUUM parte in auto", async () => {
    const res = await postManutenzione(post({ azione: "manutenzione" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const m = body["manutenzione"] as Record<string, unknown>;
    expect((m["pulizia"] as Record<string, unknown>)["eseguita"]).toBe(true);
    expect((m["vacuum"] as Record<string, unknown>)["eseguito"]).toBe(true);
    expect(m["bytesPrimaVacuum"]).toBeDefined();
    expect(m["bytesDopoVacuum"]).toBeDefined();
    // I117 — il ciclo completo MANUALE entra nel registro con innesco "post"
    expect((body["registro"] as Record<string, unknown>)["registrato"]).toBe(true);
    const inserimenti = reg.exec.filter((s) => s.includes('INSERT INTO "RegistroManutenzione"'));
    expect(inserimenti).toHaveLength(1);
    const params = reg.execParams[reg.exec.indexOf(inserimenti[0] as string)] ?? [];
    expect(params).toContain("post");
    expect(params).toContain("ok");
  });

  test("VACUUM rifiutato dal motore → 200 con errore ONESTO nel rapporto (mai mascherato)", async () => {
    vacuumFallisce = true;
    const res = await postManutenzione(post({ azione: "vacuum" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body["vacuum"] as Record<string, unknown>)["eseguito"]).toBe(false);
    expect((body["vacuum"] as Record<string, unknown>)["errore"]).toContain("VACUUM disabled");
    expect(body["riepilogo"]).toContain("non eseguito");
  });
});

/* ------------------------------------------------------------------ */
/* I122 — azione «rimuovi-demo» (DELETE selettivo con backup)           */
/* ------------------------------------------------------------------ */

describe("I122 — POST azione «rimuovi-demo» (DELETE selettivo con backup)", () => {
  const RIGHE = [
    { id: 2, t: 1790000000000, interval: 37.1, weekly: 77.6, source: "demo", region: "eu" },
    { id: 1, t: 1789999000000, interval: 39, weekly: 77.1, source: "demo", region: "eu" },
  ];

  test("dryRun: 200 con conteggio + backup e NESSUN DELETE emesso", async () => {
    conteggioDemo = 2;
    righeDemo = RIGHE;
    const res = await postManutenzione(post({ azione: "rimuovi-demo", dryRun: true }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["azione"]).toBe("rimuovi-demo");
    const r = body["rimozione"] as Record<string, unknown>;
    expect(r["eseguita"]).toBe(false);
    expect(r["dryRun"]).toBe(true);
    expect(r["eliminati"]).toBe(2);
    expect(r["troncato"]).toBe(false);
    expect((r["righe"] as unknown[])).toHaveLength(2);
    // Nessuna $executeRaw demo emessa (il COUNT/SELECT demo restano in $queryRaw).
    expect(reg.exec.filter((s) => s.includes('DELETE FROM "UsagePoint" WHERE "source"'))).toHaveLength(0);
  });

  test("azione reale: DELETE parametrizzato con source=demo e backup delle righe nella risposta", async () => {
    conteggioDemo = 2;
    righeDemo = RIGHE;
    eliminatiPerDelete = 2;
    const res = await postManutenzione(post({ azione: "rimuovi-demo" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const r = body["rimozione"] as Record<string, unknown>;
    expect(r["eseguita"]).toBe(true);
    expect(r["dryRun"]).toBe(false);
    expect(r["eliminati"]).toBe(2);
    expect((r["righe"] as unknown[])).toHaveLength(2);
    const deleteIdx = reg.exec.findIndex((s) => s.includes('DELETE FROM "UsagePoint" WHERE "source"'));
    expect(deleteIdx).toBeGreaterThan(-1);
    // Parametrizzato: "demo" è un PARAMETRO dell'$executeRaw, mai parte dell'SQL.
    expect(reg.execParams[deleteIdx]).toContain("demo");
    expect(reg.exec[deleteIdx]).not.toContain("= demo");
  });

  test("dryRun non-booleano → 400 (lo schema zod accetta solo boolean | assente)", async () => {
    const res = await postManutenzione(post({ azione: "rimuovi-demo", dryRun: "sì" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Cron notturno                                                        */
/* ------------------------------------------------------------------ */

describe("I111 — GET /api/manutenzione/cron (Bearer CRON_SECRET)", () => {
  const richiesta = (bearer?: string): Request =>
    new Request("http://localhost:3000/api/manutenzione/cron", {
      headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    });

  test("CRON_SECRET non impostata → 403 ONESTO (endpoint distruttivo mai aperto al pubblico)", async () => {
    const res = await getCron(richiesta());
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("cron_non_configurato");
    expect(reg.exec).toHaveLength(0);
  });

  test("Bearer assente/sbagliato → 401; token mai restituito", async () => {
    impostaEnv({ CRON_SECRET: "segreto-cron" });
    const senza = await getCron(richiesta());
    expect(senza.status).toBe(401);
    const sbagliato = await getCron(richiesta("nope"));
    expect(sbagliato.status).toBe(401);
    expect(JSON.stringify(await sbagliato.json())).not.toContain("segreto-cron");
  });

  test("Bearer corretto → 200 ciclo completo con pulizia automatica (DELETE reali)", async () => {
    impostaEnv({ CRON_SECRET: "segreto-cron" });
    const res = await getCron(richiesta("segreto-cron"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["ok"]).toBe(true);
    expect(body["azione"]).toBe("manutenzione-programmata");
    expect(body["puliziaAutomatica"]).toBe(true);
    const m = body["manutenzione"] as Record<string, unknown>;
    expect((m["pulizia"] as Record<string, unknown>)["eseguita"]).toBe(true);
    expect(reg.exec.filter((s) => s.startsWith("DELETE")).length).toBe(7);
    // I117 — l'esito del ciclo entra nel REGISTRO (INSERT con innesco "cron")
    // e l'esito della registrazione torna nella risposta; il COUNT del cap
    // restituisce 0 col finto → NESSUNA DELETE oltre le 7 dei dati
    expect((body["registro"] as Record<string, unknown>)["registrato"]).toBe(true);
    const inserimenti = reg.exec.filter((s) => s.includes('INSERT INTO "RegistroManutenzione"'));
    expect(inserimenti).toHaveLength(1);
    const params = reg.execParams[reg.exec.indexOf(inserimenti[0] as string)] ?? [];
    expect(params).toContain("cron");
    expect(params).toContain("ok");
  });

  test("MANUTENZIONE_AUTO_PULIZIA=\"0\" disarma SOLO la cancellazione: verifica di salute intatta", async () => {
    impostaEnv({ CRON_SECRET: "segreto-cron", MANUTENZIONE_AUTO_PULIZIA: "0" });
    const res = await getCron(richiesta("segreto-cron"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["puliziaAutomatica"]).toBe(false);
    const m = body["manutenzione"] as Record<string, unknown>;
    expect(m["pulizia"]).toBeNull();
    // I117 — nessuna DELETE sui dati; il ciclo comunque SI REGISTRA (INSERT)
    expect(reg.exec.filter((s) => s.startsWith("DELETE"))).toHaveLength(0);
    expect(reg.exec.filter((s) => s.includes('INSERT INTO "RegistroManutenzione"'))).toHaveLength(1);
    expect((m["misura"] as Record<string, unknown>)["bytes"]).toBe(64 * 4096); // misura comunque
  });
});
