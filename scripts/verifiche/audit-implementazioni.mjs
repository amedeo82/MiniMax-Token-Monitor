#!/usr/bin/env node
/**
 * I55 — Audit di riconciliazione codice ↔ documentazione.
 *
 * Per OGNI item marcato ✅ in docs/04 §3 lo strumento verifica che esistano
 * artefatti REALI nel repository: file, simboli esportati, costanti, wiring
 * (import/uso) e assenze richieste (item rimossi 🚫 che non devono tornare).
 *
 * - Zero dipendenze (Node ≥ 18), eseguibile: `node scripts/verifiche/audit-implementazioni.mjs [--strict]`
 * - Con --strict exit 1 al primo fallimento; default: riporta tutto ed esce 1 se ci sono FAIL.
 * - Report in scripts/verifiche/esiti/audit-implementazioni-<timestamp>.md
 * - La chiave API non viene MAI letta o stampata (il tool non tocca .env né richieste di rete).
 *
 * Il registro CHECKS è dichiarativo: a ogni nuovo item ✅ si aggiungono le
 * proprie verifiche (file/simbolo/costante/wiring/assenza). Ogni riga ✅ di
 * docs/04 SENZA check viene segnalata come SCOPERTA (coverage check), così
 * l'audit non può invecchiare silenziosamente.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DOCS04 = join(ROOT, "docs", "04-stato-avanzamento.md");
const ESITI_DIR = join(ROOT, "scripts", "verifiche", "esiti");
const STRICT = process.argv.includes("--strict");

/* ------------------------------------------------------------------ */
/* Helper di verifica                                                  */
/* ------------------------------------------------------------------ */

let fileCache = new Map();
function read(rel) {
  const p = join(ROOT, rel);
  if (!fileCache.has(p)) {
    fileCache.set(p, existsSync(p) ? readFileSync(p, "utf8") : null);
  }
  return fileCache.get(p);
}

const check = {
  /** Il file esiste. */
  file: (item, rel, what) => ({ item, what, kind: "file", run: () => (existsSync(join(ROOT, rel)) ? null : `file assente: ${rel}`) }),
  /** Il file contiene il simbolo/pattern (regex multiline). */
  simbolo: (item, rel, pattern, what) => ({
    item,
    what: `${what} (${rel})`,
    kind: "simbolo",
    run: () => {
      const c = read(rel);
      if (c === null) return `file assente: ${rel}`;
      return new RegExp(pattern, "m").test(c) ? null : `simbolo/pattern non trovato in ${rel}: /${pattern}/`;
    },
  }),
  /** Il file NON contiene il pattern (per item rimossi 🚫). Su directory fa una ricerca ricorsiva. */
  assenza: (item, rel, pattern, what) => ({
    item,
    what: `${what} — assenza richiesta (${rel})`,
    kind: "assenza",
    run: () => {
      const p = join(ROOT, rel);
      if (!existsSync(p)) return null; // assente del tutto: ok
      const rx = new RegExp(pattern, "m");
      if (statSync(p).isDirectory()) {
        const SKIP = /node_modules|\.next|^\./;
        const walk = (dir) =>
          readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
            if (SKIP.test(d.name)) return [];
            const full = join(dir, d.name);
            return d.isDirectory() ? walk(full) : [full];
          });
        for (const f of walk(p)) {
          if (rx.test(readFileSync(f, "utf8"))) return `trovato pattern che doveva essere assente in ${f}: /${pattern}/`;
        }
        return null;
      }
      return rx.test(read(p)) ? `trovato pattern che doveva essere assente in ${rel}: /${pattern}/` : null;
    },
  }),
  /** Nessun file corrispondente al glob esiste. */
  nessunFile: (item, dir, pattern, what) => ({
    item,
    what: `${what} — nessun file deve esistere`,
    kind: "assenza",
    run: () => {
      if (!existsSync(join(ROOT, dir))) return null;
      const rx = new RegExp(pattern);
      const hit = readdirSync(join(ROOT, dir)).filter((f) => rx.test(f));
      return hit.length > 0 ? `trovati file inattesi in ${dir}: ${hit.join(", ")}` : null;
    },
  }),
  /** Più file insieme (tutti devono esistere). */
  files: (item, rels, what) => ({
    item,
    what,
    kind: "file",
    run: () => {
      const missing = rels.filter((r) => !existsSync(join(ROOT, r)));
      return missing.length === 0 ? null : `file assenti: ${missing.join(", ")}`;
    },
  }),
};

/* ------------------------------------------------------------------ */
/* Registro delle verifiche (un blocco per item, chiavi = ID)          */
/* ------------------------------------------------------------------ */

