#!/usr/bin/env node
/**
 * verifica.mjs — Toolkit verifiche empiriche V1–V6 sul piano MiniMax (Token/M Plan)
 *
 * Zero dipendenze, Node ≥ 18 (fetch globale). Riferimenti: docs/01 §3/§4/§8, docs/02, docs/04 §4.
 *
 * Uso:
 *   node scripts/verifiche/verifica.mjs <comando> [opzioni]
 *
 * Comandi:
 *   v1            Stati di finestra durante il consumo (stato 2 = esaurita?)
 *   v2            Rolling dal primo utilizzo (start_time vs primo uso dopo reset)
 *   v3            start_time dopo un reset SENZA nuovo utilizzo
 *   v4            Diff token_plan/remains vs coding_plan/remains (stessa chiave)
 *   v5            Confronto conteggi (*_usage_count / *_total_count) vs percentuali
 *   v6            Rate limit sul polling della quota (10s × 10 min)
 *   prova-parser  Autotest del normalizzatore su un campione sintetico (offline)
 *   aiuto         Questo aiuto
 *
 * Opzioni comuni:
 *   --chiave KEY        Subscription Key (in alternativa: env MM_SUBSCRIPTION_KEY)
 *   --regione eu|cn     Regione (default: eu)
 *   --intervallo SEC    Intervallo di polling in secondi (default per comando)
 *   --durata MIN        Durata massima della verifica in minuti (default per comando)
 *   --modello NOME      Limita l'analisi a un modello (es. general, video)
 *   --once              Un solo campione (solo v1)
 *
 * Sicurezza: la chiave NON viene mai scritta nei log (solo mascherata) né stampata.
 * Gli esiti finiscono in scripts/verifiche/esiti/<id>-<istante>.json (+ .md leggibile).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Gli esiti vengono scritti nella sottocartella `esiti/` ACCANTO allo script:
// così il toolkit funziona sia nel repo sia come copia autonoma.
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "esiti");

const ENDPOINTS = {
  eu: {
    token_plan: "https://www.minimax.io/v1/token_plan/remains",
    coding_plan: "https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
  },
  cn: {
    token_plan: "https://www.minimaxi.com/v1/token_plan/remains",
    coding_plan: "https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains",
  },
};

const UA = "MiniMax-Usage-Dashboard/1.0 (verifiche V1-V6)";
const TIMEOUT_MS = 12_000;

const ETICHETTE_STATO = { "1": "attiva/in uso", "2": "esaurita? (ipotesi V1)", "3": "inattiva/mai usata" };

// ---------------------------------------------------------------- utilità

const fmtData = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "medium" });
const fmtOra = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const tRoma = (ms) => fmtData.format(new Date(ms));
const oraRoma = (ms) => fmtOra.format(new Date(ms));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizzaEpoch(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n < 1e11 ? n * 1000 : n; // secondi → millisecondi
}

function fmtDurata(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function maska(k) {
  if (!k) return "—";
  return k.length > 12 ? `${k.slice(0, 4)}…${k.slice(-4)} (${k.length} caratteri)` : "•••";
}

function parseArgv(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const nome = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) out[nome] = true;
      else { out[nome] = val; i++; }
    } else out._.push(a);
  }
  return out;
}

function num(v, def) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}

// ---------------------------------------------------------------- chiamate API

async function chiama(url, chiave) {
  const inizio = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${chiave}`, Accept: "application/json", "User-Agent": UA },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const testo = await res.text();
    let json = null, jsonErr = null;
    try { json = JSON.parse(testo); } catch { jsonErr = "risposta non JSON"; }
    return { http: res.status, ok: res.ok, json, jsonErr, testo: jsonErr ? testo.slice(0, 2000) : undefined, ms: Date.now() - inizio };
  } catch (e) {
    const abort = e?.name === "AbortError" || String(e?.message ?? "").includes("abort");
    return { http: 0, ok: false, errore: abort ? "timeout" : e?.message ?? "errore di rete", ms: Date.now() - inizio };
  } finally {
    clearTimeout(timer);
  }
}

function estraiFinestra(v, tipo) {
  const k = tipo === "interval"
    ? { pct: "current_interval_remaining_percent", status: "current_interval_status", start: "start_time", end: "end_time", remains: "remains_time", usage: "current_interval_usage_count", total: "current_interval_total_count" }
    : { pct: "current_weekly_remaining_percent", status: "current_weekly_status", start: "weekly_start_time", end: "weekly_end_time", remains: "weekly_remains_time", usage: "current_weekly_usage_count", total: "current_weekly_total_count" };
  const presente = k.pct in v || k.status in v;
  return {
    presente,
    pct: v[k.pct] == null ? null : Number(v[k.pct]),
    status: v[k.status] == null ? null : String(v[k.status]),
    start: normalizzaEpoch(v[k.start]),
    end: normalizzaEpoch(v[k.end]),
    remainsMs: v[k.remains] == null ? null : Number(v[k.remains]),
    usageCount: v[k.usage] == null ? null : Number(v[k.usage]),
    totalCount: v[k.total] == null ? null : Number(v[k.total]),
  };
}

/** Normalizza la risposta (piatta o sotto `data`) in { statusCode, statusMsg, piano, finestre } */
function normalizzaRisposta(json) {
  const root =
    json && typeof json === "object" && json.data && typeof json.data === "object" && Array.isArray(json.data.model_remains)
      ? json.data
      : json;
  const base = root && typeof root === "object" ? root.base_resp ?? null : null;
  const voci = root && Array.isArray(root.model_remains) ? root.model_remains : [];
  const finestre = {};
  for (const v of voci) {
    if (!v || typeof v !== "object") continue;
    finestre[String(v.model_name ?? "?")] = {
      interval: estraiFinestra(v, "interval"),
      weekly: estraiFinestra(v, "weekly"),
    };
  }
  return {
    statusCode: base ? Number(base.status_code) : null,
    statusMsg: base?.status_msg ?? null,
    piano: root?.current_subscribe_title ?? root?.plan_name ?? root?.combo_title ?? null,
    finestre,
  };
}

