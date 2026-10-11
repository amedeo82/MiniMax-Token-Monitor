/**
 * I52 — Test di PARITÀ tra le due implementazioni della logica condivisa:
 * - lato app (TypeScript): `src/lib/minimax.ts` + `src/lib/usage-events.ts`
 * - lato Service Worker (JavaScript puro): `public/sw-shared.js`
 *
 * Il SW non può importare i moduli TS, quindi `sw-shared.js` ne duplica la
 * semantica; questi test eseguono le STESSSE fixture su entrambi e confrontano
 * gli output, così una divergenza (TS aggiornato, JS no) rompe la suite.
 * Copre anche i due bug corretti in verifica: base_resp annidato e gestione
 * corretta del 1004 (il SW non deve mai trattarlo come snapshot valido).
 */
import { describe, test, expect } from "bun:test";
import { parseUsageResponse, type QuotaWindow } from "@/lib/minimax";
import { evaluateTransitions, windowThresholdKey, type AlertConfig } from "@/lib/usage-events";

// Modulo JS puro senza tipi dichiarati (allowJs): lato runtime bun lo esegue
// e popola globalThis.MMSwShared.
import "../../public/sw-shared.js";
const MMSwShared = (globalThis as Record<string, unknown>).MMSwShared as {
  parseUsagePayload: (raw: unknown) => { ok: boolean; snapshot?: Record<string, unknown>; statusCode?: number; error?: string };
  quotaKeyFor: (name: string, win: "interval" | "weekly", w: QuotaWindow | null) => "h5" | "h24" | "weekly";
  evaluate: (prev: unknown, next: unknown, cfg: unknown) => { alerts: Record<string, unknown>[]; resets: Record<string, unknown>[] };
};

const EPOCH_S = 1_759_400_000;
const EPOCH_MS = EPOCH_S * 1000;
const opts = { source: "api" as const, region: "eu" as const };

