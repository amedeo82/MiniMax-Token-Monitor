/**
 * I99 — Contratto di /api/summary (endpoint read-only I80 per widget esterni).
 *
 * Copre la FORMA della risposta KPI (punti per sorgente, arco temporale,
 * ultimo rilevamento, eventi per tipo, downsample) e i casi di archivio
 * vuoto. Tutte le query del mock sono di LETTURA: il test verifica anche che
 * il percorso non scriva nulla (ADR-8 intatto per costruzione).
 */
import { describe, test, expect } from "bun:test";

const ORA = Date.now();

const punti = {
  _totale: 0,
  async count() {
    return this._totale;
  },
  async groupBy({ by }: { by: string[] }) {
    void by;
    return [
      { source: "api", _count: { _all: 7 } },
      { source: "demo", _count: { _all: 3 } },
      { source: "import", _count: { _all: 1 } },
    ];
  },
  async findFirst({ orderBy }: { orderBy: Record<string, string>; select?: Record<string, boolean> }) {
    if (this._totale === 0) return null;
    if (orderBy.t === "asc") return { t: new Date(ORA - 86_400_000) };
    return { t: new Date(ORA), interval: 42.5, weekly: 77.1, source: "api" };
  },
};
const eventi = {
  async count() {
    return 4;
  },
  async groupBy(_: unknown) {
    return [
      { kind: "reset", _count: { _all: 2 } },
      { kind: "warn", _count: { _all: 1 } },
      { kind: "error", _count: { _all: 1 } },
    ];
  },
  async findFirst(_: unknown) {
    return { t: new Date(ORA - 5_000) };
  },
};
const ore = {
  async count() {
    return 5;
  },
  async findFirst({ orderBy }: { orderBy: Record<string, string> }) {
    return orderBy.hourStart === "asc" ? { hourStart: new Date(ORA - 5 * 3600_000) } : { hourStart: new Date(ORA) };
  },
};

let dbVuoto = false;

const { mock } = await import("bun:test");
mock.module("@/lib/db", () => ({
  db: {
    get usagePoint() {
      if (dbVuoto) return { count: async () => 0, groupBy: async () => [], findFirst: async () => null };
      return punti;
    },
    get usageEventRecord() {
      if (dbVuoto) return { count: async () => 0, groupBy: async () => [], findFirst: async () => null };
      return eventi;
    },
    get downsampledPoint() {
      if (dbVuoto) return { count: async () => 0, findFirst: async () => null };
      return ore;
    },
  },
}));

const getSummary = (await import("@/app/api/summary/route")).GET as unknown as () => Promise<Response>;

describe("I99 — GET /api/summary (KPI read-only per widget)", () => {
  test("KPI completa: punti per sorgente (altro = non noti), arco, ultimo rilevamento, eventi, downsample", async () => {
    punti._totale = 11;
    const res = (await getSummary()) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json["ok"]).toBe(true);
    expect(typeof json["generato"]).toBe("number");

    const puntiKpi = json["punti"] as Record<string, number>;
    expect(puntiKpi["totale"]).toBe(11);
    expect(puntiKpi["api"]).toBe(7);
    expect(puntiKpi["demo"]).toBe(3);
    expect(puntiKpi["altro"]).toBe(1);

    const arco = json["arco"] as Record<string, number | null>;
    expect(arco["primo"]).toBe(ORA - 86_400_000);
    expect(arco["ultimo"]).toBe(ORA);

    const ultimo = json["ultimoRilevamento"] as Record<string, unknown>;
    expect(ultimo["interval"]).toBe(42.5);
    expect(ultimo["source"]).toBe("api");

    const eventiKpi = json["eventi"] as { totale: number; perKind: Record<string, number>; ultimo: number | null };
    expect(eventiKpi["totale"]).toBe(4);
    expect(eventiKpi["perKind"]["reset"]).toBe(2);
    expect(eventiKpi["ultimo"]).toBe(ORA - 5_000);

    const down = json["downsample"] as Record<string, number | null>;
    expect(down["ore"]).toBe(5);
    expect(down["prima"]).toBe(ORA - 5 * 3600_000);
    expect(down["ultima"]).toBe(ORA);
  });

  test("archivio vuoto → zero coerenti e null al posto di timestamp/ultimo rilevamento", async () => {
    dbVuoto = true;
    try {
      const json = await ((await getSummary()) as unknown as { json: () => Promise<Record<string, unknown>> }).json();
      const puntiKpi = json["punti"] as Record<string, number>;
      expect(puntiKpi["totale"]).toBe(0);
      expect(puntiKpi["altro"]).toBe(0);
      expect((json["arco"] as Record<string, unknown>)["primo"]).toBeNull();
      expect(json["ultimoRilevamento"]).toBeNull();
      expect((json["eventi"] as Record<string, unknown>)["totale"]).toBe(0);
      expect((json["downsample"] as Record<string, unknown>)["ore"]).toBe(0);
    } finally {
      dbVuoto = false;
    }
  });

  test("nessuna scrittura: il contratto resta read-only (ADR-8) — il mock non espone mutazioni consumate", async () => {
    // Il summary usa SOLO count/groupBy/findFirst: se un domani la route
    // invocasse upsert/deleteMany il mock lancerebbe e il test fallirebbe
    // (TypeError → 500 → status atteso 200 non raggiunto).
    const res = (await getSummary()) as unknown as { status: number };
    expect(res.status).toBe(200);
  });
});
