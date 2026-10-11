/**
 * I50 — Test della libreria core `usage-events.ts`: registro eventi su
 * localStorage (mock in memoria), chiavi soglia per tipo finestra (I28),
 * migrazione soglie legacy, banner e transizioni tra snapshot.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  ALERT_DEFAULTS,
  appendEvents,
  clearEvents,
  deriveBanner,
  evaluateTransitions,
  loadEvents,
  makeEvent,
  migrateLegacyThresholds,
  replaceEvents,
  windowThresholdKey,
  type AlertConfig,
} from "@/lib/usage-events";
import type { ModelQuota, QuotaWindow, UsageSnapshot } from "@/lib/minimax";

/* ------------------------------------------------------------------ */
/* Mock localStorage + window (bun non li espone in test)              */
/* ------------------------------------------------------------------ */

const store = new Map<string, string>();
/* Nota I81: da quando i test di componente registrano happy-dom (bunfig
   preload), localStorage esiste ed è una proprietà a sola LETTURA — si usa
   defineProperty (configurable) per sostituirla col mock deterministico. */
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});
if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
  (globalThis as Record<string, unknown>).window = globalThis;
}

beforeEach(() => {
  store.clear();
});

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */

const H = 3_600_000;

const w = (remaining: number, durMs?: number): QuotaWindow => ({
  remainingPercent: remaining,
  totalCount: null,
  remainingCount: null,
  status: null,
  start: durMs !== undefined ? 1_000 : null,
  end: durMs !== undefined ? 1_000 + durMs : null,
  remainsTimeMs: null,
});

const model = (name: string, interval: number, weekly?: number, intervalDur?: number): ModelQuota => ({
  modelName: name,
  label: name,
  interval: w(interval, intervalDur),
  weekly: weekly !== undefined ? w(weekly) : null,
});

const snap = (models: ModelQuota[]): UsageSnapshot => ({
  planTitle: null,
  credits: null,
  models,
  fetchedAt: Date.now(),
  source: "api",
  region: "eu",
});

const cfg: AlertConfig = {
  alertsEnabled: true,
  thresholds: { h5: { warn: 25, crit: 10 }, h24: { warn: 20, crit: 5 }, weekly: { warn: 30, crit: 15 } },
  notifyReset: true,
  browserNotifications: false,
};

/* ------------------------------------------------------------------ */
/* Registro eventi                                                     */
/* ------------------------------------------------------------------ */

