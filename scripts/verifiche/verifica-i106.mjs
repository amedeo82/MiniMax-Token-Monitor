#!/usr/bin/env node
/**
 * I106 — Verifica di accettazione della persistenza portabile.
 *
 * Due scenari, scelti DALL'AMBIENTE (come il runtime):
 *
 * A. Nessun TURSO_DATABASE_URL impostato → prova COMPLETA del ramo adattato su
 *    un database FILE temporaneo: lo schema viene creato con `prisma db push`
 *    (motore nativo) e poi TUTTO il ciclo dati passa dal driver adapter
 *    libsql (stesso codice di produzione di src/lib/db.ts: upsert dedup,
 *    lettura, SQL raw parametrizzato usato da server-model-history). Il file
 *    temporaneo è cancellato alla fine.
 *
 * B. TURSO_DATABASE_URL impostato → verifica READ-ONLY del database remoto
 *    (elenco tabelle attese); NESSUNA scrittura su un archivio reale.
 *
 * Esito: scripts/verifiche/esiti/i106-persistenza-latest.md (nome fisso,
 * tracciato — lezione Task 44: un esito richiesto dall'audit deve esistere
 * anche su checkout fresco). Il token non viene mai stampato.
 *
 * Uso: bun scripts/verifiche/verifica-i106.mjs
 */

import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ESITI = join(ROOT, "scripts", "verifiche", "esiti");
const ESITO = join(ESITI, "i106-persistenza-latest.md");

const TABELLE_ATTESE = ["UsagePoint", "DownsampledPoint", "UsageEventRecord", "ModelUsagePoint"];
const passi = [];
function passo(nome, ok, dettaglio = "") {
  passi.push({ nome, ok, dettaglio });
  console.log(`${ok ? "✓" : "✗"} ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  if (!ok) throw new Error(`passo fallito: ${nome} ${dettaglio}`);
}

/** Scenari: 'file' (A, ciclo completo su temporaneo) o 'remoto' (B, read-only). */
const url = process.env.TURSO_DATABASE_URL?.trim();
const scenario = url ? "remoto" : "file";
const tmpDb = join(ESITI, `i106-verifica-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`);

if (scenario === "file") {
  // Lo schema sul file temporaneo: il push usa il motore nativo (l'adapter
  // non fa partecipare prisma db push) — poi TUTTO il ciclo passa dall'adapter.
  execFileSync("bunx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: `file:${tmpDb}` },
  });
  // L'env va impostata PRIMA dell'import dinamico: la factory legge l'ambiente
  // alla costruzione del client (stesso contratto del runtime).
  process.env.TURSO_DATABASE_URL = `file:${tmpDb}`;
}

const { db, modalitaPersistenza } = await import(join(ROOT, "src", "lib", "db.ts"));

try {
  passo(`scenario ${scenario}${scenario === "file" ? " — db temporaneo con schema nativo" : ` — ${url}`}`, true);

  const modalita = modalitaPersistenza();
  passo("modalitaPersistenza() coerente con l'ambiente", modalita === (scenario === "file" ? "turso" : "turso"), `modalità: ${modalita} (env presente → ramo adattato)`);
  // Nota: con TURSO_DATABASE_URL impostato il ramo è SEMPRE l'adattato —
  // la modalità 'locale' (motore nativo) è coperta dai test unit + dall'intera
  // suite CI (che gira senza TURSO_*).

  // Elenco tabelle via SQL raw (stesso canale di server-model-history).
  const tabelle = await db.$queryRaw`SELECT name FROM sqlite_master WHERE type = 'table'`;
  const nomi = new Set(tabelle.map((r) => r.name));
  const tutte = TABELLE_ATTESE.every((t) => nomi.has(t));
  passo("tabelle dello schema presenti (via $queryRaw sull'adapter)", tutte, TABELLE_ATTESE.filter((t) => nomi.has(t)).join(", "));

  if (scenario === "file") {
    // Ciclo di ACCETTAZIONE completo: punto scritto → riletto → dedup → raw SQL.
    const t = new Date(Date.now() - 60_000);
    await db.usagePoint.upsert({
      where: { t },
      create: { t, interval: 42.5, weekly: 77.7, source: "api", region: "eu" },
      update: {},
    });
    const letto = await db.usagePoint.findUnique({ where: { t } });
    passo("punto scritto e riletto (accessor tipizzato sull'adapter)", letto !== null && letto.interval === 42.5 && letto.weekly === 77.7, `interval=${letto?.interval} weekly=${letto?.weekly}`);

    await db.usagePoint.upsert({
      where: { t },
      create: { t, interval: 42.5, weekly: 77.7, source: "api", region: "eu" },
      update: { interval: 10 },
    });
    const aggiornato = await db.usagePoint.findUnique({ where: { t } });
    const count = await db.usagePoint.count();
    passo("upsert deduplica (contratto I16)", aggiornato?.interval === 10 && count === 1, `righe=${count}, interval aggiornato=${aggiornato?.interval}`);

    const raw = await db.$queryRaw`SELECT COUNT(*) AS c FROM "UsagePoint"`;
    const c = Number(raw[0]?.c ?? 0);
    passo("SQL raw parametrizzato ($queryRaw) sull'adapter", c === 1, `COUNT=${c} — canale usato da server-model-history I42`);
  } else {
    passo("database remoto: verifica READ-ONLY (nessuna scrittura su archivio reale)", true);
  }
} catch (errore) {
  // Un passo fallito entra nell'esito come FAIL (l'esito riflette SEMPRE l'ultima esecuzione).
  passi.push({ nome: "esecuzione interrotta da errore", ok: false, dettaglio: String(errore?.message ?? errore) });
  console.error(errore);
} finally {
  // L'esito è scritto in OGNI caso; process.exit va FUORI dal try/finally
  // (termina subito, senza eseguire il finally — lezione della prima stesura:
  // il file temporaneo sopravviveva perché exit saltava la pulizia).
  const ok = passi.length > 0 && passi.every((p) => p.ok);
  const ora = new Date().toISOString();
  const righe = [
    `# Verifica I106 — persistenza portabile (esito del ${ora})`,
    "",
    `- Scenario: **${scenario === "file" ? "A — ciclo completo su db file temporaneo tramite driver adapter libsql" : "B — read-only su database Turso remoto"}**`,
    `- Passi verificati: ${passi.length} — tutti PASS: ${ok ? "SÌ" : "NO"}`,
    ...passi.map((p) => `- ${p.ok ? "PASS" : "FAIL"} — ${p.nome}${p.dettaglio ? ` (${p.dettaglio})` : ""}`),
    "",
    scenario === "file"
      ? "Il ciclo replica il contratto di produzione (stessa factory di src/lib/db.ts): schema creato con motore nativo, dati interamente via adapter libsql — upsert con dedup I16 incluso. L'equivalente su Turso remoto richiede solo le env TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (scenario B: solo lettura)."
      : `Verifica read-only del database remoto: tabelle attese presenti (${TABELLE_ATTESE.join(", ")}). Nessuna scrittura su un archivio reale: il ciclo di scrittura è coperto dallo scenario A (db file temporaneo).`,
    "",
  ].join("\n");
  writeFileSync(ESITO, righe, "utf8");
  console.log(`\nVerdetto: ${ok ? "PASS" : "FAIL"} — esito scritto in scripts/verifiche/esiti/i106-persistenza-latest.md`);
  await db.$disconnect().catch(() => {});
  if (scenario === "file") rmSync(tmpDb, { force: true });
  process.exit(ok ? 0 : 1);
}
