/**
 * I92 — Test di regressione della normalizzazione delle risposte «lista»
 * degli endpoint archivio (lib/server-response.ts).
 *
 * Bug corretto: i fetcher di lettura (fetchServerHistory/fetchServerEvents/
 * fetchServerHourly) si fidavano della forma `{ok, total, lista}`; il fallback
 * offline del service worker poteva servire un payload di ALTRA forma con
 * `ok:true` (JSON del proxy usage) → `total: undefined` promesso `number` →
 * crash di render dei componenti che chiamano `.toLocaleString()`
 * (Registro eventi e contatori server quando offline).
 *
 * Il caso chiave replica ESATTAMENTE il payload del vecchio fallback SW:
 * `{ ok: true, data: {...} }` senza total né lista.
 */
import { describe, test, expect } from "bun:test";
import { parseServerListResponse } from "@/lib/server-response";

describe("parseServerListResponse (I92)", () => {
  test("risposta valida: total number + items passati attraverso", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const out = parseServerListResponse<{ id: string }>({ ok: true, total: 42, events: items }, "events");
    expect(out).toEqual({ ok: true, total: 42, items });
  });

  test("payload del vecchio fallback SW (usage proxy): ok:true senza total né lista → total 0, items []", () => {
    // Forma reale della risposta POST /api/minimax/usage che il vecchio
    // fallback offline serviva ai GET /api/events e /api/history
    const payload = { ok: true, data: { base_resp: { status_code: 0 } }, retryAfterMs: 0 };
    const out = parseServerListResponse(payload, "events");
    expect(out).not.toBeNull();
    expect(out!.ok).toBe(true);
    expect(out!.total).toBe(0); // NON undefined: il contratto `number` resta vero
    expect(out!.items).toEqual([]);
  });

  test("total degradato (stringa / NaN / assente) → 0", () => {
    expect(parseServerListResponse({ ok: true, total: "42", points: [] }, "points")!.total).toBe(0);
    expect(parseServerListResponse({ ok: true, total: Number.NaN, points: [] }, "points")!.total).toBe(0);
    expect(parseServerListResponse({ ok: true, points: [] }, "points")!.total).toBe(0);
  });

  test("lista mancante o non array → items []", () => {
    expect(parseServerListResponse({ ok: true, total: 3 }, "hours")!.items).toEqual([]);
    expect(parseServerListResponse({ ok: true, total: 3, hours: "nope" }, "hours")!.items).toEqual([]);
  });

  test("ok non true (false / assente) → null (il chiamante resta sui dati locali)", () => {
    expect(parseServerListResponse({ ok: false, total: 1, events: [] }, "events")).toBeNull();
    expect(parseServerListResponse({ total: 1, events: [] }, "events")).toBeNull();
  });

  test("payload non oggetto (null / numero / stringa) → null", () => {
    expect(parseServerListResponse(null, "points")).toBeNull();
    expect(parseServerListResponse(42, "points")).toBeNull();
    expect(parseServerListResponse("ok", "points")).toBeNull();
  });

  test("total Infinity non è ammesso (coerente con isFinite) → 0", () => {
    expect(parseServerListResponse({ ok: true, total: Number.POSITIVE_INFINITY, points: [] }, "points")!.total).toBe(0);
  });
});
