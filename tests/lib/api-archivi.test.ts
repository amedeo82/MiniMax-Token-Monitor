/**
 * I99 — Contratti HTTP di scrittura degli archivi server (route-level, db mockato).
 *
 * Estende il pattern I93 (mock.module sul client Prisma + import dinamico delle
 * route) ai contratti che proteggono i DATI: POST/DELETE di /api/history,
 * /api/events e /api/history/models — validazione dei corpi, cap batch 500,
 * dedup per chiave (upsert), normalizzazione campi (source/region/kind/win),
 * limiti GET (clamp) e forma delle risposte.
 *
 * Il mock implementa la semantica Prisma usata dalle route su un archivio
 * in-memory: upsert per chiave (t per i punti, id per gli eventi), deleteMany
 * con filtri t/hourStart lt, count, findMany con orderBy/take (con registro
 * degli argomenti per verificare la composizione della query).
 */
import { describe, test, expect } from "bun:test";

/* ------------------------------------------------------------------ */
/* Archivi in-memory + mock Prisma                                     */
/* ------------------------------------------------------------------ */

type Riga = Record<string, unknown>;
const epoca = (v: unknown): number | string =>
  v instanceof Date ? v.getTime() : typeof v === "number" || typeof v === "string" ? v : NaN;
/** Epoch numerico per ordinamenti (i campi t/hourStart sono sempre date/numeri). */
const tempo = (v: unknown): number => {
  const e = epoca(v);
  return typeof e === "number" ? e : 0;
};

function creaTabella() {
  const righe: Riga[] = [];
  const queryLog: unknown[] = [];
  return {
    righe,
    queryLog,
    async upsert({ where, create, update }: { where: Riga; create: Riga; update: Riga }) {
      const chiave = Object.entries(where)[0];
      const idx = righe.findIndex((r) => {
        const [campo, valore] = chiave as [string, unknown];
        return epoca(r[campo]) === epoca(valore);
      });
      if (idx >= 0) righe[idx] = { ...righe[idx], ...update };
      else righe.push({ ...create });
    },
    async deleteMany({ where }: { where?: Riga } = {}) {
      if (!where || Object.keys(where).length === 0) {
        const n = righe.length;
        righe.length = 0;
        return { count: n };
      }
      const tFilter = (where as { t?: { lt?: unknown } }).t;
      const hFilter = (where as { hourStart?: { lt?: unknown } }).hourStart;
      const soglia = tFilter?.lt !== undefined ? epoca(tFilter.lt) : hFilter?.lt !== undefined ? epoca(hFilter.lt) : null;
      const campo = tFilter?.lt !== undefined ? "t" : "hourStart";
      const prima = righe.length;
      for (let i = righe.length - 1; i >= 0; i--) {
        if (soglia !== null && epoca(righe[i][campo]) < soglia) righe.splice(i, 1);
      }
      return { count: prima - righe.length };
    },
    async count() {
      return righe.length;
    },
    async findMany(args: { orderBy?: Record<string, string>; take?: number; where?: Riga }) {
      queryLog.push(args);
      let out = [...righe];
      const tFilter = (args.where as { t?: { gte?: unknown } } | undefined)?.t;
      if (tFilter?.gte !== undefined) out = out.filter((r) => epoca(r.t) >= epoca(tFilter.gte));
      const ordine = args.orderBy ? Object.entries(args.orderBy)[0] : null;
      if (ordine) {
        const [campo, dir] = ordine;
        out.sort((a, b) => (dir === "desc" ? tempo(b[campo]) - tempo(a[campo]) : tempo(a[campo]) - tempo(b[campo])));
      }
      return args.take !== undefined ? out.slice(0, args.take) : out;
    },
  };
}

const punti = creaTabella();
const eventi = creaTabella();
const ore = creaTabella();

const ultimaQueryPunti: unknown[] = [];
const ultimaQueryEventi: unknown[] = [];

const { mock } = await import("bun:test");
mock.module("@/lib/db", () => ({
  db: {
    usagePoint: {
      upsert: punti.upsert.bind(punti),
      deleteMany: punti.deleteMany.bind(punti),
      count: punti.count.bind(punti),
      findMany: (args: { orderBy?: Record<string, string>; take?: number; where?: Riga }) => {
        ultimaQueryPunti.push(args);
        return punti.findMany(args);
      },
    },
    usageEventRecord: {
      upsert: eventi.upsert.bind(eventi),
      deleteMany: eventi.deleteMany.bind(eventi),
      count: eventi.count.bind(eventi),
      findMany: (args: { orderBy?: Record<string, string>; take?: number; where?: Riga }) => {
        ultimaQueryEventi.push(args);
        return eventi.findMany(args);
      },
    },
    downsampledPoint: {
      findUnique: async () => null, // bucket assente: mergeHourBucket parte da empty
      upsert: ore.upsert.bind(ore),
      deleteMany: ore.deleteMany.bind(ore),
      count: ore.count.bind(ore),
      findMany: ore.findMany.bind(ore),
    },
  },
}));