function comprimiFinestre(finestre) {
  const o = {};
  for (const [m, f] of Object.entries(finestre)) {
    o[m] = {};
    for (const [w, d] of Object.entries(f)) {
      if (d.presente) o[m][w] = { pct: d.pct, status: d.status, start: d.start, end: d.end, remainsMs: d.remainsMs, usage: d.usageCount, total: d.totalCount };
    }
  }
  return o;
}

/** Un campione = una chiamata + normalizzazione */
async function campiona(chiave, url) {
  const t = Date.now();
  const r = await chiama(url, chiave);
  const n = r.json ? normalizzaRisposta(r.json) : null;
  return {
    t,
    tRoma: tRoma(t),
    http: r.http,
    ok: r.ok,
    ms: r.ms,
    errore: r.errore ?? r.jsonErr ?? null,
    statusCode: n?.statusCode ?? null,
    statusMsg: n?.statusMsg ?? null,
    piano: n?.piano ?? null,
    finestre: n ? comprimiFinestre(n.finestre) : null,
  };
}

function rigaStato(s) {
  if (!s.finestre || Object.keys(s.finestre).length === 0) return `[${s.tRoma}] HTTP ${s.http || "—"} ${s.errore ?? ""} (statusCode ${s.statusCode ?? "—"})`;
  const parti = Object.entries(s.finestre).map(([m, f]) => {
    const i = f.interval, w = f.weekly;
    const pI = i ? `${i.pct ?? "—"}% (s${i.status ?? "—"})` : "assente";
    const pW = w ? `${w.pct ?? "—"}% (s${w.status ?? "—"})` : "assente";
    return `${m} i=${pI} w=${pW}`;
  });
  return `[${s.tRoma}] ${parti.join(" | ")}`;
}

// ---------------------------------------------------------------- loop di polling

/**
 * Esegue un ciclo di polling start-to-start. Per ogni campione chiama `perSample`.
 * Ritorna { campioni, interrotto }. Gestisce SIGINT in modo grazioso.
 */
async function cicloPolling({ chiave, url, intervalloS, durataMin, stampa = true }) {
  const intervalloMs = intervalloS * 1000;
  const durataMs = durataMin * 60_000;
  const campioni = [];
  const inizio = Date.now();
  let interrotto = false;
  const onSig = () => { interrotto = true; console.log("\n… SIGINT: chiusura graziosa dopo il campione in corso …"); };
  process.on("SIGINT", onSig);
  try {
    while (!interrotto && Date.now() - inizio < durataMs && campioni.length < 5000) {
      const tPartenza = Date.now();
      const s = await campiona(chiave, url);
      campioni.push(s);
      if (stampa) console.log(rigaStato(s));
      // attesa start-to-start esatta: dorme a scatti finché non è ora del prossimo campione
      let attesa = tPartenza + intervalloMs - Date.now();
      while (attesa > 0 && !interrotto) {
        await sleep(Math.min(attesa, 1000));
        attesa = tPartenza + intervalloMs - Date.now();
      }
    }
  } finally {
    process.removeListener("SIGINT", onSig);
  }
  return { campioni, interrotto };
}

/** Rileva transizioni (reset finestra, calo %, cambio stato) tra campioni consecutivi */
function rilevaTransizioni(campioni, filtroModello) {
  const transizioni = [];
  let prec = null; // chiave `${modello}/${finestra}` → dati
  for (const s of campioni) {
    if (!s.finestre) continue;
    const correnti = {};
    for (const [m, f] of Object.entries(s.finestre)) {
      if (filtroModello && m !== filtroModello) continue;
      for (const [w, d] of Object.entries(f)) correnti[`${m}/${w}`] = d;
    }
    if (prec) {
      for (const [k, d] of Object.entries(correnti)) {
        const p = prec[k];
        if (!p) continue;
        if (p.end != null && d.end != null && d.end !== p.end) {
          const startStato = d.start !== p.start ? (d.start === p.end ? "start = vecchio end" : `start ${p.start == null ? "—" : oraRoma(p.start)} → ${oraRoma(d.start)}`) : "start INVARIATO";
          transizioni.push({ t: s.t, tRoma: s.tRoma, chiave: k, tipo: "reset-finestra", dettaglio: `end ${oraRoma(p.end)} → ${oraRoma(d.end)}; ${startStato}`, pctPrima: p.pct, pctDopo: d.pct, statusPrima: p.status, statusDopo: d.status });
        } else if (p.pct != null && d.pct != null && d.pct < p.pct - 0.01) {
          transizioni.push({ t: s.t, tRoma: s.tRoma, chiave: k, tipo: "calo", dettaglio: `${p.pct}% → ${d.pct}%`, statusDopo: d.status });
        } else if (p.status != null && d.status != null && d.status !== p.status) {
          transizioni.push({ t: s.t, tRoma: s.tRoma, chiave: k, tipo: "stato", dettaglio: `stato ${p.status} → ${d.status}`, pctDopo: d.pct });
        }
      }
    }
    prec = correnti;
  }
  return transizioni;
}

