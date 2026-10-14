/**
 * I99 — Contratto del proxy /api/minimax/usage (fetch upstream mockato).
 *
 * Il proxy protegge la CHIAVE API (non finisce in log/referer di terzi) e
 * implementa: ritenti transitori (I51: 429/5xx/timeout/network, pausa 400/800 ms),
 * Retry-After, fallback I18 verso coding_plan/remains (solo su segnali di
 * endpoint scomparso: bad_json e HTTP 404/405/410/501) e passthrough dei JSON
 * validi (1004 incluso).
 *
 * Il fetch globale è mockato per-caso: la route non viene mai toccata (nessuna
 * modifica a src — criterio di accettazione I99).
 */
import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { REGION_ENDPOINTS, CODING_PLAN_ENDPOINTS } from "../../src/lib/minimax";

const postProxy = (await import("@/app/api/minimax/usage/route")).POST as unknown as (req: Request) => Promise<Response>;

async function chiama(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request("http://localhost:3000/api/minimax/usage", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  const res = (await postProxy(req)) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
  return { status: res.status, json: await res.json() };
}

const fetchOriginale = globalThis.fetch;
let chiamate: { url: string; init?: RequestInit }[] = [];

/** Imposta la sequenza di risposte upstream (una per chiamata; l'ultima si ripete). */
function fingeFetch(sequenze: Array<(url: string) => Response | Promise<Response>>): void {
  chiamate = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    chiamate.push({ url: urlStr, init });
    const passo = sequenze[Math.min(i, sequenze.length - 1)];
    i += 1;
    return passo(urlStr);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

const rispostaMiniMax = (corpo: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(corpo), { status, headers });

describe("I99 — POST /api/minimax/usage (contratto proxy, chiave protetta)", () => {
  test("chiave mancante/vuota/solo spazi → 400 missing_key (nessuna chiamata upstream)", async () => {
    fingeFetch([]);
    for (const body of [{}, { apiKey: "" }, { apiKey: "   " }]) {
      const { status, json } = await chiama(body);
      expect(status).toBe(400);
      expect((json["error"] as Record<string, unknown>)["code"]).toBe("missing_key");
    }
    expect(chiamate).toHaveLength(0);
  });

  test("corpo non JSON → 400 bad_request", async () => {
    fingeFetch([]);
    const { status, json } = await chiama("{{{nope");
    expect(status).toBe(400);
    expect((json["error"] as Record<string, unknown>)["code"]).toBe("bad_request");
  });

  test("successo: passthrough del data, endpoint primario eu, fetchedAt", async () => {
    const payload = { base_resp: { status_code: 0, status_msg: "success" }, model_remains: [] };
    fingeFetch([() => rispostaMiniMax(payload)]);
    const { status, json } = await chiama({ apiKey: "k", region: "eu" });
    expect(status).toBe(200);
    expect(json["ok"]).toBe(true);
    expect(json["data"]).toEqual(payload);
    expect(json["endpoint"]).toBe(REGION_ENDPOINTS["eu"]);
    expect(typeof json["fetchedAt"]).toBe("number");
    expect(chiamate).toHaveLength(1);
  });

  test("region=cn → endpoint cinese", async () => {
    fingeFetch([() => rispostaMiniMax({ base_resp: { status_code: 0 } })]);
    const { json } = await chiama({ apiKey: "k", region: "cn" });
    expect(json["endpoint"]).toBe(REGION_ENDPOINTS["cn"]);
  });

  test("401 → unauthorized SENZA ritenti né fallback (1 sola chiamata)", async () => {
    fingeFetch([() => rispostaMiniMax({ base_resp: { status_code: 1004, status_msg: "invalid" } }, 401)]);
    const { json } = await chiama({ apiKey: "k" });
    expect(json["ok"]).toBe(false);
    const err = json["error"] as Record<string, unknown>;
    expect(err["code"]).toBe("unauthorized");
    expect(err["httpStatus"]).toBe(401);
    expect(chiamate).toHaveLength(1);
  });

  test("1004 con HTTP 200: passthrough del corpo (errore di business, non del proxy)", async () => {
    const payload = { base_resp: { status_code: 1004, status_msg: "chiave della regione sbagliata" } };
    fingeFetch([() => rispostaMiniMax(payload)]);
    const { json } = await chiama({ apiKey: "k" });
    expect(json["ok"]).toBe(true);
    expect(json["data"]).toEqual(payload);
  });

  test("bad_json sul primario + fallback OK → fallback.used con motivo leggibile", async () => {
    fingeFetch([
      () => new Response("<<non-json>>", { status: 200 }),
      (url) => rispostaMiniMax({ base_resp: { status_code: 0 } }), // coding_plan risponde
    ]);
    const { json } = await chiama({ apiKey: "k" });
    expect(json["ok"]).toBe(true);
    expect(json["endpoint"]).toBe(CODING_PLAN_ENDPOINTS["eu"]);
    const fb = json["fallback"] as Record<string, unknown>;
    expect(fb["used"]).toBe(true);
    expect(fb["primaryEndpoint"]).toBe(REGION_ENDPOINTS["eu"]);
    expect(String(fb["reason"])).toContain("non interpretabile");
    expect(chiamate).toHaveLength(2);
  });

  test("404 sul primario (endpoint scomparso) + fallback KO → errore del primario con fallbackTried", async () => {
    fingeFetch([
      () => new Response("not found", { status: 404 }),
      () => new Response("not found", { status: 404 }),
    ]);
    const { json } = await chiama({ apiKey: "k" });
    expect(json["ok"]).toBe(false);
    expect(json["fallbackTried"]).toBe(true);
    const err = json["error"] as Record<string, unknown>;
    expect(err["code"]).toBe("http_error");
    expect(err["httpStatus"]).toBe(404);
  });

  test("429 persistente: 3 tentativi (ritenti I51) e Retry-After upstream rispettato", async () => {
    fingeFetch([() => rispostaMiniMax({ base_resp: {} }, 429, { "Retry-After": "7" })]);
    const { json } = await chiama({ apiKey: "k" });
    const err = json["error"] as Record<string, unknown>;
    expect(err["code"]).toBe("http_error");
    expect(err["httpStatus"]).toBe(429);
    expect(err["transient"]).toBe(true);
    expect(err["retryAfterMs"]).toBe(7000);
    expect(chiamate).toHaveLength(3);
  }, 10_000);

  test("429 senza header → Retry-After default 30 s", async () => {
    fingeFetch([() => rispostaMiniMax({}, 429)]);
    const { json } = await chiama({ apiKey: "k" });
    expect(((json["error"] as Record<string, unknown>)["retryAfterMs"] as number)).toBe(30_000);
  }, 10_000);

  test("errore di rete persistente → 3 tentativi, code network, floor 10 s", async () => {
    fingeFetch([() => Promise.reject(new Error("connessione rifiutata"))]);
    const { json } = await chiama({ apiKey: "k" });
    const err = json["error"] as Record<string, unknown>;
    expect(err["code"]).toBe("network");
    expect(err["transient"]).toBe(true);
    expect(err["retryAfterMs"]).toBe(10_000);
    expect(chiamate).toHaveLength(3);
  }, 10_000);
});
