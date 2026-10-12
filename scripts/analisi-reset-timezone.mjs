#!/usr/bin/env node
/**
 * analisi-reset-timezone.mjs — I49 / V8 (runbook docs/05 §11)
 *
 * Analizza i campioni passivi raccolti dal proxy (scripts/verifiche/campione-live.jsonl,
 * una riga JSONL per poll con {ts, region, endpoint, payload}) e verifica l'ipotesi:
 *
 *   «le finestre 5h si chiudono su blocchi fissi UTC (…00/05/10/15/20)»
 *
 * Per ogni transizione di finestra osservata (cambio di end_time) riporta:
 *   - istanti di osservazione prima/dopo (UTC + Europe/Rome);
 *   - vecchio end_time e nuova finestra (start/end) in UTC + Europe/Rome;
 *   - allineamento del confine: end_time mod 1h (0 ms = confine UTC esatto);
 *   - deriva di osservazione: reset avvenuto tra [ts_after − end_old] e [end_old − ts_before];
 *   - comportamento dello start: pre-armata (start = vecchio end) / invariato / nuovo.
 *
 * Uso:
 *   node scripts/verifiche/analisi-reset-timezone.mjs             # analizza il file reale
 *   node scripts/verifiche/analisi-reset-timezone.mjs --file X    # file alternativo
 *   node scripts/verifiche/analisi-reset-timezone.mjs --prova     # autotest su dati sintetici
 *
 * Zero dipendenze, Node ≥ 18. Il report viene salvato anche in esiti/analisi-reset-<istante>.md
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FILE_DEFAULT = path.join(QUI, "verifiche", "campione-live.jsonl");
const DIR_ESITI = path.join(QUI, "verifiche", "esiti");

const ORA_MS = 3_600_000;

// ─── formattatori ─────────────────────────────────────────────────────────────
const fmtUTC = (ms) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", dateStyle: "short", timeStyle: "medium" }).format(new Date(ms)) + " UTC";
const fmtRoma = (ms) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "medium" }).format(new Date(ms)) + " (Roma)";
const fmtTs = (d) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "medium" }).format(d);
const fmtDurata = (ms) => {
  const h = ms / ORA_MS;
  if (Math.abs(h - Math.round(h)) < 0.01) return `${Math.round(h)} h`;
  if (h >= 24) return `${Math.floor(h / 24)}g ${Math.round(h % 24)} h`;
  return `${h.toFixed(2)} h`;
};
const tipoFinestra = (dur) => {
  if (dur >= 23 * ORA_MS && dur <= 25 * ORA_MS) return "24h";
  if (dur >= 4 * ORA_MS && dur <= 6 * ORA_MS) return "5h";
  if (dur >= 167 * ORA_MS && dur <= 169 * ORA_MS) return "settimanale";
  return `${Math.round(dur / ORA_MS)}h`;
};

// ─── lettura campioni (parser tollerante, schema reale e demo) ────────────────
function leggiCampioni(testo) {
  const campioni = [];
  for (const riga of testo.split("\n")) {
    if (!riga.trim()) continue;
    try {
      const j = JSON.parse(riga);
      if (!j?.ts || !j?.payload) continue;
      campioni.push({ ts: new Date(j.ts), region: j.region ?? "?", payload: j.payload });
    } catch {
      // riga malformata: tollerata e segnalata nel conteggio
      campioni.push({ malformata: true });
    }
  }
  return campioni;
}

/** Estrae le osservazioni (modello × tipo finestra) da un payload, in entrambi gli schema noti. */
function estraiOsservazioni(payload) {
  const out = [];
  const modelli = Array.isArray(payload?.model_remains) ? payload.model_remains : [];
  for (const m of modelli) {
    const nome = m?.model_name ?? "?";
    // schema REALE (cattura proxy): campi piatti con weekly_*
    if (typeof m?.end_time === "number" && typeof m?.start_time === "number") {
      out.push({
        chiave: `${nome} · interval`,
        start: m.start_time,
        end: m.end_time,
        pct: typeof m.current_interval_remaining_percent === "number" ? m.current_interval_remaining_percent : null,
        status: m.current_interval_status ?? null,
      });
    }
    const wStart = m?.weekly_start_time;
    const wEnd = m?.weekly_end_time;
    if (typeof wEnd === "number" && typeof wStart === "number") {
      out.push({ chiave: `${nome} · weekly`, start: wStart, end: wEnd, pct: m.current_weekly_remaining_percent ?? null, status: m.current_weekly_status ?? null });
    }
    // schema DEMO/sintetico: time_info + remains{interval, weekly}
    if (m?.time_info && typeof m.time_info?.start_time === "number" && typeof m.time_info?.end_time === "number") {
      const dur = m.time_info.end_time - m.time_info.start_time;
      out.push({
        chiave: `${nome} · ${tipoFinestra(dur)}`,
        start: m.time_info.start_time,
        end: m.time_info.end_time,
        pct: m.remains?.interval ?? m.remains?.weekly ?? null,
        status: null,
      });
    }
  }
  return out;
}

