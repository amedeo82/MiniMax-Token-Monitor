/**
 * Fase 3 (batch 2) — Test di `lib/health.ts`: episodi di errore, ultimo
 * errore, messaggio più frequente, finestra 7 giorni.
 */
import { describe, test, expect } from "bun:test";
import { saluteMonitor } from "@/lib/health";
import type { UsageEvent } from "@/lib/usage-events";

const M = 60_000;
const ORA = 3_600_000;

const err = (t: number, message: string): UsageEvent => ({
  id: `e-${t}-${message}`,
  t,
  kind: "error",
  model: null,
  win: null,
  message,
  value: null,
});

const ORA0 = Date.UTC(2026, 9, 11, 12, 0, 0);

describe("health: saluteMonitor", () => {
  test("nessun errore → salute perfetta", () => {
    const s = saluteMonitor([], { now: ORA0 });
    expect(s.totale).toBe(0);
    expect(s.episodi).toEqual([]);
    expect(s.ultimoErrore).toBeNull();
    expect(s.piuFrequente).toBeNull();
  });

  test("errori ravvicinati (< 15 min) = UN episodio", () => {
    const eventi = [err(ORA0, "timeout"), err(ORA0 + 5 * M, "timeout"), err(ORA0 + 10 * M, "timeout")];
    const s = saluteMonitor(eventi, { now: ORA0 + ORA });
    expect(s.totale).toBe(1);
    expect(s.episodi[0].conteggio).toBe(3);
    expect(s.episodi[0].inizio).toBe(ORA0);
    expect(s.episodi[0].fine).toBe(ORA0 + 10 * M);
    expect(s.episodi[0].ultimoMessaggio).toBe("timeout");
  });

  test("errori distanti (> 15 min) = episodi separati, più recente prima", () => {
    const eventi = [err(ORA0, "a"), err(ORA0 + 20 * M, "b"), err(ORA0 + 40 * M, "c")];
    const s = saluteMonitor(eventi, { now: ORA0 + ORA });
    expect(s.totale).toBe(3);
    expect(s.episodi[0].inizio).toBe(ORA0 + 40 * M);
    expect(s.episodi[2].inizio).toBe(ORA0);
  });

  test("fuori finestra 7 giorni ignorato; gap iniettabile", () => {
    const eventi = [err(ORA0 - 8 * 24 * ORA, "vecchio"), err(ORA0 - ORA, "fresco")];
    const s = saluteMonitor(eventi, { now: ORA0 });
    expect(s.totale).toBe(1);
    expect(s.episodi[0].inizio).toBe(ORA0 - ORA);

    const s2 = saluteMonitor([err(ORA0, "a"), err(ORA0 + 2 * M, "b")], {
      now: ORA0 + ORA,
      episodeGapMs: M,
    });
    expect(s2.totale).toBe(2);
  });

  test("ultimo errore e messaggio più frequente", () => {
    const eventi = [err(ORA0, "quota esaurita"), err(ORA0 + M, "network"), err(ORA0 + 2 * M, "quota esaurita")];
    const s = saluteMonitor(eventi, { now: ORA0 + ORA });
    expect(s.ultimoErrore?.message).toBe("quota esaurita");
    expect(s.piuFrequente).toEqual({ message: "quota esaurita", conteggio: 2 });
  });

  test("gli eventi non-error non contano", () => {
    const reset: UsageEvent = { ...err(ORA0, "reset"), kind: "reset" };
    const s = saluteMonitor([reset], { now: ORA0 + ORA });
    expect(s.totale).toBe(0);
  });
});