// ---------------------------------------------------------------- esiti su disco

function scriviLog(id, dati) {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = join(OUT_DIR, `${id}-${stamp}`);
  writeFileSync(`${base}.json`, JSON.stringify(dati, null, 2));
  writeFileSync(`${base}.md`, mdDi(dati));
  return base;
}

function mdDi(dati) {
  const L = [];
  L.push(`# Verifica ${dati.id} — ${dati.domanda}`);
  L.push("");
  L.push(`- **Avvio:** ${dati.avvio} · **Fine:** ${dati.fine}`);
  L.push(`- **Config:** regione ${dati.config.regione} · chiave \`${dati.config.chiave}\` · intervallo ${dati.config.intervalloS ?? "—"}s · durata ${dati.config.durataMin ?? "—"} min`);
  L.push(`- **Endpoint:** ${dati.config.endpoint ?? "—"}`);
  L.push(`- **Verdetto:** ${dati.esito?.verdetto ?? "—"}`);
  if (dati.esito?.note?.length) { L.push(""); for (const n of dati.esito.note) L.push(`- ${n}`); }
  if (dati.transizioni?.length) {
    L.push(""); L.push("## Transizioni osservate"); L.push(""); L.push("| Istante (Roma) | Chiave | Tipo | Dettaglio |"); L.push("|---|---|---|---|");
    for (const tr of dati.transizioni.slice(0, 100)) L.push(`| ${tr.tRoma} | ${tr.chiave} | ${tr.tipo} | ${tr.dettaglio} |`);
  }
  if (dati.campioni?.length) {
    L.push(""); L.push(`## Campioni (${dati.campioni.length}, ultimi 50)`); L.push(""); L.push("```");
    for (const s of dati.campioni.slice(-50)) L.push(rigaStato(s));
    L.push("```");
  }
  return L.join("\n") + "\n";
}

function configBase(opts, comando, extra = {}) {
  return {
    comando,
    regione: opts.regione === "cn" ? "cn" : "eu",
    chiave: maska(opts.chiave),
    intervalloS: extra.intervalloS ?? null,
    durataMin: extra.durataMin ?? null,
    endpoint: extra.endpoint ?? null,
    modello: opts.modello ?? null,
  };
}

function richiediChiave(opts) {
  const chiave = (opts.chiave ?? process.env.MM_SUBSCRIPTION_KEY ?? process.env.MINIMAX_SUBSCRIPTION_KEY ?? "").trim();
  if (!chiave) {
    console.error("Chiave mancante. Usa --chiave KEY oppure la variabile d'ambiente MM_SUBSCRIPTION_KEY.");
    console.error("Suggerimento: export MM_SUBSCRIPTION_KEY=\"...\" && node scripts/verifiche/verifica.mjs v4");
    process.exit(1);
  }
  return chiave;
}

// ---------------------------------------------------------------- comandi V1–V6

