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
import { execSync } from "node:child_process";

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
  /** Il file contiene il contatore reale valutato ALL'ESCUZIONE (I105: README ↔ audit auto-coerenti). */
  contatore: (item, rel, forma, what) => ({
    item,
    what: `${what} — contatore dinamico`,
    kind: "simbolo",
    run: () => {
      const c = read(rel);
      if (c === null) return `file assente: ${rel}`;
      const rx = new RegExp(forma(CHECKS.length), "m");
      return rx.test(c) ? null : `contatore non allineato in ${rel}: atteso /${forma(CHECKS.length)}/`;
    },
  }),
  /** Nessun percorso corrispondente è tracciato da git (I97: artefatti fuori dall'indice). */
  nonTracciato: (item, pattern, what) => ({
    item,
    what: `${what} — nessun file tracciato deve corrispondere`,
    kind: "assenza",
    run: () => {
      const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      const rx = new RegExp(`^${pattern}$`, "m");
      const hit = tracked.split("\n").filter((f) => rx.test(f));
      return hit.length === 0 ? null : `file ancora tracciati che devono restare fuori dall'indice: ${hit.slice(0, 8).join(", ")}${hit.length > 8 ? ` (+${hit.length - 8} altri)` : ""}`;
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
  /* I92: la cache snapshot non esiste più (rimossa con il suo fallback) —
     l'intento del fix «1004 cachato» è ora garantito in modo più forte:
     NESSUNA risposta del proxy usage finisce in Cache Storage. */
  check.assenza("I52", "public/sw.js", "api/minimax/usage|c\\.put\\(SNAPSHOT", "nessuna cache delle risposte usage (fix 1004 cachato, superato da I92)"),
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
  /* --- I85 — nav sezioni sempre visibile durante lo scrolling (docs/03 §5.17; condizione
         riallineata a I87: la nav è nascosta anche nel kiosk) --- */
  check.simbolo("I85", "src/app/page.tsx", "\\{!compact && !kioskAttivo \\? <SectionNav /> : null\\}", "nav figlia DIRETTA di main: contenitore sticky = tutta la pagina (nascosta in compact e kiosk)"),
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
  /* --- I86 — riconciliazione dei residui dell'era 08/10 (docs/03 §5.20) --- */
  check.nessunFile("I86", "src/app/api", "^verifiche$", "route Task 7 api/verifiche RIMOSSA (coerenza ADR-13-R: nessun endpoint che spawn di processi)"),
  check.nessunFile("I86", "src/app/api", "^route\\.ts$", "scaffold api/route.ts rimosso"),
  /* I86/I49 — campionatore CONDIZIONALE: fuori campagna DEVE essere dormiente (nessun wiring);
     durante la campagna V8 il wiring è ammesso SOLO dentro il blocco marcato «CAMPAGNA V8»
     (protocollo ADR-13-R2, montaggio/smontaggio docs/05 §11). */
  {
    item: "I86",
    what: "campionatore I49 dormiente FUORI campagna / ri-cablato SOLO con blocco marcato CAMPAGNA V8 (ADR-13-R2)",
    kind: "condizione",
    run: () => {
      const route = read("src/app/api/minimax/usage/route.ts");
      if (route === null) return "file assente: src/app/api/minimax/usage/route.ts";
      const wiring = /lib\/campione/.test(route);
      const marcato = /CAMPAGNA V8/.test(route);
      if (wiring && !marcato) return "wiring del campionatore presente SENZA blocco marcato CAMPAGNA V8 (violazione ADR-13-R2: smontaggio a fine campagna)";
      if (!wiring && marcato) return "blocco marcato CAMPAGNA V8 presente ma wiring assente (blocco incompleto)";
      return null; // dormiente (nessuno dei due) o campagna attiva ben formata: entrambi OK
    },
  },
  check.simbolo("I86", "src/lib/campione.ts", "export (async )?function campionaRisposta", "contratto del campionatore superstite (dormiente, per la campagna V8)"),
  check.simbolo("I86", "src/lib/version.ts", "export const APP_VERSION", "marcatore versione (I46): fonte unica"),
  check.simbolo("I86", "src/app/page.tsx", "APP_VERSION", "versione renderizzata nel footer"),
  /* I86/I49 — cattura chiave TEMPORANEA: il riferimento a .chiave-sessione in src/app è
     ammesso SOLO durante la campagna V8 marcata (ADR-13 ri-armato su autorizzazione
     utente 12/10); fuori campagna l'app non deve né leggere né scrivere file chiave. */
  {
    item: "I86",
    what: "nessun riferimento a file chiave in src/app FUORI dal blocco marcato CAMPAGNA V8 (ADR-13-R intatto)",
    kind: "condizione",
    run: () => {
      const route = read("src/app/api/minimax/usage/route.ts");
      if (route === null) return "file assente: src/app/api/minimax/usage/route.ts";
      const routeHasChiave = /chiave-sessione/.test(route);
      const marcato = /CAMPAGNA V8/.test(route);
      if (routeHasChiave && !marcato) return "riferimento a .chiave-sessione senza blocco marcato CAMPAGNA V8 (violazione ADR-13-R)";
      if (!routeHasChiave) {
        // fuori campagna: verifica estesa su src/app (spawn processi e file chiave)
        const rx = /chiave-sessione|spawn\(\s*["']node/;
        const SKIP = /node_modules|\.next|^\./;
        const walk = (dir) =>
          readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
            if (SKIP.test(d.name)) return [];
            const full = join(dir, d.name);
            return d.isDirectory() ? walk(full) : [full];
          });
        for (const f of walk(join(ROOT, "src", "app"))) {
          if (rx.test(readFileSync(f, "utf8"))) return `riferimento non ammesso in ${f}: /chiave-sessione|spawn("node…)/`;
        }
      }
      return null;
    },
  },
  /* --- I87 — modalità kiosk/TV (docs/03 §5.20) --- */
  check.files("I87", ["src/lib/kiosk.ts", "src/components/kiosk-bar.tsx"], "modulo kiosk (puro) + barra di controllo"),
  check.simbolo("I87", "src/lib/kiosk.ts", "export function readKioskMode", "parsing ?kiosk=1 (semantica readCompactMode)"),
  check.simbolo("I87", "src/lib/kiosk.ts", "export function isNightRome", "finestra notturna dimming 22:00–06:59 Europe/Rome"),
  check.simbolo("I87", "src/app/page.tsx", "<KioskBar", "barra kiosk cablata (sostituisce footer e nav mobile)"),
  check.simbolo("I87", "src/app/page.tsx", "nextKioskView", "rotazione automatica delle viste"),
  check.simbolo("I87", "src/app/page.tsx", "isNightRome", "dimming notturno cablato (overlay z-45 sotto la barra)"),
  check.simbolo("I87", "src/app/page.tsx", "kioskHref\\(", "URL sincronizzato via history.replaceState"),
  check.simbolo("I87", "src/app/page.tsx", "e\\.key === \"Escape\"", "uscita con Esc"),
  check.simbolo("I87", "src/app/page.tsx", "aria-label=\"Attiva modalità kiosk\"", "toggle di ingresso nell'header"),
  check.simbolo("I87", "src/components/kiosk-bar.tsx", "Esci dal kiosk", "uscita sempre disponibile dalla barra sticky"),
  check.simbolo("I87", "src/components/kiosk-bar.tsx", "APP_VERSION", "versione resa anche nella barra kiosk (I46)"),
  /* --- I53 — multi-regione simultanea (docs/03 §5.21) --- */
  check.simbolo("I53", "src/lib/minimax.ts", "export function regioneAlt", "regione opposta (eu↔cn)"),
  check.simbolo("I53", "src/lib/minimax.ts", "export function chiaviPerRegione", "coppie {region,key} della campagna parallela (dedup chiave doppia)"),
  check.simbolo("I53", "src/components/settings-dialog.tsx", "apiKeyAlt", "settings multi-chiave (seconda chiave opzionale, retrocompatibile)"),
  check.simbolo("I53", "src/components/settings-dialog.tsx", "regioneAlt\\(region\\)", "etichetta dinamica della seconda regione nel dialog"),
  check.simbolo("I53", "src/components/region-alt-panel.tsx", "export function RegionAltPanel", "pannello della seconda regione (solo visualizzazione)"),
  check.simbolo("I53", "src/app/page.tsx", "Promise\\.allSettled", "campagna di fetch PARALLELA per regione"),
  check.simbolo("I53", "src/app/page.tsx", "chiaviPerRegione", "coppie di interrogazione derivate dalle impostazioni"),
  check.simbolo("I53", "src/app/page.tsx", "<RegionAltPanel", "pannello cablato nella sezione Panoramica"),
  check.simbolo("I53", "src/components/tech-panels.tsx", "Seconda regione", "riga TechInfo con stato della secondaria"),
  check.assenza("I53", "src/app/page.tsx", "pushHistory\\(snapAlt\\)", "lo snapshot secondario NON entra nello storico (integrità analisi §5.21)"),
  /* --- I48 — verifica «demo ↔ API ufficiale» (docs/01 §11, esiti su file) --- */
  check.simbolo("I48", "docs/01-api-minimax-ricerca.md", "^## 11\\. ", "matrice demo ↔ API ri-creata (era §11.2, persa col rollback)"),
  check.simbolo("I48", "docs/01-api-minimax-ricerca.md", "fedele al 100%", "verdetto della verifica registrato nella docs"),
  check.simbolo("I48", "scripts/verifiche/verifica-i48-demo-vs-api.ts", "makeDemoSnapshot", "script di verifica riproducibile (bun, zero rete, zero chiavi)"),
  check.simbolo("I48", "scripts/verifiche/verifica-i48-demo-vs-api.ts", "1790939878714", "t_query reale derivato (triangolazione docs/02 §4.2) incorporato"),
  check.file("I48", "scripts/verifiche/esiti/i48-demo-vs-api-latest.md", "esito persistente a nome stabile (lezione rollback: nessun verdetto senza artefatto)"),
  /* --- I54 — verifica coerenza inversa «live ↔ demo» (docs/03 §5.22) --- */
  check.simbolo("I54", "docs/03-piano-implementazione.md", "^### 5\\.22 ", "matrice live ↔ demo ricostruita (era §5.9, persa col rollback)"),
  check.simbolo("I54", "docs/03-piano-implementazione.md", "live ⊇ demo", "verdetto della verifica registrato nella docs"),
  check.simbolo("I54", "scripts/verifiche/verifica-i54-live-vs-demo.mjs", "live ⊇ demo", "script di verifica riproducibile (evidenze statiche su file)"),
  check.simbolo("I54", "scripts/verifiche/verifica-i54-live-vs-demo.mjs", "tipo: \"assenza\"", "assenze richieste verificate esplicitamente (nessun fork nel parser/kiosk)"),
  check.file("I54", "scripts/verifiche/esiti/i54-live-vs-demo-latest.md", "esito persistente a nome stabile"),
  /* --- I49/I56 — campagna campionatore V8 con chiave reale (docs/03 §5.23, docs/05 §11) --- */
  check.files("I49", ["scripts/verifiche/analisi-reset-timezone.mjs", "scripts/verifiche/campione-live.jsonl"], "analizzatore fuso reset ri-creato + file campione commesso come prova grezza (205 righe: 122 del 09/10 recuperate + 83 fresche)"),
  check.file("I56", "scripts/verifiche/esiti/v8-fuso-reset-latest.md", "verdetto V8 «blocchi fissi UTC» su esito stabile a nome persistente"),
  check.files("I56", ["scripts/verifiche/esiti/v4-2026-10-12T12-56-18.json", "scripts/verifiche/esiti/v5-2026-10-12T12-56-24.json", "scripts/verifiche/esiti/v6-2026-10-12T13-19-29.json"], "esiti rapidi con chiave reale commessi (V4/V5/V6, 12/10)"),
  /* --- I88 — fix bug latente test-infra: localStorage distrutto dal cleanup kiosk --- */
  check.simbolo("I88", "tests/lib/kiosk.test.ts", "getOwnPropertyDescriptor", "descrittore originale catturato (happy-dom window===globalThis: il delete eliminava la proprietà own PER SEMRE)"),
  check.simbolo("I88", "tests/lib/kiosk.test.ts", "defineProperty", "ripristino del descrittore in afterEach (mai delete secco)"),
  check.simbolo("I88", "tests/lib/usage-events.test.ts", "afterAll", "secondo polluter (mock usage-events) ripristinato con afterAll"),
  check.file("I88", "scripts/verifiche/prova-bug-localstorage.ts", "prova meccanista window===globalThis commessa (prima/durante/dopo)"),
  /* --- I89 — aggiornamento stack alle ultime versioni (fase 1 bun update + fase 2 major) --- */
  check.nessunFile("I89", "src/components/ui", "^chart\\.tsx$", "ui/chart.tsx shadcn RIMOSSO (dead code 353 righe incompatibile con recharts 3, precedente I86)"),
  check.simbolo("I89", "docs/04-stato-avanzamento.md", "TypeScript 7", "voci tenute indietro con motivo documentato (TS 7, Prisma 7/8, eslint 10)"),
  check.simbolo("I89", "docs/04-stato-avanzamento.md", "react-day-picker", "wrapper shadcn non importati tenuti indietro con motivo (upgrade con rigenerazione)"),
  /* --- I90 — passata «React Compiler-ready»: regole react-hooks v7 riattivate (docs/04 §7) --- */
  check.assenza("I90", "eslint.config.mjs", "set-state-in-effect...off", "set-state-in-effect RIATTIVATA (niente più off in config)"),
  check.assenza("I90", "eslint.config.mjs", "react-hooks/refs...off", "refs RIATTIVATA (niente più off in config)"),
  check.simbolo("I90", "eslint.config.mjs", "React Compiler-ready", "motivazione della riattivazione documentata in config"),
  check.nessunFile("I90", "src/components/ui", "^carousel\\.tsx$", "ui/carousel.tsx shadcn RIMOSSO (dead code a zero import, precedente I86)"),
  check.simbolo("I90", "src/hooks/use-mobile.ts", "useSyncExternalStore", "hook shadcn convertito (niente setState sincrono in effect)"),
  check.simbolo("I90", "src/components/theme-toggle.tsx", "useSyncExternalStore", "mounted-guard senza setState in effect"),
  check.simbolo("I90", "src/components/section-nav.tsx", "useSyncExternalStore", "offset nav come misura da store esterno"),
  check.simbolo("I90", "src/app/page.tsx", "queueMicrotask", "caricamento persisted differito a microtask (init senza setState sincroni)"),
  check.simbolo("I90", "src/app/page.tsx", "pollDelayMs", "ritardo scheduler come STATO (le ref non si leggono in render)"),
  check.simbolo("I90", "src/components/analysis-panel.tsx", "setRemote\\(null\\)", "reset pivot in fase di render (coppia remoteRef+serverVersion eliminata)"),
  check.simbolo("I90", "src/components/settings-dialog.tsx", "prevReset", "reset form all'apertura con aggiustamento in render"),
  check.simbolo("I90", "src/lib/ring-color.ts", "prevValue", "casi istantanei AnimatedPercent con aggiustamento in render"),
  // I91 — refactoring + bug hunting: 2 bug reali corretti, dead code rimosso, DRY (stats/http-validate)
  check.assenza("I91", "src/app/page.tsx", "weekly === null && general === undefined", "vecchia guardia codice morto RIMOSSA da pushHistory (produceva punto finto {100,100})"),
  check.simbolo("I91", "src/app/page.tsx", "flatPointFromGeneral\\(", "punto flat «general» costruito con la funzione pura condivisa"),
  check.simbolo("I91", "src/lib/model-history.ts", "export function flatPointFromGeneral", "costruzione del punto flat estratta e testabile"),
  check.simbolo("I91", "src/app/page.tsx", "prevSnapRef\\.current = null;", "transizioni azzerate al cambio connessione (niente falsi reset eu→cn / demo→api)"),
  check.assenza("I91", "src/lib/rate.ts", "vCurr - vPrev >= RESET_JUMP", "disgiuntiva irraggiungibile rimossa (la risalita copre già il reset)"),
  check.assenza("I91", "src/lib/ewma.ts", "RESET_JUMP", "disgiuntiva irraggiungibile rimossa + import ripulito"),
  check.simbolo("I91", "src/lib/stats.ts", "export function medianaDi", "mediana condivisa (DRY: era duplicata in sampling/rate-anomalies/cycles)"),
  check.assenza("I91", "src/lib/sampling.ts", "function medianaDi", "copia locale rimossa (usa lib/stats)"),
  check.assenza("I91", "src/lib/rate-anomalies.ts", "function medianaDi", "copia locale rimossa (usa lib/stats)"),
  check.simbolo("I91", "src/lib/http-validate.ts", "export function toEpoch", "validazione HTTP condivisa (DRY: era duplicata in 3 routes)"),
  check.assenza("I91", "src/app/api/events/route.ts", "function toEpoch", "copia locale rimossa (usa lib/http-validate)"),
  check.assenza("I91", "src/app/api/history/models/route.ts", "function toFloat", "copia locale rimossa (usa lib/http-validate)"),
  check.simbolo("I91", "tests/lib/flat-history.test.ts", "flatPointFromGeneral", "test di regressione del punto finto {100,100}"),

  /* --- I92 — diagnostica e ricerca di bug: fix offline SW, normalizzazione risposte archivio, cleanup PwaRegister, dead-code toast/embla --- */
  check.assenza("I92", "public/sw.js", "SNAPSHOT_KEY\\s*=|match\\(SNAPSHOT_KEY\\)", "cache «ultimo snapshot» RIMOSSA (payload senza consumatore GET, avvelenava il fallback offline)"),
  check.simbolo("I92", "public/sw.js", "mm-dash-v2", "cache bump a v2 (attivazione elimina le voci stale mm-dash-v1)"),
  check.simbolo("I92", "src/lib/server-response.ts", "export function parseServerListResponse", "normalizzazione condivisa delle risposte archivio (total garantito number)"),
  check.simbolo("I92", "src/lib/server-history.ts", "parseServerListResponse<ServerPoint>", "fetchServerHistory usa il normalizzatore"),
  check.simbolo("I92", "src/lib/server-history.ts", "parseServerListResponse<ServerHourBucket>", "fetchServerHourly usa il normalizzatore"),
  check.simbolo("I92", "src/lib/server-events.ts", "parseServerListResponse<ServerEventRow>", "fetchServerEvents usa il normalizzatore"),
  check.simbolo("I92", "tests/lib/server-response.test.ts", "vecchio fallback SW", "test di regressione del payload degradato {ok:true} senza total"),
  check.simbolo("I92", "src/components/pwa-register.tsx", "removeEventListener\\(\"visibilitychange\"", "cleanup PwaRegister COMPLETO (prima: listener anonimo mai rimosso)"),
  check.simbolo("I92", "src/components/pwa-register.tsx", "removeEventListener\\(\"message\"", "listener message del SW rimosso nel cleanup"),
  check.nessunFile("I92", "src/components/ui", "^(toast|toaster)\\.tsx$", "stack shadcn toast RIMOSSO (dead code: la dashboard usa sonner)"),
  check.nessunFile("I92", "src/hooks", "^use-toast\\.ts$", "hook use-toast RIMOSSO (dead code, unico consumatore era ui/toaster)"),
  check.assenza("I92", "package.json", "react-toast|embla-carousel", "dipendenze morte rimosse (@radix-ui/react-toast, embla-carousel-react senza consumatori)"),

  /* --- I93 — diagnostica e ricerca di bug: GET archivio serve la fetta PIÙ RECENTE (3 punti), dead-code parseWindow --- */
  check.simbolo("I93", "src/app/api/history/route.ts", "orderBy: \\{ t: \"desc\" \\}", "GET storico: la fetta servita è la PIÙ RECENTE (era asc = più vecchi)"),
  check.simbolo("I93", "src/app/api/history/route.ts", "rows\\.reverse\\(\\)", "GET storico: output restaurato cronologico dopo la selezione desc"),
  check.simbolo("I93", "src/app/api/events/route.ts", "orderBy: \\{ t: \"desc\" \\}", "GET eventi: la fetta servita è la PIÙ RECENTE (era asc = più vecchi)"),
  check.simbolo("I93", "src/app/api/events/route.ts", "rows\\.reverse\\(\\)", "GET eventi: output restaurato cronologico dopo la selezione desc"),
  check.simbolo("I93", "src/lib/server-model-history.ts", "ORDER BY \\\"t\\\" DESC", "findModelPoints: fetta PIÙ RECENTE (era ASC = righe più vecchie)"),
  check.simbolo("I93", "src/lib/server-model-history.ts", "rows\\.reverse\\(\\)", "findModelPoints: output restaurato cronologico dopo la selezione DESC"),
  check.simbolo("I93", "tests/lib/archive-recent.test.ts", "fetta PIÙ RECENTE", "test di regressione route-level con db mockato (query desc + output cronologico)"),
  check.assenza("I93", "src/lib/minimax.ts", "prefix", "parametro parseWindow «prefix» RIMOSSO (dead code: mai usato)"),
  check.assenza("I93", "public/sw-shared.js", "var p = kind === \"weekly\"", "variabile «p» RIMOSSA dal parseWindow del mirror SW (dead code, mai letta)"),

  /* --- I94 — CI GitHub Actions + baseline dei tipi onesta --- */
  check.simbolo("I94", "tsconfig.json", "\"examples\"", "tsconfig esclude examples/ (scaffolding non-progetto: tsc onesto su tutto il repo)"),
  check.simbolo("I94", "tsconfig.json", "\"skills\"", "tsconfig esclude skills/ (scaffolding non-progetto)"),
  check.assenza("I94", "next.config.ts", "ignoreBuildErrors", "next.config NON maschera più i tipi al build (ignoreBuildErrors rimosso)"),
  check.simbolo("I94", "package.json", "\"typecheck\": \"tsc --noEmit\"", "script typecheck dichiarato in package.json"),
  check.simbolo("I94", "package.json", "\"audit\": \"node scripts/verifiche/audit-implementazioni.mjs\"", "script audit dichiarato in package.json"),
  check.file("I94", ".github/workflows/ci.yml", "workflow CI GitHub Actions presente"),
  check.simbolo("I94", ".github/workflows/ci.yml", "bun run typecheck", "CI esegue il typecheck"),
  check.simbolo("I94", ".github/workflows/ci.yml", "bun run test", "CI esegue la suite"),
  check.simbolo("I94", ".github/workflows/ci.yml", "bun run audit", "CI esegue l'audit di riconciliazione"),
  check.file("I94", ".github/dependabot.yml", "dependabot settimanale (npm + actions) presente"),

  /* --- I97 — igiene del repository git: artefatti di sessione fuori dall'indice --- */
  check.simbolo("I97", ".gitignore", "scripts/verifiche/esiti/\\*", ".gitignore: esiti/ ignorati (contenuto, non la directory)"),
  check.simbolo("I97", ".gitignore", "!scripts/verifiche/esiti/audit-latest\\.md", ".gitignore: audit-latest.md esplicitamente NON ignorato (unica evidenza tracciata)"),
  check.simbolo("I97", ".gitignore", "db/\\*\\.db", ".gitignore: database runtime ignorato (fine dei commit DB separati, lezione I30)"),
  check.assenza("I97", ".gitignore", "^test$", "entry ambigua «test» rimossa (ignorava QUALSIASI file/dir «test» nel repo) → sostituita da /test"),
  check.file("I97", "scripts/verifiche/esiti/audit-latest.md", "esito audit corrente tracciato con nome fisso (evidenza pubblica)"),
  check.nonTracciato("I97", "tool-results/.*", "tool-results/ fuori dall'indice"),
  check.nonTracciato("I97", "upload/.*", "upload/ fuori dall'indice"),
  check.nonTracciato("I97", "db/.*\\.db", "db runtime fuori dall'indice"),
  check.nonTracciato("I97", "scripts/.*\\.png", "PNG di verifica di sessione fuori dall'indice"),
  check.nonTracciato("I97", "scripts/verifiche/(esiti|esiti-backup)/(?!audit-latest\\.md).+", "esiti storici fuori dall'indice (restano su disco e nella storia git)"),

  /* --- I105 — coerenza di versione, README e metadati (contatori presidiati: aggiornare README a ogni cambio) --- */
  check.simbolo("I105", "package.json", "\"name\": \"minimax-usage-monitor\"", "name npm coerente col progetto (era nextjs_tailwind_shadcn_ts)"),
  check.assenza("I105", "package.json", "nextjs_tailwind_shadcn_ts", "name generico scaffolding RIMOSSO"),
  check.contatore("I105", "README.md", (n) => `audit-${n}_PASS`, "badge audit allineato al numero reale dei check"),
  check.contatore("I105", "README.md", (n) => `${n} verifiche dichiarative`, "contatore audit §Qualità allineato"),
  check.simbolo("I105", "README.md", "358 test / 1013 asserzioni", "contatori suite §Struttura/§Qualità allineati (aggiornare a ogni aggiunta test)"),
  check.simbolo("I105", "README.md", "01–08", "indice documentazione README completo (docs/08 incluso)"),
  check.simbolo("I105", "README.md", "docs/08-analisi-codebase-miglioramenti\\.md", "docs/08 presente nella tabella indice del README"),
  check.simbolo("I105", "README.md", "changelog canonico", "README dichiara il changelog canonico (docs/04 §8) e APP_VERSION come riferimento versione"),

  /* --- I98 — gestione esplicita della quota localStorage (persistJson unico punto di scrittura) --- */
  check.simbolo("I98", "src/lib/persist-json.ts", "export function persistJson", "helper centralizzato persistJson (unico punto di scrittura localStorage)"),
  check.simbolo("I98", "src/lib/persist-json.ts", "QuotaExceededError", "rilevamento esplicito dell'errore di quota (alias Firefox incluso)"),
  check.simbolo("I98", "src/lib/persist-json.ts", "setQuotaNotifier", "notifica registrabile una tantum per sessione (toast + evento tecnico fuori dal modulo)"),
  check.assenza("I98", "src/app/page.tsx", "localStorage\\.setItem", "page.tsx: nessun setItem diretto (tutte le scritture passano da persistJson — prima: 4 catch silenziosi)"),
  check.assenza("I98", "src/lib/usage-events.ts", "localStorage\\.setItem", "usage-events: nessun setItem diretto (prima: catch silenzioso sul registro eventi)"),
  check.assenza("I98", "src/lib/model-history.ts", "localStorage\\.setItem", "model-history: nessun setItem diretto (prima: catch silenzioso sullo storico per-modello)"),
  check.assenza("I98", "src/lib/kiosk.ts", "localStorage\\.setItem", "kiosk: nessun setItem diretto (sesto catch silenzioso individuato in implementazione)"),
  check.simbolo("I98", "src/app/page.tsx", "setQuotaNotifier\\(", "notifier cablato in page.tsx: toast sonner + evento tecnico «error» nel registro"),
  check.file("I98", "tests/lib/persist-json.test.ts", "test con storage finto che solleva QuotaExceededError (fallback FIFO, rinuncia, notifica una tantum)"),

  /* --- I100 — poller consapevole di rete e visibilità --- */
  check.simbolo("I100", "src/lib/backoff.ts", "export function ritardoPolling", "dilatazione ×4 a tab nascosta (pura, testata)"),
  check.simbolo("I100", "src/lib/backoff.ts", "export function tickAllaVisibilita", "tick al ritorno in visibilità solo se dati più vecchi di metà intervallo base"),
  check.simbolo("I100", "src/lib/backoff.ts", "FATTORE_TAB_NASCOSTA = 4", "dilatazione NON sospensione (coerenza badge/registri e verifiche V1–V6)"),
  check.simbolo("I100", "src/app/page.tsx", "addEventListener\\(\"online\", onOnline\\)", "scheduler: rientro rete → tick immediato (prima: attesa backoff fino a 10 min)"),
  check.simbolo("I100", "src/app/page.tsx", "addEventListener\\(\"visibilitychange\", onVisibility\\)", "scheduler: ritorno in visibilità → tick condizionato"),
  check.simbolo("I100", "src/app/page.tsx", "const tickImmediato", "tick immediato con reset del backoff (attempt riparte da 0)"),
  check.simbolo("I100", "src/app/page.tsx", "lastRilevamentoRef", "epoch ultimo rilevamento per il tick condizionato alla visibilità"),
  check.simbolo("I100", "src/app/page.tsx", "ritardoPolling\\(ms, document\\.visibilityState === \"hidden\"\\)", "schedule applica la dilatazione ×4 a tab nascosta"),
  check.simbolo("I100", "src/components/diagnostica-panel.tsx", "pollCausa", "Diagnostica mostra la causa dell'attesa (offline / tab nascosta; backoff già badge I51)"),
  check.simbolo("I100", "tests/lib/backoff.test.ts", "tickAllaVisibilita", "test delle decisioni pure di rete/visibilità"),

  /* --- I101 — prompt «nuova versione disponibile» per la PWA --- */
  check.simbolo("I101", "src/components/pwa-register.tsx", "setAggiornamentoPronto\\(true\\)", "nuovo SW installato in attesa → stato banner (prima: SKIP_WAITING automatico silenzioso)"),
  check.assenza("I101", "src/components/pwa-register.tsx", "nuovo\\.postMessage", "niente SKIP_WAITING AUTOMATICO sul worker installing (l'attivazione è esplicita via banner)"),
  check.simbolo("I101", "src/components/pwa-register.tsx", "Nuova versione disponibile", "banner persistente con testo esplicito"),
  check.simbolo("I101", "src/components/pwa-register.tsx", "Ricarica", "azione esplicita del banner"),
  check.simbolo("I101", "src/components/pwa-register.tsx", "controllerchange", "reload SOLO quando la nuova versione prende il controllo"),
  check.simbolo("I101", "tests/components/pwa-update.test.tsx", "SKIP_WAITING", "test componente: niente auto-skip, click → postMessage al worker in attesa"),

  /* --- I102 — skip-link e landmark di destinazione --- */
  check.simbolo("I102", "src/app/layout.tsx", "Salta al contenuto", "skip-link come PRIMO elemento focusabile (etichetta in italiano)"),
  check.simbolo("I102", "src/app/layout.tsx", "href=\\\"#contenuto\\\"", "destinazione: <main id=\"contenuto\">"),
  check.simbolo("I102", "src/app/layout.tsx", "sr-only focus:not-sr-only", "visibile SOLO on-focus (pattern Tailwind, famiglia focus-visible I79)"),
  check.simbolo("I102", "src/app/page.tsx", "<main id=\\\"contenuto\\\" tabIndex=\\{-1\\}", "main focalizzabile programmaticamente (niente anello gigante: outline-none)"),
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
