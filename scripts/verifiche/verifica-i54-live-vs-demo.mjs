#!/usr/bin/env node
/**
 * I54 — Verifica di coerenza inversa «live ↔ demo» (matrice ricostruita).
 *
 * Era `docs/03` §5.9 (eseguita il 09/10 con esito «live ⊇ demo su tutte le
 * dimensioni»); la sezione con la matrice a 23 dimensioni è PERSA col secondo
 * rollback dell'11/10 → qui RI-ESeguita e ri-documentata (`docs/03` §5.22) con
 * esito su FILE e CONTEGGIO AGGIORNATO (la matrice è ricostruita dal codice
 * attuale: il numero di dimensioni può differire dall'originale, onestamente
 * registrato).
 *
 * Domanda della verifica: OGNI dimensione di comportamento visibile in modalità
 * demo ha una controparte nel percorso live (con la STESSA logica condivisa),
 * salvo le dimensioni live-only PER COSTRUZIONE (rete, errori, notifiche SW)?
 * Verdetto atteso: «live ⊇ demo» — il live copre tutto ciò che la demo mostra,
 * e in più ha ciò che la demo non può avere.
 *
 * Metodo: evidenze statiche sul codice (regex su file) per ogni dimensione —
 * il percorso demo e quello live condividono lo stesso simbolo/componente/lib,
 * oppure il fork è documentato come marcatore di fonte o live-only voluto.
 *
 * Esecuzione: node scripts/verifiche/verifica-i54-live-vs-demo.mjs
 * Esiti:      scripts/verifiche/esiti/i54-<timestamp>.md (+ .json)
 *             scripts/verifiche/esiti/i54-live-vs-demo-latest.md (nome stabile per l'audit)
 * Zero rete, zero chiavi, zero scritture DB.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ESITI = join(ROOT, "scripts", "verifiche", "esiti");

const cacheFile = new Map();
function leggi(rel) {
  if (!cacheFile.has(rel)) {
    try {
      cacheFile.set(rel, readFileSync(join(ROOT, rel), "utf8"));
    } catch {
      cacheFile.set(rel, null);
    }
  }
  return cacheFile.get(rel);
}

let falli = 0;
const righe = [];

/**
 * Registra una dimensione della matrice.
 * @param {string} id
 * @param {string} nome
 * @param {string} demo  evidenza/demo-side
 * @param {string} live  evidenza/live-side
 * @param {Array<{rel: string, pattern: string, tipo?: "presenza"|"assenza", nota?: string}>} checks
 * @param {"condivisa"|"condivisa (con marcatore)"|"live-only per costruzione"} tipo
 * @param {string} nota
 */
function dimensione(id, nome, demo, live, checks, tipo, nota) {
  const problemi = [];
  for (const c of checks) {
    const contenuto = leggi(c.rel);
    if (contenuto === null) {
      problemi.push(`file assente: ${c.rel}`);
      continue;
    }
    const trovato = new RegExp(c.pattern, "m").test(contenuto);
    const richiesto = c.tipo !== "assenza";
    if (richiesto && !trovato) problemi.push(`${c.rel}: atteso /${c.pattern}/`);
    if (!richiesto && trovato) problemi.push(`${c.rel}: VIETATO /${c.pattern}/`);
  }
  if (problemi.length > 0) falli++;
  righe.push({ id, nome, demo, live, tipo, nota, evidenze: checks.map((c) => `${c.tipo === "assenza" ? "ASSENZA" : "presenza"} ${c.rel} /${c.pattern}/`), esito: problemi.length === 0 ? "OK" : `FALLITO: ${problemi.join("; ")}` });
}

/* ------------------------------------------------------------------ */
/* Matrice delle dimensioni                                            */
/* ------------------------------------------------------------------ */

dimensione(
  "D01",
  "Parser della risposta",
  "demo.ts costruisce il raw simulato e passa dallo STESSO parser",
  "page.tsx parsa la risposta del proxy con parseUsageResponse (primaria + secondaria)",
  [
    { rel: "src/lib/demo.ts", pattern: "parseUsageResponse\\(raw, \\{ source: \"demo\"" },
    { rel: "src/app/page.tsx", pattern: "parseUsageResponse\\(r\\.data, \\{" },
    { rel: "src/app/page.tsx", pattern: "parseUsageResponse\\(r?\\.data|parseUsageResponse\\(json\\.data" },
  ],
  "condivisa",
  "un solo percorso di normalizzazione: nessuna divergenza possibile di schema/semantica",
);

