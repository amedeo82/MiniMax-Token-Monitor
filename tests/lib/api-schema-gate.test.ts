/**
 * I107-fix4 — Il gate dello schema incorporato precede OGNI accesso DB nelle
 * rotte (route-level, client mockato con gate VERO).
 *
 * Il bug (report utente su Vercel, 16/10/2026): 500 su /api/events,
 * /api/history e /api/history/models — e stessa classe di guasto per
 * /api/summary. La factory lancia il bootstrap DDL in fire-and-forget (`void
 * preparaSchema(client)`) e fino al fix4 SOLO /api/persistenza attendeva il
 * gate: le altre rotte interpellavano il DB subito — su un'istanza serverless
 * fredda la prima query correva contro lo schema ancora da costruire (o peggio,
 * contro un motore freddo che rifiuta i DDL: probe
 * scripts/verifiche/verifica-i107-fix4-gate.mjs — 0/8 riuscite senza gate,
 * 8/8 col gate) → «The table … does not exist» → 500 su ogni richiesta delle
 * istanze fredde. In locale il guasto non si vedeva mai: `bun run db:push`
 * ha già creato le tabelle e il file esiste da sempre.
 *
 * Meccanica del test:
 * - il mock di "@/lib/db" viene RIREGISTRATO per test con un CLIENTE FRESCO
 *   (identità nuova = chiave WeakMap nuova: il gate `preparaSchema`, NON
 *   mockato, esegue davvero il bootstrap simulato su quel cliente);
 * - il cliente espone `$executeRawUnsafe`: il flag `pronto` si accende solo
 *   quando TUTTI gli statement sono passati (schema completo);
 * - ogni accessor dati registra (pronto, ddlViste) AL MOMENTO della chiamata:
 *   events/history/summary asservono che il PRIMO accesso dati avvenga a
 *   schema completo (una rotta senza gate perde la corsa — il bug di
 *   produzione riprodotto in test);
 * - per la rotta per-modello l'asserzione è al livello GATE (DDL 13/13 prima
 *   della risposta): il binding di "@/lib/server-model-history" dipende da
 *   quale file ha fatto la PRIMA mock.module di quello specificatore
 *   (api-archivi lo mocka canned) e bun 1.3.14 esegue i file in ordine NON
 *   alfabetico — la regola di rebinding osservata (probe di biseca): un
 *   importatore caricato SENZA mock segue solo la prima registrazione, uno
 *   caricato SOTTO mock le segue tutte. Il binding "@/lib/db" delle rotte è
 *   invece SEMPRE sotto mock (ogni file che carica le rotte registra il suo
 *   mock prima dell'import): segue ogni riregistrazione in ogni ordine.
 */
import { describe, test, expect } from "bun:test";
import { SCHEMA_PERSISTENZA, preparaSchema } from "@/lib/schema-persistenza";

const { mock } = await import("bun:test");

/* ------------------------------------------------------------------ */
/* Stato del cliente corrente (riarmato per test da nuovoScenario)     */
/* ------------------------------------------------------------------ */

type Accesso = { che: string; pronto: boolean; ddlViste: number };

let accessi: Accesso[] = [];
let pronto = false;
let ddlViste = 0;
let clienteCorrente: Record<string, unknown> = {};

/** Registra un accesso dati con lo stato dello schema AL MOMENTO della chiamata. */
function traccia<T>(che: string, valore: T): T {
  accessi.push({ che, pronto, ddlViste });
  return valore;
}

