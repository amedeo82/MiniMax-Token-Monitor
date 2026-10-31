#!/usr/bin/env node
/**
 * analisi-reset-timezone.mjs — I49/I56 · analisi del fuso di reset delle finestre (V8).
 *
 * Ri-creazione (12/10/2026) dell'analizzatore perito col secondo rollback: legge i campioni
 * grezzi del campionatore passivo (I49, ADR-13-R2): di default la FIXTURE sintetica
 * `scripts/verifiche/campione-fixture.jsonl` (I136: i campioni reali non sono più nel repo,
 * usare --input per un campione locale `campione-live.jsonl` gitignored)
 * e risponde alla domanda V8: **le finestre sono «rolling» ancorate al primo utilizzo o
 * «blocchi fissi» allineati a confini UTC?**
 *
 * Metodo (sui campioni REALI, nessuna chiamata di rete):
 *   per ogni modello e per ciascuna finestra (interval = start_time/end_time; weekly =
 *   weekly_start_time/weekly_end_time):
 *   - elenca gli start distinti osservati e le TRANSIZIONI (cambio di start con istante
 *     di cattura) — la transizione mostra SE il nuovo start coincide col confine di griglia
 *     o con l'istante d'uso (rolling);
 *   - misura l'OFFSET di ogni start dalla griglia teorica:
 *       interval → multipli di 5h UTC (griglia della finestra breve del piano token);
 *       finestra di 24h (quando la durata osservata è 24h, es. video) → mezzanotte UTC;
 *       weekly   → lunedì 00:00 UTC;
 *     con tolleranza 0 ms richiesta dal verdetto storico («offset 0 ms»);
 *   - controlla la coerenza end − start = durata attesa della griglia;
 *   - verifica di SICUREZZA: nessun materiale chiave nel file campione (ADR-13-R2).
 *
 * Verdetto automatico (stessa semantica della campagna 09/10):
 *   «BLOCCHI FISSI UTC» se TUTTI gli start osservati giacciono sulla griglia con offset
 *   0 ms E almeno una transizione è stata osservata con nuovo start = confine di griglia
 *   (non l'istante d'uso); «ROLLING» se un solo start non allineato basta a falsificare.
 *
 * Esiti: `esiti/v8-analisi-reset-<ts>.json` (+ `.md`) con copia a nome stabile
 * `esiti/v8-fuso-reset-latest.md` (referenziabile da audit/docs). Chiave MAI letta/stampata.
 *
 * Uso: node scripts/verifiche/analisi-reset-timezone.mjs [percorso-campione]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ESITI_DIR = join(SCRIPT_DIR, "esiti");
const DEFAULT_INPUT = join(SCRIPT_DIR, "campione-fixture.jsonl");

const MS_MIN = 60_000, MS_H = 3_600_000, MS_DAY = 86_400_000;
const GRIGLIE = {
  interval5h: { nome: "blocchi fissi 5h UTC", periodo: 5 * MS_H, etichetta: "5 ore" },
  day24h: { nome: "blocchi fissi 24h UTC (mezzanotte)", periodo: MS_DAY, etichetta: "24 ore" },
  weekly: { nome: "settimanale lunedì 00:00 UTC", periodo: 7 * MS_DAY, etichetta: "7 giorni" },
};
/** Tolleranza richiesta: il verdetto storico della campagna 09/10 è «offset 0 ms». */
const TOLLERANZA_MS = 0;

const iso = (ms) => new Date(Number(ms)).toISOString();
const roma = (ms) => new Date(Number(ms)).toLocaleString("it-IT", { timeZone: "Europe/Rome" });

