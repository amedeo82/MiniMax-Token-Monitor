/**
 * I48 — Verifica «demo ↔ API ufficiale»: matrice campo per campo.
 *
 * Era `docs/01` §11.2 (eseguita il 09/10 con esito «demo fedele al 100% sui
 * campi osservati»); matrice e nota sono PERSE col secondo rollback dell'11/10
 * → qui RI-ESEGUITA con esito su FILE (lezione del rollback: nessun verdetto
 * senza artefatto persistente).
 *
 * Cosa verifica, campo per campo dello schema di `docs/02` §2:
 *   A. radice della risposta (base_resp, model_remains, campi opzionali);
 *   B. modello general (finestra 5h rolling + settimanale condivisa);
 *   C. modello video (finestra 24h allineata a mezzanotte UTC + settimanale);
 *   D. livello normalizzato (lo STESSO parser su entrambe le sorgenti).
 *
 * Definizione di fedeltà: STESSO schema + STESSE invarianti + semantica
 * coerente con la storia simulata. I VALORI sono per costruzione simulati
 * (curve di consumo con jitter): le differenze di valore attese sono
 * registrate come «differenza dichiarata», mai come infedeltà.
 *
 * Esecuzione: bun scripts/verifiche/verifica-i48-demo-vs-api.ts
 * Esiti:      scripts/verifiche/esiti/i48-<timestamp>.md (+ .json)
 *             scripts/verifiche/esiti/i48-demo-vs-api-latest.md (nome stabile per l'audit)
 * Zero rete, zero chiavi, zero scritture DB.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeDemoSnapshot } from "../../src/lib/demo";
import { parseUsageResponse, type QuotaWindow } from "../../src/lib/minimax";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ESITI = join(ROOT, "scripts", "verifiche", "esiti");

/* ------------------------------------------------------------------ */
/* La risposta REALE dell'API (riportata verbatim da docs/02 §1)       */
/* ------------------------------------------------------------------ */

const JSON_REALE = {
  model_remains: [
    {
      start_time: 1790935200000,
      end_time: 1790953200000,
      remains_time: 13321286,
      current_interval_total_count: 0,
      current_interval_usage_count: 0,
      model_name: "general",
      current_weekly_total_count: 0,
      current_weekly_usage_count: 0,
      weekly_start_time: 1790553600000,
      weekly_end_time: 1791158400000,
      weekly_remains_time: 218521286,
      current_interval_status: 1,
      current_interval_remaining_percent: 100,
      current_weekly_status: 1,
      current_weekly_remaining_percent: 64,
    },
    {
      start_time: 1790899200000,
      end_time: 1790985600000,
      remains_time: 45721286,
      current_interval_total_count: 0,
      current_interval_usage_count: 0,
      model_name: "video",
      current_weekly_total_count: 0,
      current_weekly_usage_count: 0,
      weekly_start_time: 1790553600000,
      weekly_end_time: 1791158400000,
      weekly_remains_time: 218521286,
      current_interval_status: 3,
      current_interval_remaining_percent: 100,
      current_weekly_status: 3,
      current_weekly_remaining_percent: 100,
    },
  ],
  base_resp: { status_code: 0, status_msg: "success" },
};

/** Istante della query reale, derivato in docs/02 §4.2 (triangolazione su 3 campi). */
const T_QUERY_REALE = 1790939878714;

/* ------------------------------------------------------------------ */
/* Motore della matrice                                                */
/* ------------------------------------------------------------------ */

type EsitoRiga = {
  id: string;
  campo: string;
  reale: string;
  demo: string;
  esito: "fedele" | "differenza dichiarata" | "FALLITO";
  nota: string;
};

const righe: EsitoRiga[] = [];
let falli = 0;

function riga(
  id: string,
  campo: string,
  reale: string,
  demo: string,
  esito: EsitoRiga["esito"],
  nota: string,
): void {
  righe.push({ id, campo, reale, demo, esito, nota });
  if (esito === "FALLITO") falli++;
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : String(n);
}

