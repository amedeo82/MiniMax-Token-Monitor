/**
 * Test diretto del campionatore passivo (I49 · ADR-13-R2) — eseguire con:
 *   bun run scripts/verifiche/test-campione.ts
 *
 * Verifica su disco reale:
 * 1. envelopeValida rifiuta: null, non-oggetto, manca base_resp, status_code 1004, model_remains vuoto;
 * 2. campionaRisposta con envelope INVALIDA → NESSUN file creato;
 * 3. campionaRisposta con envelope VALIDA → 1 riga JSONL con ts/region/endpoint/payload;
 * 4. seconda chiamata valida → 2 righe (append);
 * 5. round-trip: la riga riletta contiene l'envelope sintetico fedele al JSON reale del 02/10.
 *
 * NOTE: il file di prova è scripts/verifiche/campione-live-TEST.jsonl (mai quello reale:
 * il percorso vero viene SOLO toccato se il test passa per il percorso override — qui si
 * usa un file dedicato) — alla fine viene eliminato.
 */
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// Import relativo: bun esegue TS nativamente e risolve l'estensione .ts
import { campionaRisposta, envelopeValida } from "../../src/lib/campione";

const FILE_TEST = path.resolve(process.cwd(), "scripts/verifiche/campione-live-TEST.jsonl");

let falliti = 0;
function verifica(nome: string, cond: boolean, dettaglio = "") {
  if (cond) {
    console.log(`  ✓ ${nome}`);
  } else {
    falliti++;
    console.error(`  ✗ ${nome}${dettaglio ? ` — ${dettaglio}` : ""}`);
  }
}

/** Envelope sintetica fedele al JSON reale del 02/10/2026 (docs/02 §5): finestra 12:00→17:00 Roma. */
const ENVELOPE_VALIDA = {
  base_resp: { status_code: 0, status_msg: "success" },
  model_remains: [
    {
      model_name: "MiniMax-M2",
      current_subscribe_title: "M Plan · Explore",
      remains_time: 3_420_000,
      time_info: { start_time: 1_790_935_200_000, end_time: 1_790_953_200_000 },
      remains: { interval: 74, weekly: 77 },
      counts: { interval_usage_count: 0, interval_total_count: 0, weekly_usage_count: 0, weekly_total_count: 0 },
    },
  ],
};

const ENVELOPE_ERRORE_1004 = {
  base_resp: { status_code: 1004, status_msg: "login fail: Please carry the API secret key" },
};

console.log("— Test campionatore passivo (I49) —");

// 1. envelopeValida: casi negativi
console.log("1) envelopeValida — rifiuti attesi:");
verifica("null → null", envelopeValida(null) === null);
verifica("stringa → null", envelopeValida("ok") === null);
verifica("oggetto senza base_resp → null", envelopeValida({ foo: 1 }) === null);
verifica("status_code 1004 → null", envelopeValida(ENVELOPE_ERRORE_1004) === null);
verifica("model_remains assente → null", envelopeValida({ base_resp: { status_code: 0 } }) === null);
verifica("model_remains vuoto → null", envelopeValida({ base_resp: { status_code: 0 }, model_remains: [] }) === null);
verifica("envelope valida → record", envelopeValida(ENVELOPE_VALIDA) !== null);

// pulizia preventiva
await rm(FILE_TEST, { force: true });

// 2. risposta invalida → nessun file
console.log("2) risposta INVALIDA (1004) → nessun file:");
await campionaRisposta(ENVELOPE_ERRORE_1004, "eu", "https://www.minimax.io/v1/token_plan/remains", FILE_TEST);
// dai tempo alla scrittura fire-and-forget (se fosse partita per errore)
await new Promise((r) => setTimeout(r, 300));
verifica("file NON creato", !existsSync(FILE_TEST));

// 3. risposta valida → 1 riga
console.log("3) risposta VALIDA → 1 riga JSONL (su file di TEST, non su quello reale):");
await campionaRisposta(ENVELOPE_VALIDA, "eu", "https://www.minimax.io/v1/token_plan/remains", FILE_TEST);
await new Promise((r) => setTimeout(r, 300));
verifica("file creato", existsSync(FILE_TEST));
let contenuto = existsSync(FILE_TEST) ? await readFile(FILE_TEST, "utf8") : "";
let righe = contenuto.split("\n").filter((l) => l.trim().length > 0);
verifica("1 riga", righe.length === 1, `trovate ${righe.length}`);
let campione = righe.length > 0 ? JSON.parse(righe[0]) : null;
verifica("campione.ts presente e ISO", typeof campione?.ts === "string" && !Number.isNaN(Date.parse(campione.ts)));
verifica("region 'eu'", campione?.region === "eu");
verifica("endpoint presente", typeof campione?.endpoint === "string" && campione.endpoint.includes("token_plan"));
verifica(
  "payload = envelope sintetica (end_time 1.790.953.200.000)",
  campione?.payload?.model_remains?.[0]?.time_info?.end_time === 1_790_953_200_000,
);

// 4. append: seconda risposta valida → 2 righe
console.log("4) seconda risposta VALIDA → append a 2 righe:");
await new Promise((r) => setTimeout(r, 1100)); // garantire ts diverso
await campionaRisposta(ENVELOPE_VALIDA, "cn", "https://api.minimaxi.com/v1/token_plan/remains", FILE_TEST);
await new Promise((r) => setTimeout(r, 300));
contenuto = await readFile(FILE_TEST, "utf8");
righe = contenuto.split("\n").filter((l) => l.trim().length > 0);
verifica("2 righe", righe.length === 2, `trovate ${righe.length}`);
campione = JSON.parse(righe[1]);
verifica("seconda riga region 'cn'", campione.region === "cn");
verifica("ts delle righe distinte", righe[0] !== righe[1]);

// 5. la chiave non compare mai nel file
console.log("5) sicurezza: nessuna chiave nel file:");
verifica("nessuna occorrenza 'apiKey'", !contenuto.includes("apiKey"));
verifica("nessuna occorrenza 'Authorization'", !contenuto.includes("Authorization"));

// pulizia
await rm(FILE_TEST, { force: true });
console.log(`— pulizia: ${FILE_TEST} eliminato —`);

if (falliti > 0) {
  console.error(`ESITO: ${falliti} verifiche FALLITE`);
  process.exit(1);
}
console.log("ESITO: tutte le verifiche passate ✓");
