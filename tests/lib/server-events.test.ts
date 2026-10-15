/**
 * I99 — Contratto dei client di sincronizzazione degli eventi (I27/I92):
 * lib/server-events.ts.
 *
 * Stessa rete mockata del test server-history: conversione righe server →
 * UsageEvent (scarto dei kind non validi), dedup per id del merge (vince il
 * locale), forma del POST fire-and-forget, normalizzazione I92 della GET e
 * fallback silenziosi.
 */
import { describe, test, expect, afterEach } from "bun:test";

(globalThis as Record<string, unknown>)["window"] = globalThis;

const { serverEventsToEvents, mergeEvents, pushEventsToServer, fetchServerEvents, clearServerEvents } = await import(
  "../../src/lib/server-events"
);

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
const evento = (id: string, t = T) => ({ id, t, kind: "reset" as const, model: "general", win: "interval" as const, message: `msg ${id}`, value: 85 });

describe("I99 — lib/server-events: conversioni pure", () => {
  test("serverEventsToEvents: scarta kind non valido, normalizza win non ammessa → null", () => {
    const out = serverEventsToEvents([
      { id: "a", t: T, kind: "reset", model: "general", win: "interval", message: "ok", value: 1 },
      { id: "b", t: T, kind: "pazzesco", model: null, win: null, message: "kind sbagliato", value: null },
      { id: "c", t: T, kind: "info", model: null, win: "strana", message: "win strana", value: null },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.id === "c")?.win).toBeNull();
  });

  test("mergeEvents: dedup per id (vince il LOCALE), ordinato per t", () => {
    const locale = [evento("x", T + 60_000), { ...evento("y", T), message: "locale" }];
    const remoto = [{ ...evento("y", T), message: "remoto" }];
    const out = mergeEvents(locale, remoto);
    expect(out.map((e) => e.id)).toEqual(["y", "x"]);
    expect(out.find((e) => e.id === "y")?.message).toBe("locale");
  });
});

describe("I99 — lib/server-events: contratti HTTP", () => {
  test("pushEventsToServer: POST /api/events con {events:[…]} e onTotal", async () => {
    let risolto: ((v: number) => void) | null = null;
    const promessa = new Promise<number>((r) => (risolto = r));
    fingeFetch(() => new Response(JSON.stringify({ ok: true, stored: 1, total: 17 }), { status: 200 }));
    pushEventsToServer(evento("e1"), { onTotal: (n) => risolto?.(n) });
    const totale = await promessa;
    expect(ultimaFetch?.url).toBe("/api/events");
    expect(ultimaFetch?.init?.method).toBe("POST");
    const corpo = JSON.parse(String(ultimaFetch?.init?.body)) as { events: Record<string, unknown>[] };
    expect(corpo.events).toHaveLength(1);
    expect(corpo.events[0]).toMatchObject({ id: "e1", kind: "reset" });
    expect(totale).toBe(17);
  });

  test("fetchServerEvents: querystring con kind, normalizzazione I92 (events mancante = [])", async () => {
    fingeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const out = await fetchServerEvents(300, "reset");
    expect(out).toEqual({ ok: true, total: 0, events: [] });
    expect(ultimaFetch?.url).toBe("/api/events?limit=300&kind=reset");
  });

  test("fetchServerEvents: guasto HTTP/rete → null", async () => {
    fingeFetch(() => new Response("nope", { status: 500 }));
    expect(await fetchServerEvents()).toBeNull();
    fingeFetch(null);
    expect(await fetchServerEvents()).toBeNull();
  });

  test("clearServerEvents: DELETE con deleted; null su guasto", async () => {
    fingeFetch(() => new Response(JSON.stringify({ ok: true, deleted: 3 }), { status: 200 }));
    expect(await clearServerEvents()).toBe(3);
    fingeFetch(() => new Response("{}", { status: 503 }));
    expect(await clearServerEvents()).toBeNull();
  });
});