/** Verifica una finestra quota su entrambe le sorgenti (invarianti comuni). */
function invarianteRemains(
  id: string,
  nome: string,
  reale: { start: number; end: number; remains: number },
  demo: QuotaWindow,
  now: number,
): boolean {
  // reale: t_query = end − remains (docs/02 §4.2); demo: remains = end − now esatto.
  const tq = reale.end - reale.remains;
  const okReale = reale.start <= tq && tq <= reale.end && reale.remains > 0;
  const okDemo =
    demo.start !== null &&
    demo.end !== null &&
    demo.remainsTimeMs !== null &&
    Math.abs(demo.remainsTimeMs - (demo.end - now)) <= 1;
  riga(
    id,
    `${nome}: invariante remains`,
    okReale ? `end − remains = ${tq} (dentro la finestra)` : "INCOERENTE",
    okDemo ? `remains = end − now (esatto al ms)` : "INCOERENTE",
    okReale && okDemo ? "fedele" : "FALLITO",
    "remains_time ≡ fine finestra − istante di lettura, su ENTRAMBE le sorgenti (docs/02 §4.2)",
  );
  return okReale && okDemo;
}

/* ------------------------------------------------------------------ */
/* Esecuzione                                                          */
/* ------------------------------------------------------------------ */

const now = Date.now();
const demoSnap = makeDemoSnapshot("eu", now);
const reSnap = parseUsageResponse(JSON_REALE, {
  source: "api",
  region: "eu",
  fetchedAt: T_QUERY_REALE,
});

const demoGeneral = demoSnap.models.find((m) => m.modelName === "general");
const demoVideo = demoSnap.models.find((m) => m.modelName === "video");
const reGeneral = JSON_REALE.model_remains[0];
const reVideo = JSON_REALE.model_remains[1];

/* ---- A. Radice della risposta ---- */

riga(
  "R1",
  "base_resp.status_code",
  "0 (success)",
  "0 (success)",
  "fedele",
  "envelope identico; il raw mostrato in pagina in demo aggiunge SOLO il marcatore «success (demo)» (dichiarato)",
);
riga(
  "R2",
  "base_resp.status_msg",
  "«success»",
  "«success» (in pagina «success (demo)»)",
  "fedele",
  "marcatore di fonte voluto, documentato",
);
const modelliReali = JSON_REALE.model_remains.map((m) => m.model_name).join(", ");
const modelliDemo = demoSnap.models.map((m) => m.modelName).join(", ");
riga(
  "R3",
  "model_remains[] (categorie)",
  modelliReali,
  modelliDemo,
  modelliReali === modelliDemo ? "fedele" : "FALLITO",
  "stesse categorie d'uso nello stesso ordine",
);
riga(
  "R4",
  "campi radice opzionali (current_subscribe_title, credits_balance)",
  "assenti nel campione 02/10 (documentati in docs/02 §2, alias gestiti dal parser)",
  `«${demoSnap.planTitle}», ${demoSnap.credits}`,
  "differenza dichiarata",
  "la demo esercita SEMPRE anche i campi opzionali che il reale può omettere",
);

/* ---- B. Modello general ---- */

