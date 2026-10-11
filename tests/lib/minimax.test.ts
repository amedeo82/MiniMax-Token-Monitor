/**
 * I50 — Test della libreria core `minimax.ts`: parser tollerante della
 * risposta Token Plan, normalizzazioni epoch/durate, etichette stato e quota.
 */
import { describe, test, expect } from "bun:test";
import {
  REGION_ENDPOINTS,
  consumedPercent,
  findModel,
  inferServerTime,
  modelLabel,
  parseUsageResponse,
  quotaLevel,
  statusLabel,
  type QuotaWindow,
} from "@/lib/minimax";

const EPOCH_S = 1_759_400_000; // secondi
const EPOCH_MS = EPOCH_S * 1000; // millisecondi equivalenti

/** Risposta piatta minimale ma completa (un modello «general»). */
function rispostaPiatta(overrides: Record<string, unknown> = {}) {
  return {
    base_resp: { status_code: 0, status_msg: "success" },
    current_subscribe_title: "MiniMax M2 Plan",
    points_balance: 123.45,
    model_remains: [
      {
        model_name: "general",
        current_interval_remaining_percent: 84.5,
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: 1,
        start_time: EPOCH_S,
        end_time: EPOCH_S + 18_000,
        remains_time: 18_000,
        current_weekly_remaining_percent: 62.3,
        weekly_start_time: EPOCH_S,
        weekly_end_time: EPOCH_S + 7 * 86_400,
        weekly_remains_time: 7 * 86_400,
      },
    ],
    ...overrides,
  };
}

const opts = { source: "api" as const, region: "eu" as const };

describe("minimax: parseUsageResponse — forme della risposta", () => {
  test("risposta piatta: titoli, crediti e modelli estratti", () => {
    const snap = parseUsageResponse(rispostaPiatta(), opts);
    expect(snap.planTitle).toBe("MiniMax M2 Plan");
    expect(snap.credits).toBe(123.45);
    expect(snap.models).toHaveLength(1);
    expect(snap.models[0].modelName).toBe("general");
    expect(snap.source).toBe("api");
    expect(snap.region).toBe("eu");
  });

  test("risposta annidata sotto `data` equivalente alla piatta", () => {
    const piatta = parseUsageResponse(rispostaPiatta(), opts);
    const annidata = parseUsageResponse({ data: rispostaPiatta() }, opts);
    expect(annidata.models).toEqual(piatta.models);
    expect(annidata.planTitle).toBe(piatta.planTitle);
    expect(annidata.credits).toBe(piatta.credits);
  });

  test("non-oggetto → errore esplicito", () => {
    expect(() => parseUsageResponse("nope", opts)).toThrow();
    expect(() => parseUsageResponse(null, opts)).toThrow();
    expect(() => parseUsageResponse([1, 2], opts)).toThrow();
  });

  test("base_resp status_code 1004 → throw con statusCode allegato", () => {
    let caught: (Error & { statusCode?: number }) | null = null;
    try {
      parseUsageResponse(rispostaPiatta({ base_resp: { status_code: 1004, status_msg: "invalid" } }), opts);
    } catch (e) {
      caught = e as Error & { statusCode?: number };
    }
    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(1004);
    expect(caught?.message).toContain("1004");
  });

  test("base_resp diverso da 0 (non 1004) → messaggio con status_msg", () => {
    expect(() =>
      parseUsageResponse(rispostaPiatta({ base_resp: { status_code: 5, status_msg: "server busy" } }), opts),
    ).toThrow(/server busy/);
  });

  test("model_remains assente → snapshot con zero modelli", () => {
    const snap = parseUsageResponse({ base_resp: { status_code: 0 } }, opts);
    expect(snap.models).toHaveLength(0);
    expect(snap.planTitle).toBeNull();
    expect(snap.credits).toBeNull();
  });

  test("voci non-oggetto o senza model_name ignorate", () => {
    const snap = parseUsageResponse(
      rispostaPiatta({ model_remains: ["junk", 42, { current_interval_remaining_percent: 50 }, { model_name: "video", current_interval_remaining_percent: 10 }] }),
      opts,
    );
    expect(snap.models).toHaveLength(1);
    expect(snap.models[0].modelName).toBe("video");
  });

  test("finestre senza alcun dato utile non generano modelli", () => {
    const snap = parseUsageResponse(
      rispostaPiatta({ model_remains: [{ model_name: "ghost" }] }),
      opts,
    );
    expect(snap.models).toHaveLength(0);
  });
});

