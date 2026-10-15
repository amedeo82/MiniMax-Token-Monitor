/**
 * I106 — Factory della persistenza portabile (src/lib/db.ts).
 *
 * Pattern I93: mock.module dei costruttori (PrismaClient / PrismaLibSQL) con
 * cattura degli argomenti + import dinamico del modulo REALE di db — si
 * verifica la SELEZIONE del motore guidata dall'ambiente, non le query:
 *
 * - senza TURSO_* → PrismaClient NATIVO senza adapter (sviluppo locale
 *   invariato — accettazione I106);
 * - con TURSO_DATABASE_URL → adapter libsql costruito con {url, authToken}
 *   e passato al client (ramo portabile Turso);
 * - token assente/vuoto → `authToken: undefined` (MAI la stringa «undefined»,
 *   lezione Task 45: l'igiene dell'env è fatta con delete, mai con undefined);
 * - url/token con spazi → trim (gli spazi incidono sul protocollo libsql://);
 * - I107-fix: il ramo nativo passa SEMPRE `datasourceUrl` esplicito — senza,
 *   Prisma esige env("DATABASE_URL") dallo schema e il primo $queryRaw esplode
 *   «Environment variable not found: DATABASE_URL» in ogni ambiente senza
 *   file .env (bug riprodotto: pannello «Persistenza» su deployment senza
 *   variabili configurate). Default ASSOLUTO db/custom.db: Prisma risolve i
 *   percorsi file: relativi rispetto a prisma/schema.prisma, NON al CWD
 *   (probe empirica I107-fix).
 * - I107-fix2: con VERCEL=1 (serverless, filesystem read-only tranne /tmp) il
 *   default NON va nel CWD ma in tmpdir()/db/custom.db; DATABASE_URL esplicita
 *   vince SEMPRE (passthrough anche su Vercel). La factory prepara la
 *   directory padre degli URL file: ASSOLUTI (SQLite non crea le cartelle:
 *   senza, clone fresco senza db/ e Vercel senza env esplodevano con
 *   «Error code 14: Unable to open the database file» — SQLITE_CANTOPEN,
 *   bug riprodotto dal report utente sul pannello «Persistenza»).
 *
 * La factory è in un modulo PROPRI (src/lib/db-factory.ts) perché i test dei
 * contratti HTTP (I99) e dei guard (I95) mockano "@/lib/db" a livello di
 * processo: importare la factory da un modulo non mockato la rende verificabile
 * senza collisioni. Il singleton `db` (valutato una sola volta per processo,
 * convenzione Next globalThis) sta nello stesso modulo: i casi di ambiente
 * chiamano creaPrismaClient() invece di re-importare il modulo.
 */
import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/* Mock dei costruttori con cattura degli argomenti                    */
/* ------------------------------------------------------------------ */

const costruttoriClient: Array<Record<string, unknown> | undefined> = [];
const configsAdapter: Array<Record<string, unknown>> = [];

mock.module("@prisma/client", () => ({
  PrismaClient: class {
    opzioni: Record<string, unknown> | undefined;
    constructor(opzioni?: Record<string, unknown>) {
      this.opzioni = opzioni;
      costruttoriClient.push(opzioni);
    }
  },
}));

mock.module("@prisma/adapter-libsql", () => ({
  PrismaLibSQL: class {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      this.config = config;
      configsAdapter.push(config);
    }
  },
}));

/* Import DINAMICO dopo i mock.module (il mock deve precedere l'import). */
const mod = await import("@/lib/db-factory");
const { creaPrismaClient, modalitaPersistenza } = mod;

/* ------------------------------------------------------------------ */
/* Igiene dell'ambiente: ripristino con DELETE (lezione Task 45)       */
/* ------------------------------------------------------------------ */

const CHIAVI = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "DATABASE_URL", "VERCEL"] as const;
const origine = new Map<string, string | undefined>(
  CHIAVI.map((k) => [k, process.env[k]]),
);

