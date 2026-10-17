/**
 * I110 — Verifica EMPIRICA dell'attivazione Turso (16/10/2026, richiesta
 * utente «fixa il bug ed aiutami ad attivare turso»).
 *
 * A differenza delle probe .mjs precedenti (verifica-i106: client libsql
 * DIRETTO) questa probe passa dalla STESSA VIA DI PRODUZIONE: importa la
 * factory reale src/lib/db-factory.ts (bun esegue TypeScript nativamente e
 * risolve l'alias "@/..." dal tsconfig) con le env TURSO_* impostate dal
 * .env locale — quindi:
 *
 *   1. modalitaPersistenza() DEVE valere "turso" (selezione guidata dall'env);
 *   2. creaPrismaClient() costruisce l'adapter libsql verso il database reale;
 *   3. await preparaSchema(client) applica il DDL incorporato (I107-fix3) al
 *      database Turso: un DB appena creato funziona senza db-push-turso.mjs
 *      (D1 «zero migrazione» verificata sul CLOUD, non solo su file locale);
 *   4. SELECT 1 con latenza misurata (test di connessione, come /api/persistenza);
 *   5. conteggi delle 4 tabelle (route diagnostica);
 *   6. ROUND-TRIP completo scrivi→leggi→verifica→cancella→verifica su
 *      UsageEventRecord VIA PRISMA (l'esatta API usata dalle route);
 *   7. seconda preparaSchema() = no-op istantaneo (cache WeakMap, idempotenza).
 *
 * SEGRETI: il token NON viene mai stampato né finisce nell'evidenza; l'host
 * appare SOLO in forma sanificata (hostname, stesso livello del pannello
 * I107 — userinfo/porta/percorso/query scartati). L'evidenza va in
 * scripts/verifiche/esiti/i110-turso-attivazione-latest.md (nome fisso,
 * eccezione esplicita nella regex I97 dell'audit).
 *
 * Uscita: exit 0 = attivazione verificata; exit 1 = guasto con messaggio
 * preciso (nessuna mascheratura — stessa filosofia del progetto).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const URL_TURSO = process.env.TURSO_DATABASE_URL?.trim() ?? "";
const TOKEN = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";

if (!URL_TURSO) {
  console.error("[i110] TURSO_DATABASE_URL assente: attivazione non verificabile. Impostala nel .env locale (gitignored) o nell'ambiente.");
  process.exit(1);
}

/** Host sanificato: SOLO hostname — stesso livello di hostDiagnostico (I107). */
function hostSanificato(url: string): string {
  try {
    const senzaSchema = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
    const senzaPercorso = senzaSchema.split(/[/?#]/)[0] ?? "";
    const senzaUserInfo = senzaPercorso.includes("@") ? (senzaPercorso.split("@").pop() ?? "") : senzaPercorso;
    const senzaPorta = senzaUserInfo.replace(/:\d+$/, "");
    return senzaPorta || "(host non riconoscibile)";
  } catch {
    return "(host non riconoscibile)";
  }
}

const HOST = hostSanificato(URL_TURSO);
const passi: Array<{ nome: string; esito: "PASS" | "FAIL"; dettaglio: string }> = [];
let guasto = false;

function registra(nome: string, ok: boolean, dettaglio: string): void {
  passi.push({ nome, esito: ok ? "PASS" : "FAIL", dettaglio });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${nome} — ${dettaglio}`);
  if (!ok) guasto = true;
}

const t0 = performance.now();
const { creaPrismaClient, modalitaPersistenza } = await import("../../src/lib/db-factory");
const { preparaSchema } = await import("../../src/lib/schema-persistenza");
registra("import factory reale", true, `@/lib/db-factory + @/lib/schema-persistenza (${Math.round(performance.now() - t0)} ms)`);

/* 1 — selezione del motore guidata dall'ambiente */
const modalita = modalitaPersistenza();
registra("modalità selezionata", modalita === "turso", `modalitaPersistenza() = "${modalita}" (atteso "turso" con TURSO_DATABASE_URL presente)`);

if (modalita !== "turso") {
  console.error("[i110] la selezione ambiente NON arriva al ramo Turso: probe interrotta.");
  process.exit(1);
}

/* 2 — client di produzione (adapter libsql, token dall'ambiente) */
const db = creaPrismaClient();
registra("client di produzione", true, `creaPrismaClient() con adapter libsql verso ${HOST} (token mai stampato)`);

/* 3 — DDL incorporato sul database reale (un Turso appena creato basta) */
const tDDL = performance.now();
await preparaSchema(db);
const msDDL = Math.round(performance.now() - tDDL);
registra("preparaSchema (DDL incorporato)", true, `gate completato in ${msDDL} ms — 4 tabelle + 9 indici idempotenti su Turso (D1 zero migrazione nel cloud)`);

/* 4 — test di connessione con latenza (stessa misura di /api/persistenza) */
const tSel = performance.now();
await db.$queryRaw`SELECT 1`;
const msSel = Math.round(performance.now() - tSel);
registra("SELECT 1", true, `connessione ok, latenza ${msSel} ms (RTT verso Turso)`);

/* 5 — conteggi delle 4 tabelle (route diagnostica) */
const [
  punti, bucket, eventi, modelli,
] = await Promise.all([
  db.usagePoint.count(),
  db.downsampledPoint.count(),
  db.usageEventRecord.count(),
  db.modelUsagePoint.count(),
]);
registra("conteggi 4 tabelle", true, `UsagePoint=${punti} · DownsampledPoint=${bucket} · UsageEventRecord=${eventi} · ModelUsagePoint=${modelli}`);

/* 6 — round-trip completo via Prisma (l'esatta API delle route) */
const ID_PROVA = `i110-probe-${Date.now()}`;
const T_PROVA = new Date();
const MESSAGGIO = "riga di verifica I110 (cancellata a fine probe)";
const tScrivi = performance.now();
await db.usageEventRecord.upsert({
  where: { id: ID_PROVA },
  create: { id: ID_PROVA, t: T_PROVA, kind: "info", message: MESSAGGIO, value: 1 },
  update: { t: T_PROVA, kind: "info", message: MESSAGGIO, value: 1 },
});
const msScrivi = Math.round(performance.now() - tScrivi);

const letto = await db.usageEventRecord.findUnique({ where: { id: ID_PROVA } });
const roundTripOk =
  letto !== null &&
  letto.kind === "info" &&
  letto.message === MESSAGGIO &&
  letto.t.getTime() === T_PROVA.getTime();
registra(
  "round-trip scrivi→leggi (POST+GET come le route)",
  roundTripOk,
  `upsert + findUnique ok in ${msScrivi} ms (scrittura) — riga ${ID_PROVA}`,
);

const tCancella = performance.now();
await db.usageEventRecord.delete({ where: { id: ID_PROVA } });
const dopoDelete = await db.usageEventRecord.count({ where: { id: ID_PROVA } });
registra(
  "cancella→verifica",
  dopoDelete === 0,
  `delete ok in ${Math.round(performance.now() - tCancella)} ms — riga di prova rimossa (database lasciato com'era)`,
);

/* 7 — seconda passata del gate: cache WeakMap = no-op istantaneo */
const tGate2 = performance.now();
await preparaSchema(db);
const msGate2 = Math.round(performance.now() - tGate2);
registra("seconda preparaSchema (idempotenza)", msGate2 < 100, `no-op in ${msGate2} ms (cache WeakMap per client)`);

/* Evidenza a nome fisso (eccezione I97 nell'audit) — MAI il token. */
const esitiDir = join(import.meta.dir, "esiti");
mkdirSync(esitiDir, { recursive: true });
const righe = [
  "# I110 — Attivazione Turso verificata empiricamente (probe di produzione)",
  "",
  `- Data: ${new Date().toISOString()}`,
  `- Host: ${HOST} (sanificato — token MAI stampato, stesso livello del pannello I107)`,
  `- Via: factory REALE src/lib/db-factory.ts (creaPrismaClient + preparaSchema), env TURSO_* dal .env locale (gitignored)`,
  "",
  "| Passo | Esito | Dettaglio |",
  "|-------|-------|-----------|",
  ...passi.map((p) => `| ${p.nome} | ${p.esito} | ${p.dettaglio} |`),
  "",
  `Verdetto: **${guasto ? "FAIL" : "PASS"}** (${passi.filter((p) => p.esito === "PASS").length}/${passi.length} passi)`,
  "",
  "Significato: con TURSO_DATABASE_URL+TURSO_AUTH_TOKEN nell'ambiente l'app si connette al database cloud, il DDL incorporato (I107-fix3) rende lo schema disponibile senza db-push-turso.mjs, e scrivere/leggere/cancellare via Prisma funziona — l'archivio server diventa DURATURO (sopravvive a istanze serverless e ridistribuzioni). Per Vercel: impostare le stesse due env nel dashboard (Project → Settings → Environment Variables) e ridistribuire.",
];
const outPath = join(esitiDir, "i110-turso-attivazione-latest.md");
writeFileSync(outPath, righe.join("\n"), "utf8");
console.log(`\nEvidenza salvata: ${outPath}`);

if (guasto) {
  console.error("[i110] ATTIVAZIONE NON VERIFICATA: vedi i passi FAIL sopra.");
  process.exit(1);
}
console.log("[i110] ATTIVAZIONE TURSO VERIFICATA: connessione, schema incorporato e round-trip OK sul database reale.");
process.exit(0);