async function cmdV1(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const url = ENDPOINTS[regione].token_plan;
  const once = Boolean(opts.once);
  const intervalloS = num(opts.intervallo, 30);
  const durataMin = once ? 0.02 : num(opts.durata, 180);

  console.log(`V1 — stati di finestra durante il consumo (${once ? "snapshot singolo" : `polling ogni ${intervalloS}s per ${durataMin} min`})`);
  console.log(`Endpoint: ${url}`);
  console.log("Ipotesi da confermare: stato 2 = finestra esaurita (docs/01 §8.2). Consuma quota nel frattempo con uso normale.\n");

  const { campioni } = await cicloPolling({ chiave, url, intervalloS, durataMin });

  const transizioni = rilevaTransizioni(campioni, opts.modello);
  const note = [];
  const conStato2 = [];
  for (const s of campioni) {
    for (const [m, f] of Object.entries(s.finestre ?? {})) {
      for (const [w, d] of Object.entries(f)) {
        if (d.status === "2") conStato2.push({ tRoma: s.tRoma, chiave: `${m}/${w}`, pct: d.pct });
      }
    }
  }
  let verdetto;
  if (conStato2.length === 0) {
    verdetto = "NON CONCLUSIVA — stato 2 mai osservato: serve consumare la finestra fino a esaurimento durante la verifica.";
  } else {
    const tuttiZero = conStato2.every((x) => x.pct === 0);
    verdetto = tuttiZero
      ? "COERENTE — stato 2 sempre osservato con residuo 0%: ipotesi «2 = esaurita» rafforzata."
      : "CONTRADDETTA — stato 2 osservato anche con residuo > 0%: rivedere l'interpretazione (docs/01 §8.2).";
    for (const x of conStato2.slice(0, 20)) note.push(`stato 2 su ${x.chiave} alle ${x.tRoma} con residuo ${x.pct}%`);
  }
  if (campioni.length && campioni[0].statusCode !== 0) note.push(`base_resp.status_code = ${campioni[0].statusCode} (${campioni[0].statusMsg ?? "?"}): chiave non valida o endpoint in errore — verifica ripetibile solo con chiave reale.`);

  const base = scriviLog("v1", {
    id: "V1", domanda: "Il codice di stato 2 significa «esaurita»?",
    avvio: tRoma(campioni[0]?.t ?? Date.now()), fine: tRoma(Date.now()),
    config: configBase(opts, "v1", { intervalloS, durataMin, endpoint: url }),
    campioni, transizioni, esito: { verdetto, note },
  });
  console.log(`\nVERDETTO V1: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  return 0;
}

async function cmdV2(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const url = ENDPOINTS[regione].token_plan;
  const intervalloS = num(opts.intervallo, 20);
  const durataMin = num(opts.durata, 360);

  console.log(`V2 — rolling dal primo utilizzo (polling ogni ${intervalloS}s per max ${durataMin} min)`);
  console.log("Procedura: lavora normalmente con l'API; la verifica individua il reset della finestra e il primo calo di % successivo,");
  console.log("poi confronta il nuovo start_time con il primo utilizzo osservato (docs/01 §7: start = primo utilizzo).\n");

  const { campioni } = await cicloPolling({ chiave, url, intervalloS, durataMin });
  const transizioni = rilevaTransizioni(campioni, opts.modello);
  const note = [];
  let verdetto = "NON CONCLUSIVA — nessun reset di finestra osservato nel periodo (allunga --durata fino a coprire lo scadere).";

  const reset = transizioni.find((t) => t.tipo === "reset-finestra" && t.chiave.endsWith("/interval"));
  if (reset) {
    const [modello] = reset.chiave.split("/");
    const dopoReset = campioni.filter((s) => s.t >= reset.t);
    const primaDopo = dopoReset.find((s) => s.finestre?.[modello]?.interval && s.finestre[modello].interval.pct != null && s.finestre[modello].interval.pct < 99.99);
    if (!primaDopo) {
      verdetto = "PARZIALE — reset osservato ma nessun utilizzo successivo: comportamento identico a V3 (rilancia usando l'API dopo il reset).";
    } else {
      const nuovoStart = primaDopo.finestre[modello].interval.start;
      const deltaMs = primaDopo.t - nuovoStart;
      const tolleranzaMs = intervalloS * 1000 + 120_000;
      if (nuovoStart == null) {
        verdetto = "NON CONCLUSIVA — nuovo start_time assente dopo il reset.";
      } else if (deltaMs >= 0 && deltaMs <= tolleranzaMs) {
        verdetto = `COERENTE — nuovo start_time (${tRoma(nuovoStart)}) coincide entro ${Math.round(deltaMs / 1000)}s col primo calo osservato (${primaDopo.tRoma}): rolling dal primo utilizzo confermato.`;
      } else {
        verdetto = `DA APPROFONDIRE — start_time (${tRoma(nuovoStart)}) ${deltaMs >= 0 ? "anticipa" : "segue"} il primo calo osservato (${primaDopo.tRoma}) di ${fmtDurata(Math.abs(deltaMs))}: o l'uso è avvenuto tra due campioni, oppure start ≠ primo utilizzo.`;
      }
      note.push(`reset su ${reset.chiave} alle ${reset.tRoma}: ${reset.dettaglio}`);
      note.push(`primo calo dopo reset: ${primaDopo.tRoma} (${primaDopo.finestre[modello].interval.pct}%)`);
    }
  } else {
    note.push("transizioni osservate: " + (transizioni.length ? transizioni.map((t) => `${t.chiave}:${t.tipo}`).join(", ") : "nessuna"));
  }
  if (campioni.length && campioni[0].statusCode !== 0) note.push(`base_resp.status_code = ${campioni[0].statusCode}: serve chiave reale per osservare i reset.`);

  const base = scriviLog("v2", {
    id: "V2", domanda: "La finestra 5h è rolling dal primo utilizzo anche nel nostro piano?",
    avvio: tRoma(campioni[0]?.t ?? Date.now()), fine: tRoma(Date.now()),
    config: configBase(opts, "v2", { intervalloS, durataMin, endpoint: url }),
    campioni, transizioni, esito: { verdetto, note },
  });
  console.log(`\nVERDETTO V2: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  return 0;
}

async function cmdV3(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const url = ENDPOINTS[regione].token_plan;
  const intervalloS = num(opts.intervallo, 60);
  const durataMin = num(opts.durata, 360);

  console.log(`V3 — start_time dopo reset SENZA utilizzo (polling ogni ${intervalloS}s per max ${durataMin} min)`);
  console.log("IMPORTANTE: non usare l'API MiniMax durante la verifica (nessun modello invocato); il dashboard può restare aperto in sola lettura.\n");

  const { campioni } = await cicloPolling({ chiave, url, intervalloS, durataMin });
  const transizioni = rilevaTransizioni(campioni, opts.modello);
  const note = [];
  let verdetto = "NON CONCLUSIVA — nessun reset osservato nel periodo: allunga --durata fino a coprire lo scadere della finestra (end_time).";

  const reset = transizioni.find((t) => t.tipo === "reset-finestra" && t.chiave.endsWith("/interval"));
  if (reset) {
    const usoDopo = transizioni.find((t) => t.tipo === "calo" && t.chiave === reset.chiave && t.t > reset.t);
    if (usoDopo) note.push(`ATTENZIONE: calo di % su ${reset.chiave} alle ${usoDopo.tRoma}: la finestra è stata usata durante la verifica, rilanciala senza utilizzo.`);
    if (reset.dettaglio.includes("start = vecchio end")) {
      verdetto = "RISPOSTA B — start_time diventa il vecchio end_time (finestra «pre-armata» al reset, senza aspettare il primo utilizzo).";
    } else if (reset.dettaglio.includes("start INVARIATO")) {
      verdetto = "RISPOSTA A — start_time resta il vecchio finché non si usa la finestra (coerente col rolling dal primo utilizzo dei docs).";
    } else {
      verdetto = `COMPORTAMENTO INATTESO — ${reset.dettaglio} (confronta con docs/01 §7 e apri question su GitHub se riproducibile).`;
    }
    note.push(`reset su ${reset.chiave} alle ${reset.tRoma}: pct ${reset.pctPrima}% → ${reset.pctDopo}%, stato ${reset.statusPrima} → ${reset.statusDopo}`);
    note.push(reset.dettaglio);
  }
  if (campioni.length && campioni[0].statusCode !== 0) note.push(`base_resp.status_code = ${campioni[0].statusCode}: serve chiave reale per osservare i reset.`);

  const base = scriviLog("v3", {
    id: "V3", domanda: "Dopo il reset senza nuovo utilizzo, start_time resta il vecchio o diventa end_time?",
    avvio: tRoma(campioni[0]?.t ?? Date.now()), fine: tRoma(Date.now()),
    config: configBase(opts, "v3", { intervalloS, durataMin, endpoint: url }),
    campioni, transizioni, esito: { verdetto, note },
  });
  console.log(`\nVERDETTO V3: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  return 0;
}

