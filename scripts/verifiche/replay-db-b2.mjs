/**
 * Prepara i payload di REPLAY per la verifica browser del batch 2 (I59/I60/I62/I63/I64).
 *
 * Scarica in sola lettura lo storico e gli eventi REALI dal server locale
 * (GET /api/history, GET /api/events) e li salva in forma compatta (senza
 * source/region, come farebbe serverPointsToHistory) per usarli come
 * route-mock di agent-browser (pattern glob della rotta, body da file):
 *
 *   network route [pattern /api/history] --body [contenuto replay-history-b2.json]
 *   network route [pattern /api/events]  --body [contenuto replay-events-b2.json]
 *
 * Così la GET mostra i dati reali, OGNI POST (punti demo della pagina,
 * eventi) resta intercettato e il DB non viene toccato (lezione sessione
 * precedente: la demo spinge punti source:"demo" a ogni tick).
 */
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

const hist = await getJson(`${BASE}/api/history?limit=10000`);
if (!hist.ok) throw new Error("storico non disponibile");
const points = hist.points.map((p) => ({
  t: p.t,
  interval: p.interval,
  weekly: p.weekly,
}));
const histPayload = { ok: true, total: points.length, points };

const ev = await getJson(`${BASE}/api/events?limit=5000`);
if (!ev.ok) throw new Error("eventi non disponibili");
const evPayload = { ok: true, total: ev.total, events: ev.events };

const dir = new URL(".", import.meta.url).pathname;
const histPath = `${dir}replay-history-b2.json`;
const evPath = `${dir}replay-events-b2.json`;
writeFileSync(histPath, JSON.stringify(histPayload));
writeFileSync(evPath, JSON.stringify(evPayload));

const oldest = new Date(points[0]?.t ?? Date.now()).toISOString();
const newest = new Date(points[points.length - 1]?.t ?? Date.now()).toISOString();
const kinds = {};
for (const e of ev.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;

console.log(`storico: ${points.length} punti (${histPath} — ${(JSON.stringify(histPayload).length / 1024).toFixed(0)} KB)`);
console.log(`  da ${oldest} a ${newest}`);
console.log(`eventi: ${ev.events.length} (${evPath}) — tipi: ${JSON.stringify(kinds)}`);
