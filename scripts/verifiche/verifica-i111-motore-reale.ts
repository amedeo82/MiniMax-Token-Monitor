/**
 * I111 — Verifica END-TO-END della manutenzione su MOTORE REALE, in PROCESSO
 * FIGLIO (immune dai mock: nessun bun.test, nessun mock.module — il modulo
 * "@prisma/client" qui è sempre quello REALE, in ogni ordine di caricamento e
 * in ogni versione di bun; lezione CI run #22/#23: bun «latest» in CI chiave i
 * mock in modo diverso dal 1.3.14 locale, anche via percorso assoluto).
 *
 * Stessa partitura dell'ormai rimossa e2e in-process: ritenuta che elimina
 * davvero le righe vecchie di ENTRAMBE le codifiche DateTime (INTEGER del
 * motore + TEXT dell'SQL raw), cap FIFO che conserva le più recenti, PRAGMA
 * misurabili, quick_check ok, ciclo completo e idempotenza. Zero credenziali:
 * file temporaneo. Esito: «I111-MOTORE-REALE: PASS» + exit 0, altrimenti
 * «I111-MOTORE-REALE: FAIL <dettaglio>» + exit 1 (il test padre lo riporta
 * PAROLE PER PAROLE: il fallimento dice SEMPRE perché).
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import {
  eseguiManutenzioneDb,
  eseguiPuliziaRitenuta,
  eseguiVacuum,
  LIMITI_TURSO_FREE,
  misuraDimensioneDb,
  RETENZIONE_DEFAULT,
  statisticaTabelle,
  verificaIntegritaDb,
} from "../../src/lib/manutenzione-db";
import { preparaSchema } from "../../src/lib/schema-persistenza";

const DIR = join(tmpdir(), "i111-motore-reale");
let client: PrismaClient | undefined;

function fallisci(e: unknown): never {
  const messaggio = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.error(`I111-MOTORE-REALE: FAIL ${messaggio}`);
  process.exit(1);
}

try {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  // I115 — prisma 7: datasourceUrl rimosso, adapter obbligatorio (anche sul file:).
  client = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${join(DIR, "prova.db")}` }) });
  // Guardia onesta: accessori di modello presenti = client REALE.
  if (typeof (client as unknown as { usagePoint?: unknown }).usagePoint !== "object") {
    throw new Error("client senza accessori di modello (non è il PrismaClient reale)");
  }
  await preparaSchema(client);

  const ora = Date.now();
  const giorni = (n: number) => new Date(ora - n * 24 * 3600_000);
  const iso = (n: number) => new Date(ora - n * 24 * 3600_000).toISOString();
  const verifica = (condizione: boolean, messaggio: string): void => {
    if (!condizione) throw new Error(`verifica non soddisfatta: ${messaggio}`);
  };

  // UsagePoint: 2 vecchie INTEGER (200/150 gg) + 3 recenti INTEGER + 1 vecchia
  // TEXT (100 gg, SQL raw come la lib I42) + 1 recente TEXT (2 gg).
  for (const [i, t] of [200, 150, 1, 2, 3].entries()) {
    await client.usagePoint.create({ data: { t: giorni(t), interval: i, weekly: i * 2 } });
  }
  await client.$executeRaw`INSERT INTO "UsagePoint" ("t", "interval", "weekly", "source", "region", "createdAt") VALUES (${iso(100)}, 1, 2, 'import', 'eu', ${iso(100)})`;
  await client.$executeRaw`INSERT INTO "UsagePoint" ("t", "interval", "weekly", "source", "region", "createdAt") VALUES (${iso(2)}, 3, 6, 'import', 'eu', ${iso(2)})`;
  // DownsampledPoint vecchio + recente.
  await client.downsampledPoint.create({ data: { hourStart: giorni(120), lastT: giorni(120), count: 1 } });
  await client.downsampledPoint.create({ data: { hourStart: giorni(1), lastT: giorni(1), count: 2 } });
  // ModelUsagePoint: 5 righe per il cap FIFO a 3.
  for (const i of [0, 1, 2, 3, 4]) {
    await client.modelUsagePoint.create({ data: { model: "general", win: "interval", t: giorni(i), percent: i } });
  }
  // Evento recente e evento vecchio.
  await client.usageEventRecord.create({ data: { id: "i111-recente", t: giorni(1), kind: "info", message: "recente" } });
  await client.usageEventRecord.create({ data: { id: "i111-vecchio", t: giorni(200), kind: "info", message: "vecchio" } });

  /* DryRun prima: conta ma NON elimina (il database resta com'era). */
  const stima = await eseguiPuliziaRitenuta(client, RETENZIONE_DEFAULT, { dryRun: true });
  verifica(stima.dryRun && !stima.eseguita, "dryRun dichiarata");
  verifica(stima.eliminati.punti === 3, `dryRun punti = 3 (2 INTEGER + 1 TEXT), ricevuti ${stima.eliminati.punti}`);
  verifica(stima.eliminati.bucket === 1, "dryRun bucket = 1");
  verifica(stima.eliminati.eventi === 1, "dryRun eventi = 1");
  verifica(stima.eliminati.modelli === 0, "dryRun modelli = 0");
  verifica((await client.usagePoint.count()) === 7, "dryRun: 7 punti intatti");

  /* Pulizia reale + cap FIFO modelli a 3. */
  const esito = await eseguiPuliziaRitenuta(client, { ...RETENZIONE_DEFAULT, maxModelli: 3 }, { ora });
  verifica(esito.eseguita && !esito.dryRun, "pulizia reale eseguita");
  verifica(esito.eliminati.punti === 3, `punti eliminati = 3, ricevuti ${esito.eliminati.punti}`);
  verifica(esito.eliminati.bucket === 1, "bucket eliminati = 1");
  verifica(esito.eliminati.eventi === 1, "eventi eliminati = 1");
  verifica(esito.eliminati.modelli === 2, "modelli eliminati = 2 (5 → cap 3)");
  verifica((await client.usagePoint.count()) === 4, "restano 4 punti (3 recenti INTEGER + 1 recente TEXT)");
  verifica((await client.downsampledPoint.count()) === 1, "resta 1 bucket");
  verifica((await client.usageEventRecord.count()) === 1, "resta 1 evento");
  const modelliRestanti = await client.modelUsagePoint.findMany({ orderBy: { t: "desc" } });
  verifica(
    modelliRestanti.length === 3 &&
      JSON.stringify(modelliRestanti.map((r) => r.t.getTime())) === JSON.stringify([giorni(0), giorni(1), giorni(2)].map((d) => d.getTime())),
    "cap FIFO modelli conserva le PIÙ RECENTI",
  );

  /* Misure reali: PRAGMA, statistiche, integrità, quota. */
  const misura = await misuraDimensioneDb(client);
  verifica(misura.bytes > 0 && misura.dimPagina > 0 && misura.pagine > 0, "PRAGMA misurabili");
  const statistiche = await statisticaTabelle(client);
  const perNome = new Map(statistiche.tabelle.map((t) => [t.tabella, t.righe]));
  verifica(perNome.get("UsagePoint") === 4, "statistica UsagePoint = 4");
  verifica(perNome.get("DownsampledPoint") === 1, "statistica DownsampledPoint = 1");
  verifica(perNome.get("UsageEventRecord") === 1, "statistica UsageEventRecord = 1");
  verifica(perNome.get("ModelUsagePoint") === 3, "statistica ModelUsagePoint = 3");
  verifica(statistiche.totaleRighe === 9, "totale righe = 9");
  const integrita = await verificaIntegritaDb(client, misura.bytes);
  verifica(integrita.eseguito && integrita.ok && integrita.esito === "ok", "quick_check ok");
  const ciclo = await eseguiManutenzioneDb(client, { pulizia: true, vacuum: "auto" });
  verifica(ciclo.quota.limite === LIMITI_TURSO_FREE.storageBytes, "limite quota = 5 GiB");
  verifica(ciclo.quota.livello === "ok", "livello quota ok (file di prova microscopico)");
  verifica(ciclo.integrita.ok, "ciclo: integrità ok");
  verifica(ciclo.statistiche.totaleRighe === 9, "ciclo: totale righe = 9");
  verifica(ciclo.vacuum === null, "ciclo: VACUUM auto non parte senza eliminazioni");

  /* Seconda pulizia: idempotente — zero righe oltre ritenuta e cap. */
  const ritorno = await eseguiPuliziaRitenuta(client, { ...RETENZIONE_DEFAULT, maxModelli: 3 });
  verifica(ritorno.totale === 0, "seconda pulizia idempotente (zero righe)");

  /* VACUUM sul motore nativo: eseguito e il file resta usabile. */
  verifica((await eseguiVacuum(client)).eseguito, "VACUUM eseguito sul motore nativo");
  verifica((await client.usagePoint.count()) === 4, "VACUUM: dati intatti");

  await client.$disconnect();
  rmSync(DIR, { recursive: true, force: true });
  console.log("I111-MOTORE-REALE: PASS");
  process.exit(0);
} catch (e) {
  await client?.$disconnect().catch(() => undefined);
  rmSync(DIR, { recursive: true, force: true });
  fallisci(e);
}