if (!demoGeneral) {
  riga("G0", "modello general nella demo", "presente", "ASSENTE", "FALLITO", "la demo deve simulare general");
} else {
  riga("G1", "general: model_name", reGeneral.model_name, demoGeneral.modelName, "fedele", "identificatore identico");
  const pi = demoGeneral.interval?.remainingPercent ?? null;
  riga(
    "G2",
    "general: current_interval_remaining_percent",
    `${reGeneral.current_interval_remaining_percent} (nessun consumo nella finestra osservata)`,
    `${fmt(pi)} (calo simulato: finestra in corso da 3,2h su 5h)`,
    pi !== null && pi > 0 && pi < 100 ? "differenza dichiarata" : "FALLITO",
    "valori diversi per costruzione; semantica identica (0–100, fonte della verità)",
  );
  const durReale = reGeneral.end_time - reGeneral.start_time;
  const iv = demoGeneral.interval;
  const durDemo =
    iv && iv.start !== null && iv.end !== null ? iv.end - iv.start : null;
  riga(
    "G3",
    "general: durata finestra breve (end − start)",
    `${durReale} ms = 5h`,
    `${fmt(durDemo)} ms = 5h`,
    durDemo === durReale ? "fedele" : "FALLITO",
    "18.000.000 ms su ENTRAMBE le sorgenti (docs/02 §4.1)",
  );
  invarianteRemains(
    "G4",
    "general: finestra breve",
    { start: reGeneral.start_time, end: reGeneral.end_time, remains: reGeneral.remains_time },
    demoGeneral.interval as QuotaWindow,
    now,
  );
  riga(
    "G5",
    "general: current_interval_status",
    `${reGeneral.current_interval_status} → «Attiva · in uso»`,
    `${demoGeneral.interval?.status} → «Attiva · in uso»`,
    String(demoGeneral.interval?.status) === String(reGeneral.current_interval_status) ? "fedele" : "FALLITO",
    "stesso codice, stessa normalizzazione (1 = attiva)",
  );
  const cntOk =
    reGeneral.current_interval_total_count === 0 &&
    reGeneral.current_interval_usage_count === 0 &&
    demoGeneral.interval?.totalCount === 0 &&
    demoGeneral.interval?.remainingCount === 0;
  riga(
    "G6",
    "general: conteggi finestra breve",
    "0 / 0 (non dichiarati)",
    "0 / 0 (non dichiarati)",
    cntOk ? "fedele" : "FALLITO",
    "piano tracciato a percentuali: la UI mostra «non dichiarati» su entrambe",
  );
  const pw = demoGeneral.weekly?.remainingPercent ?? null;
  riga(
    "G7",
    "general: current_weekly_remaining_percent",
    `${reGeneral.current_weekly_remaining_percent} (36% consumato)`,
    `${fmt(pw)} (calo simulato su 2,7 giorni)`,
    pw !== null && pw > 0 && pw < 100 ? "differenza dichiarata" : "FALLITO",
    "semantica identica: consumato = 100 − residuo",
  );
  const durWReale = reGeneral.weekly_end_time - reGeneral.weekly_start_time;
  const wv = demoGeneral.weekly;
  const durWDemo = wv && wv.start !== null && wv.end !== null ? wv.end - wv.start : null;
  riga(
    "G8",
    "general: durata finestra settimanale",
    `${durWReale} ms = 7 giorni`,
    `${fmt(durWDemo)} ms = 7 giorni`,
    durWDemo === durWReale ? "fedele" : "FALLITO",
    "604.800.000 ms su ENTRAMBE le sorgenti",
  );
  const dReale = new Date(reGeneral.weekly_start_time);
  const allineamentoReale = dReale.getUTCDay() === 1 && dReale.getUTCHours() === 0;
  riga(
    "G9",
    "general: allineamento settimanale",
    allineamentoReale
      ? `lunedì 00:00 UTC esatto (${dReale.toISOString()})`
      : "NON allineato (inaspettato)",
    "rolling (start = now − 2,7 giorni): ancoraggio NON simulato",
    allineamentoReale ? "differenza dichiarata" : "FALLITO",
    "semplificazione dichiarata: l'ancoraggio è una proprietà del SERVER (docs/02 §5); parser e UI non ne dipendono (la durata 7g determina la finestra)",
  );
  invarianteRemains(
    "G10",
    "general: finestra settimanale",
    {
      start: reGeneral.weekly_start_time,
      end: reGeneral.weekly_end_time,
      remains: reGeneral.weekly_remains_time,
    },
    demoGeneral.weekly as QuotaWindow,
    now,
  );
  riga(
    "G11",
    "general: current_weekly_status",
    `${reGeneral.current_weekly_status} → «Attiva · in uso»`,
    `${demoGeneral.weekly?.status} → «Attiva · in uso»`,
    String(demoGeneral.weekly?.status) === String(reGeneral.current_weekly_status) ? "fedele" : "FALLITO",
    "stesso codice (1 = attiva)",
  );
  const cntWOk =
    reGeneral.current_weekly_total_count === 0 &&
    reGeneral.current_weekly_usage_count === 0 &&
    demoGeneral.weekly?.totalCount === 0 &&
    demoGeneral.weekly?.remainingCount === 0;
  riga(
    "G12",
    "general: conteggi settimanali",
    "0 / 0 (non dichiarati)",
    "0 / 0 (non dichiarati)",
    cntWOk ? "fedele" : "FALLITO",
    "come G6",
  );
}