// ─── analisi ──────────────────────────────────────────────────────────────────
function analizza(campioni) {
  // serie: chiave → [{ts, start, end, pct, status}]
  const serie = new Map();
  for (const c of campioni) {
    if (c.malformata) continue;
    for (const o of estraiOsservazioni(c.payload)) {
      if (!serie.has(o.chiave)) serie.set(o.chiave, []);
      serie.get(o.chiave).push({ ts: c.ts, ...o });
    }
  }

  const transizioni = [];
  for (const [chiave, obs] of serie) {
    obs.sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < obs.length; i++) {
      if (obs[i].end !== obs[i - 1].end) {
        const prima = obs[i - 1];
        const dopo = obs[i];
        const endVecchio = prima.end;
        transizioni.push({
          chiave,
          tsPrima: prima.ts,
          tsDopo: dopo.ts,
          endVecchio,
          endNuovo: dopo.end,
          startNuovo: dopo.start,
          pctPrima: prima.pct,
          pctDopo: dopo.pct,
          // comportamento start
          preArmata: dopo.start === endVecchio,
          startInvariato: dopo.start === prima.start,
          // allineamento confine (ms oltre l'ora UTC esatta)
          offsetConfineVecchio: ((endVecchio % ORA_MS) + ORA_MS) % ORA_MS,
          offsetConfineNuovo: ((dopo.end % ORA_MS) + ORA_MS) % ORA_MS,
          durataNuova: dopo.end - dopo.start,
          durataVecchia: prima.end - prima.start,
        });
      }
    }
  }
  return { serie, transizioni };
}