/** Mezzanotte UTC del giorno di `ms`. */
function mezzanotteUtc(ms) {
  const d = new Date(Number(ms));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Offset (ms, >=0) di uno start dalla griglia teorica.
 *
 * ATTENZIONE (lezione della campagna 12/10): la griglia 5h NON è "multipli di 5h
 * dall'epoca" — 24h non è multiplo di 5h e i confini slitterebbero di giorno in
 * giorno (il 09/10 05:00/10:00 UTC sarebbe on-grid, il 12/10 10:00 UTC off-grid).
 * I dati reali (start sempre a 00/05/10… ora UTC ESATTE con ms=0) mostrano che la
 * griglia è ANCORATA ALLA MEZZANOTTE UTC DEL GIORNO: confini a 00:00, 05:00,
 * 10:00, 15:00, 20:00 UTC di ciascun giorno. Per la finestra di 24h il confine è
 * la mezzanotte UTC; per la settimanale, lunedì 00:00 UTC.
 */
function offsetDaGriglia(ms, griglia) {
  if (griglia === GRIGLIE.weekly) return Math.abs(Number(ms) - inizioSettimanaUtc(ms));
  const t = Number(ms) - mezzanotteUtc(ms); // ms da mezzanotte UTC del giorno
  const p = griglia.periodo; // 5h o 24h
  const x = ((t % p) + p) % p;
  return Math.min(x, p - x); // distanza dal confine più vicino dentro il giorno
}

/** Lunedì 00:00 UTC precedente (la griglia settimanale dell'API, docs/02 §5). */
function inizioSettimanaUtc(ms) {
  const d = new Date(Number(ms));
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const giorno = d.getUTCDay(); // 0 = domenica … 6 = sabato
  const deltaGiorni = (giorno + 6) % 7; // giorni da lunedì
  return utcMidnight - deltaGiorni * MS_DAY;
}

/** Classifica una finestra osservata (durata) nella griglia teorica corrispondente. */
function grigliaPerDurata(durataMs) {
  if (Math.abs(durataMs - 5 * MS_H) <= MS_MIN) return GRIGLIE.interval5h;
  if (Math.abs(durataMs - MS_DAY) <= 2 * MS_MIN) return GRIGLIE.day24h;
  if (Math.abs(durataMs - 7 * MS_DAY) <= 5 * MS_MIN) return GRIGLIE.weekly;
  return null;
}

function analizza(righe) {
  // struttura: `${modello}/${finestra}` → { start distinti, transizioni, campioni }
  const serie = new Map();
  const tocca = (chiave) => {
    if (!serie.has(chiave)) serie.set(chiave, { starts: new Map(), transizioni: [], campioni: 0, durataMs: null });
    return serie.get(chiave);
  };

  let prec = new Map(); // chiave → ultimo start visto (cronologico per istante di cattura)
  const ordinate = [...righe].sort((a, b) => new Date(a.ts) - new Date(b.ts));
  for (const o of ordinate) {
    const modelli = o?.payload?.model_remains;
    if (!Array.isArray(modelli)) continue;
    for (const m of modelli) {
      const nome = m?.model_name;
      if (!nome) continue;
      // finestra breve (interval) e settimanale del modello
      const coppie = [
        ["interval", m.start_time, m.end_time],
        ["weekly", m.weekly_start_time, m.weekly_end_time],
      ];
      for (const [win, s, e] of coppie) {
        if (typeof s !== "number" || typeof e !== "number") continue;
        const chiave = `${nome}/${win}`;
        const sDati = tocca(chiave);
        sDati.campioni++;
        sDati.durataMs = e - s; // ultima durata osservata
        const precStart = prec.get(chiave);
        if (precStart !== undefined && precStart !== s) {
          sDati.transizioni.push({ ts: o.ts, da: precStart, a: s });
        }
        prec.set(chiave, s);
        if (!sDati.starts.has(s)) sDati.starts.set(s, { primoTs: o.ts, ultimoTs: o.ts, n: 1 });
        else {
          const st = sDati.starts.get(s);
          st.ultimoTs = o.ts;
          st.n++;
        }
      }
    }
  }
  return serie;
}

function valuta(serie) {
  const righe = [];
  const scoperte = [];
  for (const [chiave, dati] of [...serie.entries()].sort()) {
    const [modello, win] = chiave.split("/");
    const g = grigliaPerDurata(dati.durataMs);
    const starts = [...dati.starts.entries()].map(([ms, info]) => {
      let offsetMs = null, griglia = null, allineato = null;
      if (g) {
        griglia = g.nome;
        offsetMs = offsetDaGriglia(ms, g);
        allineato = offsetMs <= TOLLERANZA_MS;
      }
      return { start: Number(ms), iso: iso(ms), roma: roma(ms), ...info, griglia, offsetMs, allineato };
    });
    for (const t of dati.transizioni) {
      const gg = g ? offsetDaGriglia(t.a, g) : null;
      scoperte.push({ chiave, ts: t.ts, da: iso(t.da), a: iso(t.a), aRoma: roma(t.a), nuovoStartSullaGriglia: gg === 0, usoInclusoNelBlocco: Number(t.ts) > Number(t.a) });
    }
    const tuttiAllineati = starts.every((s) => s.allineato === true);
    righe.push({ chiave, modello, finestra: win, griglia: g?.nome ?? `durata non standard (${dati.durataMs} ms)`, durataMs: dati.durataMs, campioni: dati.campioni, startDistinti: starts.length, tuttiAllineati, starts, transizioni: dati.transizioni.map((t) => ({ ts: t.ts, da: iso(t.da), a: iso(t.a), aRoma: roma(t.a) })) });
  }

  const conGriglia = righe.filter((r) => r.tuttiAllineati === true || r.tuttiAllineati === false);
  const verificabili = conGriglia.filter((r) => r.startDistinti > 0);
  const nonAllineati = verificabili.filter((r) => !r.tuttiAllineati);
  const transizioni = scoperte;
  const transizioniSullaGriglia = transizioni.filter((t) => t.nuovoStartSullaGriglia);

  const esito =
    verificabili.length > 0 && nonAllineati.length === 0 && transizioni.length > 0 && transizioniSullaGriglia.length === transizioni.length
      ? "BLOCCHI FISSI UTC"
      : verificabili.length > 0 && nonAllineati.length === 0 && transizioni.length === 0
        ? "BLOCCHI FISSI UTC (nessuna transizione osservata: solo allineamento)"
        : nonAllineati.length > 0
          ? "ROLLING / NON ALLINEATO"
          : "DATI INSUFFICIENTI";

  return { esito, serie: righe, transizioni, sintesi: { modelliFinestre: righe.length, campioniTotali: righe.reduce((a, r) => a + r.campioni, 0), verificabili: verificabili.length, nonAllineati: nonAllineati.length, transizioni: transizioni.length, transizioniSullaGriglia: transizioniSullaGriglia.length } };
}

function verificaSicurezza(testo) {
  // ADR-13-R2: il file campione NON deve contenere materiale chiave.
  const pattern = [/apikey/i, /authorization/i, /bearer\s+[a-z0-9]/i, /sk-[a-zA-Z0-9]{8,}/];
  const trovati = pattern.filter((p) => p.test(testo)).map((p) => p.source);
  return trovati;
}

function mdRigaStart(s) {
  return `| \`${s.iso}\` | ${s.roma} | ${s.n} | ${s.griglia ?? "—"} | ${s.offsetMs === null ? "—" : s.offsetMs + " ms"} | ${s.allineato ? "sì" : s.allineato === false ? "**NO**" : "n.a."} |`;
}

function reportMd(esito, meta) {
  const L = [];
  L.push(`# V8 — Analisi del fuso di reset delle finestre (campione reale)`);
  L.push("");
  L.push(`- **Input:** \`${meta.input}\` (${meta.campioni} righe JSONL, da \`${meta.primaTs}\` a \`${meta.ultimaTs}\`)`);
  L.push(`- **Generato:** ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })} (Europe/Rome)`);
  L.push(`- **Sicurezza ADR-13-R2:** ${meta.sicurezza.length === 0 ? "nessun materiale chiave nel campione ✓" : "⚠️ pattern sospetti: " + meta.sicurezza.join(", ")}`);
  L.push(`- **Tolleranza richiesta:** ${TOLLERANZA_MS} ms (verdetto storico «offset 0 ms»)`);
  L.push("");
  L.push(`## Verdetto: **${esito.esito}**`);
  L.push("");
  L.push(`Sintesi: ${esito.sintesi.modelliFinestre} serie modello/finestra · ${esito.sintesi.campioniTotali} osservazioni · ${esito.sintesi.transizioni} transizioni osservate (${esito.sintesi.transizioniSullaGriglia} con nuovo start sul confine di griglia) · ${esito.sintesi.nonAllineati} serie non allineate`);
  L.push("");
  for (const s of esito.serie) {
    L.push(`### ${s.chiave} — griglia: ${s.griglia}`);
    L.push("");
    L.push(`Campioni: ${s.campioni} · start distinti: ${s.startDistinti} · tutti allineati: ${s.tuttiAllineati ? "sì" : "no"}`);
    L.push("");
    L.push(`| start (UTC) | start (Roma) | campioni | griglia | offset | allineato |`);
    L.push(`|-------------|--------------|----------|---------|--------|-----------|`);
    for (const st of s.starts) L.push(mdRigaStart(st));
    if (s.transizioni.length) {
      L.push("");
      L.push(`Transizioni:`);
      for (const t of s.transizioni) L.push(`- \`${t.ts}\` → nuovo start \`${t.a}\` (${t.aRoma} Roma)`);
    }
    L.push("");
  }
  if (esito.transizioni.length) {
    L.push(`## Lettura delle transizioni (blocco fisso vs rolling)`);
    L.push("");
    L.push(`| cattura (UTC) | serie | nuovo start | nuovo start (Roma) | sulla griglia | start ≠ istante d'uso |`);
    L.push(`|---------------|-------|-------------|--------------------|---------------|-----------------------|`);
    for (const t of esito.transizioni) {
      L.push(`| \`${t.ts}\` | ${t.chiave} | \`${t.a}\` | ${t.aRoma} | ${t.nuovoStartSullaGriglia ? "sì" : "**no**"} | ${t.usoInclusoNelBlocco ? "sì (start pre-armata)" : "no"} |`);
    }
    L.push("");
    L.push(`Se il nuovo start coincide con il confine di griglia e NON con l'istante della prima richiesta dopo il confine, la finestra è un **blocco fisso pre-armato** (non «rolling» ancorato all'uso): risposta a V2 e V3 (docs/04 §4).`);
  }
  return L.join("\n");
}

/* ------------------------------------------------------------------ */

// Parsing argomenti: un solo argomento posizionale (percorso campione, default file
// reale) + filtri opzionali di era `--da YYYY-MM-DD` / `--a YYYY-MM-DD` (sul ts di
// CATTURA). I filtri permettono un verdetto FORMALe sull'era fresca della campagna,
// con le ere precedenti (es. il 09/10 recuperato) analizzabili a parte come riscontro.
let INPUT = DEFAULT_INPUT, daTs = null, aTs = null;
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--da") { daTs = Date.parse(`${process.argv[++i]}T00:00:00Z`); continue; }
  if (a === "--a") { aTs = Date.parse(`${process.argv[++i]}T23:59:59.999Z`); continue; }
  if (!a.startsWith("--")) INPUT = resolve(a);
}