/* Import DINAMICI dopo il mock.module (il mock deve precedere l'import). */
const postStorico = (await import("@/app/api/history/route")).POST as unknown as (req: Request) => Promise<Response>;
const getStorico = (await import("@/app/api/history/route")).GET as unknown as (req: Request) => Promise<Response>;
const delStorico = (await import("@/app/api/history/route")).DELETE as unknown as () => Promise<Response>;
const postEventi = (await import("@/app/api/events/route")).POST as unknown as (req: Request) => Promise<Response>;
const getEventi = (await import("@/app/api/events/route")).GET as unknown as (req: Request) => Promise<Response>;
const delEventi = (await import("@/app/api/events/route")).DELETE as unknown as () => Promise<Response>;
const postModelli = (await import("@/app/api/history/models/route")).POST as unknown as (req: Request) => Promise<Response>;
const getModelli = (await import("@/app/api/history/models/route")).GET as unknown as (req: Request) => Promise<Response>;
const delModelli = (await import("@/app/api/history/models/route")).DELETE as unknown as (req: Request) => Promise<Response>;

async function risposta(route: (req: Request) => Promise<Response>, body?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request("http://localhost:3000/x", { method: "POST", body, headers: { "Content-Type": "application/json" } });
  return chiama(route, req);
}

/** Chiamata con Request costruita dal test (GET con querystring, DELETE…). */
async function chiama(route: (req: Request) => Promise<Response>, req: Request): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = (await route(req)) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
  return { status: res.status, json: await res.json() };
}

const puntoValido = (t: number) => ({ t, interval: 50, weekly: 70, source: "api", region: "eu" });

/* I99 — i timestamp di test DEVONO essere recenti: dopo ogni POST il pruning
   FIFO elimina i punti più vecchi di 90 giorni (contratto I16) — usando epoch
   2023 tutte le righe erano cancellate prima delle asserzioni. */
const ORA = Date.now();
const T_BASE = ORA - 60 * 60_000; // un'ora fa

/* ------------------------------------------------------------------ */
/* POST /api/history                                                   */
/* ------------------------------------------------------------------ */

describe("I99 — POST /api/history (contratto archivio storico)", () => {
  test("batch valido → 200 {ok, stored, total} e le righe finiscono nell'archivio", async () => {
    punti.righe.length = 0;
    const { status, json } = await risposta(postStorico, JSON.stringify({ points: [puntoValido(T_BASE), puntoValido(T_BASE + 60_000)] }));
    expect(status).toBe(200);
    expect(json["ok"]).toBe(true);
    expect(json["stored"]).toBe(2);
    expect(json["total"]).toBe(2);
  });

  test("corpo non JSON → 400 bad_request", async () => {
    const { status, json } = await risposta(postStorico, "non-json{{{");
    expect(status).toBe(400);
    expect((json["error"] as Record<string, unknown>)["code"]).toBe("bad_request");
  });

  test("points assente/vuoto → 400 «Nessun punto valido»", async () => {
    const a = await risposta(postStorico, JSON.stringify({}));
    const b = await risposta(postStorico, JSON.stringify({ points: [] }));
    const c = await risposta(postStorico, JSON.stringify({ points: "nope" }));
    for (const r of [a, b, c]) {
      expect(r.status).toBe(400);
      expect((r.json["error"] as Record<string, unknown>)["code"]).toBe("bad_request");
    }
  });

  test("cap batch 500: 505 punti → stored 500 (nessun errore)", async () => {
    punti.righe.length = 0;
    const troppi = Array.from({ length: 505 }, (_, i) => puntoValido(T_BASE + 100_000_000 + i));
    const { status, json } = await risposta(postStorico, JSON.stringify({ points: troppi }));
    expect(status).toBe(200);
    expect(json["stored"]).toBe(500);
  });

  test("punti con t non interpretabile → scartati singolarmente, gli altri salvati", async () => {
    punti.righe.length = 0;
    const { json } = await risposta(postStorico, JSON.stringify({ points: [{ t: "abc" }, puntoValido(T_BASE + 200_000_000), { interval: 1 } ] }));
    expect(json["ok"]).toBe(true);
    expect(json["stored"]).toBe(1);
  });

  test("dedup per t (upsert): lo stesso timestamp aggiorna la riga, non la duplica", async () => {
    punti.righe.length = 0;
    await risposta(postStorico, JSON.stringify({ points: [puntoValido(T_BASE + 300_000_000)] }));
    await risposta(postStorico, JSON.stringify({ points: [{ ...puntoValido(T_BASE + 300_000_000), interval: 10 }] }));
    expect(await punti.count()).toBe(1);
    expect(punti.righe[0]["interval"]).toBe(10);
  });

  test("normalizzazione: source oltre 16 caratteri tagliata, region non nota → eu", async () => {
    punti.righe.length = 0;
    await risposta(postStorico, JSON.stringify({ points: [{ t: T_BASE + 400_000_000, interval: 5, weekly: 5, source: "0123456789abcdefghi", region: "mars" }] }));
    expect(punti.righe[0]["source"]).toBe("0123456789abcdef");
    expect(punti.righe[0]["region"]).toBe("eu");
  });
});

