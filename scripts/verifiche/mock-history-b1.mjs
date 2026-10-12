/**
 * Mock temporaneo per la verifica VISIVA del calendario I58 (batch 1).
 *
 * Genera un payload compatibile con GET /api/history ({ok,total,points}[])
 * coprendo 14 giorni con rilevamenti ogni 15 minuti (payload compatto, senza
 * source/region: serverPointsToHistory usa solo t/interval/weekly): finestra 5h a dente di
 * sega (consumo ~0,55 punti/tick, reset quando il residuo scende sotto 20),
 * finestra settimanale in discesa lenta con reset settimanale.
 *
 * Uso (SOLO verifica, il DB non è toccato: il mock intercetta la GET):
 *   1) bun scripts/verifiche/mock-history-b1.mjs   → scrive mock-history-b1.json
 *   2) agent-browser network route [pattern /api/history] --body [contenuto json]
 *      (nel browser: «Ricarica dal server» nel pannello analisi)
 *   3) agent-browser network unroute [stesso pattern]   → ripristino
 */
import { writeFileSync } from "node:fs";

const STEP_MS = 15 * 60_000; // 15 min (payload compatto per il limite argomenti CLI)
const DAYS = 14;
const now = Date.now();
const start = now - DAYS * 24 * 3600_000;

const points = [];
let interval = 97 + Math.random() * 2; // residuo 5h
let weekly = 78 + Math.random() * 4; // residuo settimanale

for (let t = start; t <= now; t += STEP_MS) {
  interval = Math.max(0, interval - (0.4 + Math.random() * 0.4)); // ~0,55 medio
  weekly = Math.max(0, weekly - (0.015 + Math.random() * 0.02)); // ~0,025 medio
  if (interval < 20) interval = 95 + Math.random() * 4; // reset 5h
  if (weekly < 30) weekly = 76 + Math.random() * 5; // reset settimanale
  points.push({
    t: Math.round(t),
    interval: Math.round(interval * 10) / 10,
    weekly: Math.round(weekly * 10) / 10,
  });
}

const body = { ok: true, total: points.length, points };
const out = new URL("./mock-history-b1.json", import.meta.url).pathname;
writeFileSync(out, JSON.stringify(body));
console.log(`mock scritto: ${out} — ${points.length} punti su ${DAYS} giorni`);