/** Cliente fresco + riregistrazione del mock: identità nuova per il gate reale. */
function nuovoScenario(): Record<string, unknown> {
  pronto = false;
  ddlViste = 0;
  accessi = [];
  clienteCorrente = {
    // Il gate VERO (preparaSchema, non mockato) esegue qui il DDL simulato:
    // `pronto` si accende solo dopo l'ULTIMO statement (schema completo).
    $executeRawUnsafe: async (_sql: string) => {
      ddlViste += 1;
      if (ddlViste >= SCHEMA_PERSISTENZA.length) pronto = true;
      return 0;
    },
    // SQL raw della lib I42 (rotta per-modello): risposte vuote sufficienti.
    $queryRaw: async () => traccia("$queryRaw", [] as Record<string, unknown>[]),
    $executeRaw: async () => traccia("$executeRaw", 1),
    usagePoint: {
      findMany: async () => traccia("usagePoint.findMany", []),
      count: async () => traccia("usagePoint.count", 0),
      upsert: async () => traccia("usagePoint.upsert", ({})),
      deleteMany: async () => traccia("usagePoint.deleteMany", { count: 0 }),
      groupBy: async () => traccia("usagePoint.groupBy", []),
      findFirst: async () => traccia("usagePoint.findFirst", null),
    },
    usageEventRecord: {
      findMany: async () => traccia("usageEventRecord.findMany", []),
      count: async () => traccia("usageEventRecord.count", 0),
      upsert: async () => traccia("usageEventRecord.upsert", ({})),
      deleteMany: async () => traccia("usageEventRecord.deleteMany", { count: 0 }),
      groupBy: async () => traccia("usageEventRecord.groupBy", []),
      findFirst: async () => traccia("usageEventRecord.findFirst", null),
    },
    downsampledPoint: {
      findUnique: async () => traccia("downsampledPoint.findUnique", null),
      findMany: async () => traccia("downsampledPoint.findMany", []),
      findFirst: async () => traccia("downsampledPoint.findFirst", null),
      count: async () => traccia("downsampledPoint.count", 0),
      upsert: async () => traccia("downsampledPoint.upsert", ({})),
      deleteMany: async () => traccia("downsampledPoint.deleteMany", { count: 0 }),
    },
  };
  mock.module("@/lib/db", () => ({ db: clienteCorrente }));
  return clienteCorrente;
}

/* Prima registrazione PRIMA dell'import delle rotte (il mock deve precedere). */
nuovoScenario();

type HandlerReq = (req: Request) => Promise<Response>;
type HandlerNoArg = () => Promise<Response>;

const storico = (await import("@/app/api/history/route")) as unknown as {
  GET: HandlerReq;
  POST: HandlerReq;
  DELETE: HandlerReq;
};
const eventi = (await import("@/app/api/events/route")) as unknown as {
  GET: HandlerReq;
  POST: HandlerReq;
  DELETE: HandlerReq;
};
const modelli = (await import("@/app/api/history/models/route")) as unknown as {
  GET: HandlerReq;
  POST: HandlerReq;
  DELETE: HandlerReq;
};
const sintesi = (await import("@/app/api/summary/route")) as unknown as {
  GET: HandlerNoArg;
};

/* ------------------------------------------------------------------ */
/* Helper di asserzione                                                */
/* ------------------------------------------------------------------ */