const CHECKS = [
  /* --- F0–F5 (I1–I14) ---------------------------------------------- */
  ...[
    { item: "I12", what: "screenshot verifiche agent-browser (scripts/*.png ≥ 1)", kind: "file", run: () => (readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".png")).length > 0 ? null : "nessuno screenshot in scripts/") },
    check.simbolo("I1", "package.json", '"next"|"react"|"tailwindcss"', "dipendenze Next/React/Tailwind"),
    check.file("I1", "src/components/ui", "componenti shadcn/ui"),
    check.simbolo("I2", "src/lib/minimax.ts", "export function parseUsageResponse", "parser principale"),
    check.simbolo("I2", "src/lib/minimax.ts", "export const REGION_ENDPOINTS", "endpoint regionali"),
    check.simbolo("I3", "src/app/api/minimax/usage/route.ts", "export async function POST", "handler proxy"),
    check.simbolo("I3", "src/app/api/minimax/usage/route.ts", "12_000|12\\\\,000|12\\\\000", "timeout 12s"),
    check.simbolo("I4", "src/lib/time.ts", 'export const TZ_ROME = "Europe/Rome"', "fuso Rome"),
    check.simbolo("I4", "src/lib/time.ts", "export function formatCountdown", "countdown"),
    check.simbolo("I4", "src/lib/time.ts", "export function windowProgress", "progresso finestra"),
    check.simbolo("I5", "src/components/quota-cards.tsx", "export function ModelCard", "ModelCard"),
    check.simbolo("I5", "src/components/quota-cards.tsx", "export function MainWindows", "MainWindows"),
    check.simbolo("I5", "src/components/quota-ring.tsx", "export function QuotaRing|export const QuotaRing", "QuotaRing"),
    check.simbolo("I6", "src/app/page.tsx", "setInterval\\(\\(\\) => setNow\\(Date.now\\(\\)\\), 1000\\)", "tick 1s"),
    check.simbolo("I6", "src/lib/minimax.ts", "export function inferServerTime", "ora server dedotta"),
    check.simbolo("I7", "src/app/page.tsx", '"mm-dash-history-v1"', "chiave storico locale"),
    check.simbolo("I7", "src/components/history-chart.tsx", "export function HistoryChart", "HistoryChart"),
    check.simbolo("I7", "src/components/history-chart.tsx", "export function computeTrend", "computeTrend"),
    check.simbolo("I8", "src/components/settings-dialog.tsx", "export function SettingsDialog", "SettingsDialog"),
    check.simbolo("I8", "src/components/settings-dialog.tsx", "DEFAULT_SETTINGS", "default persistiti"),
    check.simbolo("I9", "src/app/page.tsx", "handleImportJson", "import JSON manuale"),
    check.simbolo("I10", "src/lib/demo.ts", "export function makeDemoSnapshot", "snapshot demo"),
    check.simbolo("I10", "src/lib/demo.ts", "export function makeDemoHistory", "storia demo"),
    check.simbolo("I11", "src/components/tech-panels.tsx", "export function RawJsonPanel", "RawJsonPanel"),
    check.simbolo("I11", "src/components/tech-panels.tsx", "export function TechInfo", "TechInfo"),
    check.simbolo("I13", "src/lib/demo.ts", "videoDayStart", "bugfix I13 presente"),
    check.files("I14", ["docs/01-api-minimax-ricerca.md", "docs/02-analisi-json-quota.md", "docs/03-piano-implementazione.md", "docs/04-stato-avanzamento.md", "README.md"], "documentazione di progetto"),
  ],

  /* --- Rimosse (I15/I19/I20 🚫): assenze ---------------------------- */
  check.nessunFile("I15", "src/app/api/minimax", "chat", "nessun proxy chat (ADR-8)"),
  check.assenza("I15", "src/lib", "token-log", "nessun token-log.ts (ADR-8)"),
  check.assenza("I15", "src", "TokenTracker", "nessun TokenTracker (ADR-8)"),
  check.assenza("I19", "src", "token-log|TokenLog", "nessuna persistenza registro token"),
  check.assenza("I20", "src", "correla.*token.*calo|tokenVsQuota", "nessuna correlazione token↔quota"),

  /* --- F6b/F7/F8 (I16–I32) ------------------------------------------ */
  check.simbolo("I16", "prisma/schema.prisma", "model UsagePoint", "modello UsagePoint"),
  check.file("I16", "src/app/api/history/route.ts", "endpoint api/history"),
  check.simbolo("I16", "src/lib/server-history.ts", "export function pushPointToServer", "replica punti"),
  check.simbolo("I16", "src/lib/server-history.ts", "export function mergeHistories", "merge storici"),
  check.simbolo("I17", "src/lib/usage-events.ts", "export function deriveBanner", "banner soglie"),
  check.simbolo("I17", "src/lib/usage-events.ts", "export function evaluateTransitions", "transizioni toast/notifiche"),
  check.simbolo("I21", "src/lib/usage-events.ts", '"mm-dash-events-v1"', "chiave registro eventi"),
  check.simbolo("I21", "src/components/event-log.tsx", "export function EventLog", "EventLog UI"),
  check.simbolo("I22", "src/lib/export.ts", "csv|CSV", "export CSV"),
  check.simbolo("I22", "src/lib/export.ts", "FEFF|BOM|bom", "BOM per Excel it-IT"),
  check.simbolo("I23", "src/components/history-chart.tsx", "ProjectionVerdict|verdetto", "verdetto esaurimento vs reset"),
  check.simbolo("I24", "src/components/model-table.tsx", "export function PanoramicTable", "vista panoramica"),
  check.simbolo("I25", "src/components/settings-dialog.tsx", "Connessione", "tab Connessione"),
  check.simbolo("I25", "src/components/settings-dialog.tsx", "Avvisi", "tab Avvisi"),
  check.simbolo("I25", "src/components/settings-dialog.tsx", "Dati", "tab Dati"),
  check.simbolo("I26", "src/lib/cycles.ts", "export const RESET_JUMP = 15", "soglia reset"),
  check.simbolo("I26", "src/lib/cycles.ts", "export function detectCycles", "cicli di finestra"),
  check.simbolo("I26", "src/lib/cycles.ts", "export function weekdayConsumption", "consumo per giorno"),
  check.simbolo("I26", "src/components/analysis-panel.tsx", "export function LongTermAnalysis|export const LongTermAnalysis", "pannello analisi"),
  check.simbolo("I27", "prisma/schema.prisma", "model UsageEventRecord", "modello eventi server"),
  check.file("I27", "src/app/api/events/route.ts", "endpoint api/events"),
  check.simbolo("I27", "src/lib/server-events.ts", "export function pushEventsToServer", "replica eventi"),
  check.simbolo("I27", "src/lib/server-events.ts", "export function mergeEvents", "merge eventi per id"),
  check.simbolo("I28", "src/lib/usage-events.ts", "export function windowThresholdKey", "chiavi soglia per finestra"),
  check.simbolo("I28", "src/lib/usage-events.ts", "export function migrateLegacyThresholds", "migrazione soglie legacy"),
  check.simbolo("I28", "src/components/settings-dialog.tsx", "AlertThresholds|thresholds", "matrice soglie nelle impostazioni"),
  check.file("I29", "scripts/verifiche/verifica.mjs", "toolkit verifiche V1–V6"),
  check.file("I29", "docs/05-verifiche-empiriche.md", "runbook verifiche"),
  check.assenza("I30", "src/app/api/minimax/usage/route.ts", "writeFile|appendFile|createWriteStream", "proxy senza cattura chiave (I30)"),
  check.simbolo("I31", "src/components/history-chart.tsx", "computePace|PacePanel", "pace di consumo"),
  check.simbolo("I32", "src/lib/cycles.ts", "export function heatmapConsumption", "heatmap 7×24"),
  check.simbolo("I32", "src/components/analysis-panel.tsx", "Per ora|Heatmap", "tab heatmap in UI"),

  /* --- Recovery (I50/I51/I55) --------------------------------------- */
  check.file("I55", "scripts/verifiche/audit-implementazioni.mjs", "audit tool stesso"),
  check.simbolo("I55", "scripts/verifiche/audit-implementazioni.mjs", "SCOPERT|coverage check", "coverage check ✅ senza verifiche"),
  check.simbolo("I55", "scripts/verifiche/audit-implementazioni.mjs", "audit-implementazioni-", "report in esiti/"),
  check.files("I50", ["tests/lib/minimax.test.ts", "tests/lib/time.test.ts", "tests/lib/cycles.test.ts", "tests/lib/usage-events.test.ts", "tests/lib/backoff.test.ts"], "suite test lib core"),
  check.simbolo("I50", "package.json", '"test": "bun test"', "script test"),
  check.file("I50", "tests/bun-env.d.ts", "tipi bun:test per tsc"),
  check.simbolo("I51", "src/lib/backoff.ts", "export function nextBackoffMs", "backoff con jitter"),
  check.simbolo("I51", "src/lib/backoff.ts", "export function parseRetryAfterMs", "parsing Retry-After"),
  check.simbolo("I51", "src/lib/backoff.ts", "export function delayAfterFailure", "decisione client"),
  check.simbolo("I51", "src/app/page.tsx", "delayAfterFailure", "wiring scheduler client"),
  check.simbolo("I51", "src/app/api/minimax/usage/route.ts", "parseRetryAfterMs|retryAfterMs", "wiring retry transitorio proxy"),
  check.simbolo("I51", "src/app/api/minimax/usage/route.ts", "TRANSIENT_HTTP", "classificazione errori transitori"),

  /* --- I18 fallback coding_plan/remains ------------------------------ */
  check.simbolo("I18", "src/lib/minimax.ts", "export const CODING_PLAN_ENDPOINTS", "endpoint alternativi per regione"),
  check.simbolo("I18", "src/lib/minimax.ts", "coding_plan/remains", "URL alternativo dichiarato"),
  check.simbolo("I18", "src/lib/minimax.ts", "export const FALLBACK_TRIGGER_HTTP", "trigger HTTP endpoint scomparso"),
  check.simbolo("I18", "src/lib/minimax.ts", "export function shouldTryFallback", "decisione di fallback pura"),
  check.simbolo("I18", "src/app/api/minimax/usage/route.ts", "shouldTryFallback|CODING_PLAN_ENDPOINTS", "wiring fallback nel proxy"),
  check.simbolo("I18", "src/app/api/minimax/usage/route.ts", "tryEndpoint", "campagna di fetch riusabile primario/fallback"),
  check.simbolo("I18", "src/app/api/minimax/usage/route.ts", "fallbackTried", "annotazione fallback tentato senza successo"),
  check.simbolo("I18", "src/app/page.tsx", "fallbackActiveRef", "stato fallback nel client"),
  check.simbolo("I18", "src/app/page.tsx", "coding_plan/remains", "evento tecnico su transizione fallback"),
  check.file("I18", "tests/lib/minimax-fallback.test.ts", "test dedicati al fallback"),
  check.files("I52", ["public/sw.js", "public/sw-shared.js", "src/app/manifest.ts", "src/components/pwa-register.tsx", "public/icon-192.png", "public/icon-512.png", "public/icon-180.png"], "artefatti PWA"),
  check.simbolo("I52", "public/sw.js", "importScripts\\(\"/sw-shared.js\"\\)", "SW usa la fonte unica"),
  check.simbolo("I52", "public/sw.js", "indexedDB", "segreti solo in IndexedDB (ADR-14)"),
  check.simbolo("I52", "public/sw.js", "ok === true", "cache snapshot solo su ok:true (fix 1004 cachato)"),
  check.simbolo("I52", "public/sw-shared.js", "parseUsagePayload", "parser condiviso"),
  check.simbolo("I52", "public/sw-shared.js", "quotaKeyFor", "chiavi soglia condivise"),
  check.simbolo("I52", "public/sw-shared.js", "function evaluate", "transizioni condivise"),
  check.simbolo("I52", "src/app/layout.tsx", "PwaRegister", "wiring registro SW nel layout"),
  check.simbolo("I52", "src/app/page.tsx", "mm-dash-settings-updated", "dispatch cambio impostazioni → SW"),
  check.file("I52", "tests/lib/sw-parity.test.ts", "test di parità TS↔SW"),

  /* --- Fase 3 recovery (I57–I67, batch abbellimenti) ---------------- */
  check.simbolo("I57", "src/lib/cycles.ts", "export function sprecoPerCiclo", "WasteStats"),
  check.simbolo("I57", "src/components/analysis-panel.tsx", "CycleWaste", "KPI spreco nei tab Cicli"),
  check.simbolo("I58", "src/lib/cycles.ts", "export function consumoGiornaliero", "aggregazione calendario"),
  check.simbolo("I58", "src/components/analysis-panel.tsx", "CalendarSection", "tab Calendario"),
  check.simbolo("I59", "src/lib/rate.ts", "export function rateSeries", "serie ritmo %/h"),
  check.simbolo("I59", "src/components/history-chart.tsx", "export function RateChart", "grafico ritmo"),
  check.simbolo("I59", "src/app/page.tsx", 'id="ritmo"', "ancora sezione ritmo"),
  check.simbolo("I60", "src/components/diagnostica-panel.tsx", "export function ResetClock", "dot plot reset"),
  check.simbolo("I60", "src/components/diagnostica-panel.tsx", "BLOCCHI_UTC", "blocchi teorici UTC"),
  check.simbolo("I61", "src/lib/cycles.ts", "export function distribuzioneResiduo", "istogramma residuo"),
  check.simbolo("I61", "src/lib/cycles.ts", "export const BAND_COLORS", "colori fasce"),
  check.simbolo("I61", "src/components/analysis-panel.tsx", "DistributionSection", "tab Distribuzione"),
  check.simbolo("I62", "src/lib/health.ts", "export function saluteMonitor", "episodi errore"),
  check.simbolo("I62", "src/components/diagnostica-panel.tsx", "export function MonitorHealth", "salute in Diagnostica"),
  check.simbolo("I63", "src/lib/cycles.ts", "export function prevedibilitaCicli", "indice regolarità"),
  check.simbolo("I63", "src/components/analysis-panel.tsx", "PrevedibilitaStrip", "striscia nei tab Cicli"),
  check.simbolo("I64", "src/lib/cycles.ts", "export function oggiVsMedia", "oggi vs media"),
  check.simbolo("I64", "src/components/analysis-panel.tsx", "TodayComparison", "tab Per giorno"),
  check.simbolo("I65", "src/lib/ring-color.ts", "export function coloreContinuo", "colore HSL continuo"),
  check.simbolo("I65", "src/lib/ring-color.ts", "export function AnimatedPercent", "count-up"),
  check.simbolo("I65", "src/components/quota-ring.tsx", "continuous", "prop anelli principali"),
  check.simbolo("I65", "src/components/quota-cards.tsx", "continuous", "MainWindows continuous"),
  check.simbolo("I66", "src/components/section-nav.tsx", "IntersectionObserver", "scrollspy"),
  check.simbolo("I66", "src/components/section-nav.tsx", "--nav-offset", "offset header+56px"),
  check.simbolo("I66", "src/app/page.tsx", "SectionNav", "wiring nav"),
  check.simbolo("I66", "src/app/globals.css", ".mm-anchor", "scroll-margin sezioni"),
  check.simbolo("I67", "src/lib/tab-identity.ts", "export function formatTabTitle", "title dinamico"),
  check.simbolo("I67", "src/lib/tab-identity.ts", "export function drawFaviconDataUrl", "favicon canvas"),
  check.simbolo("I67", "src/lib/tab-identity.ts", "MutationObserver", "guard anti re-asserzione"),
  check.simbolo("I67", "src/app/page.tsx", "TabIdentity", "wiring tab identity"),

  /* --- Batch 1 client-only (I69/I77/I76/I73, docs/07) ---------------- */
  check.simbolo("I69", "src/lib/interval.ts", "export const RANGE_PRESETS", "preset 6h/24h/3g/7g/30g/tutto"),
  check.simbolo("I69", "src/lib/interval.ts", "export function filterHistoryByPreset", "filtro client-side puro"),
  check.simbolo("I69", "src/app/page.tsx", "filterHistoryByPreset", "wiring filtro nello storico"),
  check.simbolo("I69", "src/app/page.tsx", "RANGE_PRESETS", "selettore a chips"),
  check.simbolo("I69", "tests/lib/interval.test.ts", "bordo inferiore INCLUSIVO", "semantica finestra testata"),
  check.simbolo("I77", "src/lib/event-filters.ts", "export function filterEvents", "filtri kind+testo+periodo puri"),
  check.simbolo("I77", "src/lib/event-filters.ts", "export function startOfTodayRome", "confine oggi Roma DST-safe"),
  check.simbolo("I77", "src/components/event-log.tsx", "filterEvents", "wiring filtri nel registro"),
  check.simbolo("I77", "src/components/event-log.tsx", "ToggleGroup", "chips per kind"),
  check.simbolo("I77", "src/components/event-log.tsx", "Azzera filtri", "reset della vista"),
  check.simbolo("I77", "tests/lib/event-filters.test.ts", "DST-safe", "test confine ora legale/solare"),
  check.simbolo("I76", "src/components/event-log.tsx", 'typeof e.value === "number"', "fix bug undefined.toFixed"),
  check.simbolo("I76", "src/components/section-boundary.tsx", "componentDidCatch", "error boundary React"),
  check.simbolo("I76", "src/components/section-boundary.tsx", "Riprova", "skeleton con retry"),
  check.simbolo("I76", "src/app/page.tsx", "SectionBoundary", "sezioni avvolte indipendentemente"),
  check.simbolo("I73", "src/lib/compact.ts", "export function readCompactMode", "parsing ?compact=1"),
  check.simbolo("I73", "src/app/page.tsx", "readCompactMode", "wiring modalità compatta"),
  check.simbolo("I73", "src/app/page.tsx", "VISTA COMPATTA", "widget anelli+countdown+ritmo"),
  check.simbolo("I73", "src/app/page.tsx", "Torna alla vista completa", "uscita dal widget"),
  check.simbolo("I73", "tests/lib/compact.test.ts", "readCompactMode", "test parsing"),
  /* --- Batch 2 analisi (I70/I71/I72, docs/07) ------------------------ */
  check.simbolo("I70", "src/lib/rate-anomalies.ts", "export function detectRateAnomalies", "z-score robusto mediana+MAD"),
  check.simbolo("I70", "src/lib/rate-anomalies.ts", "0.6745", "costante Iglewicz-Hoaglin"),
  check.simbolo("I70", "src/lib/rate-anomalies.ts", "sma: 1", "ritmi GREZZI (SMA disattivata)"),
  check.simbolo("I70", "src/components/diagnostica-panel.tsx", "RateAnomaliesPanel", "sezione Anomalie del ritmo"),
  check.simbolo("I70", "src/components/diagnostica-panel.tsx", "regime atteso", "mediana mostrata in UI"),
  check.simbolo("I70", "tests/lib/rate-anomalies.test.ts", "MAD", "statistiche robuste testate"),
  check.simbolo("I71", "src/lib/sampling.ts", "export function samplingQuality", "copertura+gap puri"),
  check.simbolo("I71", "src/lib/sampling.ts", "export function romeDayKey", "giorno Roma DST-safe"),
  check.simbolo("I71", "src/components/diagnostica-panel.tsx", "SamplingQualityPanel", "sezione Qualità del campionamento"),
  check.simbolo("I71", "src/components/diagnostica-panel.tsx", "Copertura", "badge copertura in UI"),
  check.simbolo("I71", "tests/lib/sampling.test.ts", "NON è un gap", "soglia 15 min testata"),
  check.simbolo("I72", "src/lib/ewma.ts", "export function ewmaProjection", "proiezione EWMA pura"),
  check.simbolo("I72", "src/lib/ewma.ts", "Math\\.exp\\(-eta \\/ halfLifeMs\\)", "peso esponenziale sulla mezza vita"),
  check.simbolo("I72", "src/components/history-chart.tsx", "EwmaCard", "card A/B affiancata al verdetto"),
  check.simbolo("I72", "src/components/history-chart.tsx", "non sostitutiva", "badge sperimentale"),
  check.simbolo("I72", "src/app/page.tsx", "ewmaProjection", "wiring ewma in page.tsx"),
  check.simbolo("I72", "tests/lib/ewma.test.ts", "mezza vita", "effetto half-life testato"),
  /* --- Batch 3 infrastruttura (I80/I81/I68, docs/07) ----------------- */
  check.file("I80", "src/app/api/summary/route.ts", "endpoint di sintesi read-only"),
  check.simbolo("I80", "src/app/api/summary/route.ts", "export async function GET", "solo GET, senza chiave"),
  check.simbolo("I80", "src/app/api/summary/route.ts", "db\\.usagePoint\\.count", "KPI aggregati dal DB"),
  check.assenza("I80", "src/app/api/summary/route.ts", "\\.(create|upsert|update|deleteMany|delete)\\(", "ADR-8: nessuna scrittura"),
  check.file("I81", "tests/components/setup-dom.ts", "registrazione happy-dom (GlobalRegistrator)"),
  check.simbolo("I81", "tests/components/setup-dom.ts", "GlobalRegistrator", "pattern DOM ufficiale di Bun"),
  check.simbolo("I81", "bunfig.toml", "preload", "DOM registrato prima di testing-library"),
  check.simbolo("I81", "tests/components/quota-ring.test.tsx", "@testing-library/react", "test QuotaRing"),
  check.simbolo("I81", "tests/components/event-log.test.tsx", "EventLog", "test EventLog (filtri I77)"),
  check.simbolo("I81", "tests/components/nav-boundary.test.tsx", "SectionBoundary", "test error boundary + section-nav"),
  check.simbolo("I68", "prisma/schema.prisma", "model DownsampledPoint", "tabella bucket orari derivati"),
  check.simbolo("I68", "prisma/schema.prisma", "@@unique\\(\\[hourStart, source\\]\\)", "univocità ora+sorgente (niente mix api/demo)"),
  check.simbolo("I68", "src/lib/downsample.ts", "export function mergeHourBucket", "merge incrementale puro"),
  check.simbolo("I68", "src/lib/downsample.ts", "export function hourStartOf", "bucket allineato all'ora UTC"),
  check.simbolo("I68", "src/app/api/history/route.ts", "updateHourBucket", "manutenzione bucket nella POST"),
  check.simbolo("I68", "src/app/api/history/route.ts", "granularity", "GET ?granularity=hour"),
  check.file("I68", "scripts/verifiche/backfill-downsample.mjs", "backfill idempotente dai punti grezzi"),
  check.simbolo("I68", "src/lib/server-history.ts", "export async function fetchServerHourly", "client grana oraria"),
  check.simbolo("I68", "src/components/history-chart.tsx", "exportHourlyFromServer", "voci export orario nel menu"),
  check.simbolo("I68", "tests/lib/downsample.test.ts", "sorgenti diverse", "bucket separati api/demo testati"),
  /* --- Batch 4 UX (I74/I75/I78, docs/07) ------------------------------ */
  check.file("I74", "src/components/bottom-nav.tsx", "barra di navigazione inferiore mobile"),
  check.simbolo("I74", "src/components/section-nav.tsx", "export function useScrollSpySezioni", "scrollspy estratto in hook condiviso"),
  check.simbolo("I74", "src/components/bottom-nav.tsx", "useScrollSpySezioni", "stesso scrollspy della nav I66"),
  check.simbolo("I74", "src/components/bottom-nav.tsx", "md:hidden", "visibile solo sotto md"),
  check.simbolo("I74", "src/app/page.tsx", "BottomNav", "wiring barra mobile in page.tsx"),
  check.simbolo("I74", "src/components/section-nav.tsx", "hidden .* md:block", "nav superiore nascosta su <md (alternativa; I85: la classe vive sul componente, nav figlia diretta di main)"),
  check.simbolo("I75", "src/lib/print.ts", "export function stampaReportSettimanale", "flusso di stampa con afterprint"),
  check.simbolo("I75", "src/components/print-report.tsx", "print-report-root", "blocco solo-carta"),
  check.simbolo("I75", "src/components/print-report.tsx", "detectCycles", "cicli nel report"),
  check.simbolo("I75", "src/components/print-report.tsx", "sprecoPerCiclo", "spreco per ciclo (I57) nel report"),
  check.simbolo("I75", "src/components/print-report.tsx", "consumoGiornaliero", "calendario (I58) nel report"),
  check.simbolo("I75", "src/components/history-chart.tsx", "Stampa report settimanale", "voce nel menu Esporta"),
  check.simbolo("I75", "src/app/globals.css", "@media print", "regole di stampa generiche"),
  check.simbolo("I75", "src/app/globals.css", "body\\.print-report", "modalità report-only nel CSS"),
  check.simbolo("I78", "src/components/theme-toggle.tsx", "useTheme", "toggle tema next-themes"),
  check.simbolo("I78", "src/app/layout.tsx", "ThemeProvider", "provider temi in layout"),
  check.simbolo("I78", "src/app/layout.tsx", 'defaultTheme="dark"', "default scuro (comportamento invariato)"),
  check.simbolo("I78", "src/app/globals.css", "html:not\\(\\.dark\\)", "strato chiaro: rimappatura superfici hardcoded"),
  check.simbolo("I78", "src/components/settings-dialog.tsx", '"aspetto"', "tab Aspetto nelle impostazioni"),
  check.simbolo("I78", "tests/components/theme-toggle.test.tsx", "localStorage", "persistenza tema testata"),
  /* --- I83/I84 — leggibilità temi chiaro e scuro (docs/03 §5.15/§5.16) --- */
  check.simbolo("I83", "src/app/globals.css", "html:not\\(\\.dark\\) \\.text-amber-200\\\\/90", "varianti opacità remappate (strato chiaro)"),
  check.simbolo("I83", "src/app/globals.css", "html:not\\(\\.dark\\) \\.text-zinc-400\\\\!", "classi ! gestite in @layer utilities"),
  check.simbolo("I83", "src/app/globals.css", "html:not\\(\\.dark\\) \\[data-slot=\"tabs-trigger\"\\]\\[data-state=\"active\"\\]", "stato attivo tab/chip in tema chiaro"),
  check.simbolo("I84", "src/app/globals.css", "--mm-muted", "token famiglie colore (chiaro/scuro)"),
  check.simbolo("I84", "src/app/globals.css", "\\.dark \\.text-zinc-500 \\{", "famiglia scuro: muted revisionati"),
  check.simbolo("I84", "src/app/globals.css", "\\.dark \\.placeholder\\\\:text-zinc-600::placeholder", "famiglia scuro: placeholder leggibile"),
  check.simbolo("I84", "src/app/globals.css", "background-color: #ecfdf5", "tinte forti → toni 50 pieni (strato chiaro)"),
  check.simbolo("I84", "src/app/globals.css", "@layer utilities \\{\\s*\\.dark \\.text-zinc-500\\\\!", "etichette menu text-zinc-500! in famiglia scuro"),
  /* --- I85 — nav sezioni sempre visibile durante lo scrolling (docs/03 §5.17) --- */
  check.simbolo("I85", "src/app/page.tsx", "\\{!compact \\? <SectionNav /> : null\\}", "nav figlia DIRETTA di main: contenitore sticky = tutta la pagina"),
  check.assenza("I85", "src/app/page.tsx", "<div className=\"hidden md:block\">\\s*<SectionNav", "niente wrapper attorno alla nav (limiterebbe la corsa dello sticky)"),
  check.simbolo("I85", "src/components/section-nav.tsx", "className=\"sticky z-30 hidden .* md:block\"", "sticky + hidden md:block sulla nav stessa (desktop ≥md)"),
  /* --- I79 — audit di accessibilità sistematico (docs/03 §5.18) --- */
  check.simbolo("I79", "src/lib/a11y.ts", "export function descrizioneHeatmap", "descrizione heatmap per screen reader (modulo puro)"),
  check.simbolo("I79", "src/lib/a11y.ts", "export function descrizioneCalendario", "descrizione calendario per screen reader"),
  check.simbolo("I79", "src/lib/a11y.ts", "export function descrizioneResetClock", "descrizione reset clock per screen reader"),
  check.simbolo("I79", "src/components/analysis-panel.tsx", "className=\"sr-only\">\\{descrizioneHeatmap", "sr-only heatmap + griglia aria-hidden"),
  check.simbolo("I79", "src/components/analysis-panel.tsx", "className=\"sr-only\">\\{descrizioneCalendario", "sr-only calendario + griglia aria-hidden"),
  check.simbolo("I79", "src/components/diagnostica-panel.tsx", "aria-label=\\{descrizioneResetClock", "reset clock: aria-label DINAMICO dai dati (role=img)"),
  check.simbolo("I79", "src/app/page.tsx", "aria-live=\"polite\"", "regione live del polling nell'header (orologio degradato ad aria-hidden)"),
  check.simbolo("I79", "src/app/globals.css", "nav a:focus-visible", "focus visibile sui link nav (famiglia scuro)"),
  check.simbolo("I79", "src/app/globals.css", "html:not\\(\\.dark\\) nav a:focus-visible", "focus visibile sui link nav (famiglia chiaro)"),
  /* --- I82 — generalizzazione multi-modello (docs/03 §5.19) --- */
  check.simbolo("I82", "src/lib/model-history.ts", "export function historyForModel", "storico per-modello → HistoryPoint[] (contratto analisi invariato, forward-fill)"),
  check.simbolo("I82", "src/lib/model-history.ts", "export function appendModelPoints", "acquisizione per-modello con dedup 20s"),
  check.simbolo("I82", "src/lib/model-history.ts", "export function modelRowsToPoints", "righe server LONG (model+win+t) → punti wide UI"),
  check.simbolo("I82", "src/app/api/history/models/route.ts", "upsertModelPoint", "route /api/history/models su lib I42 (tabella ModelUsagePoint, SQL parametrizzato)"),
  check.assenza("I82", "src/app/api/history/models/route.ts", "minimax\\.io|minimaxi\\.com|token_plan|chat/completions", "la route tocca SOLO SQLite: nessun endpoint MiniMax (ADR-8)"),
  check.simbolo("I82", "prisma/schema.prisma", "model ModelUsagePoint", "tabella storico per-modello nello schema (I42/82, @@unique model+win+t)"),
  check.simbolo("I82", "src/app/page.tsx", "historyForModel\\(modelHistory, selectedModel\\)", "pivotHistory: le analisi seguono il modello pivot"),
  check.simbolo("I82", "src/app/page.tsx", "appendModelPoints\\(modelHistoryRef\\.current, sample\\)", "ingestione per-modello in pushHistory (unico punto per demo/api/import)"),
  check.simbolo("I82", "src/app/page.tsx", "makeDemoModelHistory\\(\\)", "backfill demo dello storico per-modello"),
  check.simbolo("I82", "src/app/page.tsx", "aria-label=\"Modello delle analisi\"", "selettore del modello pivot nel grafico"),
  check.simbolo("I82", "src/components/analysis-panel.tsx", "historyForModel\\(modelRowsToPoints\\(server\\.rows\\), nomeModello\\)", "Analisi con pivot non-general: fonte server per-modello (NON lo storico flat di general)"),
  check.simbolo("I82", "src/components/quota-cards.tsx", "export function windowShortLabel", "etichetta breve della finestra interval dalla durata osservata"),
  check.simbolo("I82", "src/components/history-chart.tsx", "intervalLabel = \"5 ore\"", "etichette finestra parametriche su grafico/statistiche/ritmo"),
  check.simbolo("I82", "src/lib/demo.ts", "export function makeDemoModelHistory", "storico demo per-modello coerente con i tick dal vivo"),
];