if (!existsSync(INPUT)) {
  console.error(`File campione non trovato: ${INPUT}`);
  process.exit(1);
}

const testo = readFileSync(INPUT, "utf8");
const tutte = testo.trim().split("\n").filter(Boolean).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
const righe = tutte.filter((o) => {
  const t = Date.parse(o.ts);
  if (Number.isNaN(t)) return false;
  if (daTs !== null && !Number.isNaN(daTs) && t < daTs) return false;
  if (aTs !== null && !Number.isNaN(aTs) && t > aTs) return false;
  return true;
});
if (righe.length === 0) {
  console.error("Nessun campione leggibile.");
  process.exit(1);
}

const sicurezza = verificaSicurezza(testo);
const ordinate = [...righe].sort((a, b) => new Date(a.ts) - new Date(b.ts));
const esito = valuta(analizza(ordinate));
const meta = {
  input: INPUT,
  campioni: righe.length,
  primaTs: ordinate[0].ts,
  ultimaTs: ordinate[ordinate.length - 1].ts,
  sicurezza,
};

mkdirSync(ESITI_DIR, { recursive: true });
const tsRun = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const jsonEsito = { verifica: "V8", titolo: "Analisi del fuso di reset delle finestre (campionatore passivo I49)", ...meta, ...esito, tolleranzaMs: TOLLERANZA_MS, griglie: GRIGLIE, metodo: "start distinti per modello/finestra dai payload reali; offset dalla griglia UTC teorica (5h / 24h / lunedì 00:00 UTC); transizioni con confronto nuovo-start vs confine vs istante d'uso" };
const md = reportMd(esito, meta);

