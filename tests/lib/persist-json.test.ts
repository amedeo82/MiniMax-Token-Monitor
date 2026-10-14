/**
 * I98 — test di persist-json: gestione esplicita della quota localStorage.
 *
 * Storage finto con BUDGET: setItem solleva QuotaExceededError quando il valore
 * supera il budget (modello deterministico della quota reale). Copre i rami:
 * scrittura diretta, fallback FIFO (dimezza fino a entrare), rinuncia (valore
 * non riducibile / errore non-di-quota / sotto il minimo), notifica UNA TANTUM.
 */

import { describe, expect, test, afterAll } from "bun:test";
import {
  persistJson,
  setQuotaNotifier,
  resetQuotaNotifica,
  isQuotaError,
  type QuotaNotice,
} from "@/lib/persist-json";

/* ------------------------------------------------------------------ */
/* Mock localStorage con BUDGET (pattern usage-events.test.ts, I88)    */
/* ------------------------------------------------------------------ */

const store = new Map<string, string>();
/** Budget in caratteri: oltre soglia setItem solleva QuotaExceededError. */
const BUDGET = 5000;

function erroreQuota(): Error {
  const e = new Error("La quota di archiviazione è stata esaurita.");
  e.name = "QuotaExceededError";
  return e;
}

const descrittoreStoragePreFile: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length(): number {
      return store.size;
    },
    clear: () => void store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => {
      if (String(v).length > BUDGET) throw erroreQuota();
      store.set(k, String(v));
    },
  },
});

afterAll(() => {
  if (descrittoreStoragePreFile) {
    Object.defineProperty(globalThis, "localStorage", descrittoreStoragePreFile);
  } else {
    delete (globalThis as unknown as Record<string, unknown>).localStorage;
  }
});

/* ------------------------------------------------------------------ */
/* Cattura delle notifiche                                             */
/* ------------------------------------------------------------------ */

const notifiche: QuotaNotice[] = [];
setQuotaNotifier((n) => notifiche.push(n));

function punto(i: number): { t: number; v: number } {
  return { t: 1_700_000_000_000 + i * 60_000, v: 90 + (i % 10) };
}

describe("persist-json (I98): scrittura con gestione esplicita della quota", () => {
  test("caso normale: scrittura diretta, storage contiene il JSON", () => {
    store.clear();
    const esito = persistJson("k1", [punto(1), punto(2)], { etichetta: "storico" });
    expect(esito).toBe("scrittura-diretta");
    expect(JSON.parse(store.get("k1")!)).toEqual([punto(1), punto(2)]);
    expect(notifiche).toHaveLength(0);
  });

  test("quota piena con riduci: fallback FIFO — conserva i PIÙ RECENTI e notifica una tantum", () => {
    store.clear();
    resetQuotaNotifica();
    notifiche.length = 0;
    // 300 punti ≈ 9.000+ caratteri > BUDGET 5000: primo dimezzamento a 150 ≈ 4.500 → entra.
    const punti = Array.from({ length: 300 }, (_, i) => punto(i));
    const esito = persistJson("k2", punti, {
      riduci: (v, n) => v.slice(-n),
      etichetta: "storico",
    });
    expect(esito).toBe("ridotto-fifo");
    const salvati = JSON.parse(store.get("k2")!) as { t: number }[];
    expect(salvati.length).toBe(150);
    // FIFO: l'ultimo elemento salvato è l'ultimo dell'array (più recente)
    expect(salvati[salvati.length - 1].t).toBe(punti[punti.length - 1].t);
    expect(salvati[0].t).toBe(punti[punti.length - 150].t);
    // notifica UNA TANTUM per sessione
    expect(notifiche).toHaveLength(1);
    expect(notifiche[0].esito).toBe("ridotto-fifo");
    expect(notifiche[0].message).toContain("150 elementi");
  });

  test("notifica una tantum: la seconda scrittura in quota NON notifica di nuovo", () => {
    store.clear();
    resetQuotaNotifica();
    notifiche.length = 0;
    const punti = Array.from({ length: 300 }, (_, i) => punto(i));
    persistJson("k3a", punti, { riduci: (v, n) => v.slice(-n), etichetta: "storico" });
    persistJson("k3b", punti, { riduci: (v, n) => v.slice(-n), etichetta: "storico" });
    expect(notifiche).toHaveLength(1);
  });

  test("valore non riducibile (impostazioni): rinuncia + notifica, storage intatto", () => {
    store.clear();
    resetQuotaNotifica();
    notifiche.length = 0;
    // stringa oltre budget senza riduci (caso impostazioni con oggetto grande)
    const esito = persistJson("k4", { dato: "x".repeat(BUDGET + 1) }, { etichetta: "impostazioni" });
    expect(esito).toBe("rinuncia");
    expect(store.has("k4")).toBe(false);
    expect(notifiche).toHaveLength(1);
    expect(notifiche[0].esito).toBe("rinuncia");
    expect(notifiche[0].message).toContain("impostazioni");
  });

  test("errore NON di quota (storage bloccato): rinuncia + notifica", () => {
    store.clear();
    resetQuotaNotifica();
    notifiche.length = 0;
    const desc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        ...desc?.value,
        setItem: () => {
          const e = new Error("accesso negato");
          e.name = "SecurityError";
          throw e;
        },
      },
    });
    try {
      const esito = persistJson("k5", [punto(1)], { riduci: (v, n) => v.slice(-n), etichetta: "storico" });
      expect(esito).toBe("rinuncia");
    } finally {
      Object.defineProperty(globalThis, "localStorage", desc!);
    }
    expect(notifiche).toHaveLength(1);
  });

  test("anche dimezzato non entra (sotto MIN 25 la quota è occupata da altro): rinuncia senza cancellare terzi", () => {
    store.clear();
    resetQuotaNotifica();
    notifiche.length = 0;
    // 300 punti da ~50 caratteri: dimezzamenti 150 → 75 → 38 → 19 → sotto 25 = rinuncia
    // BUDGET 5000: 150 punti ≈ 7500 no; 75 ≈ 3750 sì... per forzare la rinuncia
    // uso punti GRANDI (300 caratteri ciascuno): 150 → 45k no, 75 → 22k no,
    // 38 → 11k no, 19 < 25 → stop = rinuncia.
    const grandi = Array.from({ length: 300 }, (_, i) => ({ ...punto(i), extra: "y".repeat(300) }));
    const esito = persistJson("k6", grandi, { riduci: (v, n) => v.slice(-n), etichetta: "storico" });
    expect(esito).toBe("rinuncia");
    expect(store.has("k6")).toBe(false);
    expect(notifiche).toHaveLength(1);
  });

  test("isQuotaError: riconosce QuotaExceededError e alias Firefox, non gli altri", () => {
    expect(isQuotaError(erroreQuota())).toBe(true);
    const ff = new Error("quota");
    ff.name = "NS_ERROR_DOM_QUOTA_REACHED";
    expect(isQuotaError(ff)).toBe(true);
    expect(isQuotaError(new Error("generico"))).toBe(false);
    expect(isQuotaError("stringa")).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});