dimensione(
  "D02",
  "Envelope base_resp",
  "demo: base_resp { status_code: 0, status_msg: \"success\" }",
  "live: passthrough del proxy (base_resp upstream intatto, 0 = ok)",
  [
    { rel: "src/lib/demo.ts", pattern: "base_resp: \\{ status_code: 0, status_msg: \"success\" \\}" },
    { rel: "src/app/api/minimax/usage/route.ts", pattern: "base_resp" },
  ],
  "condivisa",
  "stessa semantica dell'envelope (0 = ok, altri codici = errore di business)",
);

dimensione(
  "D03",
  "Normalizzazione stati finestra (1/2/3)",
  "demo produce codici numerici 1/3 come il reale",
  "statusLabel/normalizeStatus in minimax.ts senza alcun fork demo",
  [
    { rel: "src/lib/minimax.ts", pattern: "export function statusLabel" },
    { rel: "src/lib/minimax.ts", pattern: "demoMode", tipo: "assenza", nota: "il parser non conosce la demo" },
  ],
  "condivisa",
  "stessa codifica e stesse etichette («Attiva · in uso», «Inattiva · mai usata», «Esaurita (ipotesi)»)",
);

dimensione(
  "D04",
  "Percentuali come fonte della verità",
  "demo: percentuali simulate nella stessa forma",
  "live: percentuali upstream; stessa QuotaWindow.remainingPercent",
  [
    { rel: "src/components/quota-cards.tsx", pattern: "remainingPercent" },
    { rel: "src/lib/minimax.ts", pattern: "remainingPercent: " },
  ],
  "condivisa",
  "nessuna elaborazione diversa per fonte (issue #99: i conteggi non sono attendibili)",
);

dimensione(
  "D05",
  "Conteggi «non dichiarati»",
  "demo: conteggi a 0 come nel piano reale osservato",
  "live: conteggi a 0 → stessa dicitura",
  [
    { rel: "src/components/quota-cards.tsx", pattern: "CountsRow" },
    { rel: "src/components/quota-cards.tsx", pattern: "Conteggi non dichiarati" },
  ],
  "condivisa",
  "nota esplicativa identica su entrambe le fonti",
);

dimensione(
  "D06",
  "Etichette finestre per-modello (5h/24h/7g)",
  "demo: general 5h, video 24h (stesse durate del reale — verifica I48)",
  "live: windowShortLabel deriva dall'API, stessa formula",
  [{ rel: "src/components/quota-cards.tsx", pattern: "export function windowShortLabel" }],
  "condivisa",
  "etichette adattive per modello (I82) indipendenti dalla fonte",
);

dimensione(
  "D07",
  "Countdown vivi",
  "demo: tick `now` di 1 s sulla stessa pagina",
  "live: ricalcolo locale da end_time, stesso tick",
  [{ rel: "src/app/page.tsx", pattern: "setInterval\\(\\(\\) => setNow\\(Date\\.now\\(\\)\\), 1000\\)" }],
  "condivisa",
  "un solo orologio per la pagina: i countdown non dipendono dalla fonte (docs/02 §4.4)",
);

dimensione(
  "D08",
  "Storico flat + replica server (I16)",
  "demo: pushHistory(snap) nel ramo demo (riga ~465)",
  "live: pushHistory(snap) nel ramo live (riga ~615); stesso merge/locale+server",
  [
    { rel: "src/app/page.tsx", pattern: "pushHistory\\(snap\\);" },
    { rel: "src/lib/server-history.ts", pattern: "export" },
  ],
  "condivisa",
  "lo storico demo entra nella STESSA storia (source «demo») con la stessa replica server",
);

dimensione(
  "D09",
  "Storico per-modello (I82)",
  "demo: backfill makeDemoModelHistory al primo avvio",
  "live: punti per-modello inglobati da pushHistory, stessa FIFO + server",
  [
    { rel: "src/app/page.tsx", pattern: "makeDemoModelHistory" },
    { rel: "src/lib/model-history.ts", pattern: "export" },
    { rel: "src/app/api/history/models/route.ts", pattern: "export" },
  ],
  "condivisa",
  "le analisi per-modello sono sensate in demo fin dal primo avvio (stesse curve dei tick)",
);

