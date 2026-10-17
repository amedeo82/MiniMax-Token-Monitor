/**
 * I119 — audit sicurezza: livello di log del PrismaClient dipendente
 * dall'ambiente (lib/modalita-persistenza.ts, unità pura).
 *
 * Contratto: NODE_ENV=production → ["warn","error"] (nessun query log con
 * parametri nei runtime logs della piattaforma); qualsiasi altro ambiente
 * (assente, "test", "development") → ["query"] (comportamento storico dev).
 * La funzione accetta env iniettabile: il test NON tocca process.env.
 */
import { describe, test, expect } from "bun:test";
import { livelloLogPrisma } from "../../src/lib/modalita-persistenza";

describe("I119 — livelloLogPrisma (audit sicurezza: igiene dei log)", () => {
  test("produzione: solo warn/error — nessun query log con parametri", () => {
    expect(livelloLogPrisma({ NODE_ENV: "production" })).toEqual(["warn", "error"]);
  });

  test("ambiente non di produzione (dev/test/NODE_ENV assente): query visibili come prima di I119", () => {
    expect(livelloLogPrisma({})).toEqual(["query"]);
    expect(livelloLogPrisma({ NODE_ENV: "development" })).toEqual(["query"]);
    expect(livelloLogPrisma({ NODE_ENV: "test" })).toEqual(["query"]);
  });

  test("env reale del processo non mutata (funzione pura, nessun side-effect)", () => {
    const prima = process.env.NODE_ENV;
    livelloLogPrisma({ NODE_ENV: "production" });
    expect(process.env.NODE_ENV).toBe(prima);
  });
});