/** Risposta completa con un modello general (finestre 5h + weekly). */
function risposta(overrides: Record<string, unknown> = {}) {
  return {
    base_resp: { status_code: 0, status_msg: "success" },
    current_subscribe_title: "Piano M2",
    points_balance: 10,
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

/** Confronta lo snapshot TS con quello condiviso (ignora fetchedAt/region). */
function confrontaModelli(raw: unknown) {
  const ts = parseUsageResponse(raw, opts);
  const sw = MMSwShared.parseUsagePayload(raw);
  expect(sw.ok).toBe(true);
  const s = sw.snapshot as { models: unknown[]; planTitle: unknown; credits: unknown };
  expect(s.models).toEqual(ts.models);
  expect(s.planTitle).toBe(ts.planTitle);
  expect(s.credits).toBe(ts.credits);
  return { ts, sw };
}

describe("sw-parity: parseUsagePayload ≡ parseUsageResponse", () => {
  test("1 — risposta piatta: modelli identici", () => {
    confrontaModelli(risposta());
  });

  test("2 — risposta annidata sotto data: modelli identici", () => {
    confrontaModelli({ data: risposta() });
  });

  test("3 — BUG base_resp annidato: base_resp SOLO dentro data → ok su entrambi", () => {
    const dentroData = risposta() as Record<string, unknown>;
    delete dentroData.base_resp;
    const raw = { data: { base_resp: { status_code: 0, status_msg: "success" }, ...dentroData } };
    confrontaModelli(raw);
  });

  test("4 — BUG base_resp annidato: risposta con base_resp a radice e data senza → ok su entrambi", () => {
    const dentroData = risposta() as Record<string, unknown>;
    delete dentroData.base_resp;
    const raw = { base_resp: { status_code: 0, status_msg: "success" }, data: dentroData };
    confrontaModelli(raw);
  });

  test("5 — status 1004: entrambi ok:false con statusCode 1004 (il SW non cachera mai questo)", () => {
    const raw = risposta({ base_resp: { status_code: 1004, status_msg: "invalid key" } });
    const sw = MMSwShared.parseUsagePayload(raw);
    let tsCode: number | undefined;
    try {
      parseUsageResponse(raw, opts);
      throw new Error("il TS doveva lanciare");
    } catch (e) {
      tsCode = (e as Error & { statusCode?: number }).statusCode;
    }
    expect(sw.ok).toBe(false);
    expect(sw.statusCode).toBe(1004);
    expect(tsCode).toBe(1004);
    expect(sw.error).toContain("1004");
  });

  test("6 — status 5: messaggio upstream riportato su entrambi", () => {
    const raw = risposta({ base_resp: { status_code: 5, status_msg: "server busy" } });
    const sw = MMSwShared.parseUsagePayload(raw);
    expect(sw.ok).toBe(false);
    expect(sw.error).toContain("server busy");
    expect(() => parseUsageResponse(raw, opts)).toThrow(/server busy/);
  });

  test("7 — epoch in secondi normalizzato a ms su entrambi", () => {
    const { ts, sw } = confrontaModelli(risposta());
    const tsW = ts.models[0].interval!;
    const swW = (sw.snapshot as { models: { interval: QuotaWindow }[] }).models[0].interval;
    expect(swW.start).toBe(tsW.start);
    expect(swW.start).toBe(EPOCH_MS);
  });

  test("8 — remains_time in secondi convertito a ms su entrambi", () => {
    const { ts, sw } = confrontaModelli(risposta());
    const tsW = ts.models[0].interval!;
    const swW = (sw.snapshot as { models: { interval: QuotaWindow }[] }).models[0].interval;
    expect(swW.remainsTimeMs).toBe(tsW.remainsTimeMs);
    expect(swW.remainsTimeMs).toBe(18_000_000);
  });

  test("9 — stato numerico normalizzato a stringa su entrambi", () => {
    const { ts, sw } = confrontaModelli(risposta());
    const swW = (sw.snapshot as { models: { interval: QuotaWindow }[] }).models[0].interval;
    expect(swW.status).toBe(ts.models[0].interval!.status);
    expect(swW.status).toBe("1");
  });

  test("10 — alias del titolo del piano su entrambi (plan_name, combo_title, combo_card)", () => {
    confrontaModelli(risposta({ current_subscribe_title: undefined, plan_name: "Piano B" }));
    confrontaModelli(risposta({ current_subscribe_title: undefined, current_combo_card: { title: "Card T" } }));
    confrontaModelli(risposta({ current_subscribe_title: undefined }));
  });

  test("11 — alias dei crediti su entrambi (credits_balance, balance)", () => {
    const no = { points_balance: undefined, point_balance: undefined };
    confrontaModelli(risposta({ ...no, credits_balance: 5 }));
    confrontaModelli(risposta({ ...no, balance: 7 }));
  });
});

describe("sw-parity: quotaKeyFor ≡ windowThresholdKey", () => {
  const w = (durMs: number | null): QuotaWindow => ({
    remainingPercent: 50,
    totalCount: null,
    remainingCount: null,
    status: null,
    start: durMs !== null ? 1_000 : null,
    end: durMs !== null ? 1_000 + durMs : null,
    remainsTimeMs: null,
  });
  const H = 3_600_000;

  test("12 — durata reale: 24h → h24, 5h → h5, 12h → fallback, weekly → weekly", () => {
    expect(MMSwShared.quotaKeyFor("general", "interval", w(24 * H))).toBe(windowThresholdKey("general", "interval", w(24 * H)));
    expect(MMSwShared.quotaKeyFor("general", "interval", w(5 * H))).toBe(windowThresholdKey("general", "interval", w(5 * H)));
    expect(MMSwShared.quotaKeyFor("general", "interval", w(12 * H))).toBe(windowThresholdKey("general", "interval", w(12 * H)));
    expect(MMSwShared.quotaKeyFor("general", "weekly", null)).toBe(windowThresholdKey("general", "weekly", null));
    expect(MMSwShared.quotaKeyFor("general", "interval", w(24 * H))).toBe("h24");
    expect(MMSwShared.quotaKeyFor("general", "interval", w(5 * H))).toBe("h5");
  });

  test("13 — fallback per nome modello senza finestra: video → h24, general → h5", () => {
    expect(MMSwShared.quotaKeyFor("video", "interval", null)).toBe(windowThresholdKey("video", "interval", null));
    expect(MMSwShared.quotaKeyFor("video", "interval", null)).toBe("h24");
    expect(MMSwShared.quotaKeyFor("general", "interval", null)).toBe(windowThresholdKey("general", "interval", null));
    expect(MMSwShared.quotaKeyFor("general", "interval", null)).toBe("h5");
  });
});

describe("sw-parity: evaluate ≡ evaluateTransitions", () => {
  const cfg: AlertConfig = {
    alertsEnabled: true,
    thresholds: { h5: { warn: 25, crit: 10 }, h24: { warn: 20, crit: 5 }, weekly: { warn: 30, crit: 15 } },
    notifyReset: true,
    browserNotifications: false,
  };

  test("14 — reset, crit e warn: esiti identici su entrambe le implementazioni", () => {
    const modello = (percent: number) => [
      {
        modelName: "general",
        label: "general",
        interval: { remainingPercent: percent, totalCount: null, remainingCount: null, status: null, start: null, end: null, remainsTimeMs: null },
        weekly: { remainingPercent: 50, totalCount: null, remainingCount: null, status: null, start: null, end: null, remainsTimeMs: null },
      },
    ];
    const snap = (percent: number) => ({
      planTitle: null,
      credits: null,
      models: modello(percent),
      fetchedAt: 0,
      source: "api",
      region: "eu",
    });

    // reset: 40 → 95 (salto +55, arrivo ≥ 90)
    const tsReset = evaluateTransitions(snap(40) as never, snap(95) as never, cfg);
    const swReset = MMSwShared.evaluate(snap(40), snap(95), cfg);
    expect(swReset.resets).toHaveLength(1);
    expect(swReset.resets[0].winKey).toBe(tsReset.resets[0].winKey);
    expect(swReset.resets[0].from).toBe(tsReset.resets[0].from);
    expect(swReset.resets[0].to).toBe(tsReset.resets[0].to);
    expect(swReset.alerts).toHaveLength(0);

    // crit: 15 → 9 (sotto la critica h5 = 10)
    const tsCrit = evaluateTransitions(snap(15) as never, snap(9) as never, cfg);
    const swCrit = MMSwShared.evaluate(snap(15), snap(9), cfg);
    expect(swCrit.alerts).toHaveLength(1);
    expect(swCrit.alerts[0].level).toBe(tsCrit.alerts[0].level);
    expect(swCrit.alerts[0].threshold).toBe(tsCrit.alerts[0].threshold);

    // warn: 30 → 24 (sotto warn 25, sopra crit)
    const tsWarn = evaluateTransitions(snap(30) as never, snap(24) as never, cfg);
    const swWarn = MMSwShared.evaluate(snap(30), snap(24), cfg);
    expect(swWarn.alerts[0].level).toBe(tsWarn.alerts[0].level);
    expect(swWarn.alerts[0].level).toBe("warn");
  });
});