/* ------------------------------------------------------------------ */
/* GET/DELETE /api/history — limiti e svuotamento                      */
/* ------------------------------------------------------------------ */

describe("I99 — GET/DELETE /api/history (limiti e svuotamento)", () => {
  test("limit oltre il massimo → clamp a 10000 nella query", async () => {
    ultimaQueryPunti.length = 0;
    await chiama(getStorico, new Request("http://localhost:3000/api/history?limit=99999"));
    const args = ultimaQueryPunti.at(-1) as { take: number };
    expect(args.take).toBe(10000);
  });

  test("limit non numerico → default 2000", async () => {
    ultimaQueryPunti.length = 0;
    await chiama(getStorico, new Request("http://localhost:3000/api/history?limit=abc"));
    const args = ultimaQueryPunti.at(-1) as { take: number };
    expect(args.take).toBe(2000);
  });

  test("granularity=hour → risposta con bucket orari (t, media, ultimo)", async () => {
    ore.righe.length = 0;
    ore.righe.push({ hourStart: new Date(T_BASE + 500_000_000), source: "api", count: 2, minInterval: 40, maxInterval: 50, sumInterval: 90, lastInterval: 40, minWeekly: 60, maxWeekly: 70, sumWeekly: 130, lastWeekly: 65, lastT: new Date(T_BASE + 500_000_000) });
    const { json } = await chiama(getStorico, new Request("http://localhost:3000/api/history?granularity=hour&limit=10"));
    expect(json["ok"]).toBe(true);
    const hours = json["hours"] as { t: number; source: string; count: number; interval: { media: number | null } }[];
    expect(hours).toHaveLength(1);
    expect(hours[0]["interval"]["media"]).toBe(45);
  });

  test("DELETE → {ok, deleted} con il conteggio delle righe eliminate", async () => {
    punti.righe.length = 0;
    await risposta(postStorico, JSON.stringify({ points: [puntoValido(T_BASE + 600_000_000)] }));
    const { json } = await chiama(delStorico, new Request("http://localhost:3000/api/history", { method: "DELETE" }));
    expect(json["ok"]).toBe(true);
    expect(json["deleted"]).toBe(1);
    expect(await punti.count()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* POST/GET/DELETE /api/events                                         */
/* ------------------------------------------------------------------ */

const eventoValido = (id: string) => ({ id, t: T_BASE + 700_000_000, kind: "reset", model: "general", win: "interval", message: `reset ${id}`, value: 85 });

describe("I99 — POST /api/events (contratto archivio eventi)", () => {
  test("batch valido → 200 {ok, stored, total}", async () => {
    eventi.righe.length = 0;
    const { status, json } = await risposta(postEventi, JSON.stringify({ events: [eventoValido("a"), eventoValido("b")] }));
    expect(status).toBe(200);
    expect(json["stored"]).toBe(2);
  });

  test("corpo non JSON → 400; events assente/vuoto → 400", async () => {
    const a = await risposta(postEventi, "{{{");
    const b = await risposta(postEventi, JSON.stringify({ events: [] }));
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });

  test("riga senza id / t invalido / kind non ammesso / message vuoto → scartata", async () => {
    eventi.righe.length = 0;
    const { json } = await risposta(postEventi, JSON.stringify({ events: [
      { t: T_BASE + 700_000_000, kind: "reset", message: "senza id" },
      { id: "x", t: "nope", kind: "reset", message: "t invalido" },
      { id: "y", t: T_BASE + 700_000_000, kind: "pazzesco", message: "kind non ammesso" },
      { id: "z", t: T_BASE + 700_000_000, kind: "reset", message: "   " },
      eventoValido("ok-1"),
    ] }));
    expect(json["stored"]).toBe(1);
    expect(eventi.righe[0]["id"]).toBe("ok-1");
  });

  test("cap batch 500: 503 eventi → stored 500", async () => {
    eventi.righe.length = 0;
    const troppi = Array.from({ length: 503 }, (_, i) => eventoValido(`ev-${i}`));
    const { json } = await risposta(postEventi, JSON.stringify({ events: troppi }));
    expect(json["stored"]).toBe(500);
  });

  test("dedup per id (upsert): stesso id aggiorna la riga", async () => {
    eventi.righe.length = 0;
    await risposta(postEventi, JSON.stringify({ events: [eventoValido("dup")] }));
    await risposta(postEventi, JSON.stringify({ events: [{ ...eventoValido("dup"), message: "aggiornato" }] }));
    expect(await eventi.count()).toBe(1);
    expect(eventi.righe[0]["message"]).toBe("aggiornato");
  });

  test("GET ?kind=warn → filtro passato alla query", async () => {
    ultimaQueryEventi.length = 0;
    await chiama(getEventi, new Request("http://localhost:3000/api/events?kind=warn"));
    const args = ultimaQueryEventi.at(-1) as { where: { kind?: string } };
    expect(args.where["kind"]).toBe("warn");
  });

  test("DELETE → {ok, deleted}", async () => {
    eventi.righe.length = 0;
    await risposta(postEventi, JSON.stringify({ events: [eventoValido("del")] }));
    const { json } = await chiama(delEventi, new Request("http://localhost:3000/api/events", { method: "DELETE" }));
    expect(json["deleted"]).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* POST/GET/DELETE /api/history/models (lib server-model-history mockata) */
/* ------------------------------------------------------------------ */

const upsertChiamate: { model: string; win: string; t: number; percent: number; source: string; region: string }[] = [];
let findModelArgs: Record<string, unknown> | null = null;
let deleteModelArg: string | undefined | null = null;

mock.module("@/lib/server-model-history", () => ({
  upsertModelPoint: async (p: { model: string; win: string; t: number; percent: number; source: string; region: string }) => {
    upsertChiamate.push(p);
  },
  findModelPoints: async (args: Record<string, unknown>) => {
    findModelArgs = args;
    return [{ model: "video", win: "interval", t: ORA - 60_000, percent: 42 }];
  },
  countModelPoints: async () => 1,
  deleteModelPoints: async (model?: string) => {
    deleteModelArg = model ?? null;
    return 7;
  },
  pruneModelHistory: async () => {},
}));

describe("I99 — POST/GET/DELETE /api/history/models (contratto per-modello LONG)", () => {
  test("punto con interval e weekly → DUE righe LONG (win interval + weekly)", async () => {
    upsertChiamate.length = 0;
    const { status, json } = await risposta(postModelli, JSON.stringify({ points: [{ t: T_BASE + 800_000_000, model: "video", interval: 42, weekly: 77, source: "api", region: "eu" }] }));
    expect(status).toBe(200);
    expect(json["stored"]).toBe(1);
    expect(upsertChiamate).toHaveLength(2);
    expect(upsertChiamate.map((c) => c.win).sort()).toEqual(["interval", "weekly"]);
    expect(upsertChiamate[0]["model"]).toBe("video");
  });

  test("punto senza model o senza t → scartato (nessun upsert, stored 0)", async () => {
    upsertChiamate.length = 0;
    const { json } = await risposta(postModelli, JSON.stringify({ points: [{ t: T_BASE + 800_000_000, interval: 1 }, { model: "video" }] }));
    expect(json["stored"]).toBe(0);
    expect(upsertChiamate).toHaveLength(0);
  });

  test("cap batch 500 su 502 punti", async () => {
    upsertChiamate.length = 0;
    const troppi = Array.from({ length: 502 }, (_, i) => ({ t: T_BASE + 800_000_000 + i, model: "video", interval: 1 }));
    const { json } = await risposta(postModelli, JSON.stringify({ points: troppi }));
    expect(json["stored"]).toBe(500);
    expect(upsertChiamate).toHaveLength(500);
  });

  test("GET passa model/win/since/limit a findModelPoints", async () => {
    const { json } = await chiama(getModelli, new Request(`http://localhost:3000/api/history/models?model=video&win=interval&since=${ORA - 3600_000}&limit=77`));
    expect(json["ok"]).toBe(true);
    expect(findModelArgs).toMatchObject({ model: "video", win: "interval", since: ORA - 3600_000, limit: 77 });
  });

  test("win non ammessa → undefined (nessun filtro); DELETE ?model=video passa il nome", async () => {
    await chiama(getModelli, new Request("http://localhost:3000/api/history/models?win=settimanale"));
    expect((findModelArgs as { win?: string })["win"]).toBeUndefined();

    const { json } = await chiama(delModelli, new Request("http://localhost:3000/api/history/models?model=video"));
    expect(deleteModelArg).toBe("video");
    expect(json["deleted"]).toBe(7);
  });

  test("DELETE senza ?model → TUTTI i modelli (undefined)", async () => {
    deleteModelArg = null;
    await chiama(delModelli, new Request("http://localhost:3000/api/history/models"));
    expect(deleteModelArg).toBe(null); // modelRaw ?? undefined → undefined → mock registra null
  });
});
