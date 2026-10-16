/**
 * I111 — Contratti di /api/manutenzione (GET report read-only + POST azioni
 * protette I95) e /api/manutenzione/cron (GET con Bearer CRON_SECRET).
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
  exec: [] as string[],
  unsafe: [] as string[],
};
/* Cumulativo per l'intera sessione del file: il gate DDL è cached per client
   (WeakMap), quindi le sue scritture compaiono SOLO alla prima chiamata — la
   prova «nessuna scrittura indesiderata» deve valere su TUTTO ciò che il file
   ha mai inviato a $executeRawUnsafe, non sull'ultimo test. */
const unsafeTotale: string[] = [];
let eliminatiPerDelete = 3;
let vacuumFallisce = false;

const mockDb = {
  async $queryRaw(q: TemplateStringsArray): Promise<unknown[]> {
    const sql = q.join("");
    reg.query.push(sql);
    if (sql.includes("page_count")) return [{ page_count: 64 }];
    if (sql.includes("page_size")) return [{ page_size: 4096 }];
    if (sql.includes("freelist_count")) return [{ freelist_count: 4 }];
    if (sql.includes("quick_check")) return [{ quick_check: "ok" }];
    return [{ v: 0 }];
  },
  async $executeRaw(q: TemplateStringsArray): Promise<number> {
    const sql = q.join("");
    reg.exec.push(sql);
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
  reg.exec = [];
  reg.unsafe = [];
  eliminatiPerDelete = 3;
  vacuumFallisce = false;
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
  });

  test("MANUTENZIONE_AUTO_PULIZIA=\"0\" disarma SOLO la cancellazione: verifica di salute intatta", async () => {
    impostaEnv({ CRON_SECRET: "segreto-cron", MANUTENZIONE_AUTO_PULIZIA: "0" });
    const res = await getCron(richiesta("segreto-cron"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["puliziaAutomatica"]).toBe(false);
    const m = body["manutenzione"] as Record<string, unknown>;
    expect(m["pulizia"]).toBeNull();
    expect(reg.exec).toHaveLength(0); // nessuna DELETE
    expect((m["misura"] as Record<string, unknown>)["bytes"]).toBe(64 * 4096); // misura comunque
  });
});
