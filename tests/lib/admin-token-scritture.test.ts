/**
 * I120 — Contratto di RETE delle scritture degli archivi con il token admin.
 *
 * La guardia I95 del server esige `x-admin-token` su ogni scrittura quando
 * l'env ADMIN_TOKEN è impostata: questo test fissa che le SEI scritture del
 * browser (POST/DELETE di storico, eventi e punti per-modello) allegano
 * l'header SOLO quando l'utente ha salvato il token nel browser — e che senza
 * token le richieste restano IDENTICHE a prima del I120 (nessun header vuoto,
 * Content-Type invariato). Il proxy /api/minimax/usage resta FUORI per design
 * (canale della chiave dell'utente, docs/11 §4.3).
 *
 * La rete è mockata al livello `fetch` globale; window punta a un finto
 * localStorage a perimetro (installato e ripristinato DOPO l'attesa —
 * `await fn()` nel finally, così i percorsi async vedono il finto storage per
 * tutta la loro vita — mai il globale reale: bun test esegue i file in un
 * unico processo).
 */
import { describe, test, expect, afterEach } from "bun:test";
import type { UsageEvent } from "../../src/lib/usage-events";

const storico = await import("../../src/lib/server-history");
const eventi = await import("../../src/lib/server-events");
const modelli = await import("../../src/lib/model-history");
const admin = await import("../../src/lib/admin-token");

/* ------------------------------------------------------------------ */
/* Mock del fetch globale: cattura init, risposta configurabile        */
/* ------------------------------------------------------------------ */

const fetchOriginale = globalThis.fetch;
let ultimaFetch: { url: string; init?: RequestInit } | null = null;
let risposta: (() => Response) | null = null;

function fingeFetch(): void {
  risposta = null;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    ultimaFetch = { url: urlStr, init };
    if (!risposta) throw new Error("rete irraggiungibile");
    return risposta();
  }) as typeof fetch;
}

function ok200(): void {
  risposta = () => new Response(JSON.stringify({ ok: true, total: 1, deleted: 0, stored: 1 }), { status: 200 });
}

afterEach(() => {
  globalThis.fetch = fetchOriginale;
  ultimaFetch = null;
});

/** Window con localStorage finto, a perimetro: ripristino DOPO l'attesa di fn. */
async function conTokenSalvato<T>(token: string | null, fn: () => Promise<T> | T): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const winOrig = g.window;
  const map = new Map<string, string>();
  if (token !== null) map.set(admin.ADMIN_TOKEN_STORAGE_KEY, token);
  g.window = {
    localStorage: {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
    },
  };
  try {
    return await fn();
  } finally {
    if (winOrig === undefined) delete g.window;
    else g.window = winOrig;
  }
}

function headerRicevuto(): Record<string, string> {
  const h = ultimaFetch?.init?.headers;
  return h ? (h as Record<string, string>) : {};
}

const T = 1_760_000_000_000;
const EVENTO: UsageEvent = { id: "e1", t: T, kind: "info", model: null, win: null, message: "m", value: 50 };
const PUNTO = { t: T, interval: 42, weekly: 55 };
const PUNTO_MODELLO = { t: T, model: "general", interval: 42, weekly: 55 };

describe("I120 — senza token salvato: le 6 scritture NON allegano x-admin-token (invariate)", () => {
  test("POST storico / POST eventi / POST modelli: solo Content-Type, come prima del I120", async () => {
    await conTokenSalvato(null, () => {
      fingeFetch();
      ok200();

      storico.pushPointToServer(PUNTO, { source: "api", region: "eu" });
      expect(ultimaFetch?.url).toBe("/api/history");
      expect(headerRicevuto()).toEqual({ "Content-Type": "application/json" });

      eventi.pushEventsToServer([EVENTO]);
      expect(ultimaFetch?.url).toBe("/api/events");
      expect(headerRicevuto()).toEqual({ "Content-Type": "application/json" });

      modelli.pushModelPointsToServer([PUNTO_MODELLO], { source: "api", region: "eu" });
      expect(ultimaFetch?.url).toBe("/api/history/models");
      expect(headerRicevuto()).toEqual({ "Content-Type": "application/json" });
    });
  });

  test("DELETE storico / DELETE eventi / DELETE modelli: nessun header aggiunto", async () => {
    await conTokenSalvato(null, async () => {
      fingeFetch();
      ok200();

      await storico.clearServerHistory();
      expect(ultimaFetch?.init?.method).toBe("DELETE");
      expect(headerRicevuto()).toEqual({});

      await eventi.clearServerEvents();
      expect(ultimaFetch?.init?.method).toBe("DELETE");
      expect(headerRicevuto()).toEqual({});

      await modelli.clearServerModelHistory("general");
      expect(ultimaFetch?.init?.method).toBe("DELETE");
      expect(headerRicevuto()).toEqual({});
    });
  });
});

describe("I120 — con token salvato: le 6 scritture allegano x-admin-token col valore del browser", () => {
  test("POST storico / POST eventi / POST modelli", async () => {
    await conTokenSalvato("tok-produzione", () => {
      fingeFetch();
      ok200();

      storico.pushPointToServer(PUNTO, { source: "api", region: "eu" });
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");
      expect(headerRicevuto()["Content-Type"]).toBe("application/json");

      eventi.pushEventsToServer([EVENTO]);
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");

      modelli.pushModelPointsToServer([PUNTO_MODELLO], { source: "api", region: "eu" });
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");
    });
  });

  test("DELETE storico / DELETE eventi / DELETE modelli (con querystring per-modello)", async () => {
    await conTokenSalvato("tok-produzione", async () => {
      fingeFetch();
      ok200();

      await storico.clearServerHistory();
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");

      await eventi.clearServerEvents();
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");

      await modelli.clearServerModelHistory("general");
      expect(ultimaFetch?.url).toBe("/api/history/models?model=general");
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-produzione");
    });
  });

  test("token salvato con spazi ai bordi → header col valore tagliato", async () => {
    await conTokenSalvato("  tok-bordi  ", () => {
      fingeFetch();
      ok200();
      storico.pushPointToServer(PUNTO, { source: "api", region: "eu" });
      expect(headerRicevuto()["x-admin-token"]).toBe("tok-bordi");
    });
  });
});