function diffStrutturale(a, b) {
  const note = [];
  const modA = Object.keys(a.finestre).sort(), modB = Object.keys(b.finestre).sort();
  if (JSON.stringify(modA) !== JSON.stringify(modB)) note.push(`modelli diversi: token_plan=[${modA}] coding_plan=[${modB}]`);
  for (const m of modA.filter((x) => modB.includes(x))) {
    for (const w of ["interval", "weekly"]) {
      const da = a.finestre[m][w], db = b.finestre[m][w];
      if (!da?.presente || !db?.presente) { note.push(`${m}/${w}: presente solo in ${!da?.presente ? "token_plan" : "coding_plan"}`); continue; }
      const campi = ["pct", "status", "start", "end", "usage", "total"];
      for (const c of campi) {
        if (String(da[c]) !== String(db[c])) note.push(`${m}/${w}.${c}: ${da[c]} (token_plan) ≠ ${db[c]} (coding_plan)`);
      }
    }
  }
  return note;
}

async function cmdV4(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const urlT = ENDPOINTS[regione].token_plan, urlC = ENDPOINTS[regione].coding_plan;

  console.log("V4 — confronto token_plan/remains vs coding_plan/remains (stessa chiave, chiamate sequenziali)");
  console.log(`  token_plan : ${urlT}`);
  console.log(`  coding_plan: ${urlC}\n`);

  const rT = await chiama(urlT, chiave);
  console.log(`token_plan : HTTP ${rT.http} in ${rT.ms}ms ${rT.errore ?? ""}`);
  const rC = await chiama(urlC, chiave);
  console.log(`coding_plan: HTTP ${rC.http} in ${rC.ms}ms ${rC.errore ?? ""}`);

  const nT = rT.json ? normalizzaRisposta(rT.json) : null;
  const nC = rC.json ? normalizzaRisposta(rC.json) : null;
  const note = [];
  let verdetto;

  if (!nT || !nC) {
    verdetto = "NON VERIFICABILE — almeno una risposta non è JSON: " + [!nT ? `token_plan ${rT.errore ?? rT.jsonErr ?? `HTTP ${rT.http}`}` : null, !nC ? `coding_plan ${rC.errore ?? rC.jsonErr ?? `HTTP ${rC.http}`}` : null].filter(Boolean).join(" · ");
  } else {
    if (nT.statusCode !== 0) note.push(`token_plan: status_code ${nT.statusCode} (${nT.statusMsg ?? "?"})`);
    if (nC.statusCode !== 0) note.push(`coding_plan: status_code ${nC.statusCode} (${nC.statusMsg ?? "?"})`);
    const diff = diffStrutturale(nT, nC);
    note.push(...diff);
    if (nT.statusCode === 0 && nC.statusCode === 0 && diff.length === 0) {
      verdetto = "IDENTICI — stessa struttura e stessi valori su entrambi gli endpoint: il fallback (I18) è fattibile in modo trasparente.";
    } else if (nT.statusCode === 0 && nC.statusCode === 0) {
      verdetto = `EQUIVALENTI CON DIFFERENZE — entrambi rispondono OK ma ${diff.length} campo/i differisce: valuta se le differenze sono solo temporali (consumo tra le due chiamate) o strutturali.`;
    } else if (nT.statusCode !== 0 && nC.statusCode !== 0) {
      verdetto = "NON VERIFICABILE CON QUESTA CHIAVE — entrambi gli endpoint rifiutano l'autenticazione (vedi note): rilancia con la Subscription Key reale.";
    } else {
      verdetto = `ASIMMETRICI — token_plan ${nT.statusCode === 0 ? "OK" : `errore ${nT.statusCode}`}, coding_plan ${nC.statusCode === 0 ? "OK" : `errore ${nC.statusCode}`}: la chiave è accettata da un solo endpoint.`;
    }
  }

  const base = scriviLog("v4", {
    id: "V4", domanda: "coding_plan/remains risponde con la stessa struttura e gli stessi dati di token_plan/remains?",
    avvio: tRoma(Date.now()), fine: tRoma(Date.now()),
    config: configBase(opts, "v4", { endpoint: `${urlT} vs ${urlC}` }),
    risposte: {
      token_plan: { http: rT.http, ms: rT.ms, json: rT.json, testo: rT.testo ?? null },
      coding_plan: { http: rC.http, ms: rC.ms, json: rC.json, testo: rC.testo ?? null },
    },
    esito: { verdetto, note },
  });
  console.log(`\nVERDETTO V4: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  console.log("Nota: l'esito di V4 decide l'implementazione di I18 (fallback automatico, docs/03 §11 punto 2).");
  return 0;
}

async function cmdV5(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const url = ENDPOINTS[regione].token_plan;

  console.log(`V5 — conteggi vs percentuali (${url})`);
  console.log("Ipotesi (issue #99): quando popolati, *_usage_count è il RESIDUO (docs/02 §3).\n");

  const s = await campiona(chiave, url);
  const note = [];
  let verdetto;

  if (!s.finestre || s.statusCode !== 0) {
    verdetto = `NON VERIFICABILE — base_resp.status_code ${s.statusCode} (${s.statusMsg ?? s.errore ?? "?"}): serve una chiave valida (per il test pieno anche una chiave di piano legacy a conteggi).`;
  } else {
    const righe = [];
    for (const [m, f] of Object.entries(s.finestre)) {
      for (const [w, d] of Object.entries(f)) {
        if (!d.presente) continue;
        righe.push({ chiave: `${m}/${w}`, pct: d.pct, usage: d.usage, total: d.total });
      }
    }
    const conConteggi = righe.filter((r) => r.total != null && r.total > 0 && r.usage != null);
    if (conConteggi.length === 0) {
      verdetto = "NON APPLICABILE A QUESTA CHIAVE — conteggi tutti a 0/assenti (piano non «legacy a conteggi»): le percentuali restano la metrica primaria (ADR-1).";
      for (const r of righe) note.push(`${r.chiave}: pct=${r.pct}% usage=${r.usage} total=${r.total}`);
    } else {
      const esiti = [];
      for (const r of conConteggi) {
        const ratio = (r.usage / r.total) * 100;
        if (Math.abs(ratio - r.pct) <= 1) esiti.push(`${r.chiave}: usage/total=${ratio.toFixed(2)}% ≈ pct ${r.pct}% → usage_count = RESIDUO (coerente #99)`);
        else if (Math.abs(100 - ratio - r.pct) <= 1) esiti.push(`${r.chiave}: 100−usage/total=${(100 - ratio).toFixed(2)}% ≈ pct ${r.pct}% → usage_count = CONSUMO (contraddice #99)`);
        else esiti.push(`${r.chiave}: usage/total=${ratio.toFixed(2)}% vs pct ${r.pct}% → semantica non chiara`);
      }
      verdetto = "CONFRONTO ESEGUITO — vedi note: se almeno una riga indica RESIDUO, la semantica #99 è confermata su questo piano.";
      note.push(...esiti);
    }
  }

  const base = scriviLog("v5", {
    id: "V5", domanda: "I conteggi si popolano su alcuni piani (legacy a conteggi) e che semantica hanno?",
    avvio: tRoma(s.t), fine: tRoma(Date.now()),
    config: configBase(opts, "v5", { endpoint: url }),
    campioni: [s], esito: { verdetto, note },
  });
  console.log(rigaStato(s));
  console.log(`\nVERDETTO V5: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  return 0;
}

async function cmdV6(opts) {
  const chiave = richiediChiave(opts);
  const regione = opts.regione === "cn" ? "cn" : "eu";
  const url = ENDPOINTS[regione].token_plan;
  const intervalloS = num(opts.intervallo, 10);
  const durataMin = num(opts.durata, 10);

  console.log(`V6 — rate limit sul polling (ogni ${intervalloS}s per ${durataMin} min, chiamate dirette alla quota API)`);
  console.log(`Endpoint: ${url}\n`);

  const { campioni, interrotto } = await cicloPolling({ chiave, url, intervalloS, durataMin });

  const httpHist = {}, scHist = {}, errori = {};
  const lat = [];
  for (const s of campioni) {
    if (s.http) lat.push(s.ms);
    const hk = `HTTP ${s.http || "rete"}`;
    httpHist[hk] = (httpHist[hk] ?? 0) + 1;
    const sk = s.statusCode == null ? (s.errore ?? "n/d") : String(s.statusCode);
    scHist[sk] = (scHist[sk] ?? 0) + 1;
    if (s.errore) errori[s.errore] = (errori[s.errore] ?? 0) + 1;
  }
  lat.sort((a, b) => a - b);
  const p = (q) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : null);
  const media = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : null;

  const n429 = httpHist["HTTP 429"] ?? 0;
  const sc1004 = scHist["1004"] ?? 0;
  let verdetto;
  if (n429 > 0) {
    verdetto = `RATE LIMIT HTTP RILEVATO — ${n429} risposte 429 su ${campioni.length} richieste: introduci backoff nel polling.`;
  } else if (campioni.length && campioni[0].statusCode === 0 && sc1004 > 0) {
    verdetto = `SOSPETTO THROTTLE APPLICATO — richieste iniziali OK poi ${sc1004} × 1004: sotto polling aggressivo MiniMax può degradare a 1004; aumenta l'intervallo.`;
  } else if (campioni.length && campioni[0].statusCode === 0) {
    verdetto = `NESSUN RATE LIMIT OSSERVATO — ${campioni.length} richieste a ${intervalloS}s tutte OK (latenza media ${media}ms).`;
  } else if (campioni.length) {
    verdetto = `EVIDENZA PARZIALE (chiave non valida) — ${campioni.length} richieste tutte rifiutate (${Object.entries(scHist).map(([k, v]) => `${k}×${v}`).join(", ")}), nessun 429: ma il rate limit con chiave valida può comportarsi diversamente; ripeti con la chiave reale.`;
  } else {
    verdetto = "NESSUN CAMPIONE RACCOLTO.";
  }
  const note = [
    `distribuzione HTTP: ${Object.entries(httpHist).map(([k, v]) => `${k}×${v}`).join(", ")}`,
    `distribuzione status_code: ${Object.entries(scHist).map(([k, v]) => `${k}×${v}`).join(", ")}`,
    `latenza ms min/med/p95/max: ${lat[0] ?? "—"}/${media ?? "—"}/${p(0.95) ?? "—"}/${lat[lat.length - 1] ?? "—"}`,
    interrotto ? "verifica interrotta dall'utente (SIGINT)" : `completata: ${durataMin} min × ${intervalloS}s`,
  ];
  if (Object.keys(errori).length) note.push(`errori di trasporto: ${Object.entries(errori).map(([k, v]) => `${k}×${v}`).join(", ")}`);

  const base = scriviLog("v6", {
    id: "V6", domanda: "C'è rate limit sul polling della quota?",
    avvio: tRoma(campioni[0]?.t ?? Date.now()), fine: tRoma(Date.now()),
    config: configBase(opts, "v6", { intervalloS, durataMin, endpoint: url }),
    campioni, esito: { verdetto, note },
  });
  console.log(`\nVERDETTO V6: ${verdetto}`);
  for (const n of note) console.log(`  · ${n}`);
  console.log(`\nEsito salvato: ${base}.json (+ .md)`);
  return 0;
}