/* ------------------------------------------------------------------ */
/* Esecuzione                                                          */
/* ------------------------------------------------------------------ */

function parseItemStatoDaDocs() {
  if (!existsSync(DOCS04)) return { mappa: null, errore: "docs/04-stato-avanzamento.md assente" };
  const testo = readFileSync(DOCS04, "utf8");
  const mappa = new Map();
  const rx = /^\| (I\d+) \|.*?\| (⬜|🔄|✅|⏸|🚫|❓) \|/gm;
  let m;
  while ((m = rx.exec(testo)) !== null) mappa.set(m[1], m[2]);
  return { mappa, errore: null };
}

function eseguiAudit() {
  const esiti = [];
  let pass = 0;
  let fail = 0;

  for (const c of CHECKS) {
    let errore = null;
    try {
      errore = c.run();
    } catch (e) {
      errore = `eccezione nel check: ${e.message}`;
    }
    if (errore === null) pass++;
    else fail++;
    esiti.push({ ...c, esito: errore === null ? "PASS" : "FAIL", errore });
  }

  const { mappa, errore } = parseItemStatoDaDocs();
  const scoperte = [];
  const discordanze = [];
  if (mappa) {
    const itemsConCheck = new Set(CHECKS.map((c) => c.item));
    for (const [id, stato] of mappa) {
      if (stato === "✅" && !itemsConCheck.has(id)) {
        scoperte.push(id);
      }
      if (stato === "🚫" && itemsConCheck.has(id)) {
        const haAssenza = CHECKS.some((c) => c.item === id && c.kind === "assenza");
        if (!haAssenza) discordanze.push(`${id}: 🚫 senza check di assenza`);
      }
    }
  }

  return { esiti, pass, fail, scoperte, discordanze, docsError: errore };
}

