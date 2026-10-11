/**
 * I18 — Test del fallback automatico su `coding_plan/remains`:
 * endpoint alternativi per regione, set di trigger HTTP e decisione
 * `shouldTryFallback` (pura). Il parser è condiviso col primario
 * (verdetto V4 = IDENTICI, accettazione documentale — docs/04 riga I18):
 * un test di parità verifica che una risposta coding_plan identica produca
 * lo stesso snapshot.
 */
import { describe, test, expect } from "bun:test";
import {
  CODING_PLAN_ENDPOINTS,
  FALLBACK_TRIGGER_HTTP,
  REGION_ENDPOINTS,
  parseUsageResponse,
  shouldTryFallback,
} from "@/lib/minimax";

describe("I18 — CODING_PLAN_ENDPOINTS", () => {
  test("espongono gli host API distinti dal primario", () => {
    expect(CODING_PLAN_ENDPOINTS.eu).toBe("https://api.minimax.io/v1/api/openplatform/coding_plan/remains");
    expect(CODING_PLAN_ENDPOINTS.cn).toBe("https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains");
  });

  test("sono distinti dai primari token_plan ma stessa chiave regione", () => {
    for (const region of ["eu", "cn"] as const) {
      expect(CODING_PLAN_ENDPOINTS[region]).not.toBe(REGION_ENDPOINTS[region]);
      expect(CODING_PLAN_ENDPOINTS[region]).toContain("coding_plan/remains");
      expect(REGION_ENDPOINTS[region]).toContain("token_plan/remains");
    }
  });
});

describe("I18 — FALLBACK_TRIGGER_HTTP", () => {
  test("contiene solo i codici di endpoint scomparso", () => {
    expect([...FALLBACK_TRIGGER_HTTP].sort((a, b) => a - b)).toEqual([404, 405, 410, 501]);
  });

  test("NON contiene errori di autenticazione né transitori", () => {
    for (const code of [401, 403, 429, 500, 502, 503, 504]) {
      expect(FALLBACK_TRIGGER_HTTP.has(code)).toBe(false);
    }
  });
});

describe("I18 — shouldTryFallback", () => {
  test("SI sui trigger HTTP (endpoint scomparso)", () => {
    for (const status of [404, 405, 410, 501]) {
      expect(shouldTryFallback("http", status)).toBe(true);
    }
  });

  test("SI su bad_json (primario che non risponde più in JSON)", () => {
    expect(shouldTryFallback("bad_json")).toBe(true);
  });

  test("NO su errori di autenticazione (401/403/business 1004)", () => {
    expect(shouldTryFallback("auth", 401)).toBe(false);
    expect(shouldTryFallback("auth", 403)).toBe(false);
  });

  test("NO su transitori e rete (compito del retry I51)", () => {
    expect(shouldTryFallback("network")).toBe(false);
    expect(shouldTryFallback("timeout")).toBe(false);
    expect(shouldTryFallback("http", 429)).toBe(false);
    expect(shouldTryFallback("http", 503)).toBe(false);
  });

  test("NO su errori HTTP non-catalogati e su nessun fallimento", () => {
    expect(shouldTryFallback("http", 500)).toBe(false);
    expect(shouldTryFallback("http", 418)).toBe(false);
    expect(shouldTryFallback("http")).toBe(false); // stato mancante: prudenza
    expect(shouldTryFallback("none")).toBe(false);
  });
});

describe("I18 — parità del parser su risposta coding_plan (V4 = IDENTICI)", () => {
  test("una risposta identica al primario produce lo stesso snapshot", () => {
    const corpo = {
      base_resp: { status_code: 0, status_msg: "success" },
      current_subscribe_title: "MiniMax M2 Plan",
      model_remains: [
        {
          model_name: "general",
          current_interval_remaining_percent: 84.5,
          current_interval_status: 1,
          start_time: 1_759_400_000,
          end_time: 1_759_401_800,
          remains_time: 1_800,
          current_weekly_remaining_percent: 62.3,
        },
      ],
    };
    const primario = parseUsageResponse(corpo, { source: "api", region: "eu" });
    const alternativo = parseUsageResponse(corpo, { source: "api", region: "eu" });
    expect(alternativo).toEqual(primario);
    expect(alternativo.models[0].interval?.remainingPercent).toBe(84.5);
  });
});
