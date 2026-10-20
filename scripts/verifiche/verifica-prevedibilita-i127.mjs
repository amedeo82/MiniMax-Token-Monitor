/**
 * Verifica I127 (probe read-only) — ricalcolo END-TO-END della sezione
 * «Prevedibilità» (tabella cicli I124 + strip I63) sui dati REALI di
 * produzione, per confronto con l'output incollato dall'utente il 20/10.
 *
 * Replica fedele di:
 *   - detectCyclesFinestre (cycles.ts, I124): raggruppamento per blocco
 *     fisso UTC {00,05,10,15,20} (semantica cron, ultimo blocco 4h reali);
 *   - buildCycle: consumed = start − min (drawdown massimo), ritmo = %/h;
 *   - prevedibilitaCicli (I63): solo cicli completati, σ popolazione,
 *     CV = σ/μ, indice = round(100 × (1 − min(1, cv))).
 * Nessuna scrittura: solo GET /api/history.
 */

const BASE = "https://minimax-token-monitor.vercel.app";

const fmtRoma = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});
const fmtDur = (ms) => {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} ore ${m} min` : `${h} ora${h > 1 ? "i" : ""}`;
};

/** Blocco fisso UTC corrente (inizioFinestra5h) — blocchi {00,05,10,15,20}. */
function inizioFinestra5h(t) {
  const d = new Date(t);
  const h = d.getUTCHours();
  const block = h >= 20 ? 20 : h >= 15 ? 15 : h >= 10 ? 10 : h >= 5 ? 5 : 0;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), block);
}
/** Confine successivo (fineFinestra5h) — l'ultimo blocco dura 4h reali. */
function fineFinestra5h(t) {
  const inizio = inizioFinestra5h(t);
  const block = new Date(inizio).getUTCHours();
  const durataMs = block === 20 ? 4 : 5; // ore reali del blocco
  return inizio + durataMs * 3600_000;
}

const res = await fetch(`${BASE}/api/history`, { headers: { accept: "application/json" } });
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const json = await res.json();
const punti = (json.points ?? []).filter((p) => p.source !== "demo"); // senzaDemo (I124)
const serie = [...punti].sort((a, b) => a.t - b.t);
const now = Date.now();

console.log(`Punti totali: ${json.total} · usati (senza demo): ${serie.length}`);
const senzaMarca = (json.points ?? []).filter((p) => !p.source).length;
const demo = (json.points ?? []).filter((p) => p.source === "demo").length;
console.log(`Marche: demo=${demo} · senza marca=${senzaMarca}`);

// Raggruppamento per finestra (detectCyclesFinestre)
const cicli = [];
let idx = 0;
let chiave = inizioFinestra5h(serie[0].t);
for (let i = 1; i < serie.length; i++) {
  const k = inizioFinestra5h(serie[i].t);
  if (k !== chiave) { cicli.push([idx, i - 1, chiave]); idx = i; chiave = k; }
}
cicli.push([idx, serie.length - 1, chiave]);

const righe = cicli.map(([from, to, inizio], i) => {
  const slice = serie.slice(from, to + 1);
  const vals = slice.map((p) => p.interval);
  const startValue = vals[0], endValue = vals[vals.length - 1], minValue = Math.min(...vals);
  const startT = slice[0].t, endT = slice[slice.length - 1].t;
  const windowEndT = fineFinestra5h(slice[0].t);
  const durationMs = endT - startT;
  const consumed = Math.max(0, startValue - minValue);
  const hours = durationMs / 3600_000;
  return {
    n: i + 1, startT, endT, startValue, endValue, minValue,
    consumed, durationMs, points: slice.length,
    windowEndT, ongoing: windowEndT > now,
    rate: hours > 0 && consumed > 0 ? consumed / hours : null,
  };
});

console.log("\n== Cicli (finestra 5h, blocchi fissi UTC) ==");
for (const c of [...righe].reverse()) {
  const fine = c.ongoing ? "CICLO IN CORSO" : fmtRoma.format(c.endT);
  const ritmo = c.rate === null ? "—" : `${c.rate.toFixed(2)} %/h`;
  console.log(
    `#${c.n} ${fmtRoma.format(c.startT)} → ${fine} | reset ${fmtRoma.format(c.windowEndT)} | ` +
    `${fmtDur(c.durationMs)} | −${c.consumed.toFixed(1)}% (${c.startValue}→${c.endValue}) | ` +
    `min ${c.minValue.toFixed(1)}% | ${ritmo} | punti ${c.points}`
  );
}

// prevedibilitaCicli (I63) — solo completati
const durate = righe.filter((c) => !c.ongoing).map((c) => c.durationMs);
if (durate.length >= 3) {
  const media = durate.reduce((a, b) => a + b, 0) / durate.length;
  const sigma = Math.sqrt(durate.reduce((a, d) => a + (d - media) ** 2, 0) / durate.length);
  const cv = sigma / media;
  const indice = Math.round(Math.max(0, Math.min(100, 100 * (1 - Math.min(1, cv)))));
  console.log("\n== Prevedibilità (strip I63) ==");
  console.log(
    `n=${durate.length} · durata media ${fmtDur(media)} · σ ${fmtDur(sigma)} · ` +
    `CV ${(cv * 100).toFixed(0)}% · indice ${indice}/100 → ` +
    (indice >= 70 ? "Cicli regolari" : indice >= 40 ? "Cicli variabili" : "Cicli irregolari")
  );
} else {
  console.log(`\n== Prevedibilità: null (solo ${durate.length} cicli completati, servono ≥3) ==`);
}
