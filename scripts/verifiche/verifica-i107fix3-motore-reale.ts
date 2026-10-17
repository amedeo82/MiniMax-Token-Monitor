/**
 * I107-fix3 — Verifica END-TO-END dello schema incorporato su MOTORE REALE, in
 * PROCESSO FIGLIO (immune dai mock: nessun bun.test, nessun mock.module —
 * "@prisma/client" qui è sempre quello REALE; lezione CI run #22/#23: bun
 * «latest» in CI chiave i mock diversamente dal 1.3.14 locale, anche via
 * percorso assoluto).
 *
 * Scenario: preparaSchema su un file SQLite vuoto → le 5 tabelle esistono (le
 * 4 di dominio + RegistroManutenzione I117), una
 * create() per UsagePoint e per DownsampledPoint (la tabella del report utente
 * «The table main.DownsampledPoint does not exist») va a buon fine, count
 * coerente; la SECONDA preparaSchema è un no-op (idempotenza, dati intatti).
 * Zero credenziali: file temporaneo. Esito: «I107FIX3-MOTORE-REALE: PASS» +
 * exit 0, altrimenti FAIL + exit 1 (il test padre riporta l'output).
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { preparaSchema } from "../../src/lib/schema-persistenza";

const DIR = join(tmpdir(), "i107fix3-motore-reale");
let client: PrismaClient | undefined;

try {
  rmSync(DIR, { recursive: true, force: true });
  // Nel percorso di produzione la directory padre la crea la factory
  // (preparaDirectoryFile, I107-fix2): qui il test bypassa la factory e la
  // crea esplicitamente — SENZA, il motore esplode con error 14 (CANTOPEN):
  // la stessa lezione del report utente, riprodotta in miniatura.
  mkdirSync(DIR, { recursive: true });
  // I115 — prisma 7: datasourceUrl rimosso, adapter obbligatorio (anche sul file:).
  client = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${join(DIR, "prova.db")}` }) });
  // Guardia onesta: accessori di modello presenti = client REALE.
  if (typeof (client as unknown as { usagePoint?: unknown }).usagePoint !== "object") {
    throw new Error("client senza accessori di modello (non è il PrismaClient reale)");
  }
  const verifica = (condizione: boolean, messaggio: string): void => {
    if (!condizione) throw new Error(`verifica non soddisfatta: ${messaggio}`);
  };

  await preparaSchema(client);

  // La tabella del report utente e una qualunque: create + count.
  await client.downsampledPoint.create({
    data: { hourStart: new Date(1_700_000_000_000), lastT: new Date(1_700_000_000_000), count: 1 },
  });
  await client.usagePoint.create({
    data: { t: new Date(1_700_000_000_000), interval: 12.5, weekly: 40 },
  });
  verifica((await client.downsampledPoint.count()) === 1, "count DownsampledPoint = 1");
  verifica((await client.usagePoint.count()) === 1, "count UsagePoint = 1");

  // Idempotenza: la seconda passata non aggiunge né rompe nulla.
  await preparaSchema(client);
  verifica((await client.downsampledPoint.count()) === 1, "seconda passata: DownsampledPoint intatto");
  verifica((await client.usagePoint.count()) === 1, "seconda passata: UsagePoint intatto");

  await client.$disconnect();
  rmSync(DIR, { recursive: true, force: true });
  console.log("I107FIX3-MOTORE-REALE: PASS");
  process.exit(0);
} catch (e) {
  await client?.$disconnect().catch(() => undefined);
  rmSync(DIR, { recursive: true, force: true });
  const messaggio = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.error(`I107FIX3-MOTORE-REALE: FAIL ${messaggio}`);
  process.exit(1);
}
