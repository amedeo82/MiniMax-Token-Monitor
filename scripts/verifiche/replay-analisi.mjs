// Generatore di REPLAY per la verifica browser dell'analisi docs/07 (pattern I51 + replay-db-b2).
// Legge in SOLA LETTURA i punti/eventi reali dal DB e scrive tre file JSON per i route-mock:
//   - replay-analisi-history.json  → GET /api/history (dati reali, fino a 10.000 punti)
//   - replay-analisi-events.json   → GET /api/events  (eventi reali)
//   - mock-proxy-analisi.json      → POST /api/minimax/usage (snapshot coerente con la coda reale)
// OGNI POST su history/events riceve il body vuoto {} impostato direttamente nella CLI
// (scrittura bloccata). Zero scritture al DB, zero chiamate all'API MiniMax.
// ATTENZIONE (lezione batch 1): niente commenti a blocco che contengono "asterisco-slash"
// preceduti da pattern con doppi asterischi; qui solo commenti di riga.

import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const db = new PrismaClient();

const MS_H = 3600_000;
const MS_D = 86_400_000;

async function main() {
  const points = await db.usagePoint.findMany({
    orderBy: { t: "asc" },
    take: 10_000,
  });
  const total = await db.usagePoint.count();
  const events = await db.usageEventRecord.findMany({
    orderBy: { t: "asc" },
    take: 2_000,
  });
  const totalEvents = await db.usageEventRecord.count();

  writeFileSync(
    join(here, "replay-analisi-history.json"),
    JSON.stringify({
      ok: true,
      total,
      points: points.map((r) => ({
        t: r.t.getTime(),
        interval: r.interval,
        weekly: r.weekly,
        source: r.source,
        region: r.region,
      })),
    }),
  );

  writeFileSync(
    join(here, "replay-analisi-events.json"),
    JSON.stringify({
      ok: true,
      total: totalEvents,
      events: events.map((r) => ({
        id: r.id,
        t: r.t.getTime(),
        kind: r.kind,
        model: r.model,
        win: r.win,
        message: r.message,
        value: r.value,
      })),
    }),
  );

  // Snapshot mockata coerente con la coda reale del DB (ultimo punto: 5h 100, settimanale 36).
  // Finestre calcolate su "ora": reset 5h = inizio ora corrente arrotondata giu' a blocchi di 5h
  // dall'epoca (coerenza plausibile); settimanale: lunedi' 02:00 Roma = lunedi' 00:00 UTC (CEST).
  const now = Date.now();
  const block5h = Math.floor(now / (5 * MS_H)) * (5 * MS_H);
  const start5h = block5h;
  const end5h = block5h + 5 * MS_H;
  // Lunedi' 00:00 UTC corrente (02:00 CEST a Roma): lunedi' = day 1 della settimana UTC.
  const d = new Date(now);
  const dow = d.getUTCDay(); // 0 dom, 1 lun ...
  const daysSinceMonday = (dow + 6) % 7;
  const mondayUtc = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0,
  );
  const weeklyStart = mondayUtc;
  const weeklyEnd = mondayUtc + 7 * MS_D;
  const weeklyRemains = Math.max(0, weeklyEnd - now);

  const payload = {
    ok: true,
    endpoint: "https://www.minimax.io/v1/token_plan/remains (MOCK analisi docs/07)",
    fallback: false,
    data: {
      base_resp: { status_code: 0, status_msg: "success" },
      model_remains: [
        {
          model_name: "general",
          current_interval_remaining_percent: 100,
          current_interval_total_count: 0,
          current_interval_usage_count: 0,
          current_interval_status: "in uso",
          start_time: Math.floor(start5h / 1000),
          end_time: Math.floor(end5h / 1000),
          remains_time: Math.max(0, end5h - now),
          current_weekly_remaining_percent: 36,
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
          current_weekly_status: "in uso",
          weekly_start_time: Math.floor(weeklyStart / 1000),
          weekly_end_time: Math.floor(weeklyEnd / 1000),
          weekly_remains_time: Math.floor(weeklyRemains / 1000),
        },
        {
          model_name: "video",
          current_interval_remaining_percent: 100,
          current_interval_total_count: 0,
          current_interval_usage_count: 0,
          current_interval_status: "inattivo",
          start_time: Math.floor(start5h / 1000),
          end_time: Math.floor(end5h / 1000),
          remains_time: Math.max(0, end5h - now),
          current_weekly_remaining_percent: 100,
          current_weekly_total_count: 0,
          current_weekly_usage_count: 0,
          current_weekly_status: "inattivo",
          weekly_start_time: Math.floor(weeklyStart / 1000),
          weekly_end_time: Math.floor(weeklyEnd / 1000),
          weekly_remains_time: Math.floor(weeklyRemains / 1000),
        },
      ],
    },
  };
  writeFileSync(join(here, "mock-proxy-analisi.json"), JSON.stringify(payload));

  const bySource = points.reduce((acc, p) => {
    acc[p.source] = (acc[p.source] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `OK: ${total} punti (${JSON.stringify(bySource)}), ${totalEvents} eventi; ` +
      `ultimo punto ${points.length ? new Date(points[points.length - 1].t.getTime()).toISOString() : "nessuno"}`,
  );
}

main()
  .catch((e) => {
    console.error("ERRORE:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
