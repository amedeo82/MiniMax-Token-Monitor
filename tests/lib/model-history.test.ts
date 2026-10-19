/**
 * I82 — Test di `lib/model-history.ts`: storico quota per-modello.
 * Append con dedup 20s, salto dei modelli senza finestre, forward-fill alla
 * lettura, ordine dei modelli osservati, merge locale-vince, long→wide.
 */
import { describe, test, expect } from "bun:test";
import {
  appendModelPoints,
  historyForModel,
  modelNamesOsservati,
  mergeModelHistories,
  modelRowsToPoints,
  type ModelHistoryPoint,
} from "@/lib/model-history";

const S = 20_000;

describe("model-history: appendModelPoints", () => {
  test("crea un punto per OGNI modello con almeno una finestra non null", () => {
    const { points, nuovi } = appendModelPoints(
      [],
      {
        t: 1_000_000,
        source: "api",
        models: [
          { name: "general", interval: 42.5, weekly: 88 },
          { name: "video", interval: 91, weekly: 10 },
        ],
      },
    );
    expect(points).toHaveLength(2);
    expect(points.map((p) => p.model)).toEqual(["general", "video"]);
    expect(nuovi).toEqual(points);
  });

  test("salta i modelli SENZA alcuna finestra osservata e non muta il precedente", () => {
    const prev: ModelHistoryPoint[] = [{ t: 1, model: "general", interval: 50, weekly: null }];
    const { points, nuovi } = appendModelPoints(
      prev,
      { t: 2, source: "api", models: [{ name: "ghost", interval: null, weekly: null }] },
    );
    expect(points).toBe(prev);
    expect(nuovi).toHaveLength(0);
  });

  test("dedup: stesso modello entro 20s SOSTITUISCE l'ultimo punto", () => {
    const prev: ModelHistoryPoint[] = [
      { t: 1_000_000, model: "general", interval: 40, weekly: 80 },
    ];
    const { points, nuovi } = appendModelPoints(
      prev,
      { t: 1_000_000 + 19_000, source: "api", models: [{ name: "general", interval: 39, weekly: 79 }] },
    );
    expect(points).toHaveLength(1);
    expect(points[0].interval).toBe(39);
    expect(nuovi).toHaveLength(1);
  });

  test("fuori dalla finestra di dedup (≥20s) i punti si ACCODANO", () => {
    const prev: ModelHistoryPoint[] = [
      { t: 1_000_000, model: "general", interval: 40, weekly: 80 },
    ];
    const { points } = appendModelPoints(
      prev,
      { t: 1_000_000 + S, source: "api", models: [{ name: "general", interval: 39, weekly: 79 }] },
    );
    expect(points).toHaveLength(2);
  });

  test("il dedup è PER-MODELLO: video nuovo non tocca l'ultimo punto general", () => {
    const prev: ModelHistoryPoint[] = [
      { t: 1_000_000, model: "general", interval: 40, weekly: 80 },
    ];
    const { points } = appendModelPoints(
      prev,
      { t: 1_000_000 + 1000, source: "api", models: [{ name: "video", interval: 95, weekly: 70 }] },
    );
    expect(points).toHaveLength(2);
    expect(points[0].interval).toBe(40);
  });

  test("FIFO: oltre il massimo i punti più vecchi cadono", () => {
    let points: ModelHistoryPoint[] = [];
    for (let i = 0; i < 12; i++) {
      points = appendModelPoints(
        points,
        { t: (i + 1) * 60_000, source: "api", models: [{ name: "general", interval: 100 - i, weekly: 90 }] },
        10,
      ).points;
    }
    expect(points).toHaveLength(10);
    expect(points[0].t).toBe(3 * 60_000);
    expect(points[points.length - 1].t).toBe(12 * 60_000);
  });
});

describe("model-history: historyForModel", () => {
  const storico: ModelHistoryPoint[] = [
    { t: 1, model: "general", interval: 80, weekly: 90 },
    { t: 2, model: "video", interval: 95, weekly: 70 },
    { t: 3, model: "general", interval: null, weekly: 85 },
    { t: 4, model: "general", interval: null, weekly: null },
  ];

  test("filtra per modello e applicail forward-fill (null → precedente → 100)", () => {
    const g = historyForModel(storico, "general");
    expect(g.map((p) => p.t)).toEqual([1, 3, 4]);
    expect(g[0]).toEqual({ t: 1, interval: 80, weekly: 90 });
    expect(g[1]).toEqual({ t: 3, interval: 80, weekly: 85 }); // interval riempito
    expect(g[2]).toEqual({ t: 4, interval: 80, weekly: 85 }); // entrambi riempiti
  });

  test("primo punto con valori mancanti → 100 (semantica pushHistory)", () => {
    const v = historyForModel([{ t: 1, model: "video", interval: null, weekly: 33 }], "video");
    expect(v).toEqual([{ t: 1, interval: 100, weekly: 33 }]);
  });

  test("modello assente → storico vuoto (le analisi mostrano gli empty state)", () => {
    expect(historyForModel(storico, "fantasma")).toEqual([]);
  });
});

