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
    /* I12 — dalla politica I97 i PNG di sessione sono fuori dall'indice: in CI il
       checkout non li contiene. Evidenza durevole ammessa anche in docs/assets/
       (5 PNG tracciati, catture browser README). Fix CI 15/10: OR tra le due sedi. */
    { item: "I12", what: "screenshot verifiche browser (scripts/*.png oppure docs/assets/*.png ≥ 1)", kind: "file", run: () => { const n = (existsSync(join(ROOT, "scripts")) ? readdirSync(join(ROOT, "scripts")).filter((f) => f.endsWith(".png")).length : 0) + (existsSync(join(ROOT, "docs", "assets")) ? readdirSync(join(ROOT, "docs", "assets")).filter((f) => f.endsWith(".png")).length : 0); return n > 0 ? null : "nessuno screenshot in scripts/ né in docs/assets/"; } },
    check.simbolo("I1", "package.json", '"next"|"react"|"tailwindcss"', "dipendenze Next/React/Tailwind"),
    check.file("I1", "src/components/ui", "componenti shadcn/ui"),
    check.simbolo("I2", "src/lib/minimax.ts", "export function parseUsageResponse", "parser principale"),
    check.simbolo("I2", "src/lib/minimax.ts", "export const REGION_ENDPOINTS", "endpoint regionali"),
    check.simbolo("I3", "src/app/api/minimax/usage/route.ts", "export async function POST", "handler proxy"),
    check.simbolo("I3", "src/app/api/minimax/usage/route.ts", "12_000|12\\\\,000|12\\\\000", "timeout 12s"),
    check.simbolo("I4", "src/lib/time.ts", 'export const TZ_ROME = "Europe/Rome"', "fuso Rome"),
    check.simbolo("I4", "src/lib/time.ts", "export function formatCountdown", "countdown"),
    check.simbolo("I4", "src/lib/time.ts", "export function windowProgress", "progresso finestra"),
    check.simbolo("I5", "src/components/quota-cards.tsx", "export const ModelCard = React\\.memo", "ModelCard (memoizzata da I96)"),
    check.simbolo("I5", "src/components/quota-cards.tsx", "export const MainWindows = React\\.memo", "MainWindows (memoizzato da I96)"),
    check.simbolo("I5", "src/components/quota-ring.tsx", "export function QuotaRing|export const QuotaRing", "QuotaRing"),
    check.simbolo("I6", "src/app/page.tsx", "setInterval\\(\\(\\) => setNow\\(Date.now\\(\\)\\), 30_000\\)", "orologio pagina (30 s da I96: il secondo vive nelle foglie useOrologio)"),
    check.simbolo("I6", "src/lib/minimax.ts", "export function inferServerTime", "ora server dedotta"),
    /* I124 — la chiave è migrata in storage-chiavi.ts (fonte unica condivisa
       con l'azione «Svuota storico locale»); il check segue il domicilio. */
    check.simbolo("I7", "src/lib/storage-chiavi.ts", '"mm-dash-history-v1"', "chiave storico locale (fonte unica I124, prima inline in page.tsx)"),
    check.simbolo("I124", "src/app/page.tsx", "const HISTORY_KEY = CHIAVE_STORICO", "page.tsx consuma la chiave dalla fonte unica (nessuna duplicazione della stringa)"),
    check.simbolo("I7", "src/components/history-chart.tsx", "export const HistoryChart = React\\.memo", "HistoryChart (memoizzato da I96)"),
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
  check.simbolo("I24", "src/components/model-table.tsx", "export const PanoramicTable = React\\.memo", "vista panoramica (memoizzata da I96)"),
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
  check.simbolo("I59", "src/components/history-chart.tsx", "export const RateChart = React\\.memo", "grafico ritmo (memoizzato da I96)"),
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
  check.simbolo("I53", "src/components/region-alt-panel.tsx", "export const RegionAltPanel = React\\.memo", "pannello della seconda regione (solo visualizzazione; memoizzato da I96)"),
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
  check.simbolo("I97", ".gitignore", "!scripts/verifiche/esiti/audit-latest\\.md", ".gitignore: audit-latest.md esplicitamente NON ignorato (evidenza corrente tracciata)"),
  check.simbolo("I97", ".gitignore", "db/\\*\\.db", ".gitignore: database runtime ignorato (fine dei commit DB separati, lezione I30)"),
  check.assenza("I97", ".gitignore", "^test$", "entry ambigua «test» rimossa (ignorava QUALSIASI file/dir «test» nel repo) → sostituita da /test"),
  check.file("I97", "scripts/verifiche/esiti/audit-latest.md", "esito audit corrente tracciato con nome fisso (evidenza pubblica)"),
  check.nonTracciato("I97", "tool-results/.*", "tool-results/ fuori dall'indice"),
  check.nonTracciato("I97", "upload/.*", "upload/ fuori dall'indice"),
  check.nonTracciato("I97", "db/.*\\.db", "db runtime fuori dall'indice"),
  check.nonTracciato("I97", "scripts/.*\\.png", "PNG di verifica di sessione fuori dall'indice"),
  check.nonTracciato("I97", "scripts/verifiche/(esiti|esiti-backup)/(?!(?:audit-latest\\.md|i48-demo-vs-api-latest\\.md|i54-live-vs-demo-latest\\.md|v8-fuso-reset-latest\\.md|v4-2026-10-12T12-56-18\\.json|v5-2026-10-12T12-56-24\\.json|v6-2026-10-12T13-19-29\\.json|i106-persistenza-latest\\.md|i110-turso-attivazione-latest\\.md)$).+", "esiti storici fuori dall'indice (restano su disco e nella storia git; tracciati solo audit-latest + evidenze a nome stabile I48/I54/I56/I106/I110)"),

  /* --- I105 — coerenza di versione, README e metadati (contatori presidiati: aggiornare README a ogni cambio) --- */
  check.simbolo("I105", "package.json", "\"name\": \"minimax-usage-monitor\"", "name npm coerente col progetto (era nextjs_tailwind_shadcn_ts)"),
  check.assenza("I105", "package.json", "nextjs_tailwind_shadcn_ts", "name generico scaffolding RIMOSSO"),
  check.contatore("I105", "README.md", (n) => `audit-${n}_PASS`, "badge audit allineato al numero reale dei check"),
  check.contatore("I105", "README.md", (n) => `${n} verifiche dichiarative`, "contatore audit §Qualità allineato"),
  check.simbolo("I105", "README.md", "644 test / 2332 asserzioni", "contatori suite §Struttura/§Qualità allineati (aggiornare a ogni aggiunta test)"),
  check.simbolo("I123", "README.md", "Suite test automatica\\*\\*: 644 test / 2332 asserzioni", "contatore §Qualità allineato al numero reale della suite — I122 aveva aggiornato solo §Struttura lasciando §Qualità a 560/1896"),
  check.simbolo("I123", "README.md", "test-644_pass", "badge test allineato al numero reale della suite — I122 lo aveva lasciato a 560"),
  check.simbolo("I105", "README.md", "01–11", "indice documentazione README completo (docs/11 incluso)"),
  check.simbolo("I105", "README.md", "docs/08-analisi-codebase-miglioramenti\\.md", "docs/08 presente nella tabella indice del README"),
  check.simbolo("I105", "README.md", "docs/09-analisi-database-alternativi\\.md", "docs/09 presente nella tabella indice del README"),
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

  /* --- I96 — performance del rendering client --- */
  check.file("I96", "src/lib/orologio.ts", "orologio condiviso a 1 Hz per le foglie vive"),
  check.simbolo("I96", "src/lib/orologio.ts", "export function useOrologio", "hook delle foglie vive (useSyncExternalStore, pattern I90/I100)"),
  check.simbolo("I96", "src/lib/orologio.ts", "setInterval\\(tick, 1000\\)", "intervallo 1 Hz avviato al primo abbonato"),
  check.simbolo("I96", "src/lib/orologio.ts", "ascoltatori\\.size === 0 && timer !== null", "timer fermato all'ultimo disiscritto (zero timer a riposo)"),
  check.assenza("I96", "src/app/page.tsx", "setInterval\\(\\(\\) => setNow\\(Date\\.now\\(\\)\\), 1000\\)", "fine del tick 1 s a livello pagina"),
  check.simbolo("I96", "src/app/page.tsx", "setInterval\\(\\(\\) => setNow\\(Date\\.now\\(\\)\\), 30_000\\)", "orologio di pagina a MINUTO (30 s): finestra scorrevole/data/dimming/fuso"),
  check.simbolo("I96", "src/app/page.tsx", "function ProssimoRefresh", "foglia viva del countdown «prossimo aggiornamento» (header)"),
  check.simbolo("I96", "src/components/orologio-roma.tsx", "export function OrologioRoma", "orologio dell'header come foglia viva (1 Hz, zero render pagina)"),
  check.simbolo("I96", "src/components/orologio-roma.tsx", "export function OraRomaViva", "ora viva del footer come foglia viva"),
  check.assenza("I96", "src/components/quota-cards.tsx", "now: number", "ModelCard/MainWindows senza prop now (countdown = foglie ResetTra*/WindowDetails)"),
  check.assenza("I96", "src/components/model-table.tsx", "now: number", "PanoramicTable senza prop now (cella Reset = foglia ResetCell)"),
  check.assenza("I96", "src/components/region-alt-panel.tsx", "now: number", "RegionAltPanel senza prop now"),
  check.simbolo("I96", "src/components/quota-cards.tsx", "export const ModelCard = React\\.memo", "ModelCard memoizzata"),
  check.simbolo("I96", "src/components/quota-cards.tsx", "export const MainWindows = React\\.memo", "MainWindows memoizzato"),
  check.simbolo("I96", "src/components/model-table.tsx", "export const PanoramicTable = React\\.memo", "PanoramicTable memoizzata"),
  check.simbolo("I96", "src/components/region-alt-panel.tsx", "export const RegionAltPanel = React\\.memo", "RegionAltPanel memoizzato"),
  check.simbolo("I96", "src/components/history-chart.tsx", "export const HistoryChart = React\\.memo", "HistoryChart memoizzato"),
  check.simbolo("I96", "src/components/history-chart.tsx", "export const StatsPanel = React\\.memo", "StatsPanel memoizzato"),
  check.simbolo("I96", "src/components/history-chart.tsx", "export const RateChart = React\\.memo", "RateChart memoizzato"),
  check.simbolo("I96", "src/components/analysis-panel.tsx", "export const LongTermAnalysis = React\\.memo", "LongTermAnalysis memoizzata"),
  check.simbolo("I96", "src/components/diagnostica-panel.tsx", "export const DiagnosticaPanel = React\\.memo", "DiagnosticaPanel memoizzato"),
  check.simbolo("I96", "src/components/history-chart.tsx", "const TICK_STYLE", "costanti Recharts a livello modulo (props referenzialmente stabili)"),
  check.simbolo("I96", "src/components/history-chart.tsx", "function tooltipRimasto", "tooltip content estratto a livello modulo"),
  check.simbolo("I96", "src/app/page.tsx", "__mmRenderPagina", "sonda di misura del render pagina (strumento docs/04 §3 I96)"),
  check.simbolo("I96", "src/components/history-chart.tsx", "__mmRenderGrafico", "sonda di misura del render grafico"),
  check.file("I96", "tests/lib/orologio.test.ts", "test store 1 Hz: primo abbonato, stop all'ultimo, multi-abbonato"),
  check.file("I96", "scripts/verifiche/misura-render-i96.py", "strumento di misura render/min (prima 60,9 → dopo 3,7)"),

  /* --- I99 — copertura test: contratti delle API e moduli lib scoperti --- */
  check.file("I99", "tests/lib/api-archivi.test.ts", "POST/DELETE dei 3 archivi: validazione, dedup upsert, cap 500, limiti GET (db mockato)"),
  check.simbolo("I99", "tests/lib/api-archivi.test.ts", "mock\\.module\\(\"@/lib/db\"", "pattern I93: mock.module sul client Prisma + import dinamico delle route"),
  check.file("I99", "tests/lib/api-proxy.test.ts", "proxy /api/minimax/usage: fetch mockato (429 Retry-After, 401, 1004, fallback I18, bad_json, rete)"),
  check.simbolo("I99", "tests/lib/api-proxy.test.ts", "fallbackTried", "fallback I18 verificato: errore del primario + annotazione del tentativo"),
  check.file("I99", "tests/lib/api-summary.test.ts", "GET /api/summary: forma KPI, archivio vuoto, read-only"),
  check.file("I99", "tests/lib/http-validate.test.ts", "contratti toEpoch (ms/secondi) e toFloat (clamp 0-100)"),
  check.file("I99", "tests/lib/export.test.ts", "formati export: CSV ; + BOM + virgola decimali + quoting, JSON incapsulato"),
  check.file("I99", "tests/lib/server-history.test.ts", "client storico server: merge dedup (vince locale), POST/GET/DELETE, normalizzazione I92"),
  check.file("I99", "tests/lib/server-events.test.ts", "client eventi server: scarto kind non valido, dedup id, contratti HTTP"),
  check.file("I99", "tests/lib/stats.test.ts", "medianaDi: pari/dispari/vuoto/immutabilità dell'input"),

  /* --- I103 — validazione dei body con zod --- */
  check.file("I103", "src/lib/api-schemi.ts", "schemi zod dei corpi API (proxy + 3 archivi)"),
  check.simbolo("I103", "src/lib/api-schemi.ts", "export const schemaCorpoProxy", "proxy: apiKey trim ≥1, region eu|cn degradata a eu (contratto storico)"),
  check.simbolo("I103", "src/lib/api-schemi.ts", "export const schemaPuntoStorico", "punto storico normalizzato (t/interval/weekly/source/region)"),
  check.simbolo("I103", "src/lib/api-schemi.ts", "export const schemaEventoIngresso", "evento normalizzato (id/t/kind/model/win/message/value)"),
  check.simbolo("I103", "src/lib/api-schemi.ts", "export const schemaPuntoModello", "punto per-modello LONG normalizzato"),
  check.simbolo("I103", "src/lib/api-schemi.ts", "\\.slice\\(0, 500\\)", "cap batch 500 come transform (troncamento silenzioso del contratto storico)"),
  check.simbolo("I103", "package.json", '"zod"', "zod dichiarato tra le dipendenze (ora davvero usato)"),
  check.simbolo("I103", "src/app/api/minimax/usage/route.ts", "schemaCorpoProxy\.safeParse", "proxy: validazione via schema"),
  check.assenza("I103", "src/app/api/minimax/usage/route.ts", 'typeof body\.apiKey === "string"', "check manuale della chiave RIMOSSO (sostituito dallo schema)"),
  check.simbolo("I103", "src/app/api/history/route.ts", "schemaPuntoStorico\.safeParse", "archivio storico: riga normalizzata dallo schema"),
  check.assenza("I103", "src/app/api/history/route.ts", "Array\.isArray\(body\.points\)", "check manuale dell'array RIMOSSO"),
  check.simbolo("I103", "src/app/api/events/route.ts", "schemaEventoIngresso\.safeParse", "archivio eventi: riga normalizzata dallo schema"),
  check.assenza("I103", "src/app/api/events/route.ts", "Array\.isArray\(body\.events\)", "check manuale dell'array RIMOSSO"),
  check.assenza("I103", "src/app/api/events/route.ts", "optionalString", "helper di validazione manuale RIMOSSO (assorbito dallo schema)"),
  check.simbolo("I103", "src/app/api/history/models/route.ts", "schemaPuntoModello\.safeParse", "archivio per-modello: riga normalizzata dallo schema"),
  check.assenza("I103", "src/app/api/history/models/route.ts", "toModelName", "helper di validazione manuale RIMOSSO (assorbito dallo schema)"),

  /* --- I95 — hardening delle API pubbliche --- */
  check.file("I95", "src/lib/api-protezione.ts", "guard ADMIN_TOKEN + rate limit scritture in-memory per-IP"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "export function bloccoScrittura", "guardia composta (401/429) per le route di scrittura"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "process.env.ADMIN_TOKEN", "guard attiva SOLO con env impostata (default: uso locale invariato)"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "x-admin-token", "header richiesto alle scritture quando la guard è attiva"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "timingSafeEqual", "confronto del token timing-safe (SHA-256)"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "x-forwarded-for", "IP del client (per-IP; fallback «locale»)"),
  check.simbolo("I95", "src/lib/api-protezione.ts", "RATE_LIMIT_WRITES_PER_MINUTO", "budget scritture/minuto configurabile (default 120, per-istanza su serverless)"),
  check.simbolo("I95", "src/app/api/history/route.ts", "bloccoScrittura\\(req\\)", "POST+DELETE storico protetti"),
  check.simbolo("I95", "src/app/api/events/route.ts", "bloccoScrittura\\(req\\)", "POST+DELETE eventi protetti"),
  check.simbolo("I95", "src/app/api/history/models/route.ts", "bloccoScrittura\\(req\\)", "POST+DELETE per-modello protetti"),
  check.simbolo("I95", "src/app/api/minimax/usage/route.ts", "bloccoScrittura\\(req\\)", "proxy: rate limit (senza ADMIN_TOKEN: canale della chiave dell'utente)"),
  check.assenza("I95", "src/app/api/summary/route.ts", "bloccoScrittura", "summary read-only resta pubblica per design (I80)"),
  check.simbolo("I95", "next.config.ts", "X-Content-Type-Options", "header nosniff su tutte le risposte"),
  check.simbolo("I95", "next.config.ts", "X-Frame-Options", "header SAMEORIGIN"),
  check.simbolo("I95", "next.config.ts", "Referrer-Policy", "header strict-origin-when-cross-origin"),
  check.simbolo("I95", "next.config.ts", "Permissions-Policy", "header minima (camera/microfono/geolocalizzazione)"),
  check.simbolo("I95", "next.config.ts", "Content-Security-Policy-Report-Only", "CSP in report-only (prima passata senza rischi)"),
  check.simbolo("I95", "next.config.ts", "NODE_ENV === \"production\"", "HSTS solo se servito https (produzione)"),
  check.file("I95", "tests/lib/api-protezione.test.ts", "test guard (spenta/attiva/401) + rate limit (budget, finestra, per-IP, default 120)"),
  check.file("I95", "tests/lib/api-guard.test.ts", "accettazione route-level: DELETE → 401 senza header, 200 con header"),
  check.file("I95", "tests/lib/header-sicurezza.test.ts", "header di sicurezza presenti; HSTS solo in produzione"),

  /* --- I104 — potatura dipendenze e componenti inutilizzati --- */
  check.assenza("I104", "package.json", '"next-auth"', "next-auth RIMOSSO (zero import)"),
  check.assenza("I104", "package.json", '"z-ai-web-dev-sdk"', "z-ai-web-dev-sdk RIMOSSO (zero import)"),
  check.assenza("I104", "package.json", '"zustand"', "zustand RIMOSSO (zero import)"),
  check.assenza("I104", "package.json", '"@mdxeditor/editor"', "mdxeditor RIMOSSO (zero import)"),
  check.assenza("I104", "package.json", '"date-fns"', "date-fns RIMOSSO (calendar inutilizzato)"),
  check.assenza("I104", "package.json", '"react-hook-form"', "react-hook-form RIMOSSO (form inutilizzato)"),
  check.assenza("I104", "package.json", '"framer-motion"', "framer-motion RIMOSSO: la premessa della decisione I104 («usato in quota-ring») era venuta meno — restava solo un commento stale, l'import era già sparito"),
  check.assenza("I104", "package.json", '"@radix-ui/react-tooltip"', "radix tooltip RIMOSSO (ui/tooltip usato solo da sidebar)"),
  check.nessunFile("I104", "src/components/ui", "(sidebar|skeleton|tooltip|sheet|form|calendar|drawer|command|input-otp|resizable|accordion|alert-dialog)\.tsx", "componenti ui a zero import eliminati (con la loro chiusura: skeleton/tooltip/sheet servivano solo a sidebar)"),
  check.simbolo("I104", "src/components/ui/toggle-group.tsx", "toggleVariants", "ui/toggle RESTAURATO: importato da toggle-group (il grep della prima stesura l'aveva scartato)"),
  check.simbolo("I104", "src/components/quota-ring.tsx", "animato via CSS", "commento stale framer-motion corretto (l'animazione è già CSS)"),
  check.simbolo("I104", "package.json", '"zod"', "zod CONSERVATO (in uso da I103)"),
  check.simbolo("I104", "package.json", '"recharts"', "recharts conservato (grafici)"),

  /* --- I106 — persistenza server portabile (Turso via driver adapter, fallback SQLite nativo) --- */
  check.assenza("I106", "prisma/schema.prisma", 'previewFeatures\\s*=\\s*\\["driverAdapters"\\]', "schema: NESSUN preview flag (dal I115 prisma 7 l'adapter è GA e obbligatorio — il flag preview è deprecato; il client accetta `adapter` nativamente)"),
  check.simbolo("I106", "src/lib/db-factory.ts", "TURSO_DATABASE_URL", "factory: ramo portabile selezionato dall'env (modulo proprio per testabilità senza collisioni con i mock @/lib/db)"),
  check.simbolo("I106", "src/lib/db-factory.ts", "TURSO_AUTH_TOKEN", "factory: token Turso opzionale (database pubblici e file: non lo richiedono)"),
  check.simbolo("I106", "src/lib/db-factory.ts", "PrismaLibSql", "factory: driver adapter libsql costruito con {url, authToken} (dal I115 il costruttore si chiama PrismaLibSql — era PrismaLibSQL in v6)"),
  check.simbolo("I106", "src/lib/db-factory.ts", "export function creaPrismaClient", "factory esportata per i test (il singleton è valutato una volta per processo)"),
  check.simbolo("I106", "src/lib/db.ts", 'from "./db-factory"', "shim canonico @/lib/db: le route non cambiano import (contratto I106)"),
  check.simbolo("I106", "package.json", '"@prisma/adapter-libsql"', "dipendenza driver adapter (dal I115 major 7 allineata a Prisma 7 — la v6 non è più compatibile col client generato)"),
  check.simbolo("I106", "package.json", '"@libsql/client"', "dipendenza client libsql (dal I115 range richiesto dall'adapter 7: ^0.17 → 0.18)"),
  check.file("I106", "scripts/verifiche/db-push-turso.mjs", "push schema su Turso: SDL via migrate diff + esecuzione via client libsql (idempotente, token mai stampato)"),
  check.file("I106", "scripts/verifiche/verifica-i106.mjs", "ciclo accettazione adapter: scrivi→leggi→dedup→SQL raw su db temporaneo; read-only su Turso reale"),
  check.file("I106", "tests/lib/db.test.ts", "test factory env-driven (mock costruttori con cattura argomenti, igiene env con delete)"),
  check.file("I106", "scripts/verifiche/esiti/i106-persistenza-latest.md", "esito verifica I106 tracciato con nome fisso (evidenza pubblica, eccezione .gitignore)"),
  check.simbolo("I106", "README.md", "TURSO_DATABASE_URL", "README documenta le env del deployment persistente (Vercel + Turso)"),
  check.simbolo("I106", "README.md", "persistenza portabile", "README dichiara la persistenza portabile (SQLite in locale, Turso su Vercel)"),

  /* --- I107 — diagnostica persistenza: route read-only + pannello Impostazioni→Dati --- */
  check.file("I107", "src/app/api/persistenza/route.ts", "route diagnostica persistenza (modalità, host sanificato, test connessione, conteggi)"),
  check.simbolo("I107", "src/app/api/persistenza/route.ts", "export async function GET", "endpoint SOLO GET (read-only: fuori dalla guardia I95, non altera nulla)"),
  check.assenza("I107", "src/app/api/persistenza/route.ts", "export async function (POST|DELETE|PUT|PATCH)", "nessuna mutazione: l'endpoint non espone POST/DELETE/PUT/PATCH"),
  check.simbolo("I107", "src/app/api/persistenza/route.ts", "hostDiagnostico", "host ridotto all'hostname: userinfo/porta/percorso/query scartati (il token non attraversa mai la risposta)"),
  check.simbolo("I107", "src/app/api/persistenza/route.ts", "SELECT 1", "test di connessione reale sul motore attivo con latenza misurata"),
  check.simbolo("I107", "src/app/api/persistenza/route.ts", 'from "@/lib/modalita-persistenza"', "modalità dal MODULO PROPRIO (il shim @/lib/db resta { db } per i mock di processo I99/I95 — bun applica il primo mock per specificatore)"),
  check.file("I107", "src/lib/modalita-persistenza.ts", "regola ambiente→modalità in unità pura separata (solo TURSO_DATABASE_URL decide, token da solo non basta)"),
  check.simbolo("I107", "src/lib/db-factory.ts", "modalitaPersistenza,", "ri-esportazione dalla factory: superficie pubblica stabile per lo shim db.ts e i test I106 (I107-fix: multi-riga con urlPersistenzaLocale)"),
  check.simbolo("I107", "src/lib/db-factory.ts", "PrismaLibSql\\(\\{ url: urlLocale \\}\\)", "I107-fix: URL SEMPRE esplicito via urlPersistenzaLocale() — fino a I114 viaggiava in datasourceUrl, dal I115 (prisma 7: opzione rimossa) nella config dell'adapter (senza URL esplicito il vecchio client nativo esigeva env(\"DATABASE_URL\") dallo schema e il primo $queryRaw esplodeva in ambienti senza .env)"),
  check.simbolo("I107", "src/lib/modalita-persistenza.ts", "urlPersistenzaLocale", "I107-fix: URL effettivo del ramo locale (DATABASE_URL o default assoluto db/custom.db dal CWD — dal I115 l'URL file: è consumato dal driver libsql, che risolve i relativi contro il CWD; il default assoluto è corretto sotto entrambe le semantiche)"),
  check.simbolo("I107", "src/components/settings-dialog.tsx", "Persistenza server", "pannello nel tab Dati: modalità attiva, host, test connessione, conteggi"),
  check.simbolo("I107", "src/components/settings-dialog.tsx", "api/persistenza", "il pannello consuma l'endpoint di diagnostica (fetch all'apertura + bottone Aggiorna)"),
  check.simbolo("I107", "src/components/settings-dialog.tsx", "Turso \\(libsql\\)", "badge modalità attiva distinto per ramo turso/locale"),
  check.file("I107", "tests/lib/api-persistenza.test.ts", "contratto route: forma, modalità env-driven, segreti MAI nella risposta, 500 db_read"),
  check.file("I107", "tests/components/settings-persistenza.test.tsx", "test componente pannello: stati dati/errore, it-IT, ricarica manuale"),
  check.simbolo("I107", "README.md", "api/persistenza", "README documenta l'endpoint e il pannello Impostazioni→Dati → Persistenza server"),
  /* I107-fix2 — serverless: default nel tmpdir, directory preparata, nota effimero */
  check.simbolo("I107", "src/lib/modalita-persistenza.ts", 'VERCEL === "1"', "I107-fix2: con VERCEL=1 il default NON va nel CWD read-only ma in tmpdir()/db/custom.db (report utente: «Error code 14: Unable to open the database file» — SQLITE_CANTOPEN su Vercel, filesystem read-only)"),
  check.simbolo("I107", "src/lib/db-factory.ts", "preparaDirectoryFile", "I107-fix2: la factory prepara la directory padre degli URL file: ASSOLUTI (SQLite NON crea le cartelle: clone fresco senza db/ e Vercel senza env esplodevano al primo $queryRaw; i percorsi relativi restano a Prisma)"),
  check.simbolo("I107", "src/components/settings-dialog.tsx", "effimero", "I107-fix2: nel ramo locale il pannello dichiara l'effimero del file su serverless (ogni istanza parte vuota — la durata richiede TURSO_DATABASE_URL)"),
  /* I107-fix3 — schema incorporato: bootstrap DDL idempotente (zero migrazione) */
  check.file("I107", "src/lib/schema-persistenza.ts", "schema INCORPORATO nel codice: DDL idempotente delle 5 tabelle + preparaSchema (gate con cache WeakMap)"),
  check.simbolo("I107", "src/lib/schema-persistenza.ts", "IF NOT EXISTS", "DDL idempotente: riavvii, hot-reload e istanze concorrenti non si disturbano (no-op su tabelle esistenti)"),
  check.simbolo("I107", "src/lib/schema-persistenza.ts", "UsagePoint[\\s\\S]*DownsampledPoint[\\s\\S]*UsageEventRecord[\\s\\S]*ModelUsagePoint", "il DDL incorporato copre le 4 tabelle dello schema Prisma (l'esattezza è presidiata dal test anti-drift su prisma migrate diff)"),
  check.simbolo("I107", "src/lib/db-factory.ts", "preparaSchema", "I107-fix3: ENTRAMBE le branche (nativa e adapter) garantiscono lo schema all'avvio — un DB fresco (file /tmp su Vercel, Turso appena creato) funziona senza db:push né db-push-turso.mjs"),
  check.simbolo("I107", "src/app/api/persistenza/route.ts", "preparaSchema", "I107-fix3: la route attende il gate del bootstrap prima dei conteggi (determinismo al primo colpo su DB fresco)"),
  check.file("I107", "tests/lib/database-schema.test.ts", "e2e motore reale su file vuoto + anti-drift DDL vs prisma migrate diff + semantica gate (il file gira PRIMA di db.test.ts in ordine alfabetico: client reale, non mockato)"),
  /* I107-fix4 — gate dello schema su TUTTE le rotte DB + riprove del bootstrap (motore freddo) */
  check.simbolo("I107", "src/app/api/events/route.ts", "preparaSchema", "I107-fix4: le GET/POST/DELETE attendono il gate del bootstrap DDL prima di toccare il DB (report utente: 500 su /api/events, /api/history e /api/history/models su Vercel — la factory lancia il DDL fire-and-forget e solo /api/persistenza lo attendeva)"),
  check.simbolo("I107", "src/app/api/history/route.ts", "preparaSchema", "I107-fix4: gate su POST + DELETE + GET prima della diramazione granularity (copre punti grezzi E bucket orari)"),
  check.simbolo("I107", "src/app/api/history/models/route.ts", "preparaSchema", "I107-fix4: gate su GET/POST/DELETE — anche l'SQL raw della lib I42 parte solo a schema pronto (import db aggiunto: la rotta non lo importava, passava dalla lib)"),
  check.simbolo("I107", "src/app/api/summary/route.ts", "preparaSchema", "I107-fix4: anche la sintesi KPI read-only attende il gate (stessa classe di guasto)"),
  check.simbolo("I107", "src/lib/schema-persistenza.ts", "TENTATIVI_BOOTSTRAP", "I107-fix4: il bootstrap è RIPROVATO a passate intere — all'avvio freddo il motore rifiuta i primi DDL («Engine is not yet connected», «Response from the Engine was empty») e senza riprove lo schema restava parziale per l'intera vita dell'istanza (probe verifica-i107-fix4-gate.mjs: 0/8 senza gate, 8/8 col gate)"),
  check.file("I107", "tests/lib/api-schema-gate.test.ts", "route-level: ogni handler delle 4 rotte tocca il DB solo dopo il gate (primo accesso dati a schema completo; per la rotta per-modello asserzione al livello gate — il binding del lib dipende dall'ordine dei file di bun, non alfabetico)"),

  /* --- I110 — attivazione Turso (16/10/2026, richiesta utente) + igiene segreti --- */
  check.simbolo("I110", "scripts/verifiche/verifica-i110-turso-attivo.ts", "creaPrismaClient", "probe di attivazione via FACTORY REALE di produzione (creaPrismaClient + preparaSchema + round-trip Prisma) — non un client libsql parallelo: ciò che si verifica è la stessa via del runtime"),
  check.file("I110", "scripts/verifiche/esiti/i110-turso-attivazione-latest.md", "evidenza a nome fisso dell'attivazione (7 passi: selezione ambiente, client, DDL incorporato sul cloud, SELECT 1, conteggi, round-trip, idempotenza — host sanificato, token MAI stampato)"),
  check.nonTracciato("I110", "(.*/)?\\.env(\\..+)?", "segreti fuori dall'indice: .env è gitignored e le credenziali (TURSO_*, DATABASE_URL, chiavi) restano SOLO nell'ambiente (header db-factory.ts, README §Persistenza) — il commit dd03d16 dell'utente l'aveva aggiunto con git add -f e in CI rompeva anche la suite: bun auto-carica il .env e il test I106 «env assente» vedeva l'adapter Turso"),
  check.simbolo("I110", "tests/lib/db.test.ts", "baselineAssente", "suite indipendente dall'ambiente: baseline DICHIARATO (chiavi cancellate all'avvio e a ogni beforeEach), lo stato ambientale (.env incluso) ripristinato solo nell'afterAll — mai assumere lo stato del processo"),

  /* --- I111 — manutenzione database (anti-rottura + quota Turso, 17/10/2026) --- */
  check.file("I111", "src/lib/manutenzione-db.ts", "lib manutenzione (unità pura, pattern I106/I107): misura storage PRAGMA, statistiche tabelle, integrità, ritenuta da ambiente con clamp, valutazione quota, proiezione scritture, pulizia con dryRun, VACUUM onesto, orchestratore"),
  check.simbolo("I111", "src/lib/manutenzione-db.ts", "LIMITI_TURSO_FREE", "limiti del free tier Turso come costante verificabile (5 GiB / 500M read / 10M write / 100 database — fonti datate in docs/10 §2)"),
  check.simbolo("I111", "src/lib/manutenzione-db.ts", "typeof\\(\"t\"\\) = 'integer'", "confronti temporali DUALI — INTEGER (motore Prisma, epoch ms) e TEXT (SQL raw I42, ISO 8601): il bug della prima stesura, beccato dalla suite e2e, non può tornare (probe-i111-datetime.ts, docs/10 §4)"),
  check.file("I111", "docs/10-manutenzione-database.md", "procedure complete: limiti free tier con fonti (§2), architettura (§3), due codifiche DateTime (§4), procedure P1–P6 (§5), configurazione env (§6), runbook (§7), verifiche (§8), stime e onestà (§9)"),
  check.file("I111", "src/app/api/manutenzione/route.ts", "GET rapporto read-only senza chiave + POST azioni protette (pulizia | vacuum | manutenzione)"),
  check.simbolo("I111", "src/app/api/manutenzione/route.ts", "await preparaSchema\\(db\\)", "gate dello schema I107-fix4 anche sulle rotte di manutenzione: nessuna misura o scrittura parte a schema incompleto"),
  check.simbolo("I111", "src/app/api/manutenzione/route.ts", 'vacuum: "mai"', "il GET NON scrive nulla: nessuna pulizia e vacuum disattivato nel rapporto read-only (dimostrato dalla suite)"),
  check.simbolo("I111", "src/app/api/manutenzione/route.ts", "bloccoScrittura", "POST sotto la guardia I95 (ADMIN_TOKEN timing-safe + rate limit scritture) — qui la guardia conta doppio: le azioni cancellano righe"),
  check.simbolo("I111", "src/app/api/manutenzione/cron/route.ts", "CRON_SECRET", "cron notturno autenticato: senza env → 403 ONESTO (un endpoint che cancella non si apre mai al pubblico), Bearer sbagliato → 401 timing-safe, kill-switch MANUTENZIONE_AUTO_PULIZIA=0"),
  check.simbolo("I111", "vercel.json", '"path": "/api/manutenzione/cron"', "cron programmato 02:30 UTC ogni giorno (vercel.json §crons): pulizia e verifica anche a traffico zero"),
  check.simbolo("I111", "src/lib/api-schemi.ts", "schemaAzioneManutenzione", "validazione zod dell'azione di manutenzione (I103: niente check manuali sparsi)"),
  check.simbolo("I111", "tests/lib/database-manutenzione.test.ts", "motore reale", "suite lib: funzioni pure + client finto (dryRun zero DELETE, VACUUM onesto, orchestratore) + e2e su file con ENTRAMBE le codifiche DateTime, cap FIFO e idempotenza"),
  check.file("I111", "tests/lib/api-manutenzione.test.ts", "contratti route: GET read-only dimostrato (zero $executeRaw), zod 400, guard 401, tre azioni, cron 403/401/200 con kill-switch"),
  check.file("I111", "scripts/verifiche/probe-i111-datetime.ts", "probe empirica delle due codifiche DateTime nel database (motore Prisma INTEGER vs SQL raw TEXT) e del confronto duale corretto"),
  /* --- I112 — manutenzione del database locale documentata (docs-only): la copertura duale entra nel presidio --- */
  check.simbolo("I112", "docs/10-manutenzione-database.md", "P7 — Database locale", "procedura P7: le stesse procedure sul file SQLite locale — cosa è identico (PRAGMA, statistiche, quick_check, ritenuta+cap, quota), differenze oneste (VACUUM nativo funziona e recupera byte; soglie quota adattabili) e commutazione via .env"),
  check.simbolo("I112", "docs/10-manutenzione-database.md", "MANUTENZIONE_QUOTA_STORAGE_BYTES", "soglie di quota adattabili al disco locale: il tetto del free tier Turso diventa un limite scelto dall'utente sul file locale (clamp §6)"),
  check.simbolo("I112", "README.md", "anche per il database locale", "README §Persistenza dichiara la copertura locale delle procedure di manutenzione (modalita locale, VACUUM nativo, commutazione)"),
  /* --- I113 — allineamento documentale al verdetto V8: nessuna affermazione «rolling» superstite --- */
  check.assenza("I113", "README.md", "Al primo utilizzo \\(rolling\\)", "tabella «Regole del piano» senza più l'ipotesi rolling (smentita V8: blocchi fissi UTC)"),
  check.simbolo("I113", "README.md", "griglia 00/05/10/15/20 del giorno \\(V8\\)", "regole README allineate al verdetto V8 (inizio = confine di griglia, non primo utilizzo)"),
  check.simbolo("I113", "docs/01-api-minimax-ricerca.md", "empiricamente SMENTITE", "nota correttiva in §7: le regole ufficiali rolling restano CITAZIONE con smentita empirica e rimando al verdetto (docs/02 §5, esiti v8)"),
  check.assenza("I113", "docs/02-analisi-json-quota.md", "lo start non è prevedibile", "casi limite §7 allineati: lo start del blocco successivo è prevedibile (confine di griglia, V8)"),
  check.assenza("I113", "docs/02-analisi-json-quota.md", "= end_time precedente o invariato\\? Da osservare", "caso limite §9 «subito dopo il reset senza uso» chiuso con V3/V8"),
  check.assenza("I113", "docs/04-stato-avanzamento.md", "Aperto → verifica V3", "R11 chiusa dall'evidenza V8: nessun rimando a V3 come aperta"),
  check.assenza("I113", "docs/04-stato-avanzamento.md", "❓ Come mostrare", "apertura §7 «primo utilizzo previsto» risolta per obsolescenza (blocchi fissi UTC)"),
  /* --- I114 — audit delle dipendenze: aggiornamento entro range verificato + decisioni sui major --- */
  check.simbolo("I114", "package.json", '"eslint": "\\^10\\.', "eslint 10 adottato (9→10.13.0 verificato empiricamente con lint exit 0 reale; peer eslint-config-next >=9 accetta 10)"),
  check.simbolo("I114", "package.json", '"typescript": "\\^5\\.9\\.3"', "typescript resta su 5.9.x: TS 7.0 rifiutato da typescript-eslint (rompe il gate lint) — rivalutare quando supporterà TS >=7.1 (issue typescript-eslint #10940)"),
  check.file("I114", "scripts/verifiche/audit-deps-inventario.mjs", "inventario dipendenze dichiarato↔installato dal bun.lock (strumento dell'audit dipendenze)"),
  /* --- I115 — prisma 6→7.10.1 + @libsql/client 0.8→0.18: adapter obbligatorio, URL fuori dallo schema --- */
  check.simbolo("I115", "package.json", '"prisma": "\\^7\\.', "prisma 7 adottato (chiude la catena di produzione deepmerge-ts/defu via @prisma/config 7.10.1: deepmerge-ts 8.0.2 fissato — bun audit 25→2 nel I114 → 1 residua dev-only)"),
  check.simbolo("I115", "package.json", '"@libsql/client": "\\^0\\.18\\.', "@libsql/client 0.18 (range richiesto dall'adapter 7: ^0.17 — i due major sono ACCOPPIATI)"),
  check.assenza("I115", "prisma/schema.prisma", 'url\\s*=\\s*env\\(', "schema senza URL nel datasource (prisma 7: P1012 — l'URL vive in prisma.config.ts per il CLI, nella config dell'adapter per il client)"),
  check.file("I115", "prisma.config.ts", "config CLI prisma 7 (defineConfig: schema + datasource per i comandi migrate/db push)"),
  check.simbolo("I115", "prisma.config.ts", "defineConfig", "config CLI con l'API prisma/config (defineConfig)"),
  check.assenza("I115", "src/lib/db-factory.ts", "datasourceUrl:", "nessun ricorso all'opzione RIMOSSA dal client 7 (entrambi i rami passano dall'adapter PrismaLibSql — anche il file: locale, stesso dialetto SQLite)"),
  check.simbolo("I115", "tests/lib/database-schema.test.ts", '"--to-schema"', "anti-drift sul flag CLI 7 (--to-schema: --to-schema-datamodel è stato rimosso)"),
  /* --- I116 — fix deploy Vercel: il client generato deve essere SEMPRE fresco (postinstall + build) --- */
  check.simbolo("I116", "package.json", '"build": "prisma generate && next build', "build rigenera SEMPRE il client prima di next build (prisma 7 ha rimosso l'auto-generate del postinstall della dipendenza: su Vercel il node_modules ripristinato dalla build cache portava un .prisma/client stantio dell'era prisma 6 — richiedeva @prisma/client/runtime/library.js, eliminato in v7 — e la raccolta configurazione delle route falliva; riprodotto localmente con lo STESSO errore «Failed to load external module @prisma/client-<hash>: Cannot find module …/runtime/library.js» e fix verificato dallo stesso stato avvelenato: exit 0)"),
  check.simbolo("I116", "package.json", '"postinstall": "prisma generate"', "postinstall rigenera il client a ogni install (v7 non lo fa più in automatico: fresh clone e ambienti freddi hanno il client pronto per dev/test senza passi manuali)"),
  check.simbolo("I116", ".github/workflows/ci.yml", "db:generate", "CI conserva lo step esplicito di generazione (difesa in profondità: il client è fresco prima di tsc/test anche se postinstall venisse saltato)"),
  /* --- I117 — registro delle esecuzioni della manutenzione: la prova duratura del cron --- */
  check.simbolo("I117", "prisma/schema.prisma", "model RegistroManutenzione", "5ª tabella nello schema: il registro delle esecuzioni (cron notturno + azione POST «manutenzione») — la prova DURATURA che il cron è passato, indipendente dalla breve retention dei log Vercel (l'esattezza del DDL è presidiata dal test anti-drift su prisma migrate diff)"),
  check.simbolo("I117", "src/lib/schema-persistenza.ts", "RegistroManutenzione", "DDL della 5ª tabella incorporato nel gate I107-fix3 (IF NOT EXISTS: bootstrap idempotente anche sui DB esistenti — nessuna migrazione)"),
  check.simbolo("I117", "src/lib/manutenzione-db.ts", "export async function registraEsecuzione", "scrittura del registro BEST-EFFORT per contratto: non lancia mai — un problema del registro non maschera l'esito reale della manutenzione (risultato dichiarato registrato/errore)"),
  check.simbolo("I117", "src/lib/manutenzione-db.ts", "export async function leggiUltimeEsecuzioni", "lettura robusta: righe malformate SALTATE (mai presentate come dati validi), dettaglio JSON parsato o { grezzo }, LIMIT parametrizzato e clampato"),
  check.simbolo("I117", "src/lib/manutenzione-db.ts", "REGISTRO_CAP", "cap FIFO del registro applicato ALLA SCRITTURA: il registro non può crescere senza limite (100 righe ≈ oltre 3 mesi di run notturni)"),
  check.simbolo("I117", "src/app/api/manutenzione/cron/route.ts", "registraEsecuzione", "il cron registra OGNI ciclo — riuscito E fallito (best-effort: se il DB rifiuta anche l'INSERT la riga manca onestamente e resta il console.error)"),
  check.simbolo("I117", "src/app/api/manutenzione/cron/route.ts", "\\[manutenzione-cron\\]", "riga compatta nei runtime logs a ogni ciclo (esito, durata, bytes, quota, integrità, eliminati, vacuum, registro): nei log Vercel l'esito non è più solo lo status code"),
  check.simbolo("I117", "src/app/api/manutenzione/route.ts", "leggiUltimeEsecuzioni", "il GET read-only espone «ultimeEsecuzioni»: verifica del cron interrogabile in qualsiasi momento (solo SELECT — resta read-only, dimostrato dalla suite)"),
  check.simbolo("I117", "tests/lib/database-manutenzione.test.ts", "registraEsecuzione", "suite lib: INSERT parametrizzato, mai un lancio, cap FIFO alla scrittura, mappa robusta + e2e motore reale in processo figlio (verifica-i117-registro-reale.ts)"),
  check.simbolo("I117", "tests/lib/api-manutenzione.test.ts", "RegistroManutenzione", "contratti route: cron e POST «manutenzione» si registrano (innesco cron/post nei parametri), azioni parziali NO, GET espone ultimeEsecuzioni"),
  check.file("I117", "scripts/verifiche/verifica-i117-registro-reale.ts", "e2e motore reale su file temporaneo: roundtrip registra/leggi, cap FIFO che riporta ESATTAMENTE a REGISTRO_CAP, ordine id DESC (lezione I111 estesa alla lettura: la colonna DATETIME può tornare come Date dal driver)"),
  check.simbolo("I117", "docs/10-manutenzione-database.md", "P8 — Registro delle esecuzioni", "procedura P8 documentata: come verificare il cron a distanza di settimane (GET /api/manutenzione → ultimeEsecuzioni; console.log [manutenzione-cron] nei runtime logs)"),

  /* --- I118 — pannello «Registro manutenzione»: la visualizzazione nell'app --- */
  check.simbolo("I118", "src/components/settings-dialog.tsx", "Registro manutenzione", "pannello nel tab Dati (sotto Persistenza server): la visualizzazione NELL'APP del registro delle esecuzioni — la prova duratura del cron leggibile senza curl né runtime logs"),
  check.simbolo("I118", "src/components/settings-dialog.tsx", "ultimeEsecuzioni", "il pannello consuma GET /api/manutenzione (SOLO LETTURA, stesso perimetro pubblico di /api/persistenza) e rende le righe del registro: innesco, esito, durata, istante, dettaglio"),
  check.simbolo("I118", "src/components/settings-dialog.tsx", "formattaBytesClient", "specchio CLIENT di formattaBytes (manutenzione-db.ts è codice server: importarlo trascinerebbe prisma nel bundle del browser)"),
  check.simbolo("I118", "src/components/settings-dialog.tsx", "Nessuna esecuzione registrata", "stato vuoto ONESTO con la spiegazione di chi popola il registro (cron notturno + azione «manutenzione») — nessuna riga finta"),
  check.simbolo("I118", "src/components/settings-dialog.tsx", "aria-label=\"Aggiorna registro\"", "due bottoni «Aggiorna» disambiguati per gli screen reader (persistenza vs registro) — pannelli con stati INDIPENDENTI"),
  check.simbolo("I118", "tests/components/settings-persistenza.test.tsx", "api/manutenzione", "mock instradato per URL: all'apertura del dialogo convivono DUE fetch (persistenza + manutenzione) con fixture dedicate"),
  check.file("I118", "tests/components/settings-registro.test.tsx", "test di componente dedicato: righe renderizzate, errore del motore nella riga fallita, registro vuoto onesto, errore API senza mascherare l'altro pannello, «Aggiorna registro» indipendente + helper puri verificati"),
  check.simbolo("I118", "docs/10-manutenzione-database.md", "I118", "docs/10 aggiornato: la visualizzazione nell'app è la prima via di verifica del registro (P8)"),
  /* --- I119 — audit sicurezza: analisi, remediation, presidi permanenti --- */
  check.simbolo("I119", "next.config.ts", "poweredByHeader: false", "fingerprinting X-Powered-By DISATTIVATO (default Next attivo: rivelava la tecnologia del server a chiunque mappi le superfici d'attacco)"),
  check.simbolo("I119", "src/lib/modalita-persistenza.ts", "livelloLogPrisma", "regola PURA ambiente→log Prisma: produzione = warn/error (nessun query log con i parametri nei runtime logs), dev/test = query come prima — stessa famiglia di modalitaPersistenza/urlPersistenzaLocale"),
  check.simbolo("I119", "src/lib/db-factory.ts", "log: livelloLogPrisma\\(\\)", "la factory NON logga più le query in produzione (fino a I119 `log: [\"query\"]` era sempre attivo: ogni query con i valori dei parametri finiva nei log della piattaforma — noise, esposizione di stringhe inserite dagli utenti, overhead)"),
  check.simbolo("I119", "tests/lib/db-log-livello.test.ts", "livelloLogPrisma", "contratto del livello log testato su env INIETTABILE (produzione/dev/test/assente + purezza senza side-effect su process.env)"),
  check.simbolo("I119", "tests/lib/header-sicurezza.test.ts", "poweredByHeader", "la disattivazione dell'header è presidiata dal test di configurazione (non solo dalla memoria)"),
  check.simbolo("I119", "Caddyfile", "I119", "avvertimento SSRF sul blocco @transform_port_query (?XTransformPort= porta localhost arbitraria): accettabile SOLO in rete fidata di sviluppo — in self-hosting pubblico va rimosso (produzione Vercel non usa Caddy)"),
  check.file("I119", "docs/11-audit-sicurezza.md", "report dell'audit sicurezza completo: metodologia (ricognizione, caccia ai segreti, injection, auth/authz, DoS, crypto, dipendenze, configurazioni), 16 voci di analisi con gravità, remediation applicate (poweredByHeader, log Prisma, Caddyfile), rischi RESIDUI con azioni utente (rotazione token Turso della storia git dd03d16, ADMIN_TOKEN/CRON_SECRET su Vercel, CSP enforcing futuro)"),
  /* --- I120 — token admin lato client: la guardia I95 attivabile in produzione senza rompere la replica --- */
  check.file("I120", "src/lib/admin-token.ts", "token admin client: storage mm-dash-admin-token-v1 (come la chiave MiniMax, mai nel codice/log), headerAdmin SSR-safe, sonda di identità classificata (401 rifiutato / 400-429 accettato) — chiude docs/11 §5.2: impostare ADMIN_TOKEN sul server NON rompe più la replica browser→server"),
  check.simbolo("I120", "src/lib/admin-token.ts", "headerAdminDa", "header PURA da token ({} se assente: scritture identiche a prima del I120)"),
  check.simbolo("I120", "src/lib/admin-token.ts", "esitoSondaAdmin", "classificazione PURA dell'esito della sonda (401 PRIMA del rate limit → 429 implica identità accettata)"),
  check.simbolo("I120", "src/lib/server-history.ts", "headerAdmin\\(\\)", "replica storico: header admin su POST e DELETE"),
  check.simbolo("I120", "src/lib/server-events.ts", "headerAdmin\\(\\)", "replica eventi: header admin su POST e DELETE"),
  check.simbolo("I120", "src/lib/model-history.ts", "headerAdmin\\(\\)", "replica per-modello: header admin su POST e DELETE"),
  check.simbolo("I120", "src/components/settings-dialog.tsx", "Sicurezza scritture", "sezione nel tab Dati: campo password con mostra/nascondi, salva/rimuovi IMMEDIATI (fuori dal «Salva» del dialogo), sonda col server"),
  check.simbolo("I120", "src/components/settings-dialog.tsx", "__sonda_identita_i120__", "la sonda usa un'azione inesistente: il body è rifiutato con 400 DOPO la guardia — nessuna scrittura sul database"),
  check.simbolo("I120", "tests/lib/admin-token-scritture.test.ts", "x-admin-token", "contratto di rete: le 6 scritture degli archivi allegano l'header SOLO con token salvato, invariate senza"),
  check.file("I120", "tests/components/settings-sicurezza.test.tsx", "test di componente della sezione: campo dal localStorage, salvataggio immediato, mostra/nascondi, sonda 400/401 con header e body verificati, rimozione"),
  /* --- I121 — la POST del proxy usage entra nel perimetro del token (perimetro I95 completo) --- */
  check.simbolo("I121", "src/app/page.tsx", "headerAdmin\\(\\)", "la POST /api/minimax/usage allega x-admin-token: la guardia I95 protegge ANCHE la POST proxy (api-protezione.ts: «POST/DELETE degli archivi, POST proxy») — con ADMIN_TOKEN attivo il refresh non fallisce più con 401 «Scrittura protetta» (bug riportato dall'utente a I120 attivo)"),
  check.simbolo("I121", "tests/lib/admin-token-scritture.test.ts", "I121", "perimetro fissato: verifica statica che la fetch del proxy in page.tsx allega ...headerAdmin() — sette scritture protette, zero eccezioni"),
  /* --- I122 — azione «rimuovi-demo»: pulizia selettiva dei punti demo (falsi reset nelle analisi) --- */
  check.simbolo("I122", "src/lib/manutenzione-db.ts", "export async function eseguiRimozioneDemo", "DELETE selettivo source=demo con backup PRIMA del DELETE (righe nella risposta) e dryRun (conteggio senza cancellare) — i punti demo replicati generano falsi reset nelle analisi (12/12 marker di produzione falsi, verificati 17/10)"),
  check.simbolo("I122", "src/lib/manutenzione-db.ts", "RIMOZIONE_DEMO_BACKUP_MAX", "cap del backup restituito (500): oltre il cap il backup è PARZIALE ma il DELETE resta totale (troncato: true dichiara)"),
  check.simbolo("I122", "src/lib/api-schemi.ts", "\"rimuovi-demo\"", "schema zod azione estesa: rimuovi-demo nel contratto POST /api/manutenzione, dryRun booleano opzionale"),
  check.simbolo("I122", "src/app/api/manutenzione/route.ts", "eseguiRimozioneDemo\\(", "dispatch POST «rimuovi-demo» nella route protetta I95 (guard ADMIN_TOKEN + rate limit scritture), risposta completa con rimozione+backup"),
  check.simbolo("I122", "tests/lib/database-manutenzione.test.ts", "I122", "semantica su client finto: dryRun ZERO DELETE, backup PRIMA del DELETE, DELETE parametrizzato su source=demo, cap/troncato, client senza superficie SQL → errore"),
  check.simbolo("I122", "tests/lib/api-manutenzione.test.ts", "rimuovi-demo", "contratto route: dryRun 200 senza scritture, reale con DELETE parametrizzato + backup, dryRun non-booleano → 400"),
  check.simbolo("I122", "scripts/verifiche/verifica-i111-motore-reale.ts", "eseguiRimozioneDemo", "e2e motore reale in processo figlio: dryRun non cancella, reale con backup completo, restano SOLO i punti reali, idempotenza"),
  /* --- I123 — cleanup esplicito nei test di componente (bomba d'ordine beccata dopo la riconciliazione git) --- */
  check.simbolo("I123", "tests/components/quota-ring.test.tsx", "cleanup\\(\\)", "cleanup esplicito tra i test (pattern I79) anche nell'ultimo file che ne era rimasto privo: il residuo «—» dei render dei file precedenti rompeva getByText(\"—\") (I81 N/D) a seconda dell'ordine di discovery di bun"),
  {
    item: "I123",
    what: "PRESIDIO anti-ordine: OGNI file di test in tests/components/* usa la cleanup esplicita — il document happy-dom è condiviso in-process e la auto-cleanup di testing-library non è attiva in bun (il pattern I79 diventa obbligatorio e verificato)",
    kind: "presidio",
    run: () => {
      const dir = join(ROOT, "tests", "components");
      if (!existsSync(dir)) return "directory tests/components assente";
      const files = readdirSync(dir).filter((f) => f.endsWith(".test.tsx"));
      const mancanti = files.filter((f) => !readFileSync(join(dir, f), "utf8").includes("cleanup()"));
      return mancanti.length === 0 ? null : `file di test componenti SENZA cleanup(): ${mancanti.join(", ")}`;
    },
  },
  /* --- I124 — analisi dei cicli a FINESTRE UFFICIALI + esclusione demo + svuota storico locale --- */
  check.simbolo("I124", "src/lib/cycles.ts", "export function detectCyclesFinestre", "segmentazione a finestre ufficiali: blocchi orari fissi UTC 00/05/10/15/20 semantica cron (verdetto V8) per «interval», settimane lunedì 00:00 UTC per «weekly»; il ciclo si chiude al reset ufficiale anche senza campioni successivi (le finestre proseguono il conteggio lato MiniMax)"),
  check.simbolo("I124", "src/lib/cycles.ts", "export function senzaDemo", "esclusione dei punti demo dalle analisi (proposal (a) del task 69); i punti senza marca legacy restano inclusi e documentati"),
  check.simbolo("I124", "src/lib/cycles.ts", "export function inizioFinestra5h", "allineamento ai blocchi orari fissi 00/05/10/15/20 UTC di ogni giorno con fineFinestra5h (discriminatori di produzione: confine 15:00 UTC del 19/10 e reset 20:00 UTC del venerdì 16/10 — la griglia epoch è refutata e presidianta nei test)"),
  check.simbolo("I124", "src/lib/cycles.ts", "export function inizioSettimanaUtc", "allineamento settimane a lunedì 00:00 UTC (finestra a livello di piano; conferma produzione 46% domenica 18/10 → 92% lunedì 19/10)"),
  check.simbolo("I124", "src/components/analysis-panel.tsx", "senzaDemo\\(fuso\\)", "la serie d'analisi del pannello esclude i punti demo prima di OGNI analisi (cicli, per giorno, heatmap, calendario, distribuzione, oggi vs media)"),
  check.simbolo("I124", "src/components/analysis-panel.tsx", "detectCyclesFinestre\\(data, \"interval\"\\)", "cicli «interval» di general a finestre ufficiali; gli altri modelli restano sull'euristica (cadenza breve non verificata per modello — inventare un allineamento produrrebbe cicli sbagliati plausibili)"),
  check.simbolo("I124", "src/components/analysis-panel.tsx", "Reset finestra", "colonna «Reset finestra» in tabella: il momento ufficiale del reset di ogni ciclo (il PROSSIMO reset per quello in corso)"),
  check.simbolo("I124", "src/components/history-chart.tsx", "detectCyclesFinestre\\(serie, win\\)", "fasce e marker «reset» del grafico al confine di finestra ufficiale (momento vero del reset, anche dentro un buco di campionamento); fallback sull'intera serie in modalità demo"),
  check.simbolo("I124", "src/components/print-report.tsx", "senzaDemo\\(history\\)", "il report stampabile esclude i punti demo fuori dalla modalità demo e segmenta i cicli a finestre ufficiali"),
  check.simbolo("I124", "src/lib/storage-chiavi.ts", "export function svuotaStoricoLocale", "svuotamento dello storico locale (flat + per-modello) da fonte unica delle chiavi: la via per eliminare i punti demo legacy pre-I124, privi della marca source"),
  check.simbolo("I124", "src/components/settings-dialog.tsx", "svuotaStoricoLocale\\(\\)", "azione «Svuota storico locale» nel tab Dati: conferma esplicita con promessa esplicita (punti server NON toccati, riscaricati al prossimo avvio)"),
  check.simbolo("I124", "src/app/page.tsx", "source: snap\\.source", "la marca d'origine dello snapshot segue il punto flat (localStorage + replica server)"),
  check.simbolo("I124", "src/lib/demo.ts", "source: \"demo\"", "anche i backfill demo (flat e per-modello) sono marcati: da I124 nessun nuovo punto demo senza marca"),
  check.simbolo("I124", "src/lib/server-history.ts", "source: p\\.source", "la source dei punti server (api/demo/import) passa al HistoryPoint"),
  check.simbolo("I124", "src/lib/model-history.ts", "source: sample\\.source", "lo storico per-modello replica la marca d'origine lungo tutta la catena (ModelSample → ModelHistoryPoint → HistoryPoint)"),
  check.simbolo("I124", "tests/lib/cycles-finestre.test.ts", "produzione 19/10", "i casi di test replicano i dati reali di produzione (confine 15:00 UTC 17→96; settimanale 46→92 al lunedì 00 UTC; chiusura al reset senza campioni successivi)"),
  /* --- I125 — piano attuale documentato dalle fonti ufficiali + demo fedele alle finestre verificate --- */
  check.simbolo("I125", "src/lib/demo.ts", "inizioFinestra5h\\(now\\)", "la finestra breve demo è il BLOCCO FISSO corrente UTC {00,05,10,15,20} (verdetto V8) — non più rolling «3,2h fa»: il reset a confine è ora visibile in demo come sul server reale"),
  check.simbolo("I125", "src/lib/demo.ts", "fineFinestra5h\\(now\\)", "la fine della finestra breve demo è il confine del blocco successivo (durata reale 5h, 4h nell'ultimo blocco del giorno)"),
  check.simbolo("I125", "src/lib/demo.ts", "inizioSettimanaUtc\\(now\\)", "la finestra settimanale demo è la settimana corrente da lunedì 00:00 UTC, condivisa tra i modelli (chiude la differenza dichiarata G9 della matrice I48)"),
  check.simbolo("I125", "src/lib/demo.ts", "clampPct", "le percentuali demo sono clampate in [0,100]: l'API non sfora mai, nemmeno il jitter deve farlo"),
  check.simbolo("I125", "src/lib/demo.ts", "curva a sega", "lo storico demo simula ogni punto dentro la SUA finestra (ancoraggio per punto): il grafico dimostrativo mostra i reset ai confini come la serie reale"),
  check.simbolo("I125", "tests/lib/demo-finestre.test.ts", "I125", "test di fedeltà demo con istanti deterministici 19–20/10/2026 (blocco pieno, ultimo blocco 4h reali, post-reset settimanale, salto al confine)"),
  check.simbolo("I125", "scripts/verifiche/verifica-i48-demo-vs-api.ts", "G13", "matrice I48 con la NUOVA riga G13 (finestra breve = blocco fisso UTC) e la riga G9 CHIUSA (settimanale allineata, ora fedele)"),
  check.simbolo("I125", "docs/02-analisi-json-quota.md", "^## 11\\. I125", "quadro ufficiale ri-verificato in tempo reale (20/10/2026): tier 1×/3×/7,5×, modelli per tier, endpoint confermato, NESSUNO schema JSON ufficiale (docs/02 resta il riferimento de-facto), tensione «rolling» ufficiale vs V8 presidiata"),
  check.simbolo("I125", "docs/01-api-minimax-ricerca.md", "^### 11\\.3", "racconto dell'ancoraggio demo (G9 chiusa, G13 nuova) con l'esito della matrice ri-eseguita"),
  check.simbolo("I125", "docs/01-api-minimax-ricerca.md", "Verifica fresca 20/10/2026", "la nota §7 distingue la CITAZIONE delle docs ufficiali (rolling) dal comportamento verificato (blocchi V8) con la data della verifica documentale"),

  /* --- I126 — demo opt-in: default FALSE, niente forzamento silenzioso al salvataggio --- */
  check.simbolo("I126", "src/components/settings-dialog.tsx", "demoMode: false", "il default NON è più la demo: il primo avvio senza chiave mostra la needsSetup card — chiusa lato client la causa radice dei burst demo post-deploy (task 69/I122)"),
  check.assenza("I126", "src/components/settings-dialog.tsx", "demoMode \\|\\| !apiKey", "handleSave non forza più la demo quando la chiave è vuota: la scelta dell'utente viene salvata così com'è (il caso api-senza-chiave è della needsSetup card e del guard fetchData)"),
  check.simbolo("I126", "src/app/page.tsx", "needsSetup = mounted && !settings\\.demoMode", "needsSetup gated su mounted: SSR e primo render mostrano lo skeleton — nessun flash della card di setup per gli utenti di ritorno con impostazioni salvate"),
  check.simbolo("I126", "src/app/page.tsx", "I126 — primo avvio senza chiave", "l'effetto connessione non chiama fetchData (e non apre il dialog via guard) senza demo né chiave: il primo fetch parte al salvataggio, quando connKey cambia"),
  check.file("I126", "tests/components/settings-demo-default.test.tsx", "test di componente dell'opt-in: default FALSE, switch spento, salvataggio senza chiave rispettato, opt-in esplicito funzionante, chiave trimmata (mock completo a livello di contratto — lezione bombe d'ordine)"),
  /* --- I127 — proiezione sulla finestra corrente + caveat «campione ridotto» --- */
  check.simbolo("I127", "src/lib/cycles.ts", "PREVEDIBILITA_CAMPIONE_SOGLIA", "soglia di onestà statistica della strip Prevedibilità: sotto 7 cicli completati l'indice resta calcolato ma viene dichiarato fragile (σ dominata dai singoli valori + durate = limiti inferiori con campionamento sparso)"),
  check.simbolo("I127", "src/components/analysis-panel.tsx", "campione ridotto", "la strip Prevedibilità mostra il caveat «campione ridotto (indice fragile)» quando n < soglia — onestà statistica sull'indice 26/100 osservato in produzione con 4 cicli"),
  check.simbolo("I127", "src/components/history-chart.tsx", "computeSessionTrend", "ritmo della FINESTRA CORRENTE (blocco fisso UTC corrente per la 5h, settimana corrente da lunedì 00 UTC per la settimanale — stesso allineamento V8): la proiezione non usa più la sola media di lungo periodo che include le ore di inattività (+0.37 %/h di produzione mentre la sessione bruciava al 18-36 %/h)"),
  check.simbolo("I127", "src/components/history-chart.tsx", "Al ritmo della finestra in corso", "verdetto d'esaurimento e pace dichiarano SEMPRE la base della proiezione (sessione quando ci sono ≥2 rilevamenti nella finestra attiva, lungo periodo altrimenti)"),
  check.simbolo("I127", "src/app/page.tsx", "sessionTrend={sessionTrend}", "il trend di sessione è calcolato memoizzato e passato a StatsPanel sia nella vista principale sia nel kiosk"),
  check.file("I127", "tests/components/history-session-trend.test.tsx", "test della base di sessione: solo punti del blocco UTC corrente, null con <2 punti (i vecchi NON rientrano), confine inclusivo, settimanale da lunedì 00 UTC, consumo nullo, verdetto/pace con etichetta base, fallback dichiarato sul trend lungo"),
  /* --- I128 — evoluzione dell'indice Prevedibilità al crescere del campione --- */
  check.simbolo("I128", "src/lib/cycles.ts", "evoluzionePrevedibilita", "serie cumulativa dell'indice di regolarità (k = 3..n cicli completati, ricalcolo con la STESSA formula di prevedibilitaCicli) con ultimo Δ e salto massimo: dà il CONTESTO del caveat «campione ridotto» (I127) — non basta dichiarare la fragilità statistica (indice 26 con 4 cicli in produzione, task 76), va mostrata come si è mossa la lettura al crescere del campione"),
  check.simbolo("I128", "src/components/analysis-panel.tsx", "PrevedibilitaEvoLine", "la strip Prevedibilità mostra il percorso dell'indice (chip n→indice, ultimi 8 punti, colori delle soglie 70/40) con ultimo Δ colorato e salti max quando ci sono ≥2 punti — con un solo punto (n=3) non c'è ancora una storia e la riga non appare"),
  check.simbolo("I128", "src/components/analysis-panel.tsx", "evoluzionePrevedibilita\\(cycles\\)", "l'evoluzione è calcolata memoizzata nella sezione cicli e passata alla strip (wiring I96)"),
  check.file("I128", "tests/lib/cycles-abbellimenti.test.ts", "test dell'evoluzione: null sotto 3 completati, punto unico con n=3 (nessun delta, salto 0), ricalcolo cumulativo coerente con prevedibilitaCicli (durati 2,2,2,7h → 100→33, Δ −67), percorso su 5 completati con ultimo Δ positivo e salto max preservato"),
  /* --- I129 — evoluzione delle medie per ciclo (ritmo, spreco) --- */
  check.simbolo("I129", "src/lib/cycles.ts", "evoluzioneMedia", "media cumulativa generica per k = 1..n (una media esiste dal primo ciclo, a differenza dell'indice I128 che parte da 3) con delta, ultimoDelta e maxSalto: la stessa lettura d'evoluzione di I128 applicata a ritmo medio e spreco medio — i cicli recenti stanno ancora spostando le medie?"),
  check.simbolo("I129", "src/components/analysis-panel.tsx", "EvoluzioneMediaLine", "riga «n → media» (ultimi 8 punti, «…» se troncata) con ultimo Δ e salti max NEUTRI (grigio): la direzione del Δ di una media non ha valenza buona/cattiva univoca — il colore dichiarerebbe un giudizio che non è del codice"),
  check.simbolo("I129", "src/components/analysis-panel.tsx", "Evoluzione del ritmo medio", "wiring: evoluzioneMedia sui ratePerHour dei cicli completati (null con consumo nullo escluso), memoizzata, riga sopra lo spreco/per-ciclo; sotto la griglia spreco la riga «Evoluzione dello spreco medio» (residuo al reset)"),
  check.file("I129", "tests/lib/cycles-abbellimenti.test.ts", "test evoluzioneMedia: null su vuoto, punto unico, medie cumulative sui ritmi reali di serieCicli (35/46/24 → 35, 40,5, 35) con Δ e salto max, spreco endValue (20/3/44 → 20, 11,5, 22,33…), salto max = max|Δ|"),
  /* --- I130 — evoluzione del consumo medio (drawdown per ciclo) --- */
  check.simbolo("I130", "src/components/analysis-panel.tsx", "evoConsumo", "stessa lettura d'evoluzione (I128/I129) per il consumo medio per ciclo: la terza metrica della sezione cicli completa il quadro — `consumed` è SEMPRE un numero (anche 0, con nessuna discesa osservata) e a differenza del ritmo non serve alcun filtro null: il consumo nullo è un dato valido e resta nel campione"),
  check.simbolo("I130", "src/components/analysis-panel.tsx", "Evoluzione del consumo medio", "riga dopo la griglia KPI (prima dell'evoluzione del ritmo: ordine di lettura consumo → ritmo → spreco come le colonne della tabella) con chip «n → media», ultimo Δ neutro e salti max; gate ≥2 cicli completati come I129"),
  check.simbolo("I130", "src/components/analysis-panel.tsx", "c\\.consumed", "wiring al campo drawdown massimo (start − minValue) di buildCycle: robusto ai recuperi interni al ciclo (una risalita non è consumo mancato) — coerenza col KPI «Consumo medio» di summarizeCycles (avgConsumed)"),
  check.file("I130", "tests/lib/cycles-abbellimenti.test.ts", "test I130: consumi reali di serieCicli (70/92/48 → medie 70, 81, 70 con Δ ±11), coerenza ultimo punto = avgConsumed, drawdown ≠ start−end con recupero interno (90→10→30 → 80, non 60), consumo nullo 0 resta nel campione (a differenza del ritmo null → escluso: 85→85 → medie 0, 15 con Δ +15)"),
  /* --- I131 — sparkline per le righe di evoluzione --- */
  check.file("I131", "src/lib/sparkline.ts", "geometria della sparkline come funzione PURA e testata: puntiSparkline(values, w, h, pad) normalizza su min/max con y INVERTITA (origine SVG in alto a sinistra), serie piatta (min === max) a metà altezza, <2 punti → array vuoto — nessun troncamento: la forma mostra TUTTI i punti al posto delle chip tagliate a 8 con «…»"),
  check.simbolo("I131", "src/components/analysis-panel.tsx", "function Sparkline", "componente svg inline per le righe di evoluzione: polilinea + ultimo punto cerchiato, currentColor (indice colorato per soglia, medie neutre), aria-label/title con la serie completa dei valori esatti che le chip mostravano"),
  check.simbolo("I131", "src/components/analysis-panel.tsx", "puntiSparkline", "wiring: ENTRAMBE le righe (PrevedibilitaEvoLine I128 e EvoluzioneMediaLine I129/I130) passano dalla sparkline — slice(-8) e il troncamento «…» rimossi; resta la chip finale «n → valore» col punto corrente esatto"),
  check.file("I131", "tests/lib/sparkline.test.ts", "test I131: normalizzazione [0,50,100] → x 2/48/94 e y 22/12/2 (invertita), serie piatta [5,5,5,5] → y=h/2 con x distribuita, <2 punti → [], viewport custom (200×40, pad 5) su [70,92,48] → y 20/5/35 (scala min/max, NON primo/ultimo)"),
  /* --- I132 — kiosk: rotazione sempre visibile + countdown del timer (bug utente) --- */
  check.simbolo("I132", "src/lib/kiosk.ts", "function intervalloRotazioneMs", "helper PURO estratto dal Math.max(5, …) inlinea I87 di page.tsx: intervallo in ms con clamp KIOSK_ROTATION_MIN_SECONDS=5, testato su tutti i valori del selettore (15/30/60/120/300) e sul clamp (0, negativi, 2 → 5s)"),
  check.simbolo("I132", "src/components/kiosk-bar.tsx", "function CountdownRotazione", "countdown «prossima schermata tra Ns» nella barra (testo I133, era «prossima vista tra Ns»): foglia VIVA abbonata all'orologio 1 Hz I96 (la pagina non re-renderizza al secondo), visibile SOLO con rotazione attiva — riscontro continuo che il timer gira anche con intervalli fino a 5 minuti"),
  check.simbolo("I132", "src/app/page.tsx", "Kiosk attivo — in attesa dei dati", "branch kiosk FUORI dal branch «snapshot ?»: senza dati (primo fetch, errore API, quota esaurita) il kiosk mostra lo stato d'attesa «Kiosk attivo — in attesa dei dati» invece dei rami loading/null che lasciavano l'area centrale VUOTA — la causa del bug «la rotazione non ha alcun effetto»: lo stato kioskView cambiava ma lo schermo no"),
  check.file("I132", "tests/lib/kiosk-rotazione.test.ts", "test I132: intervalloRotazioneMs sui valori del selettore e clamp al minimo, prossimaRotazioneEpoch (matematica chiusa + coerenza now + intervallo), test componente countdown (armato → «prossima schermata tra \d+s» dal testo I133, null → assente, rotazione spenta → assente)"),
  /* --- I133 — kiosk: selettore rotazione più comprensibile (richiesta utente) --- */
  check.simbolo("I133", "src/components/kiosk-bar.tsx", "Rotazione tra schermate", "etichetta esplicita al posto del solo «Rotazione»: dice CHE COSA ruota (le schermate/visuali Quote → Grafico → Analisi), richiesta utente «scriverei rotazione tra schermate, rotazioni tra visuali al posto di rotazione»"),
  check.simbolo("I133", "src/components/kiosk-bar.tsx", "ciclo automatico: Quote → Grafico → Analisi, poi ricomincia", "hint visibile con rotazione attiva: rende leggibile a colpo d'occhio il funzionamento del selettore (ordine di rotazione e ripetizione) — informazione che prima non compariva da nessuna parte nella UI"),
  check.simbolo("I133", "src/components/kiosk-bar.tsx", "rotazione spenta: cambio schermata solo coi bottoni", "hint con rotazione disattivata: distingue lo stato spento (solo cambio manuale coi bottoni a fianco) dal ciclo automatico"),
  check.simbolo("I133", "src/components/kiosk-bar.tsx", "Ogni quanto cambia la schermata durante la rotazione automatica", "title esplicativo sul selettore dell'intervallo + aria-label «Intervallo di rotazione delle schermate»: il selettore spiega se stesso"),
  check.simbolo("I133", "tests/components/kiosk-bar.test.tsx", "I133", "test di componente: etichetta esplicita + aria-label switch, hint ciclo/spento mutuamente esclusi, title del selettore, countdown allineato a «prossima schermata tra»"),
  /* --- I134 — asset visivi del README allineati a I133 (richiesta utente) --- */
  check.simbolo("I134", "scripts/github-assets.py", "Prova la demo", "cattura I126-aware: la demo NON è più il default (I126) e un contesto fresco mostra la scheda di setup — la pipeline clicca esplicitamente «Prova la demo» e verifica il badge «dati simulati» dopo il click; il badge da solo non basta come segnale: la copia della scheda I126 lo contiene lei stessa"),
  check.simbolo("I134", "scripts/github-assets.py", "modalita-kiosk", "cattura della modalità kiosk/TV (?kiosk=1) con stato kiosk seminato (rotazione attiva a 30 s): lo screenshot mostra la barra I133 («Rotazione tra schermate» + hint del ciclo) e il countdown I132 («prossima schermata tra Ns»), verificati nel body prima dello scatto"),
  check.simbolo("I134", "README.md", "modalita-kiosk\\.png", "lo screenshot della modalità kiosk è referenziato nel README: la funzionalità di punta I87/I132/I133 ha ora una visuale nella sezione Screenshot, accanto ai 4 PNG della dashboard"),
  {
    item: "I111",
    what: "APP_VERSION allineata al changelog canonico (docs/04 §8, riga più recente) — regola dell'utente «aggiorna sempre la versione», ora presidiata dall'audit e non solo dalla memoria",
    kind: "versione",
    run: () => {
      const mv = /APP_VERSION = "(\d{4}-\d{2}-\d{2}) · (I\d+)"/.exec(read("src/lib/version.ts") ?? "");
      if (!mv) return "APP_VERSION non trovata in src/lib/version.ts";
      const d04 = read("docs/04-stato-avanzamento.md") ?? "";
      const sezione = d04.indexOf("## 8. Changelog della documentazione");
      if (sezione < 0) return "sezione §8 non trovata in docs/04";
      const riga = /^\| (\d{4}-\d{2}-\d{2}) \|([^\n]*)/m.exec(d04.slice(sezione));
      if (!riga) return "nessuna riga changelog trovata in docs/04 §8";
      const item = /\*\*(I\d+)/.exec(riga[2] ?? "");
      if (!item) return "item I<n> non trovato nella riga changelog più recente di docs/04 §8";
      return mv[1] === riga[1] && mv[2] === item[1]
        ? null
        : `APP_VERSION "${mv[1]} · ${mv[2]}" non allineata al changelog canonico (attesa "${riga[1]} · ${item[1]}")`;
    },
  },
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
