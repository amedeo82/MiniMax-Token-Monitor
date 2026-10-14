/**
 * I95 — Test della protezione delle scritture (lib/api-protezione.ts).
 *
 * Contratto: guard ADMIN_TOKEN SPENTA per default (uso locale invariato);
 * attiva → header x-admin-token obbligatorio (confronto timing-safe);
 * rate limit per-IP come deterrente (budget/minuto, finestra scorrevole).
 */
import { describe, test, expect, afterEach } from "bun:test";
import { adminRichiesto, adminAutorizzato, sottoLimiteScritture, bloccoScrittura, ripulisciProtezione, tokenUguale } from "../../src/lib/api-protezione";

const ENV_ORIGINE = { ...process.env };

/* I95 — ripristino robusto dell'env: assegnare `undefined` a process.env è
   AMBIENTE-DIPENDENTE (Node e alcune versioni di bun lo coercizzano nella
   stringa "undefined", truthy → la guardia restava attiva a cascata e la CI
   falliva con 401). Cancellare la chiave è l'unico modo portabile. */
function ripristinaEnv(nome: string): void {
  const valore = ENV_ORIGINE[nome];
  if (valore === undefined) delete process.env[nome];
  else process.env[nome] = valore;
}

afterEach(() => {
  ripristinaEnv("ADMIN_TOKEN");
  ripristinaEnv("RATE_LIMIT_WRITES_PER_MINUTO");
  ripulisciProtezione();
});

const richiesta = (header?: Record<string, string>) =>
  new Request("http://localhost:3000/api/history", { method: "DELETE", headers: header });

describe("I95 — guard ADMIN_TOKEN", () => {
  test("default: ADMIN_TOKEN assente → guard spenta, scritture aperte (uso locale invariato)", () => {
    delete process.env.ADMIN_TOKEN;
    expect(adminRichiesto()).toBeFalse();
    expect(adminAutorizzato(richiesta())).toBeTrue();
    expect(bloccoScrittura(richiesta())).toBeNull();
  });

  test("ADMIN_TOKEN impostato: senza header → negato; header sbagliato → negato", () => {
    process.env.ADMIN_TOKEN = "segreto-demo";
    expect(adminRichiesto()).toBeTrue();
    expect(adminAutorizzato(richiesta())).toBeFalse();
    expect(adminAutorizzato(richiesta({ "x-admin-token": "sbagliato" }))).toBeFalse();
    const blocco = bloccoScrittura(richiesta({ "x-admin-token": "sbagliato" }));
    expect(blocco?.status).toBe(401);
  });

  test("ADMIN_TOKEN impostato + header corretto → autorizzato (accettazione: 200)", () => {
    process.env.ADMIN_TOKEN = "segreto-demo";
    expect(adminAutorizzato(richiesta({ "x-admin-token": "segreto-demo" }))).toBeTrue();
    expect(bloccoScrittura(richiesta({ "x-admin-token": "segreto-demo" }))).toBeNull();
  });

  test("tokenUguale: timing-safe ma corretta (stringhe diverse → false, uguali → true)", () => {
    expect(tokenUguale("abc", "abc")).toBeTrue();
    expect(tokenUguale("abc", "abd")).toBeFalse();
    expect(tokenUguale("corta", "una stringa molto più lunga")).toBeFalse();
    expect(tokenUguale("", "")).toBeTrue();
  });
});

describe("I95 — rate limit scritture (in-memory per-IP)", () => {
  test("budget configurabile: entro il limite → true; oltre → false (429 nel blocco)", () => {
    process.env.RATE_LIMIT_WRITES_PER_MINUTO = "3";
    const ipTest = { "x-forwarded-for": "203.0.113.7" };
    expect(sottoLimiteScritture(richiesta(ipTest), 1_000)).toBeTrue();
    expect(sottoLimiteScritture(richiesta(ipTest), 1_001)).toBeTrue();
    expect(sottoLimiteScritture(richiesta(ipTest), 1_002)).toBeTrue();
    expect(sottoLimiteScritture(richiesta(ipTest), 1_003)).toBeFalse();
    const blocco = bloccoScrittura(richiesta(ipTest), 1_004);
    expect(blocco?.status).toBe(429);
  });

  test("finestra scorrevole: i tentativi vecchi escono dal budget", () => {
    process.env.RATE_LIMIT_WRITES_PER_MINUTO = "2";
    const ipTest = { "x-forwarded-for": "198.51.100.9" };
    expect(sottoLimiteScritture(richiesta(ipTest), 10_000)).toBeTrue();
    expect(sottoLimiteScritture(richiesta(ipTest), 10_001)).toBeTrue();
    expect(sottoLimiteScritture(richiesta(ipTest), 10_002)).toBeFalse();
    // dopo 61 s i due tentativi sono fuori finestra: il budget torna libero
    expect(sottoLimiteScritture(richiesta(ipTest), 10_000 + 61_000)).toBeTrue();
  });

  test("per-IP: un altro indirizzo ha il suo budget", () => {
    process.env.RATE_LIMIT_WRITES_PER_MINUTO = "1";
    expect(sottoLimiteScritture(richiesta({ "x-forwarded-for": "192.0.2.1" }), 2_000)).toBeTrue();
    expect(sottoLimiteScritture(richiesta({ "x-forwarded-for": "192.0.2.1" }), 2_001)).toBeFalse();
    expect(sottoLimiteScritture(richiesta({ "x-forwarded-for": "192.0.2.2" }), 2_002)).toBeTrue();
  });

  test("senza env: budget default 120/minuto (prima richieste tutte dentro)", () => {
    delete process.env.RATE_LIMIT_WRITES_PER_MINUTO;
    const ipTest = { "x-forwarded-for": "192.0.2.50" };
    for (let i = 0; i < 120; i++) {
      expect(sottoLimiteScritture(richiesta(ipTest), 3_000 + i)).toBeTrue();
    }
    expect(sottoLimiteScritture(richiesta(ipTest), 3_500)).toBeFalse();
  });
});