const pJson = join(ESITI_DIR, `v8-analisi-reset-${tsRun}.json`);
const pMd = join(ESITI_DIR, `v8-analisi-reset-${tsRun}.md`);
const pLatest = join(ESITI_DIR, `v8-fuso-reset-latest.md`);
writeFileSync(pJson, JSON.stringify(jsonEsito, null, 2), "utf8");
writeFileSync(pMd, md, "utf8");
writeFileSync(pLatest, md, "utf8");

console.log(`V8 — analisi fuso reset su ${righe.length} campioni (${meta.primaTs} → ${meta.ultimaTs})`);
console.log(`VERDETTO: ${esito.esito}`);
console.log(`Sintesi: ${JSON.stringify(esito.sintesi)}`);
for (const t of esito.transizioni) console.log(`  transizione ${t.chiave} @${t.ts}: nuovo start ${t.a} (${t.aRoma} Roma) — sulla griglia: ${t.nuovoStartSullaGriglia ? "sì" : "NO"}`);
console.log(`Sicurezza ADR-13-R2: ${sicurezza.length === 0 ? "nessun materiale chiave nel campione ✓" : "⚠️ " + sicurezza.join(", ")}`);
console.log(`Esiti: ${pJson} (+ .md, copia stabile ${pLatest})`);