// ─── report ───────────────────────────────────────────────────────────────────
function costruisciReport(campioni, { serie, transizioni }, sorgente) {
  const L = [];
  const nMalformate = campioni.filter((c) => c.malformata).length;
  const tsMin = campioni.filter((c) => !c.malformata).map((c) => c.ts).sort((a, b) => a - b)[0];
  const tsMax = campioni.filter((c) => !c.malformata).map((c) => c.ts).sort((a, b) => a - b).at(-1);

  L.push(`# Analisi reset / fuso dei confini (V8 · I49)`);
  L.push("");
  L.push(`- Sorgente: \`${sorgente}\``);
  L.push(`- Campioni: **${campioni.length - nMalformate}** validi${nMalformate ? ` (+${nMalformate} righe malformate tollerate)` : ""}`);
  if (tsMin && tsMax) L.push(`- Copertura: ${fmtTs(tsMin)} → ${fmtTs(tsMax)} (Europe/Rome)`);
  L.push(`- Serie osservate: ${[...serie.keys()].map((k) => `\`${k}\``).join(", ") || "nessuna"}`);
  L.push("");

  L.push(`## Transizioni di finestra osservate (${transizioni.length})`);
  L.push("");
  if (transizioni.length === 0) {
    L.push("> Nessuna transizione: servono campioni a cavallo di almeno un reset (finestra che cambia `end_time`).");
    L.push("> Il campionatore passivo (I49) raccoglie da solo: basta il polling reale attivo (demo OFF).");
  }
  for (const t of transizioni) {
    L.push(`### \`${t.chiave}\``);
    L.push("");
    L.push(`- Osservata tra **${fmtTs(t.tsPrima)}** e **${fmtTs(t.tsDopo)}** (Europe/Rome)`);
    L.push(`- Vecchio end_time: **${fmtUTC(t.endVecchio)}** = ${fmtRoma(t.endVecchio)}`);
    L.push(`- Nuova finestra: ${fmtUTC(t.startNuovo)} → **${fmtUTC(t.endNuovo)}** (durata ${fmtDurata(t.durataNuova)})`);
    L.push(`  - in Europa/Rome: ${fmtRoma(t.startNuovo)} → **${fmtRoma(t.endNuovo)}**`);
    L.push(`- Allineamento confine vecchio: offset **${t.offsetConfineVecchio} ms** dall'ora UTC esatta ${t.offsetConfineVecchio === 0 ? "→ **confine UTC esatto**" : "→ NON allineato"}`);
    L.push(`- Allineamento confine nuovo: offset **${t.offsetConfineNuovo} ms** dall'ora UTC esatta ${t.offsetConfineNuovo === 0 ? "→ **confine UTC esatto**" : "→ NON allineato"}`);
    const basso = (t.tsPrima.getTime() - t.endVecchio) / 1000;
    const alto = (t.tsDopo.getTime() - t.endVecchio) / 1000;
    L.push(`- Reset compreso nell'intervallo tra i due campioni: fino a **${Math.abs(basso).toFixed(0)} s prima** e fino a **+${alto.toFixed(0)} s dopo** il confine teorico (istante vero in mezzo; con polling ~60 s la precisione è ±1 campione)`);
    L.push(`- Residui attorno alla transizione: ${t.pctPrima ?? "?"} → ${t.pctDopo ?? "?"} %`);
    L.push(
      `- Comportamento start: ${t.preArmata ? "**pre-armata** (nuovo start = vecchio end)" : t.startInvariato ? "**start invariato** (rolling al primo utilizzo)" : `**nuovo start** (${fmtUTC(t.startNuovo)})`}`,
    );
    L.push("");
  }

  // verdetto sintetico sull'allineamento
  const confini = new Map(); // tipo finestra → Set di offset
  const durate = new Map(); // tipo finestra → Set di durate
  for (const [chiave, obs] of serie) {
    const tipo = chiave.split(" · ")[1] ?? chiave;
    for (const o of obs) {
      if (!confini.has(tipo)) confini.set(tipo, new Set());
      confini.get(tipo).add(((o.end % ORA_MS) + ORA_MS) % ORA_MS);
      if (!durate.has(tipo)) durate.set(tipo, new Set());
      durate.get(tipo).add(o.end - o.start);
    }
  }
  L.push(`## Verdetto sintetico`);
  L.push("");
  for (const [tipo, offsets] of confini) {
    const tuttiZero = [...offsets].every((o) => o === 0);
    const durs = [...(durate.get(tipo) ?? [])].map(fmtDurata).join(", ");
    L.push(
      `- Finestre **${tipo}**: ${tuttiZero ? "tutti i confini osservati sono **ore UTC esatte** (offset 0 ms)" : `offset NON nulli: ${[...offsets].join(", ")} ms`} — durate osservate: ${durs}`,
    );
  }
  if (transizioni.length > 0 && [...confini.values()].every((s) => [...s].every((o) => o === 0))) {
    L.push("");
    L.push("**Conclusione**: i confini osservati coincidono con blocchi fissi UTC — coerente con l'ipotesi «finestre ancorate a blocchi 5h UTC (…00/05/10/15/20)»; l'orario del reset a Roma dipende quindi solo dalla convenzione oraria locale (CEST/CET) del giorno.");
  }
  L.push("");
  L.push("> Regola di presentazione (docs/02 §5): l'orario di reset va sempre etichettato UTC + conversione Europe/Rome del giorno (CEST fino al 25/10, poi CET).");
  return L.join("\n");
}