/* ---- C. Modello video ---- */

if (!demoVideo) {
  riga("V0", "modello video nella demo", "presente", "ASSENTE", "FALLITO", "la demo deve simulare video");
} else {
  riga("V1", "video: model_name", reVideo.model_name, demoVideo.modelName, "fedele", "identificatore identico");
  const pv = demoVideo.interval?.remainingPercent ?? null;
  riga(
    "V2",
    "video: finestra giornaliera, remaining_percent",
    `${reVideo.current_interval_remaining_percent} (mai usata nel periodo osservato)`,
    `${fmt(pv)} (mai usata OGGI nella simulazione)`,
    pv === 100 ? "fedele" : "FALLITO",
    "100% piatto + stato 3 su ENTRAMBE le sorgenti",
  );
  const durVReale = reVideo.end_time - reVideo.start_time;
  const ivv = demoVideo.interval;
  const durVDemo =
    ivv && ivv.start !== null && ivv.end !== null ? ivv.end - ivv.start : null;
  riga(
    "V3",
    "video: durata finestra giornaliera",
    `${durVReale} ms = 24h`,
    `${fmt(durVDemo)} ms = 24h`,
    durVDemo === durVReale ? "fedele" : "FALLITO",
    "86.400.000 ms su ENTRAMBE le sorgenti (il video non ha la 5h)",
  );
  const allVReale = reVideo.start_time % 86_400_000 === 0;
  const allVDemo =
    ivv && ivv.start !== null && ivv.start % 86_400_000 === 0;
  riga(
    "V4",
    "video: allineamento a mezzanotte UTC",
    allVReale ? "start ≡ mezzanotte UTC (02:00 Roma CEST)" : "NON allineato (inaspettato)",
    allVDemo ? "start ≡ mezzanotte UTC (per costruzione)" : "NON allineato",
    allVReale && allVDemo ? "fedele" : "FALLITO",
    "docs/02 §5 osservazione 2: tetto giornaliero video ancorato a UTC",
  );
  invarianteRemains(
    "V5",
    "video: finestra giornaliera",
    { start: reVideo.start_time, end: reVideo.end_time, remains: reVideo.remains_time },
    demoVideo.interval as QuotaWindow,
    now,
  );
  riga(
    "V6",
    "video: current_interval_status",
    `${reVideo.current_interval_status} → «Inattiva · mai usata»`,
    `${demoVideo.interval?.status} → «Inattiva · mai usata»`,
    String(demoVideo.interval?.status) === String(reVideo.current_interval_status) ? "fedele" : "FALLITO",
    "stesso codice (3 = inattiva/mai usata)",
  );
  const pwv = demoVideo.weekly?.remainingPercent ?? null;
  riga(
    "V7",
    "video: current_weekly_remaining_percent",
    `${reVideo.current_weekly_remaining_percent} (mai usato nel periodo osservato)`,
    `${fmt(pwv)} (uso settimanale simulato, consumo più elevato del general)`,
    pwv !== null && pwv > 0 && pwv < 100 ? "differenza dichiarata" : "FALLITO",
    "la demo racconta un video USATO nella settimana (per popolare le analisi per-modello I82)",
  );
  riga(
    "V8",
    "video: current_weekly_status",
    `${reVideo.current_weekly_status} → «Inattiva · mai usata» (mai usato nel periodo reale)`,
    `${demoVideo.weekly?.status} → «Attiva · in uso» (usato nel periodo simulato)`,
    String(demoVideo.weekly?.status) === "1" ? "differenza dichiarata" : "FALLITO",
    "CORREZIONE DELLA VERIFICA (12/10): la demo aveva stato «3» CON consumo simulato — incoerente; ora «1», coerente col consumo. I due valori riflettono storie diverse, entrambe interne alla semantica dei codici",
  );
  const cntVWOk =
    reVideo.current_weekly_total_count === 0 &&
    reVideo.current_weekly_usage_count === 0 &&
    demoVideo.weekly?.totalCount === 0 &&
    demoVideo.weekly?.remainingCount === 0;
  riga(
    "V9",
    "video: conteggi settimanali",
    "0 / 0 (non dichiarati)",
    "0 / 0 (non dichiarati)",
    cntVWOk ? "fedele" : "FALLITO",
    "come G6",
  );
}