describe("model-history: modelNamesOsservati", () => {
  test("«general» sempre primo, poi ordine di prima comparsa", () => {
    const pts: ModelHistoryPoint[] = [
      { t: 1, model: "video", interval: 1, weekly: 1 },
      { t: 2, model: "general", interval: 1, weekly: 1 },
      { t: 3, model: "audio", interval: 1, weekly: 1 },
      { t: 4, model: "video", interval: 2, weekly: 2 },
    ];
    expect(modelNamesOsservati(pts)).toEqual(["general", "video", "audio"]);
  });

  test("storico vuoto → solo «general» (pivot di default)", () => {
    expect(modelNamesOsservati([])).toEqual(["general"]);
  });
});

describe("model-history: mergeModelHistories", () => {
  test("dedup per (model, t): vince il punto LOCALE, ordinato per t", () => {
    const local: ModelHistoryPoint[] = [{ t: 5, model: "general", interval: 44, weekly: 44 }];
    const remote: ModelHistoryPoint[] = [
      { t: 2, model: "video", interval: 90, weekly: 60 },
      { t: 5, model: "general", interval: 99, weekly: 99 }, // stessa chiave del locale
    ];
    const merged = mergeModelHistories(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.map((p) => p.t)).toEqual([2, 5]);
    expect(merged[1].interval).toBe(44); // locale, non 99
  });
});

describe("model-history: modelRowsToPoints (long → wide)", () => {
  test("due righe (interval+weekly) stesso (model, t) → un punto wide", () => {
    const rows = [
      { model: "general", win: "interval" as const, t: 10, percent: 42, source: "api", region: "eu" },
      { model: "general", win: "weekly" as const, t: 10, percent: 88, source: "api", region: "eu" },
    ];
    expect(modelRowsToPoints(rows)).toEqual([
      { t: 10, model: "general", interval: 42, weekly: 88, source: "api" }, // I124: la source segue il punto
    ]);
  });

  test("riga orfana (una sola finestra) → punto con l'altra a null", () => {
    const rows = [
      { model: "video", win: "interval" as const, t: 20, percent: 91, source: "demo", region: "eu" },
    ];
    expect(modelRowsToPoints(rows)).toEqual([
      { t: 20, model: "video", interval: 91, weekly: null, source: "demo" }, // I124: anche i demo sono marcati
    ]);
  });

  test("win sconosciuta scartata; ordinamento per t preservato", () => {
    const rows = [
      { model: "general", win: "weekly" as const, t: 31, percent: 80, source: "api", region: "eu" },
      { model: "general", win: "interval" as const, t: 30, percent: 40, source: "api", region: "eu" },
    ];
    const pts = modelRowsToPoints(rows);
    expect(pts.map((p) => p.t)).toEqual([30, 31]);
  });
});

describe("I124 — marcatura source nello storico per-modello", () => {
  test("appendModelPoints replica la source del campione sui punti", () => {
    const { points } = appendModelPoints(
      [],
      { t: 1_000_000, source: "demo", models: [{ name: "general", interval: 42, weekly: 88 }] },
    );
    expect(points[0].source).toBe("demo");
  });

  test("modelRowsToPoints conserva la source delle righe LONG (stessa per (model, t))", () => {
    const punti = modelRowsToPoints([
      { model: "general", win: "interval", t: 5, percent: 42, source: "api", region: "eu" },
      { model: "general", win: "weekly", t: 5, percent: 88, source: "api", region: "eu" },
    ]);
    expect(punti).toHaveLength(1);
    expect(punti[0].source).toBe("api");
  });

  test("historyForModel propaga la source fino al HistoryPoint (fill compreso)", () => {
    const storico: ModelHistoryPoint[] = [
      { t: 1, model: "video", interval: 95, weekly: 70, source: "api" },
      { t: 2, model: "video", interval: null, weekly: 68, source: "demo" },
    ];
    const flat = historyForModel(storico, "video");
    expect(flat.map((p) => p.source)).toEqual(["api", "demo"]);
    expect(flat[1]).toMatchObject({ interval: 95, weekly: 68 }); // forward-fill invariato
  });
});