function impostaEnv(valori: Partial<Record<(typeof CHIAVI)[number], string>>) {
  for (const k of CHIAVI) {
    const v = valori[k];
    // MAI `process.env[k] = undefined`: su CI (bun latest) viene coercizzato
    // nella STRINGA "undefined" (truthy) — lezione Task 45, ricaduta reale:
    // l'adapter riceveva authToken="undefined" e l'URL "undefined" dava
    // modalità "turso". Le chiavi assenti si CANCELLANO, sempre.
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function ripristinoEnv() {
  for (const k of CHIAVI) {
    const originale = origine.get(k);
    if (originale === undefined) delete process.env[k]; // MAI assegnare undefined: su CI coerza in "undefined" (stringa truthy)
    else process.env[k] = originale;
  }
}

afterAll(() => {
  ripristinoEnv();
  // Il singleton globale creato dall'import resta: è un mock leggero, nessun
  // motore reale — gli altri file di test mockano comunque @/lib/db.
});

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

describe("I106 — selezione del motore guidata dall'ambiente", () => {
  beforeEach(() => {
    costruttoriClient.length = 0;
    configsAdapter.length = 0;
    ripristinoEnv();
  });

  test("env TURSO_* assente → PrismaClient nativo SENZA adapter (sviluppo locale invariato)", () => {
    const client = creaPrismaClient();
    expect(configsAdapter.length).toBe(0); // l'adapter non è mai costruito
    expect(costruttoriClient.length).toBe(1);
    expect(costruttoriClient[0]?.["adapter"]).toBeUndefined();
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBeDefined(); // I107-fix: URL sempre esplicito
    expect(client).toBeDefined();
    expect(modalitaPersistenza()).toBe("locale");
  });

  test("I107-fix: DATABASE_URL assente → datasourceUrl = default ASSOLUTO db/custom.db (nessuna env richiesta)", () => {
    impostaEnv({ DATABASE_URL: undefined });
    creaPrismaClient();
    expect(costruttoriClient[0]?.["adapter"]).toBeUndefined();
    // Percorso ASSOLUTO dal CWD: un default relativo (file:./db/custom.db)
    // sarebbe risolto contro prisma/ (schema) e atterrato su prisma/db/.
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBe(`file:${process.cwd()}/db/custom.db`);
  });

  test("I107-fix: DATABASE_URL presente → passthrough identico come datasourceUrl (comportamento invariato)", () => {
    impostaEnv({ DATABASE_URL: "file:/percorso/archivio.db" });
    creaPrismaClient();
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBe("file:/percorso/archivio.db");
  });

  test("I107-fix: DATABASE_URL con spazi → trim (coerente con la regola TURSO_*)", () => {
    impostaEnv({ DATABASE_URL: "  file:/percorso/archivio.db  " });
    creaPrismaClient();
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBe("file:/percorso/archivio.db");
  });

  test("I107-fix: urlPersistenzaLocale() segue la stessa regola della factory (unità pura nel modulo proprio)", () => {
    impostaEnv({ DATABASE_URL: undefined });
    expect(mod.urlPersistenzaLocale()).toBe(`file:${process.cwd()}/db/custom.db`);
    impostaEnv({ DATABASE_URL: "file:./x.db" });
    expect(mod.urlPersistenzaLocale()).toBe("file:./x.db");
  });

  test("TURSO_DATABASE_URL + TURSO_AUTH_TOKEN → adapter libsql con url e token passati al client", () => {
    impostaEnv({
      TURSO_DATABASE_URL: "libsql://monitor-org.turso.io",
      TURSO_AUTH_TOKEN: "tok-segreto",
    });
    creaPrismaClient();
    expect(configsAdapter.length).toBe(1);
    expect(configsAdapter[0]).toEqual({ url: "libsql://monitor-org.turso.io", authToken: "tok-segreto" });
    expect(costruttoriClient.length).toBe(1);
    expect(costruttoriClient[0]?.["adapter"]).toBeDefined();
    expect(modalitaPersistenza()).toBe("turso");
  });

  test("TURSO_DATABASE_URL senza token → authToken undefined (non la STRINGA «undefined»)", () => {
    impostaEnv({ TURSO_DATABASE_URL: "libsql://monitor-org.turso.io" });
    creaPrismaClient();
    expect(configsAdapter[0]?.["url"]).toBe("libsql://monitor-org.turso.io");
    expect(configsAdapter[0]?.["authToken"]).toBeUndefined(); // database pubblici e file: non richiedono token
  });

  test("url e token con spazi → trim (gli spazi incidono sul protocollo libsql://)", () => {
    impostaEnv({
      TURSO_DATABASE_URL: "  libsql://monitor-org.turso.io  ",
      TURSO_AUTH_TOKEN: "  tok-segreto  ",
    });
    creaPrismaClient();
    expect(configsAdapter[0]?.["url"]).toBe("libsql://monitor-org.turso.io");
    expect(configsAdapter[0]?.["authToken"]).toBe("tok-segreto");
  });

  test("token vuoto o di soli spazi → authToken undefined (come assente)", () => {
    impostaEnv({ TURSO_DATABASE_URL: "libsql://monitor-org.turso.io", TURSO_AUTH_TOKEN: "   " });
    creaPrismaClient();
    expect(configsAdapter[0]?.["authToken"]).toBeUndefined();
  });

  test("URL file: (libsql locale) passa dallo stesso ramo adattato", () => {
    impostaEnv({ TURSO_DATABASE_URL: "file:/tmp/i106-prova.db" });
    creaPrismaClient();
    expect(configsAdapter[0]?.["url"]).toBe("file:/tmp/i106-prova.db");
    expect(modalitaPersistenza()).toBe("turso");
  });
});

describe("I107-fix2 — default serverless (VERCEL) e preparazione della directory", () => {
  /* NOTA mock bun (lezione I107/I107-fix2): in suite COMPLETA questo file vede
     urlPersistenzaLocale() attraverso il MIRROR mockato in
     tests/lib/api-persistenza.test.ts (bun applica il PRIMO mock registrato per
     specificatore — api-persistenza gira prima in ordine alfabetico). In
     isolamento vede il modulo reale. I due devono restare identici: aggiornarli
     INSIEME a ogni cambio di regola (il mirror è commentato nello stesso senso). */
  const DIR_PROVA = join(tmpdir(), "i107-fix2-factory-dir");

  beforeEach(() => {
    costruttoriClient.length = 0;
    configsAdapter.length = 0;
    ripristinoEnv();
    rmSync(DIR_PROVA, { recursive: true, force: true });
  });

  afterAll(() => {
    rmSync(DIR_PROVA, { recursive: true, force: true });
  });

  test("VERCEL=1 senza DATABASE_URL → default nel tmpdir del serverless, NON nel CWD read-only", () => {
    impostaEnv({ DATABASE_URL: undefined, VERCEL: "1" });
    const url = mod.urlPersistenzaLocale();
    expect(url).toBe(`file:${join(tmpdir(), "db", "custom.db")}`);
    expect(url.startsWith(`file:${process.cwd()}`)).toBe(false);
    creaPrismaClient();
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBe(url);
  });

  test("VERCEL=1 con DATABASE_URL → passthrough identico (la env esplicita vince anche su Vercel)", () => {
    impostaEnv({ DATABASE_URL: "file:/dati/esterni.db", VERCEL: "1" });
    expect(mod.urlPersistenzaLocale()).toBe("file:/dati/esterni.db");
    creaPrismaClient();
    expect(costruttoriClient[0]?.["datasourceUrl"]).toBe("file:/dati/esterni.db");
  });

  test("la factory prepara la directory padre del file SQLite (SQLite NON crea le cartelle)", () => {
    impostaEnv({ DATABASE_URL: `file:${join(DIR_PROVA, "profonda", "custom.db")}` });
    expect(existsSync(join(DIR_PROVA, "profonda"))).toBe(false);
    creaPrismaClient();
    expect(existsSync(join(DIR_PROVA, "profonda"))).toBe(true);
  });

  test("percorsi file: relativi → nessuna cartella inventata (Prisma li risolve contro prisma/schema.prisma)", () => {
    impostaEnv({ DATABASE_URL: "file:i107-fix2-relativo/inesistente.db" });
    creaPrismaClient();
    expect(existsSync("i107-fix2-relativo")).toBe(false);
  });
});

describe("I106 — singleton e semantica della factory", () => {
  beforeEach(() => {
    ripristinoEnv();
  });

  test("la factory crea NUOVE istanze a ogni chiamata; il modulo esporta il singleton memoizzato", () => {
    const a = creaPrismaClient();
    const b = creaPrismaClient();
    expect(a).not.toBe(b);
    expect(mod.db).toBeDefined();
    // NODE_ENV=test (≠ production): il singleton è registrato in globalThis.
    const globale = globalThis as unknown as { prisma?: unknown };
    expect(globale.prisma).toBe(mod.db);
  });

  test("modalitaPersistenza() segue SOLO TURSO_DATABASE_URL (non il token da solo)", () => {
    impostaEnv({ TURSO_AUTH_TOKEN: "tok-segreto" });
    expect(modalitaPersistenza()).toBe("locale");
    impostaEnv({ TURSO_DATABASE_URL: "libsql://monitor-org.turso.io" });
    expect(modalitaPersistenza()).toBe("turso");
  });
});