describe("minimax: parseUsageResponse — normalizzazioni", () => {
  test("epoch in secondi convertito in ms, remain in secondi in ms", () => {
    const snap = parseUsageResponse(rispostaPiatta(), opts);
    const w = snap.models[0].interval;
    expect(w?.start).toBe(EPOCH_MS);
    expect(w?.end).toBe(EPOCH_MS + 18_000_000);
    expect(w?.remainsTimeMs).toBe(18_000_000);
  });

  test("epoch già in ms lasciato invariato", () => {
    const snap = parseUsageResponse(
      rispostaPiatta({
        model_remains: [{ model_name: "general", current_interval_remaining_percent: 9, start_time: EPOCH_MS, end_time: EPOCH_MS + 1000 }],
      }),
      opts,
    );
    expect(snap.models[0].interval?.start).toBe(EPOCH_MS);
  });

  test("status numerico normalizzato in stringa", () => {
    const snap = parseUsageResponse(rispostaPiatta(), opts);
    expect(snap.models[0].interval?.status).toBe("1");
  });

  test("percentuali come stringa numerica accettate", () => {
    const snap = parseUsageResponse(
      rispostaPiatta({ model_remains: [{ model_name: "general", current_interval_remaining_percent: "77.5" }] }),
      opts,
    );
    expect(snap.models[0].interval?.remainingPercent).toBe(77.5);
  });

  test("alias del titolo del piano (plan_name, combo_title, current_combo_card.title)", () => {
    expect(parseUsageResponse(rispostaPiatta({ current_subscribe_title: undefined }), opts).planTitle).toBeNull();
    expect(parseUsageResponse(rispostaPiatta({ current_subscribe_title: undefined, plan_name: "Piano B" }), opts).planTitle).toBe("Piano B");
    expect(parseUsageResponse(rispostaPiatta({ current_subscribe_title: undefined, current_combo_card: { title: "Card T" } }), opts).planTitle).toBe("Card T");
  });

  test("alias dei crediti (point_balance, credits_balance, credit_balance, balance)", () => {
    const no = { points_balance: undefined, point_balance: undefined };
    expect(parseUsageResponse(rispostaPiatta({ ...no, credits_balance: 5 }), opts).credits).toBe(5);
    expect(parseUsageResponse(rispostaPiatta({ ...no, credit_balance: 6 }), opts).credits).toBe(6);
    expect(parseUsageResponse(rispostaPiatta({ ...no, balance: 7 }), opts).credits).toBe(7);
  });

  test("fetchedAt opzionale rispettato, altrimenti Date.now", () => {
    const t = 1_760_000_000_000;
    expect(parseUsageResponse(rispostaPiatta(), { ...opts, fetchedAt: t }).fetchedAt).toBe(t);
    const near = parseUsageResponse(rispostaPiatta(), opts).fetchedAt;
    expect(Math.abs(near - Date.now())).toBeLessThan(5_000);
  });
});

describe("minimax: helper di dominio", () => {
  test("statusLabel: mappatura codici osservati", () => {
    expect(statusLabel("1")?.tone).toBe("ok");
    expect(statusLabel("2")?.tone).toBe("crit");
    expect(statusLabel("3")?.tone).toBe("idle");
    expect(statusLabel("normal")?.label).toBe("Normale");
    expect(statusLabel("exhausted")?.tone).toBe("crit");
    expect(statusLabel("throttled")?.tone).toBe("warn");
    expect(statusLabel("zzz")?.label).toContain("zzz");
    expect(statusLabel(null)).toBeNull();
  });

  test("inferServerTime: end − remains del primo campo credibile", () => {
    const snap = parseUsageResponse(rispostaPiatta(), opts);
    expect(inferServerTime(snap.models)).toBe(EPOCH_MS + 18_000_000 - 18_000_000);
  });

  test("inferServerTime: null senza dati credibili", () => {
    expect(inferServerTime([])).toBeNull();
    const snap = parseUsageResponse(rispostaPiatta({ model_remains: [{ model_name: "general" }] }), opts);
    expect(inferServerTime(snap.models)).toBeNull();
  });

  test("consumedPercent: 100 − residua, limitata 0–100", () => {
    const w = (remaining: number | null): QuotaWindow => ({
      remainingPercent: remaining, totalCount: null, remainingCount: null, status: null, start: null, end: null, remainsTimeMs: null,
    });
    expect(consumedPercent(w(84.5))).toBe(15.5);
    expect(consumedPercent(w(0))).toBe(100);
    expect(consumedPercent(w(100))).toBe(0);
    expect(consumedPercent(w(-5))).toBe(100);
    expect(consumedPercent(w(120))).toBe(0);
    expect(consumedPercent(w(null))).toBeNull();
  });

  test("quotaLevel: soglie 60/30/10 e null → N/D", () => {
    expect(quotaLevel(null).label).toBe("N/D");
    expect(quotaLevel(61).color).toBe("ok");
    expect(quotaLevel(31).color).toBe("good");
    expect(quotaLevel(11).color).toBe("warn");
    expect(quotaLevel(9.9).color).toBe("crit");
  });

  test("findModel case-insensitive + modelLabel fallback", () => {
    const snap = parseUsageResponse(rispostaPiatta(), opts);
    expect(findModel(snap, "GENERAL")?.modelName).toBe("general");
    expect(findModel(snap, "niente")).toBeUndefined();
    expect(modelLabel("general")).toBe("Testo · Immagini · Audio");
    expect(modelLabel("modello_sconosciuto")).toBe("modello_sconosciuto");
  });

  test("endpoint regionali eu/cn dichiarati", () => {
    expect(REGION_ENDPOINTS.eu).toContain("minimax.io");
    expect(REGION_ENDPOINTS.cn).toContain("minimaxi.com");
  });
});
