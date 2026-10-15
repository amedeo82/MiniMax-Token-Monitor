#!/usr/bin/env node
/**
 * I106 — Push dello schema Prisma su Turso/libsql.
 *
 * Il runtime usa il driver adapter (src/lib/db.ts), ma `prisma db push` e le
 * migration NON passano dall'adapter: questo script crea le tabelle sul
 * database remoto generando l'SQL dallo schema (migrate diff, nessuna
 * connessione necessaria) ed eseguendolo VIA CLIENT LIBSQL.
 *
 * Uso (env richieste, mai passate come argomento e MAI stampate):
 *   TURSO_DATABASE_URL=libsql://<db>-<org>.turso.io \
 *   TURSO_AUTH_TOKEN=<token> \
 *   node scripts/verifiche/db-push-turso.mjs
 *
 * Idempotente: se tutte le tabelle dello schema esistono già, non tocca nulla
 * (verifica su sqlite_master). Il token resta SOLO nell'ambiente: nessun log
 * contiene URL completo con credenziali né il token.
 */

import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");

const url = process.env.TURSO_DATABASE_URL?.trim();
if (!url) {
  console.error("ERRORE: TURSO_DATABASE_URL mancante (es. libsql://<db>-<org>.turso.io).");
  process.exit(1);
}
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

const TABELLE_ATTESE = ["UsagePoint", "DownsampledPoint", "UsageEventRecord", "ModelUsagePoint"];

/** Esegue l'SDL → SQL dallo schema (nessun accesso al DB: from-empty → datamodel). */
function generaSql() {
  const stdout = execFileSync(
    "bunx",
    ["prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", join("prisma", "schema.prisma"), "--script"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "file:./db/custom.db" } },
  );
  if (!stdout.includes("CREATE TABLE")) throw new Error("migrate diff non ha prodotto CREATE TABLE");
  return stdout;
}

const { createClient } = await import("@libsql/client");
const client = createClient({ url, authToken });

try {
  const esistente = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
  const presenti = new Set(esistente.rows.map((r) => String(r.name)));
  const mancanti = TABELLE_ATTESE.filter((t) => !presenti.has(t));

  if (mancanti.length === 0) {
    console.log(`Schema già presente su ${url} — nessuna modifica (${TABELLE_ATTESE.join(", ")}).`);
  } else {
    console.log(`Tabelle mancanti: ${mancanti.join(", ")} — genero ed eseguo l'SDL…`);
    const sql = generaSql();
    await client.executeMultiple(sql);
    const dopo = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    const dopoSet = new Set(dopo.rows.map((r) => String(r.name)));
    const ancora = TABELLE_ATTESE.filter((t) => !dopoSet.has(t));
    if (ancora.length > 0) throw new Error(`push incompleto, tabelle ancora assenti: ${ancora.join(", ")}`);
    console.log(`Schema applicato su ${url}: ${TABELLE_ATTESE.join(", ")}.`);
  }
  console.log("OK — db-push-turso completato (il token non è stato stampato).");
} finally {
  client.close();
}