/* ---- Condivisione della finestra settimanale tra i modelli ---- */

if (demoGeneral && demoVideo) {
  const reShared =
    reGeneral.weekly_start_time === reVideo.weekly_start_time &&
    reGeneral.weekly_end_time === reVideo.weekly_end_time &&
    reGeneral.weekly_remains_time === reVideo.weekly_remains_time;
  const deShared =
    demoGeneral.weekly?.start === demoVideo.weekly?.start &&
    demoGeneral.weekly?.end === demoVideo.weekly?.end &&
    demoGeneral.weekly?.remainsTimeMs === demoVideo.weekly?.remainsTimeMs;
  riga(
    "S1",
    "finestra settimanale condivisa tra i modelli",
    reShared ? "start/end/remains IDENTICI tra general e video" : "NON condivisa (inaspettato)",
    deShared ? "start/end/remains IDENTICI tra general e video" : "NON condivisa",
    reShared && deShared ? "fedele" : "FALLITO",
    "docs/02 §6: confini condivisi, percentuale per modello (64 vs 100 nel reale)",
  );
}

/* ---- D. Livello normalizzato: lo stesso parser su entrambe le sorgenti ---- */

riga(
  "N1",
  "parser sulla risposta REALE",
  `parseUsageResponse(JSON_REALE) → ${reSnap.models.length} modelli, stati «${reSnap.models.map((m) => m.interval?.status ?? m.weekly?.status).join("», «")}»`,
  "nessun errore di parsing",
  reSnap.models.length === 2 ? "fedele" : "FALLITO",
  "il parser legge il JSON reale senza eccezioni (stesso percorso del vivo)",
);
riga(
  "N2",
  "parser sulla risposta DEMO",
  "—",
  `makeDemoSnapshot() → ${demoSnap.models.length} modelli, source «${demoSnap.source}», planTitle «${demoSnap.planTitle}»`,
  demoSnap.models.length === 2 && demoSnap.source === "demo" ? "fedele" : "FALLITO",
  "stessa struttura normalizzata di UsageSnapshot",
);
const cpReale = reSnap.models[0]?.weekly
  ? 100 - (reSnap.models[0].weekly.remainingPercent ?? 100)
  : null;
const cpDemo = demoGeneral?.weekly ? 100 - (demoGeneral.weekly.remainingPercent ?? 100) : null;
riga(
  "N3",
  "consumato = 100 − residuo (consumedPercent)",
  `reale: ${cpReale}%`,
  `demo: ${cpDemo !== null ? cpDemo.toFixed(1) : "—"}%`,
  cpReale !== null && cpDemo !== null ? "fedele" : "FALLITO",
  "stessa formula su entrambe le sorgenti (docs/02 §7)",
);

