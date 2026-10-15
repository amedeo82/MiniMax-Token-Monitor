import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { modalitaPersistenza } from "@/lib/modalita-persistenza";

export const dynamic = "force-dynamic";

/**
 * I107 — Diagnostica della persistenza server (endpoint SOLO LETTURA).
 *
 * Espone alle impostazioni (pannello «Persistenza», tab Dati) ciò che
 * `modalitaPersistenza()` già sa dall'ambiente (I106), più un test di
 * connessione reale e i conteggi per tabella: la versione ONESTA del
 * requisito «impostare il database dall'app» — il database si SCEGLIE con
 * le variabili d'ambiente (locale=SQLite nativo, cloud=Turso via driver
 * adapter, docs/09 §6–§8), l'app lo RENDE VISIBILE senza mai consentire
 * di cambiarlo a runtime e senza MAI esporre credenziali:
 *
 * - l'host di Turso è ridotto al solo hostname (schema, userinfo, porta,
 *   percorso e query — dove un token può nascondersi — scartati);
 * - il token vive solo nell'ambiente del server e non attraversa mai
 *   questa risposta (test dedicato in tests/lib/api-persistenza.test.ts);
 * - nessuna credenziale tocca il localStorage (vincolo di sicurezza del
 *   progetto: la chiave MiniMax resta l'unico segreto del browser).
 *
 * NOTA IMPORT: `modalitaPersistenza` arriva dal MODULO PROPRIO
 * (src/lib/modalita-persistenza.ts, pattern I106) e NON da "@/lib/db": i
 * mock di processo I99/I95 del shim espongono solo `{ db }` (bun applica il
 * primo mock registrato per specificatore) — un secondo import nominato da
 * lì romperebbe il link ESM dell'intera suite. Il `db` resta sul percorso
 * canonico (le route non cambiano import — contratto I106).
 *
 * GET → {
 *   ok: true,
 *   modalita: "locale" | "turso",
 *   host: string,                       // sanificato, nessun segreto
 *   test: { ok, latenzaMs },            // SELECT 1 reale sul motore attivo
 *   tabelle: [{ tabella, etichetta, righe }],
 *   totale, generatoIl
 * }
 *
 * La scelta read-only (niente POST/DELETE) mantiene l'endpoint fuori dalla
 * guardia ADMIN_TOKEN di I95: non altera nulla e non espone nulla che non
 * sia già diagnostica aggregata (solo conteggi e hostname).
 */

/** Modelli monitorati, con l'etichetta mostrata nel pannello. */
const TABELLE = [
  { tabella: "UsagePoint", etichetta: "Punti storici" },
  { tabella: "DownsampledPoint", etichetta: "Bucket orari" },
  { tabella: "UsageEventRecord", etichetta: "Eventi" },
  { tabella: "ModelUsagePoint", etichetta: "Punti per modello" },
] as const;

type Tabella = (typeof TABELLE)[number]["tabella"];

/** Conteggio per modello (camelCase) — portabile su SQLite e libsql. */
async function contaRighe(t: Tabella): Promise<number> {
  switch (t) {
    case "UsagePoint":
      return db.usagePoint.count();
    case "DownsampledPoint":
      return db.downsampledPoint.count();
    case "UsageEventRecord":
      return db.usageEventRecord.count();
    case "ModelUsagePoint":
      return db.modelUsagePoint.count();
  }
}

/**
 * Host diagnostico SENZA credenziali per il motore attivo:
 * - ramo turso/libsql: solo hostname di TURSO_DATABASE_URL (schema, userinfo,
 *   porta, percorso e query scartati — la query è dove un token si nasconde);
 * - URL `file:` (libsql locale): il percorso è diagnostica, non segreto;
 * - ramo locale (SQLite nativo): il percorso del file da DATABASE_URL
 *   (default `db/custom.db`).
 */
function hostDiagnostico(): string {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  if (url) {
    if (url.startsWith("file:")) return url;
    const senzaSchema = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const senzaCredenziali = senzaSchema.replace(/^[^/@]*@/, "");
    const conPorta = senzaCredenziali.split("/")[0]?.split("?")[0] ?? "";
    const host = conPorta.replace(/:\d+$/, "");
    return host || "URL non riconosciuto (host nascosto)";
  }
  return process.env.DATABASE_URL?.trim() || "db/custom.db";
}

/** Test di connessione reale sul motore attivo, con latenza misurata (ms). */
async function testConnessione(): Promise<{ ok: boolean; latenzaMs: number }> {
  const inizio = performance.now();
  await db.$queryRaw`SELECT 1`;
  return { ok: true, latenzaMs: Math.max(0, Math.round(performance.now() - inizio)) };
}

export async function GET() {
  try {
    const test = await testConnessione();
    const tabelle = await Promise.all(
      TABELLE.map(async (t) => ({
        tabella: t.tabella,
        etichetta: t.etichetta,
        righe: await contaRighe(t.tabella),
      })),
    );
    const totale = tabelle.reduce((s, r) => s + r.righe, 0);
    return NextResponse.json({
      ok: true,
      modalita: modalitaPersistenza(),
      host: hostDiagnostico(),
      test,
      tabelle,
      totale,
      generatoIl: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Verifica della persistenza non disponibile.";
    return NextResponse.json(
      { ok: false, error: { code: "db_read", message } },
      { status: 500 },
    );
  }
}