// ---------------------------------------------------------------- autotest offline

// Timestamps coerenti col JSON reale del 02/10/2026 (docs/02 §4): end − remains coincide
// su tutte le finestre → ora server 11:17:59 UTC = 13:17:59 CEST.
const CAMPIONE_SINTETICO = {
  base_resp: { status_code: 0, status_msg: "success" },
  current_subscribe_title: "M Plan — esempio sintetico (prova-parser)",
  model_remains: [
    { model_name: "general", current_interval_remaining_percent: 33.97, current_interval_total_count: 0, current_interval_usage_count: 0, current_interval_status: 1, start_time: 1790935200000, end_time: 1790953200000, remains_time: 13321000, current_weekly_remaining_percent: 64.21, current_weekly_total_count: 0, current_weekly_usage_count: 0, current_weekly_status: 1, weekly_start_time: 1790553600000, weekly_end_time: 1791158400000, weekly_remains_time: 218521000 },
    { model_name: "video", current_interval_remaining_percent: 100, current_interval_total_count: 0, current_interval_usage_count: 0, current_interval_status: 3, start_time: 1790899200000, end_time: 1790985600000, remains_time: 45721000, current_weekly_remaining_percent: 77.5, current_weekly_total_count: 0, current_weekly_usage_count: 0, current_weekly_status: 1, weekly_start_time: 1790553600000, weekly_end_time: 1791158400000, weekly_remains_time: 218521000 },
  ],
};