// ─── autotest su dati sintetici ───────────────────────────────────────────────
async function prova() {
  // Giornata sintetica: finestra A 10:00→15:00 UTC, transizione al confine 15:00:00.000 UTC,
  // finestra B 15:00→20:00 UTC; weekly invariata lun 05/10 00:00 UTC → lun 12/10 00:00 UTC.
  const base = Date.UTC(2026, 9, 8, 14, 58, 0, 0); // 14:58:00 UTC del 08/10/2026
  const righe = [];
  let t = base;
  let num = 0;
  while (t <= base + 4.5 * 60_000) {
    num++;
    const dopoConfine = t >= Date.UTC(2026, 9, 8, 15, 0, 0, 0);
    const startGen = dopoConfine ? Date.UTC(2026, 9, 8, 15, 0, 0, 0) : Date.UTC(2026, 9, 8, 10, 0, 0, 0);
    const endGen = startGen + 5 * ORA_MS;
    const pctGen = dopoConfine ? 98 : 9;
    righe.push(
      JSON.stringify({
        ts: new Date(t).toISOString(),
        region: "eu",
        endpoint: "https://www.minimax.io/v1/token_plan/remains",
        payload: {
          base_resp: { status_code: 0, status_msg: "success" },
          model_remains: [
            {
              model_name: "general",
              start_time: startGen,
              end_time: endGen,
              current_interval_remaining_percent: pctGen,
              current_interval_status: 1,
              weekly_start_time: Date.UTC(2026, 9, 5, 0, 0, 0, 0),
              weekly_end_time: Date.UTC(2026, 9, 12, 0, 0, 0, 0),
              current_weekly_remaining_percent: 45,
              current_weekly_status: 1,
            },
          ],
        },
      }),
    );
    if (num === 3) righe.push("QUESTA RIGA È MALFORMATA APPOSTA"); // tolleranza parser
    t += 30_000;
  }
  const fileProva = path.join(QUI, "campione-PROVA.jsonl");
  await writeFile(fileProva, righe.join("\n") + "\n", "utf8");
  try {
    console.log("— AUTOTEST su dati sintetici (finestra 10:00→15:00 UTC, transizione al confine 15:00:00.000) —\n");
    const esito = await esegui(fileProva, true);
    const ok =
      esito.transizioni.length === 1 &&
      esito.transizioni[0].offsetConfineVecchio === 0 &&
      esito.transizioni[0].offsetConfineNuovo === 0 &&
      esito.transizioni[0].preArmata;
    console.log(
      ok
        ? "\nAUTOTEST: PASSATO ✓ (1 transizione, confini UTC esatti, nuova finestra pre-armata 15:00→20:00 UTC)"
        : "\nAUTOTEST: FALLITO ✗ — controllare il report sopra",
    );
    if (!ok) process.exitCode = 1;
  } finally {
    await rm(fileProva, { force: true });
  }
}

async function esegui(file, suppressSave = false) {
  let testo;
  try {
    testo = await readFile(file, "utf8");
  } catch {
    console.error(`File non trovato: ${file}`);
    console.error("Il campionatore passivo (I49) crea questo file automaticamente a ogni poll REALE");
    console.error("(demo OFF). Attendi qualche ora di polling a cavallo di un reset e rilancia, oppure");
    console.error("esegui l'autotest: node scripts/verifiche/analisi-reset-timezone.mjs --prova");
    process.exitCode = 1;
    return { transizioni: [] };
  }
  const campioni = leggiCampioni(testo);
  const esito = analizza(campioni);
  const report = costruisciReport(campioni, esito, path.relative(process.cwd(), file) || file);
  console.log(report);
  if (!suppressSave) {
    const istante = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    await mkdir(DIR_ESITI, { recursive: true });
    const dest = path.join(DIR_ESITI, `analisi-reset-${istante}.md`);
    await writeFile(dest, report + "\n", "utf8");
    console.log(`— report salvato in ${path.relative(process.cwd(), dest)} —`);
  }
  return esito;
}

// ─── main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--prova")) {
  await prova();
} else {
  const idx = args.indexOf("--file");
  const file = idx >= 0 && args[idx + 1] ? path.resolve(args[idx + 1]) : FILE_DEFAULT;
  await esegui(file);
}
