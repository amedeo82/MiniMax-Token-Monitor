/**
 * Verifica I42 (Task 19): pulizia righe di test + iniezione di una serie
 * sintetica temporanea per il modello "video" (via API /api/history), così
 * l'analisi per modello ha dati plausibili da mostrare nel browser.
 * Le righe di test usano source "test" e vengono rimosse a fine verifica.
 *
 * Uso: node scripts/i42_verify_data.js pulisci | inietta | svuota-test
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function post(modelPoints) {
  const res = await fetch(`${BASE}/api/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelPoints }),
  });
  return res.json();
}

async function main() {
  const cmd = process.argv[2] ?? "aiuto";

  if (cmd === "pulisci" || cmd === "svuota-test") {
    // Cancella SOLO le righe con source "test" direttamente dal DB.
    const { PrismaClient } = require("@prisma/client");
    const p = new PrismaClient();
    const n = await p.$executeRaw`DELETE FROM "ModelUsagePoint" WHERE "source" = 'test'`;
    console.log(`righe test rimosse: ${n}`);
    const rows = await p.$queryRaw`SELECT COUNT(*) AS c FROM "ModelUsagePoint"`;
    console.log(`righe ModelUsagePoint rimaste: ${rows[0].c}`);
    await p.$disconnect();
    return;
  }

  if (cmd === "inietta") {
    const now = Date.now();
    const STEP = 15 * 60_000; // 15 min
    const DAYS = 3;
    const pts = [];
    for (let i = DAYS * 96; i >= 0; i--) {
      const t = now - i * STEP;
      // weekly: 100 → 58 lineare in 3 giorni + jitter
      const weekly = 100 - (42 * (DAYS * 96 - i)) / (DAYS * 96) + (Math.random() * 1.6 - 0.8);
      // interval (finestra giornaliera video, reset 02:00 UTC = mezzanotte UTC del
      // giorno corrente nel generatore demo): 100 → 78 nel giorno + salto al reset
      const dayMs = 24 * 3600_000;
      const dayStart = Math.floor(t / dayMs) * dayMs;
      const elapsedDay = (t - dayStart) / dayMs;
      const daily = 100 - 22 * elapsedDay + (Math.random() * 1.2 - 0.6);
      pts.push({ model: "video", win: "weekly", t, percent: Math.max(0, Math.min(100, Math.round(weekly * 10) / 10)), source: "test", region: "eu" });
      pts.push({ model: "video", win: "interval", t, percent: Math.max(0, Math.min(100, Math.round(daily * 10) / 10)), source: "test", region: "eu" });
    }
    // A blocchi da 400 righe (limite POST: 500)
    let stored = 0;
    for (let i = 0; i < pts.length; i += 400) {
      const r = await post(pts.slice(i, i + 400));
      stored += r.modelStored ?? 0;
      if (!r.ok) { console.error("POST fallito:", r); process.exit(1); }
    }
    console.log(`iniettate ${stored} righe (source "test") su ${pts.length} — attese ~${DAYS * 96 + 1} per finestra`);
    return;
  }

  console.log("comandi: pulisci | inietta");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