describe("usage-events: registro eventi (localStorage mock)", () => {
  test("makeEvent: campi di default e opzioni", () => {
    const e = makeEvent("warn", "messaggio");
    expect(e.kind).toBe("warn");
    expect(e.message).toBe("messaggio");
    expect(e.model).toBeNull();
    expect(e.win).toBeNull();
    expect(e.value).toBeNull();
    expect(typeof e.t).toBe("number");
    const e2 = makeEvent("crit", "altro", { model: "general", win: "interval", value: 9.5, t: 123 });
    expect(e2.model).toBe("general");
    expect(e2.win).toBe("interval");
    expect(e2.value).toBe(9.5);
    expect(e2.t).toBe(123);
    expect(e2.id).not.toBe(e.id);
  });

  test("appendEvents + loadEvents: roundtrip ordinato dal più vecchio", () => {
    appendEvents([makeEvent("info", "a"), makeEvent("info", "b")]);
    appendEvents(makeEvent("info", "c"));
    const all = loadEvents();
    expect(all.map((e) => e.message)).toEqual(["a", "b", "c"]);
  });

  test("appendEvents: cap a 200 eventi (i più vecchi cadono)", () => {
    for (let i = 0; i < 210; i++) appendEvents(makeEvent("info", `e${i}`));
    const all = loadEvents();
    expect(all).toHaveLength(200);
    expect(all[0].message).toBe("e10");
    expect(all[199].message).toBe("e209");
  });

  test("loadEvents: JSON corrotto o non-array → registro vuoto", () => {
    store.set("mm-dash-events-v1", "{non è json");
    expect(loadEvents()).toEqual([]);
    store.set("mm-dash-events-v1", JSON.stringify({ nope: true }));
    expect(loadEvents()).toEqual([]);
  });

  test("loadEvents: scarta le voci malformate, tiene le valide", () => {
    const valido = makeEvent("info", "ok");
    store.set("mm-dash-events-v1", JSON.stringify([null, "x", { id: 5 }, valido]));
    const all = loadEvents();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(valido.id);
  });

  test("replaceEvents: sostituisce il registro e applica il cap", () => {
    const many = Array.from({ length: 205 }, (_, i) => makeEvent("info", `r${i}`));
    const next = replaceEvents(many);
    expect(next).toHaveLength(200);
    expect(loadEvents()).toHaveLength(200);
    expect(loadEvents()[0].message).toBe("r5");
  });

  test("clearEvents svuota davvero", () => {
    appendEvents(makeEvent("info", "x"));
    clearEvents();
    expect(loadEvents()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Soglie per tipo di finestra (I28)                                   */
/* ------------------------------------------------------------------ */

describe("usage-events: windowThresholdKey", () => {
  test("la settimanale è sempre «weekly»", () => {
    expect(windowThresholdKey("general", "weekly", null)).toBe("weekly");
  });

  test("durata reale 24h → h24, 5h → h5 (indipendente dal nome)", () => {
    expect(windowThresholdKey("general", "interval", w(50, 24 * H))).toBe("h24");
    expect(windowThresholdKey("video", "interval", w(50, 5 * H))).toBe("h5");
  });

  test("bordi inclusi: 23h/25h → h24, 4h/6h → h5, fuori range → fallback nome", () => {
    expect(windowThresholdKey("general", "interval", w(50, 23 * H))).toBe("h24");
    expect(windowThresholdKey("general", "interval", w(50, 25 * H))).toBe("h24");
    expect(windowThresholdKey("general", "interval", w(50, 4 * H))).toBe("h5");
    expect(windowThresholdKey("general", "interval", w(50, 6 * H))).toBe("h5");
    expect(windowThresholdKey("general", "interval", w(50, 12 * H))).toBe("h5");
  });

  test("senza finestra: fallback sul nome modello (video → h24)", () => {
    expect(windowThresholdKey("video", "interval", null)).toBe("h24");
    expect(windowThresholdKey("VIDEO", "interval", null)).toBe("h24");
    expect(windowThresholdKey("general", "interval", null)).toBe("h5");
  });
});

describe("usage-events: migrateLegacyThresholds", () => {
  test("input invalidi → null", () => {
    expect(migrateLegacyThresholds(null)).toBeNull();
    expect(migrateLegacyThresholds("x")).toBeNull();
    expect(migrateLegacyThresholds({})).toBeNull();
    expect(migrateLegacyThresholds({ alertThresholdWarn: "alta" })).toBeNull();
  });

  test("forma legacy: numeri globali applicati a tutte le finestre", () => {
    const t = migrateLegacyThresholds({ alertThresholdWarn: 40, alertThresholdCrit: 12 });
    expect(t).toEqual({ h5: { warn: 40, crit: 12 }, h24: { warn: 40, crit: 12 }, weekly: { warn: 40, crit: 12 } });
  });

  test("forma legacy con un solo valore: l'altro torna di default", () => {
    const t = migrateLegacyThresholds({ alertThresholdWarn: 40 });
    expect(t?.h5).toEqual({ warn: 40, crit: ALERT_DEFAULTS.thresholds.h5.crit });
  });

  test("forma nuova: completa i pezzi mancanti con i default", () => {
    const t = migrateLegacyThresholds({ thresholds: { h5: { warn: 33 } } });
    expect(t?.h5).toEqual({ warn: 33, crit: ALERT_DEFAULTS.thresholds.h5.crit });
    expect(t?.h24).toEqual(ALERT_DEFAULTS.thresholds.h24);
  });

  test("forma nuova con valori non numerici → default per quel campo", () => {
    const t = migrateLegacyThresholds({ thresholds: { weekly: { warn: -1, crit: "x" } } });
    expect(t?.weekly).toEqual(ALERT_DEFAULTS.thresholds.weekly);
  });
});

/* ------------------------------------------------------------------ */
/* Banner (stateless) e transizioni                                    */
/* ------------------------------------------------------------------ */

describe("usage-events: deriveBanner", () => {
  test("null senza snapshot o con avvisi disattivati", () => {
    expect(deriveBanner(null, cfg)).toBeNull();
    expect(deriveBanner(snap([model("general", 5)]), { ...cfg, alertsEnabled: false })).toBeNull();
  });

  test("sotto soglia warn → banner di attenzione con etichetta finestra", () => {
    const b = deriveBanner(snap([model("general", 20)]), cfg);
    expect(b?.level).toBe("warn");
    expect(b?.items[0].winKey).toBe("h5");
    expect(b?.items[0].threshold).toBe(25);
  });

  test("sotto soglia crit → livello crit ha la precedenza", () => {
    const b = deriveBanner(snap([model("general", 8)]), cfg);
    expect(b?.level).toBe("crit");
  });

  test("soglia 0 disattiva la finestra; ogni finestra usa la propria soglia (I28)", () => {
    const c2: AlertConfig = {
      ...cfg,
      thresholds: { h5: { warn: 25, crit: 10 }, h24: { warn: 0, crit: 0 }, weekly: { warn: 30, crit: 15 } },
    };
    // video con finestra 24h al 8%: le soglie h24 sono disattivate → nessun banner
    expect(deriveBanner(snap([model("video", 8, undefined, 24 * H)]), c2)).toBeNull();
    // la stessa percentuale su finestra 5h scatta in crit
    expect(deriveBanner(snap([model("general", 8, undefined, 5 * H)]), c2)?.level).toBe("crit");
  });
});

describe("usage-events: evaluateTransitions", () => {
  test("senza snapshot precedente o con avvisi off → nessuna transizione", () => {
    expect(evaluateTransitions(null, snap([model("general", 50)]), cfg).alerts).toHaveLength(0);
    expect(
      evaluateTransitions(snap([model("general", 50)]), snap([model("general", 5)]), { ...cfg, alertsEnabled: false }).alerts,
    ).toHaveLength(0);
  });

  test("attraversamento crit genera alert + evento", () => {
    const r = evaluateTransitions(snap([model("general", 15)]), snap([model("general", 9)]), cfg);
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0].level).toBe("crit");
    expect(r.alerts[0].from).toBe(15);
    expect(r.alerts[0].to).toBe(9);
    expect(r.events[0].kind).toBe("crit");
  });

  test("attraversamento warn (senza toccare crit) genera alert di attenzione", () => {
    const r = evaluateTransitions(snap([model("general", 30)]), snap([model("general", 24)]), cfg);
    expect(r.alerts[0].level).toBe("warn");
    expect(r.events[0].kind).toBe("warn");
  });

  test("reset: salto ≥ +25 punti verso ≥ 90 genera reset (e non soglie)", () => {
    const r = evaluateTransitions(snap([model("general", 40)]), snap([model("general", 95)]), cfg);
    expect(r.resets).toHaveLength(1);
    expect(r.resets[0].to).toBe(95);
    expect(r.alerts).toHaveLength(0);
    expect(r.events[0].kind).toBe("reset");
  });

  test("recupero moderato non è un reset; stabilizzazione sotto soglia non ri-notifica", () => {
    expect(evaluateTransitions(snap([model("general", 60)]), snap([model("general", 70)]), cfg).resets).toHaveLength(0);
    const r = evaluateTransitions(snap([model("general", 9)]), snap([model("general", 8)]), cfg);
    expect(r.alerts).toHaveLength(0);
    expect(r.events).toHaveLength(0);
  });

  test("modelli nuovi senza predecessore ignorati; ogni finestra usa le sue soglie", () => {
    const r = evaluateTransitions(snap([]), snap([model("general", 5)]), cfg);
    expect(r.alerts).toHaveLength(0);

    // video (finestra 24h reali): soglie h24 warn 20/crit 5 — al 12% è warn, non crit
    const r2 = evaluateTransitions(
      snap([model("video", 25, undefined, 24 * H)]),
      snap([model("video", 12, undefined, 24 * H)]),
      cfg,
    );
    expect(r2.alerts[0].level).toBe("warn");
  });
});