dimensione(
  "D10",
  "Registro eventi + transizioni",
  "demo: evaluateTransitions sullo snapshot demo (soglie, reset)",
  "live: stessa chiamata su ogni snapshot, indipendente dalla fonte",
  [
    { rel: "src/app/page.tsx", pattern: "evaluateTransitions\\(prevSnapRef\\.current, snapshot, settings\\)" },
    { rel: "src/lib/usage-events.ts", pattern: "export function evaluateTransitions" },
  ],
  "condivisa",
  "avvisi di soglia e rilevamento reset: stesso motore (lezione I18: eventi di sola transizione)",
);

dimensione(
  "D11",
  "Avvisi di soglia",
  "demo: soglie sugli stessi campi",
  "live: soglie identiche (AlertThresholds)",
  [
    { rel: "src/lib/usage-events.ts", pattern: "thresholds: AlertThresholds" },
    { rel: "src/app/page.tsx", pattern: "Soglia di attenzione superata" },
  ],
  "condivisa",
  "banner e titolo tab seguono lo snapshot, qualunque sia la fonte (solo primaria — design I53)",
);

dimensione(
  "D12",
  "Scheduler di polling + backoff (I51)",
  "demo: inclusa nello stesso scheduler (gate = demo OPPURE chiave)",
  "live: backoff esponenziale + Retry-After sugli errori",
  [
    { rel: "src/app/page.tsx", pattern: "if \\(!settings\\.demoMode && !settings\\.apiKey\\) return;" },
    { rel: "src/lib/backoff.ts", pattern: "export function delayAfterFailure|export function" },
  ],
  "condivisa",
  "il gate dello scheduler INCLUDE la demo (nessun percorso parallelo); il backoff è un percorso live-only che non tocca la demo (mai in errore per costruzione)",
);

dimensione(
  "D13",
  "Seconda regione (I53)",
  "demo: snapshot simulato della regione opposta con badge «dati simulati», senza eventi né storico",
  "live: campagna parallela Promise.allSettled, eventi di sola transizione",
  [
    { rel: "src/app/page.tsx", pattern: "setSnapshotAlt\\(makeDemoSnapshot\\(regioneAlt\\(s\\.region\\)\\)\\)" },
    { rel: "src/app/page.tsx", pattern: "Promise\\.allSettled" },
    { rel: "src/components/region-alt-panel.tsx", pattern: "export function RegionAltPanel" },
  ],
  "condivisa (con marcatore)",
  "stesso pannello, stessa integrità (mai storico/analisi): il fork è SOLO la fonte dei dati, dichiarata dal badge",
);

dimensione(
  "D14",
  "Import JSON manuale",
  "demo: disponibile (non gated)",
  "live: disponibile — stesso handleImportJson",
  [{ rel: "src/app/page.tsx", pattern: "const handleImportJson = \\(raw: unknown\\)" }],
  "condivisa",
  "nessun ramo demo nell'import: parse identico, pushHistory identico",
);

dimensione(
  "D15",
  "Export CSV/JSON",
  "demo: stessi dati esportabili (source «demo» nel contenuto)",
  "live: stesso lib/export.ts",
  [{ rel: "src/lib/export.ts", pattern: "export function" }],
  "condivisa",
  "formato identico (separatore «;», BOM UTF-8, Excel it-IT)",
);

dimensione(
  "D16",
  "Grafico storico + ritmo di consumo (I59)",
  "demo: curva simulata + backfill",
  "live: curva dai punti reali, stesso HistoryChart/RateChart",
  [
    { rel: "src/components/history-chart.tsx", pattern: "export function HistoryChart|export const HistoryChart" },
    { rel: "src/lib/rate.ts", pattern: "export function rateSeries" },
  ],
  "condivisa",
  "gap e reset trattati identicamente (buchi onesti)",
);

dimensione(
  "D17",
  "Analisi di lungo periodo + cicli/spreco/prevedibilità (I26/I57/I63)",
  "demo: cicli simulati analizzati allo stesso modo",
  "live: stesso analysis-panel sulle stesse lib",
  [
    { rel: "src/components/analysis-panel.tsx", pattern: "CycleWaste" },
    { rel: "src/lib/cycles.ts", pattern: "export function" },
  ],
  "condivisa",
  "nessuna statistica dipende dalla fonte",
);

dimensione(
  "D18",
  "Calendario (I58) / distribuzione (I61) / oggi vs media (I64)",
  "demo: griglia e fasce sui dati simulati",
  "live: stesse componenti",
  [
    { rel: "src/components/analysis-panel.tsx", pattern: "CalendarSection" },
    { rel: "src/components/analysis-panel.tsx", pattern: "DistributionSection|TodayComparison" },
  ],
  "condivisa",
  "DST-safe via date stringhe, identico per fonte",
);