function cmdProvaParser() {
  console.log("prova-parser — normalizzazione di un campione sintetico (offline, nessuna rete)\n");
  const n = normalizzaRisposta(CAMPIONE_SINTETICO);
  const s = {
    t: Date.now(), tRoma: tRoma(Date.now()), http: 200, ok: true, ms: 123,
    errore: null, statusCode: n.statusCode, statusMsg: n.statusMsg, piano: n.piano,
    finestre: comprimiFinestre(n.finestre),
  };
  console.log(rigaStato(s));
  console.log(`piano: ${s.piano}`);
  for (const [m, f] of Object.entries(s.finestre)) {
    for (const [w, d] of Object.entries(f)) {
      console.log(`  ${m}/${w}: pct=${d.pct}% status=${d.status} (${ETICHETTE_STATO[d.status] ?? "?"}) start=${d.start ? tRoma(d.start) : "—"} end=${d.end ? tRoma(d.end) : "—"} remains=${fmtDurata(d.remainsMs)} usage=${d.usage} total=${d.total}`);
    }
  }
  // ora server dedotta (end − remains): deve coincidere su entrambi i modelli
  const g = s.finestre.general, v = s.finestre.video;
  const stG = g.interval.end - g.interval.remainsMs, stV = v.interval.end - v.interval.remainsMs;
  console.log(`\nora server dedotta (end − remains): general ${tRoma(stG)} · video ${tRoma(stV)} → ${Math.abs(stG - stV) <= 1000 ? "COINCIDENTI ✓" : "DISCOSTANTI ✗"}`);
  // differenza tra campione e variante: prova del diff V4
  const variante = JSON.parse(JSON.stringify(CAMPIONE_SINTETICO));
  variante.model_remains[0].current_interval_remaining_percent = 33.5;
  const diff = diffStrutturale(n, normalizzaRisposta(variante));
  console.log(`diff con variante (pct 33.97→33.5): ${diff.length === 0 ? "NESSUNA ✗ (diff rotto)" : diff.join(" · ") + " ✓"}`);
  console.log("\nAutotest completato.");
  return 0;
}

