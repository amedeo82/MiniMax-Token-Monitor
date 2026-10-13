/**
 * I93 — Test di regressione della selezione della fetta nelle GET di archivio
 * (/api/history e /api/events).
 *
 * Il bug: entrambe le GET (e findModelPoints, non testabile qui perché su SQL
 * raw — coperto da check audit) usavano `orderBy t asc` + `take limit`: con
 * archivio più grande del limit la risposta conteneva i punti/eventi PIÙ
 * VECCHI. I consumatori (merge all'avvio, export «Archivio server») vogliono
 * la CONTEMPORANEITÀ, e il pruning FIFO conserva proprio i più recenti — la
 * fetta servita era l'esatto opposto del bisogno.
 *
 * Il fix: `orderBy t desc` + `take limit` + inversione in coda — l'output
 * resta cronologico (contratto invariato) ma la fetta è la più recente.
 *
 * Il mock del db implementa la semantica Prisma usata dalle route (orderBy
 * desc + take + reverse del chiamante), così il test copre l'INTERO percorso:
 * composizione della query e forma della risposta HTTP.
 */
import { describe, test, expect, mock } from "bun:test";

/* ------------------------------------------------------------------ */
/* Dataset simulato (più grande del limit: è il caso che espone il bug) */
/* ------------------------------------------------------------------ */

const T0 = 1_760_000_000_000;
const STEP = 60_000;

/** 10 punti cronologici t0..t9 (i più recenti sono gli ULTIMI). */
const punti = Array.from({ length: 10 }, (_, i) => ({
  t: new Date(T0 + i * STEP),
  interval: 90 - i,
  weekly: 70 - i * 0.5,
  source: "api",
  region: "eu",
}));

/** 10 eventi cronologici (i più recenti sono gli ULTIMI). */
const eventi = Array.from({ length: 10 }, (_, i) => ({
  id: `ev-${i}`,
  t: new Date(T0 + i * STEP),
  kind: "warn",
  model: "general",
  win: "interval",
  message: `evento ${i}`,
  value: 90 - i,
}));

/* ------------------------------------------------------------------ */
/* Mock del client Prisma con la semantica usata dalle route           */
/* ------------------------------------------------------------------ */

/** findMany come Prisma: orderBy desc/asc su t + take. Registra gli argomenti. */
function findManySu<R extends { t: Date }>(rows: R[], args: { orderBy: { t: string }; take?: number }): R[] {
  const ordinate = [...rows].sort((a, b) =>
    args.orderBy?.t === "desc" ? b.t.getTime() - a.t.getTime() : a.t.getTime() - b.t.getTime(),
  );
  return args.take !== undefined ? ordinate.slice(0, args.take) : ordinate;
}

const ultimeQueryStorico: unknown[] = [];
const ultimeQueryEventi: unknown[] = [];

mock.module("@/lib/db", () => ({
  db: {
    usagePoint: {
      findMany: async (args: { orderBy: { t: string }; take?: number }) => {
        ultimeQueryStorico.push(args);
        return findManySu(punti, args);
      },
      count: async () => punti.length,
    },
    usageEventRecord: {
      findMany: async (args: { orderBy: { t: string }; take?: number }) => {
        ultimeQueryEventi.push(args);
        return findManySu(eventi, args);
      },
      count: async () => eventi.length,
    },
    // Il POST non è toccato da questi test; i rimanenti accessori non servono.
  },
}));

/* Import DINAMICI dopo il mock.module (il mock deve precedere l'import).
   Le GET accettano NextRequest ma leggono solo req.url: il cast a
   (req: Request) rende il test indipendente dai tipi Next. */
const getStorico = (await import("@/app/api/history/route")).GET as unknown as (req: Request) => Promise<Response>;
const getEventi = (await import("@/app/api/events/route")).GET as unknown as (req: Request) => Promise<Response>;

async function jsonDi(route: (req: Request) => Promise<Response>, qs: string): Promise<Record<string, unknown>> {
  const res = (await route(new Request(`http://localhost:3000${qs}`))) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/history — fetta PIÙ RECENTE (bug I93)", () => {
  test("con archivio > limit: la risposta contiene i punti più recenti, in ordine cronologico", async () => {
    const json = await jsonDi(getStorico, "/api/history?limit=3");
    const points = json["points"] as { t: number; interval: number }[];
    // I 10 punti simulati hanno t = T0..T0+9·STEP: la fetta giusta è t7,t8,t9
    const attesi = [7, 8, 9].map((i) => T0 + i * STEP);
    expect(points.map((p) => p.t)).toEqual(attesi);
    // Contratto invariato: output cronologico crescente
    expect([...points].sort((a, b) => a.t - b.t).map((p) => p.t)).toEqual(points.map((p) => p.t));
    expect(json["total"]).toBe(10);
  });

  test("la query usa orderBy t desc (la fetta scelta è la più recente)", async () => {
    ultimeQueryStorico.length = 0;
    await jsonDi(getStorico, "/api/history?limit=4");
    expect(ultimeQueryStorico.length).toBe(1);
    const args = ultimeQueryStorico[0] as { orderBy: { t: string }; take: number };
    expect(args.orderBy.t).toBe("desc");
    expect(args.take).toBe(4);
  });

  test("senza limit: default 2000, tutti i punti, ordine cronologico", async () => {
    const json = await jsonDi(getStorico, "/api/history");
    const points = json["points"] as { t: number }[];
    expect(points).toHaveLength(10);
    expect(points.map((p) => p.t)).toEqual(Array.from({ length: 10 }, (_, i) => T0 + i * STEP));
  });
});

describe("GET /api/events — fetta PIÙ RECENTE (bug I93)", () => {
  test("con archivio > limit: la risposta contiene gli eventi più recenti, in ordine cronologico", async () => {
    const json = await jsonDi(getEventi, "/api/events?limit=3");
    const events = json["events"] as { id: string; t: number }[];
    expect(events.map((e) => e.id)).toEqual(["ev-7", "ev-8", "ev-9"]);
    expect(events.map((e) => e.t)).toEqual([7, 8, 9].map((i) => T0 + i * STEP));
    expect(json["total"]).toBe(10);
  });

  test("la query usa orderBy t desc (la fetta scelta è la più recente)", async () => {
    ultimeQueryEventi.length = 0;
    await jsonDi(getEventi, "/api/events?limit=5");
    expect(ultimeQueryEventi.length).toBe(1);
    const args = ultimeQueryEventi[0] as { orderBy: { t: string }; take: number };
    expect(args.orderBy.t).toBe("desc");
    expect(args.take).toBe(5);
  });
});