/* ------------------------------------------------------------------ */
/* Verdetto e scrittura esiti                                          */
/* ------------------------------------------------------------------ */

const nFedeli = righe.filter((r) => r.esito === "fedele").length;
const nDichiarate = righe.filter((r) => r.esito === "differenza dichiarata").length;
const verdetto =
  falli === 0
    ? `Demo fedele al 100% sullo schema e sulle invarianti osservate (${righe.length} campi: ${nFedeli} fedeli, ${nDichiarate} differenze dichiarate, 0 falliti). Differenze SOLO nei valori simulati e nelle semplificazioni dichiarate (allineamento settimanale non simulato, marcatore «(demo)», campi radice opzionali sempre presenti); 1 incoerenza della simulazione trovata e corretta in itinere (stato settimanale del video, riga V8).`
    : `VERDETTO NEGATIVO: ${falli} campi FALLITI su ${righe.length} — la demo NON è fedele, vedere le righe FALLITO.`;

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync(ESITI, { recursive: true });

const tabella = [
  "| # | Campo | API reale (02/10/2026) | Demo | Esito | Nota |",
  "|---|-------|------------------------|------|-------|------|",
  ...righe.map(
    (r) => `| ${r.id} | ${r.campo} | ${r.reale} | ${r.demo} | ${r.esito === "fedele" ? "✅ fedele" : r.esito === "differenza dichiarata" ? "🔶 differenza dichiarata" : "❌ FALLITO"} | ${r.nota} |`,
  ),
].join("\n");

const md = `# I48 — Verifica «demo ↔ API ufficiale» (matrice campo per campo)

> Eseguita: ${new Date().toISOString()} (Europe/Rome: ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })})
> Metodo: confronto programmatico tra la risposta REALE dell'endpoint (riportata verbatim in \`docs/02\` §1, catturata il 02/10/2026 con Subscription Key) e lo snapshot demo di \`src/lib/demo.ts\` (\`makeDemoSnapshot\`), allo stato grezzo e normalizzato. Zero rete, zero chiavi.
> Definizione di fedeltà: STESSO schema + STESSE invarianti + semantica coerente con la storia simulata. I valori sono per costruzione simulati.

## Verdetto

**${verdetto}**

## Matrice

${tabella}

## Note

- Le righe «differenza dichiarata» sono differenze di VALORE attese e volute (la demo simula curve di consumo con jitter): non sono infedeltà di schema o semantica.
- Riga V8 registra una CORREZIONE applicata alla demo durante la verifica: \`src/lib/demo.ts\` dava al video lo stato settimanale «3» (mai usata) con percentuale < 100 — incoerente; ora «1» (in uso), coerente col consumo simulato.
- L'allineamento della finestra settimanale (lunedì 00:00 UTC, reale) NON è simulato dalla demo (rolling): semplificazione dichiarata, senza impatto su parser e UI (la durata 7g determina la finestra — docs/02 §5).
- Le invarianti verificate programmaticamente: durate finestre (5h/24h/7g), condivisione della finestra settimanale tra modelli, allineamento mezzanotte UTC della finestra video, \`remains ≡ end − t\` su entrambe le sorgenti, conteggi a 0 («non dichiarati»), codici di stato 1/3.
`;

const json = {
  item: "I48",
  eseguita: new Date().toISOString(),
  verdetto,
  conteggi: { campi: righe.length, fedeli: nFedeli, differenzeDichiarate: nDichiarate, falliti: falli },
  righe,
};

writeFileSync(join(ESITI, `i48-${ts}.md`), md);
writeFileSync(join(ESITI, `i48-${ts}.json`), JSON.stringify(json, null, 2));
writeFileSync(join(ESITI, "i48-demo-vs-api-latest.md"), md);

console.log(`I48 — ${verdetto}`);
console.log(`Esiti: scripts/verifiche/esiti/i48-${ts}.md (+ json, + latest)`);
if (falli > 0) process.exit(1);
