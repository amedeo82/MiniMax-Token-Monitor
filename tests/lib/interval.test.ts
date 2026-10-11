/**
 * Batch 1 client-only — Test di `lib/interval.ts` (I69): preset di intervallo
 * e filtro client-side dello storico.
 */
import { describe, test, expect } from "bun:test";
import { RANGE_PRESETS, presetWindowMs, filterHistoryByPreset } from "@/lib/interval";

const H = 3_600_000;
const G = 86_400_000;

const mk = (t: number) => ({ t, interval: 80, weekly: 90 });

describe("interval: preset", () => {
  test("i 6 preset dichiarati da docs/07 §5.2 esistono con l'ampiezza giusta", () => {
    expect(RANGE_PRESETS.map((p) => p.id)).toEqual(["6h", "24h", "3g", "7g", "30g", "all"]);
    expect(presetWindowMs("6h")).toBe(6 * H);
    expect(presetWindowMs("24h")).toBe(24 * H);
    expect(presetWindowMs("3g")).toBe(3 * G);
    expect(presetWindowMs("7g")).toBe(7 * G);
    expect(presetWindowMs("30g")).toBe(30 * G);
    expect(presetWindowMs("all")).toBeNull();
  });

  test("preset sconosciuto → null (fallback sicuro = tutto)", () => {
    expect(presetWindowMs("1h" as never)).toBeNull();
  });
});

describe("interval: filterHistoryByPreset", () => {
  test("«tutto» restituisce lo STESSO array (nessuna copia)", () => {
    const hist = [mk(0), mk(H)];
    expect(filterHistoryByPreset(hist, "all", 10 * H)).toBe(hist);
  });

  test("finestra 24h: conserva i punti delle ultime 24 ore in ordine", () => {
    const now = 100 * H;
    const hist = [mk(now - 30 * H), mk(now - 24 * H), mk(now - 23 * H), mk(now - 2 * H)];
    const out = filterHistoryByPreset(hist, "24h", now);
    expect(out.map((p) => p.t)).toEqual([now - 24 * H, now - 23 * H, now - 2 * H]);
  });

  test("bordo inferiore INCLUSIVO: il punto esattamente a now − ampiezza rientra", () => {
    const now = 50 * H;
    expect(filterHistoryByPreset([mk(now - 6 * H)], "6h", now)).toHaveLength(1);
    expect(filterHistoryByPreset([mk(now - 6 * H - 1)], "6h", now)).toHaveLength(0);
  });

  test("punto nel futuro non viene scartato (tolleranza sfasamento orologio)", () => {
    const now = 10 * H;
    expect(filterHistoryByPreset([mk(now + 30_000)], "6h", now)).toHaveLength(1);
  });

  test("ordine di input preservato (nessun riordino) e nessuna mutazione dell'input", () => {
    const now = 20 * H;
    const hist = [mk(now - 10 * H), mk(now - 2 * H), mk(now - 19 * H)];
    const out = filterHistoryByPreset(hist, "24h", now);
    // l'input NON è cronologico: il filtro NON riordina, restituisce nell'ordine dato
    expect(out.map((p) => p.t)).toEqual([now - 10 * H, now - 2 * H, now - 19 * H]);
    expect(hist).toHaveLength(3);
  });

  test("array vuoto e filtro che esclude tutto → array vuoto", () => {
    expect(filterHistoryByPreset([], "7g", 1000)).toEqual([]);
    expect(filterHistoryByPreset([mk(0)], "6h", 100 * H)).toEqual([]);
  });
});
