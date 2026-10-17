/**
 * I120 — Contratto del modulo admin-token (src/lib/admin-token.ts).
 *
 * Due famiglie:
 * - FUNZIONI PURHE (headerAdminDa, esitoSondaAdmin): nessun DOM, nessun env —
 *   fissano la semantica dell'header allegato alle scritture e la
 *   classificazione della sonda di identità (401 rifiutato / 400-429 accettato
 *   / altro inatteso), coerente con l'ordine dei controlli in bloccoScrittura
 *   (guardia I95: 401 PRIMA del rate limit → 429 implica identità accettata);
 * - STORAGE DOM-side (leggi/salva/cancella): window sostituito con un finto
 *   localStorage SCOPATO (installato e ripristino in ogni caso, senza toccare
 *   il globale reale — bun test esegue i file in un unico processo), più il
 *   percorso SSR (window assente) e il percorso degradato (localStorage che
 *   lancia: privacy estremo, quota piena) — mai un crash.
 */
import { describe, test, expect } from "bun:test";

const mod = await import("../../src/lib/admin-token");
const {
  ADMIN_TOKEN_STORAGE_KEY,
  leggiTokenAdmin,
  salvaTokenAdmin,
  cancellaTokenAdmin,
  headerAdminDa,
  headerAdmin,
  esitoSondaAdmin,
} = mod;

/* ------------------------------------------------------------------ */
/* Helper: window con localStorage finto, installazione a perimetro    */
/* ------------------------------------------------------------------ */

interface FintoStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

/**
 * Sostituisce window con un finto localStorage a perimetro, esegue fn(ls, lancia),
 * RIPRISTINA sempre. NB: si tocca SOLO `window` — `globalThis.localStorage` di bun
 * è una proprietà readonly (assegnarla lancia TypeError) e il modulo legge
 * esclusivamente window.localStorage. `lancia()` accende il guasto: da lì in poi
 * il finto storage lancia su ogni operazione (privacy estremo, quota piena).
 */
function conWindow<T>(fn: (ls: FintoStorage, lancia: () => void) => T): T {
  const g = globalThis as Record<string, unknown>;
  const winOrig = g.window;
  const map = new Map<string, string>();
  let guasto = false;
  const ls: FintoStorage = {
    getItem: (k) => {
      if (guasto) throw new Error("storage bloccato");
      return map.has(k) ? map.get(k)! : null;
    },
    setItem: (k, v) => {
      if (guasto) throw new Error("storage bloccato");
      map.set(k, String(v));
    },
    removeItem: (k) => {
      if (guasto) throw new Error("storage bloccato");
      map.delete(k);
    },
  };
  g.window = { localStorage: ls };
  try {
    return fn(ls, () => {
      guasto = true;
    });
  } finally {
    if (winOrig === undefined) delete g.window;
    else g.window = winOrig;
  }
}

describe("I120 — headerAdminDa (puro): l'header esiste SOLO con un token", () => {
  test("token presente → header x-admin-token col valore tagliato ai bordi", () => {
    expect(headerAdminDa("tok-abc")).toEqual({ "x-admin-token": "tok-abc" });
    expect(headerAdminDa("  tok-spazi  ")).toEqual({ "x-admin-token": "tok-spazi" });
  });

  test("token assente/vuoto/solo spazi → {} (le scritture restano IDENTICHE a prima del I120)", () => {
    expect(headerAdminDa(null)).toEqual({});
    expect(headerAdminDa("")).toEqual({});
    expect(headerAdminDa("   ")).toEqual({});
  });
});

describe("I120 — esitoSondaAdmin (puro): classifica la sonda come bloccoScrittura emette", () => {
  test("401 = identità rifiutata (guardia attiva, token sbagliato/assente)", () => {
    const esito = esitoSondaAdmin(401);
    expect(esito.ok).toBe(false);
    expect(esito.messaggio).toContain("RIFIUTATO");
  });

  test("400 = identità accettata (o guardia spenta): il body invalido è arrivato oltre la guardia", () => {
    const esito = esitoSondaAdmin(400);
    expect(esito.ok).toBe(true);
    expect(esito.messaggio).toContain("accettata");
  });

  test("429 = identità accettata ma budget esaurito (il rate limit corre DOPO il controllo identità)", () => {
    const esito = esitoSondaAdmin(429);
    expect(esito.ok).toBe(true);
    expect(esito.messaggio).toContain("budget");
  });

  test("codici inattesi (200, 403, 500, 503) → esito negativo onesto, mai un falso verde", () => {
    for (const status of [200, 403, 500, 503]) {
      expect(esitoSondaAdmin(status).ok).toBe(false);
      expect(esitoSondaAdmin(status).messaggio).toContain(String(status));
    }
  });
});

describe("I120 — storage del token (DOM-side): roundtrip, rimozione, percorsi degradati", () => {
  test("salva → leggi: roundtrip con taglio dei bordi nella chiave convenzionata", () => {
    conWindow((ls) => {
      salvaTokenAdmin("  tok-nuovo  ");
      expect(ls.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBe("tok-nuovo");
      expect(leggiTokenAdmin()).toBe("tok-nuovo");
    });
  });

  test("salva stringa vuota = rimozione (nessuna chiave vuota lasciata nel browser)", () => {
    conWindow((ls) => {
      salvaTokenAdmin("tok-pieno");
      salvaTokenAdmin("");
      expect(ls.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
      expect(leggiTokenAdmin()).toBeNull();
    });
  });

  test("cancellaTokenAdmin rimuove il token salvato", () => {
    conWindow((ls) => {
      salvaTokenAdmin("tok-da-via");
      cancellaTokenAdmin();
      expect(ls.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
      expect(leggiTokenAdmin()).toBeNull();
    });
  });

  test("token di soli spazi → lettura null (mai un header con valore inutile)", () => {
    conWindow(() => {
      salvaTokenAdmin("   ");
      expect(leggiTokenAdmin()).toBeNull();
      expect(headerAdmin()).toEqual({});
    });
  });

  test("SSR (window assente) → nessuna lettura, nessuna scrittura, header {}", () => {
    const g = globalThis as Record<string, unknown>;
    const winOrig = g.window;
    delete g.window;
    try {
      expect(leggiTokenAdmin()).toBeNull();
      expect(() => salvaTokenAdmin("tok")).not.toThrow();
      expect(() => cancellaTokenAdmin()).not.toThrow();
      expect(headerAdmin()).toEqual({});
    } finally {
      if (winOrig === undefined) delete g.window;
      else g.window = winOrig;
    }
  });

  test("localStorage che lancia (privacy estremo / quota piena) → mai un crash, degrada a null/{}", () => {
    conWindow((_ls, lancia) => {
      lancia();
      expect(() => salvaTokenAdmin("tok")).not.toThrow();
      expect(leggiTokenAdmin()).toBeNull();
      expect(headerAdmin()).toEqual({});
      expect(() => cancellaTokenAdmin()).not.toThrow();
    });
  });
});