// ---------------------------------------------------------------- aiuto + main

function aiuto() {
  console.log(`verifica.mjs — Toolkit verifiche empiriche V1–V6 (piano MiniMax, docs/04 §4)

Comandi:
  v1            Stati di finestra durante il consumo → stato 2 = esaurita?
                [--once] [--intervallo 30] [--durata 180] [--modello general]
  v2            Rolling dal primo utilizzo (start_time vs primo uso dopo reset)
                [--intervallo 20] [--durata 360] [--modello general]
  v3            start_time dopo reset SENZA utilizzo (non usare l'API durante!)
                [--intervallo 60] [--durata 360] [--modello general]
  v4            Diff token_plan/remains vs coding_plan/remains (decide I18)
  v5            Confronto conteggi vs percentuali (semantica issue #99)
  v6            Rate limit sul polling  [--intervallo 10] [--durata 10]
  prova-parser  Autotest offline del normalizzatore
  aiuto         Questo aiuto

Opzioni:
  --chiave KEY     Subscription Key (oppure env MM_SUBSCRIPTION_KEY) — mai scritta nei log
  --regione eu|cn  default eu
  --intervallo S   secondi tra i campioni (start-to-start)
  --durata MIN     durata massima della verifica
  --modello NOME   limita l'analisi a un modello (es. general)
  --once           un solo campione (v1)

Esempi:
  export MM_SUBSCRIPTION_KEY="…"
  node scripts/verifiche/verifica.mjs prova-parser
  node scripts/verifiche/verifica.mjs v4
  node scripts/verifiche/verifica.mjs v3 --durata 420
  node scripts/verifiche/verifica.mjs v6 --intervallo 10 --durata 10

Gli esiti vengono salvati in scripts/verifiche/esiti/<id>-<istante>.json (+ .md).
V1 richiede di consumare quota fino a esaurimento; V2/V3 coprono lo scadere di una finestra;
V5 dà risultati solo con una chiave di piano «legacy a conteggi». Dettagli: docs/05.`);
  return 0;
}

async function main() {
  const opts = parseArgv(process.argv.slice(2));
  const cmd = opts._[0] ?? "aiuto";
  switch (cmd) {
    case "v1": return cmdV1(opts);
    case "v2": return cmdV2(opts);
    case "v3": return cmdV3(opts);
    case "v4": return cmdV4(opts);
    case "v5": return cmdV5(opts);
    case "v6": return cmdV6(opts);
    case "prova-parser": return cmdProvaParser();
    case "aiuto": case "help": case "--help": case "-h": return aiuto();
    default:
      console.error(`Comando sconosciuto: ${cmd}\n`);
      return aiuto();
  }
}

main().then((c) => process.exit(c ?? 0)).catch((e) => {
  console.error("Errore inatteso:", e?.stack ?? e);
  process.exit(1);
});