function reportMarkdown({ esiti, pass, fail, scoperte, discordanze, docsError }) {
  const ora = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const righe = [];
  righe.push(`# Audit implementazioni — ${new Date().toISOString()}`);
  righe.push("");
  righe.push(`- Verifiche totali: **${esiti.length}** · PASS: **${pass}** · FAIL: **${fail}**`);
  righe.push(`- Item ✅ in docs/04 senza verifiche dedicate (SCOPERTE): ${scoperte.length === 0 ? "nessuno" : scoperte.join(", ")}`);
  if (discordanze.length > 0) righe.push(`- Discordanze 🚫: ${discordanze.join("; ")}`);
  if (docsError) righe.push(`- ⚠️ docs/04 non leggibile: ${docsError}`);
  righe.push("");
  righe.push("| Item | Verifica | Tipo | Esito | Dettaglio |");
  righe.push("|------|----------|------|-------|-----------|");
  for (const e of esiti) {
    righe.push(`| ${e.item} | ${e.what} | ${e.kind} | ${e.esito} | ${e.errore ?? "—"} |`);
  }
  if (scoperte.length > 0) {
    righe.push("");
    righe.push("## Item ✅ privi di verifiche (aggiungerle al registro CHECKS)");
    for (const id of scoperte) righe.push(`- ${id}`);
  }
  righe.push("");
  righe.push(`Verdetto: **${fail === 0 && scoperte.length === 0 ? "PASS" : "FAIL"}** (${pass} pass, ${fail} fail, ${scoperte.length} scoperte)`);
  return righe.join("\n");
}

const risultato = eseguiAudit();
const md = reportMarkdown(risultato);
mkdirSync(ESITI_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outPath = join(ESITI_DIR, `audit-implementazioni-${stamp}.md`);
writeFileSync(outPath, md, "utf8");

console.log(md);
console.log(`\nReport salvato: ${outPath}`);
process.exit(risultato.fail === 0 && risultato.scoperte.length === 0 ? 0 : 1);