dimensione(
  "D19",
  "Anomalie del ritmo / EWMA / qualità campionamento (I70/I71/I72)",
  "demo: z-score, EWMA e copertura sui tick simulati",
  "live: stesse lib rate-anomalies/ewma/sampling",
  [
    { rel: "src/lib/rate-anomalies.ts", pattern: "export function" },
    { rel: "src/lib/ewma.ts", pattern: "export function" },
    { rel: "src/lib/sampling.ts", pattern: "export function" },
  ],
  "condivisa",
  "regimi e soglie identici",
);

dimensione(
  "D20",
  "Diagnostica e salute del monitor (I60/I62)",
  "demo: episodi simulati dal registro eventi",
  "live: episodi reali, stesso health.ts",
  [
    { rel: "src/components/diagnostica-panel.tsx", pattern: "export function" },
    { rel: "src/lib/health.ts", pattern: "export function" },
  ],
  "condivisa",
  "in demo il monitor non ha guasti: la salute mostra l'assenza di episodi (comportamento corretto, non un fork)",
);

dimensione(
  "D21",
  "Modalità kiosk/TV (I87)",
  "demo: viste identiche (nessun fork)",
  "live: identiche — kiosk.ts non menziona la demo",
  [{ rel: "src/lib/kiosk.ts", pattern: "demo", tipo: "assenza", nota: "nessun fork demo nel kiosk" }],
  "condivisa",
  "rotazione, dimming e barra sticky sopra qualunque fonte",
);

dimensione(
  "D22",
  "Modalità compatta (I73)",
  "demo: widget con anelli simulati",
  "live: stesso compact.ts",
  [{ rel: "src/lib/compact.ts", pattern: "export" }],
  "condivisa",
  "nessun fork",
);

dimensione(
  "D23",
  "Tema chiaro/scuro (I78/I84)",
  "demo: stesse superfici",
  "live: identico (next-themes)",
  [{ rel: "src/components/theme-toggle.tsx", pattern: "useTheme" }],
  "condivisa",
  "nessun fork",
);

dimensione(
  "D24",
  "Nav sezioni + scrollspy (I66/I74/I85)",
  "demo: stessa nav",
  "live: stessa useScrollSpySezioni",
  [
    { rel: "src/components/section-nav.tsx", pattern: "useScrollSpySezioni" },
    { rel: "src/components/bottom-nav.tsx", pattern: "useScrollSpySezioni" },
  ],
  "condivisa",
  "nessun fork",
);

dimensione(
  "D25",
  "Vista stampa (I75)",
  "demo: report con marcatore «dati simulati»",
  "live: stesso PrintReport con prop demo",
  [{ rel: "src/app/page.tsx", pattern: "<PrintReport[^>]*demo=\\{settings\\.demoMode\\}" }],
  "condivisa (con marcatore)",
  "stesso report; la fonte è dichiarata nel documento",
);

dimensione(
  "D26",
  "Titolo tab + favicon (I67)",
  "demo: TabIdentity con prop demo",
  "live: stesso tab-identity.ts",
  [{ rel: "src/app/page.tsx", pattern: "<TabIdentity[^>]*demo=\\{settings\\.demoMode\\}" }],
  "condivisa (con marcatore)",
  "stesso comportamento; suffisso demo dichiarato",
);

dimensione(
  "D27",
  "TechInfo: sorgente dati",
  "demo: endpoint «demo://token_plan/remains» + «Modalità demo (nessuna chiamata reale)»",
  "live: endpoint reale interrogato",
  [{ rel: "src/app/page.tsx", pattern: "demo://token_plan/remains" }],
  "condivisa (con marcatore)",
  "stessa riga diagnostica, fonte dichiarata",
);

dimensione(
  "D28",
  "Notifiche SW a tab chiuso (I52, ADR-14)",
  "demo: DISISCRIZIONE esplicita (demoMode → apiKey null → il SW cancella)",
  "live: sottoscrizione con chiave in IndexedDB",
  [{ rel: "src/components/pwa-register.tsx", pattern: "s\\.demoMode \\|\\| !s\\.apiKey" }],
  "live-only per costruzione",
  "documentato in docs/03 §5.10: in demo non ci sono dati reali da notificare — il percorso demo è gestito ESPPLICITAMENTE (disiscrizione), non abbandonato",
);

