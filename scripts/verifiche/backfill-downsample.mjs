/**
 * I68 — Backfill della tabella DownsampledPoint dai punti grezzi esistenti.
 *
 * Ricostruisce l'intera tabella derivata dallo storico UsagePoint (lettura
 * completa ordinata per t, aggregazione in memoria per (ora UTC, source),
 * ricreazione dei bucket). Idempotente: ogni esecuzione riporta la tabella
 * esattamente allo stato derivato dai punti grezzi correnti.
 *
 * Uso: `node scripts/verifiche/backfill-downsample.mjs`
 * (usa il DATABASE_URL da .env, come le altre istanze Prisma del progetto)
 *
 * Non tocca i dati grezzi: UsagePoint ed UsageEventRecord restano intatti.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Statistiche di una finestra nel bucket in costruzione. */
function nuovoAcc() {
  return { min: null, max: null, somma: 0, ultimo: null };
}

function accPer(acc, v) {
  if (v === null || !isFinite(v)) return;
  acc.min = acc.min === null ? v : Math.min(acc.min, v);
  acc.max = acc.max === null ? v : Math.max(acc.max, v);
  acc.somma += v;
  acc.ultimo = v; // i punti arrivano ordinati per t: l'ultimo è questo
}

async function main() {
  const punti = await db.usagePoint.findMany({ orderBy: { t: "asc" } });
  console.log(`Punti grezzi da aggregare: ${punti.length}`);

  const bucket = new Map();
  for (const p of punti) {
    const hourStart = Math.floor(p.t.getTime() / 3_600_000) * 3_600_000;
    const key = `${hourStart}|${p.source}`;
    if (!bucket.has(key)) {
      bucket.set(key, {
        hourStart,
        source: p.source,
        interval: nuovoAcc(),
        weekly: nuovoAcc(),
        count: 0,
        lastT: p.t.getTime(),
      });
    }
    const b = bucket.get(key);
    const osserva = p.interval !== null || p.weekly !== null;
    if (osserva) b.count += 1;
    accPer(b.interval, p.interval);
    accPer(b.weekly, p.weekly);
    b.lastT = Math.max(b.lastT, p.t.getTime());
  }

  console.log(`Bucket orari da scrivere: ${bucket.size}`);

  // Ricostruzione completa: la tabella è derivata, il delete è sicuro
  await db.downsampledPoint.deleteMany({});
  const righe = [...bucket.values()].map((b) => ({
    hourStart: new Date(b.hourStart),
    source: b.source,
    minInterval: b.interval.min,
    maxInterval: b.interval.max,
    sumInterval: b.interval.somma,
    lastInterval: b.interval.ultimo,
    minWeekly: b.weekly.min,
    maxWeekly: b.weekly.max,
    sumWeekly: b.weekly.somma,
    lastWeekly: b.weekly.ultimo,
    count: b.count,
    lastT: new Date(b.lastT),
  }));
  // SQLite: createMany in un unico batch (Prisma 6 lo supporta)
  await db.downsampledPoint.createMany({ data: righe });

  const ore = await db.downsampledPoint.count();
  console.log(`Backfill completato: ${ore} bucket orari nella tabella DownsampledPoint.`);
}

main()
  .catch((e) => {
    console.error("Backfill fallito:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
