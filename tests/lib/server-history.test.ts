/**
 * I99 — Contratto dei client di sincronizzazione dello storico (I16/I68/I92):
 * lib/server-history.ts.
 *
 * La rete è mockata al livello `fetch` globale e `window` è simulato (le
 * funzioni sono no-op su server — guard `typeof window`): si fissano i
 * contratti che proteggono i dati — forma delle richieste POST, dedup del
 * merge (vince il locale), normalizzazione I92 delle risposte e fallback
 * silenziosi (null) su guasti.
 */
import { describe, test, expect, afterEach } from "bun:test";

// Simula l'ambiente browser (le guard window entrano in funzione)
(globalThis as Record<string, unknown>)["window"] = globalThis;

const mod = await import("../../src/lib/server-history");
const { serverPointsToHistory, mergeHistories, pushPointToServer, fetchServerHistory, fetchServerHourly, clearServerHistory } = mod;

const fetchOriginale = globalThis.fetch;
let ultimaFetch: { url: string; init?: RequestInit } | null = null;
let rispostaFinta: (() => Response | Promise<Response>) | null = null;

function fingeFetch(risposta: (() => Response | Promise<Response>) | null): void {
  rispostaFinta = risposta;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    ultimaFetch = { url: urlStr, init };
    if (!rispostaFinta) throw new Error("rete irraggiungibile");
    return rispostaFinta();
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  ultimaFetch = null;
  rispostaFinta = null;
});

const T = 1_760_000_000_000;

describe("I99 — lib/server-history: conversioni pure", () => {
  test("serverPointsToHistory: scarta i punti interamente nulli, default 100 sui null parziali", () => {
    const out = serverPointsToHistory([
      { t: T, interval: 42, weekly: null, source: "api", region: "eu" },
      { t: T + 1, interval: null, weekly: null, source: "api", region: "eu" },
      { t: T + 2, interval: null, weekly: 55, source: "api", region: "eu" },
    ]);
    expect(out).toEqual([
      { t: T, interval: 42, weekly: 100 },
      { t: T + 2, interval: 100, weekly: 55 },
    ]);
  });

  test("mergeHistories: dedup per timestamp (vince il LOCALE), output ordinato", () => {
    const locale = [
      { t: T, interval: 10, weekly: 20 },
      { t: T + 60_000, interval: 30, weekly: 40 },
    ];
    const remoto = [
      { t: T, interval: 99, weekly: 99 }, // stesso t: vince il locale
      { t: T - 60_000, interval: 1, weekly: 2 },
    ];
    const out = mergeHistories(locale, remoto);
    expect(out.map((p) => p.t)).toEqual([T - 60_000, T, T + 60_000]);
    expect(out.find((p) => p.t === T)?.interval).toBe(10);
  });
});

describe("I99 — lib/server-history: contratti HTTP", () => {
  test("pushPointToServer: POST /api/history con body {points:[…]} e onTotal dal total", async () => {
    let risolto: ((v: number) => void) | null = null;
    const promessa = new Promise<number>((r) => (risolto = r));
    fingeFetch(() => new Response(JSON.stringify({ ok: true, stored: 1, total: 1234 }), { status: 200 }));
    pushPointToServer({ t: T, interval: 42, weekly: 55 }, { source: "api", region: "eu", onTotal: (n) => risolto?.(n) });
    const totaleRicevuto = await promessa;
    expect(ultimaFetch?.url).toBe("/api/history");
    expect(ultimaFetch?.init?.method).toBe("POST");
    const corpo = JSON.parse(String(ultimaFetch?.init?.body)) as { points: Record<string, unknown>[] };
    expect(corpo.points).toHaveLength(1);
    expect(corpo.points[0]).toMatchObject({ t: T, interval: 42, weekly: 55, source: "api", region: "eu" });
    expect(totaleRicevuto).toBe(1234);
  });

  test("fetchServerHistory: normalizzazione I92 (total garantito, points mancante = [])", async () => {
    fingeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const out = await fetchServerHistory(2000);
    expect(out).toEqual({ ok: true, total: 0, points: [] });
    expect(ultimaFetch?.url).toBe("/api/history?limit=2000");
  });

  test("fetchServerHistory: guasto HTTP o rete → null (fallback offline silenzioso)", async () => {
    fingeFetch(() => new Response("nope", { status: 500 }));
    expect(await fetchServerHistory()).toBeNull();
    fingeFetch(null); // fetch rifiutata
    expect(await fetchServerHistory()).toBeNull();
  });

  test("fetchServerHourly: querystring granularity=hour + source opzionale", async () => {
    fingeFetch(() => new Response(JSON.stringify({ ok: true, total: 1, hours: [] }), { status: 200 }));
    const out = await fetchServerHourly(500, "demo");
    expect(out?.ok).toBe(true);
    expect(ultimaFetch?.url).toBe("/api/history?granularity=hour&limit=500&source=demo");
  });

  test("clearServerHistory: DELETE con deleted dal body; null su guasto", async () => {
    fingeFetch(() => new Response(JSON.stringify({ ok: true, deleted: 42 }), { status: 200 }));
    expect(await clearServerHistory()).toBe(42);
    expect(ultimaFetch?.init?.method).toBe("DELETE");
    fingeFetch(() => new Response("{}", { status: 503 }));
    expect(await clearServerHistory()).toBeNull();
  });
});