async function jsonDi(res: Response): Promise<Record<string, unknown>> {
  const r = res as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
  const json = await r.json();
  // Sul 500 il messaggio del motore finisce nell'eccezione: fallisce DICENDO perché.
  if (r.status !== 200) {
    throw new Error(`status ${r.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/** Il primo accesso dati della richiesta è avvenuto a SCHEMA COMPLETO. */
function asserisciGateApplicato(): void {
  const primo = accessi[0];
  expect(primo).toBeDefined();
  expect(primo?.pronto).toBe(true);
  expect(primo?.ddlViste).toBe(SCHEMA_PERSISTENZA.length);
}

/**
 * Il gate è stato invocato e COMPLETATO (13/13 DDL) prima della risposta —
 * indipendente dal lib attivo per la rotta per-modello (reale o canned di
 * api-archivi: vedi il commento d'intestazione). Se la rotta non chiamasse
 * il gate, ddlViste sarebbe 0 qui sotto (il cliente è fresco per test).
 */
function asserisciGateCompletato(): void {
  expect(pronto).toBe(true);
  expect(ddlViste).toBe(SCHEMA_PERSISTENZA.length);
}

const GET = (url: string): Request => new Request(url);
const POST = (url: string, corpo: unknown): Request =>
  new Request(url, { method: "POST", body: JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
const DELETE = (url: string): Request => new Request(url, { method: "DELETE" });

const ORA = Date.now();

/* ------------------------------------------------------------------ */
/* Le 11 combinazioni handler × rotta che toccano il DB                */
/* ------------------------------------------------------------------ */

describe("I107-fix4 — il gate precede ogni accesso DB nelle rotte", () => {
  test("GET /api/history (punti grezzi)", async () => {
    nuovoScenario();
    const json = await jsonDi(await storico.GET(GET("http://localhost/api/history?limit=10")));
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("GET /api/history?granularity=hour (bucket orari)", async () => {
    nuovoScenario();
    const json = await jsonDi(await storico.GET(GET("http://localhost/api/history?granularity=hour&limit=10")));
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("POST /api/history (upsert punto + bucket + pruning)", async () => {
    nuovoScenario();
    const json = await jsonDi(
      await storico.POST(POST("http://localhost/api/history", { points: [{ t: ORA, interval: 42.5 }] })),
    );
    expect(json["ok"]).toBe(true);
    expect(json["stored"]).toBe(1);
    asserisciGateApplicato();
  });

  test("DELETE /api/history", async () => {
    nuovoScenario();
    const json = await jsonDi(await storico.DELETE(DELETE("http://localhost/api/history")));
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("GET /api/events", async () => {
    nuovoScenario();
    const json = await jsonDi(await eventi.GET(GET("http://localhost/api/events?limit=10")));
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("POST /api/events (upsert evento + pruning)", async () => {
    nuovoScenario();
    const json = await jsonDi(
      await eventi.POST(
        POST("http://localhost/api/events", {
          events: [{ id: "gate-ev-1", t: ORA, kind: "warn", message: "soglia superata" }],
        }),
      ),
    );
    expect(json["ok"]).toBe(true);
    expect(json["stored"]).toBe(1);
    asserisciGateApplicato();
  });

  test("DELETE /api/events", async () => {
    nuovoScenario();
    const json = await jsonDi(await eventi.DELETE(DELETE("http://localhost/api/events")));
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("GET /api/history/models — il gate completa il bootstrap prima della risposta", async () => {
    nuovoScenario();
    const json = await jsonDi(await modelli.GET(GET("http://localhost/api/history/models?limit=10")));
    expect(json["ok"]).toBe(true);
    asserisciGateCompletato();
  });

  test("POST /api/history/models — il gate completa il bootstrap prima della risposta", async () => {
    nuovoScenario();
    const json = await jsonDi(
      await modelli.POST(
        POST("http://localhost/api/history/models", {
          points: [{ t: ORA, model: "MiniMax-Text01", interval: 42.5 }],
        }),
      ),
    );
    expect(json["ok"]).toBe(true);
    asserisciGateCompletato();
  });

  test("DELETE /api/history/models — il gate completa il bootstrap prima della risposta", async () => {
    nuovoScenario();
    const json = await jsonDi(await modelli.DELETE(DELETE("http://localhost/api/history/models")));
    expect(json["ok"]).toBe(true);
    asserisciGateCompletato();
  });

  test("GET /api/summary (sintesi KPI read-only)", async () => {
    nuovoScenario();
    const json = await jsonDi(await sintesi.GET());
    expect(json["ok"]).toBe(true);
    asserisciGateApplicato();
  });

  test("meccanica con denti: senza gate il primo accesso vede lo schema NON pronto; col gate, pronto", async () => {
    const cliente = nuovoScenario();
    const tabelle = cliente as {
      usagePoint: { findMany: () => Promise<unknown[]>; count: () => Promise<number> };
    };
    // Senza gate (il bug): accesso immediato → registra schema NON pronto.
    await tabelle.usagePoint.findMany();
    expect(accessi[0]?.pronto).toBe(false);
    expect(accessi[0]?.ddlViste).toBe(0);
    // Col gate: il bootstrap completa il DDL simulato e l'accesso successivo
    // è a schema completo (determinismo, non corsa).
    await preparaSchema(clienteCorrente);
    await tabelle.usagePoint.count();
    expect(accessi[1]?.pronto).toBe(true);
    expect(accessi[1]?.ddlViste).toBe(SCHEMA_PERSISTENZA.length);
  });
});