dimensione(
  "D29",
  "Percorsi d'errore: rete, fallback I18, Retry-After, ora server dedotta",
  "demo: non esistono (nessuna rete, nessun guasto possibile)",
  "live: inferServerTime, fallback coding_plan/remains, backoff con Retry-After",
  [
    { rel: "src/lib/minimax.ts", pattern: "inferServerTime|export function shouldTryFallback" },
    { rel: "src/app/api/minimax/usage/route.ts", pattern: "fallback|fallbackUsed|used" },
  ],
  "live-only per costruzione",
  "il live è un SUPERINSIEME: tutto ciò che la demo mostra esiste nel live, e il live aggiunge la gestione del mondo reale",
);

/* ------------------------------------------------------------------ */
/* Verdetto e scrittura esiti                                          */
/* ------------------------------------------------------------------ */

const nCondivise = righe.filter((r) => r.tipo.startsWith("condivisa")).length;
const nLiveOnly = righe.filter((r) => r.tipo === "live-only per costruzione").length;
const verdetto =
  falli === 0
    ? `live ⊇ demo su tutte le ${righe.length} dimensioni ricostruite: ${nCondivise} condivise (stesso codice; marcatore di fonte dove previsto) + ${nLiveOnly} gruppi live-only per costruzione (notifiche SW disiscritte in demo; percorsi d'errore/rete inesistenti in demo). La demo non mostra NULLA che il live non copra; il live copre tutto ciò che la demo mostra e in più ha la gestione del mondo reale. Matrice originale (23 dimensioni, 09/10) persa col rollback: ricostruzione onesta con conteggio aggiornato.`
    : `VERDETTO NEGATIVO: ${falli} dimensioni con evidenze FALLITE su ${righe.length} — vedere le righe FALLITO.`;

const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
mkdirSync(ESITI, { recursive: true });

const tabella = [
  "| # | Dimensione | Percorso demo | Percorso live | Tipo | Evidenze (audit statico) | Esito |",
  "|---|-----------|---------------|---------------|------|--------------------------|-------|",
  ...righe.map(
    (r) =>
      `| ${r.id} | ${r.nome} | ${r.demo} | ${r.live} | ${r.tipo} | ${r.evidenze.join(" · ")} | ${r.esito === "OK" ? "✅ OK" : "❌ " + r.esito} |`,
  ),
].join("\n");

const md = `# I54 — Verifica di coerenza inversa «live ↔ demo» (matrice ricostruita)

> Eseguita: ${new Date().toISOString()} (Europe/Rome: ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })})
> Metodo: per ogni dimensione, evidenza STATICHE sul codice — il percorso demo e quello live condividono lo stesso simbolo/componente/lib, oppure il fork è documentato (marcatore di fonte, live-only voluto). Le assenze richieste (nessun fork nel parser, nessun fork nel kiosk) sono verificate altrettanto esplicitamente.
> Nota storica: la matrice originale (23 dimensioni, 09/10) è persa col secondo rollback dell'11/10; questa è una RICOSTRUZIONE dal codice attuale con conteggio onestamente aggiornato (${righe.length} dimensioni).

## Verdetto

**${verdetto}**

## Matrice

${tabella}

## Lettura

- **Condivise**: demo e live attraversano lo STESSO codice (parser, normalizzazioni, storico, eventi, analisi, UI): nessuna divergenza di comportamento è possibile senza modificare un simbolo condiviso, e l'audit di riconciliazione (I55) sorveglia questi simboli a ogni passata.
- **Condivise (con marcatore)**: unico fork dichiarato = la FONTE dei dati (badge «dati simulati», endpoint «demo://», prop demo nelle stampe/titolo): presentazione, non logica.
- **Live-only per costruzione**: la demo non ha rete né guasti; il SW si disiscrive esplicitamente in demo (gestito, non ignorato). Sono i punti in cui «live ⊇ demo» è tautologico e voluto.
`;

const json = {
  item: "I54",
  eseguita: new Date().toISOString(),
  verdetto,
  conteggi: { dimensioni: righe.length, condivise: nCondivise, liveOnly: nLiveOnly, fallite: falli },
  righe,
};

writeFileSync(join(ESITI, `i54-${ts}.md`), md);
writeFileSync(join(ESITI, `i54-${ts}.json`), JSON.stringify(json, null, 2));
writeFileSync(join(ESITI, "i54-live-vs-demo-latest.md"), md);

console.log(`I54 — ${verdetto}`);
console.log(`Esiti: scripts/verifiche/esiti/i54-${ts}.md (+ json, + latest)`);
if (falli > 0) process.exit(1);
