import { appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Region } from "@/lib/minimax";

/**
 * Campionatore passivo (I49 · ADR-13-R2) — blocco TEMPORANEO, rimuovere a fine campagna V8.
 *
 * Cosa fa: a ogni risposta VALIDA dell'endpoint usage ricevuta dal proxy accoda una
 * riga JSONL su `scripts/verifiche/campione-live.jsonl` con istante di cattura,
 * regione, endpoint ed envelope grezza. Il dashboard polla già ogni ~60 s: il
 * campionamento è quindi a costo zero (nessuna chiamata extra, nessun consumo quota).
 *
 * Cosa NON fa MAI:
 * - non scrive la Subscription Key (vive solo nel corpo della RICHIESTA e non viene
 *   mai serializzata qui);
 * - non scrive le risposte in errore (es. `base_resp.status_code = 1004`): genererebbero
 *   rumore e crescita senza valore con chiave non valida;
 * - non lancia eccezioni: un errore di scrittura non deve mai rompere il proxy.
 *
 * Protocollo di chiusura campagna (come da runbook `docs/05` §11):
 * 1. rimuovere il blocco marcato in `src/app/api/minimax/usage/route.ts`;
 * 2. NON commettere `campione-live.jsonl`: dal I136 i campioni reali NON entrano nel
 *    repo (gitignored, pre-pubblicazione GitHub) — nel repo vive solo la fixture
 *    sintetica `campione-fixture.jsonl`; il file reale resta in locale per le
 *    verifiche manuali (`--input` su analisi-reset-timezone.mjs);
 * 3. aggiornare `docs/04` §4 (V8) e `docs/02` §5 con il verdetto.
 */

const CAMPIONE_DIR = "scripts/verifiche";
const CAMPIONE_FILE = "campione-live.jsonl";
/** Cap di crescita: oltre soglia il campionamento si ferma (la campagna va chiusa/committata). */
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

/**
 * Riconosce un envelope valido: `{ base_resp: { status_code: 0 }, model_remains: [...] }`.
 * Restituisce il record tipizzato come oggetto oppure null se la risposta non è
 * un campione utile (errore applicativo, struttura inattesa, payload vuoto).
 */
export function envelopeValida(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const base = rec["base_resp"];
  if (!base || typeof base !== "object") return null;
  const statusCode = (base as Record<string, unknown>)["status_code"];
  if (statusCode !== 0) return null;
  if (!Array.isArray(rec["model_remains"]) || rec["model_remains"].length === 0) return null;
  return rec;
}

/** Percorso del file campione (costante pubblica per reference in docs/test). */
export const PERCORSO_CAMPIONE = path.resolve(process.cwd(), CAMPIONE_DIR, CAMPIONE_FILE);

/**
 * Accoda (fire-and-forget) una risposta valida su disco. Best-effort intenzionale:
 * qualunque problema (disco, permessi, cap raggiunto) viene silenziato e il proxy
 * continua a funzionare identicamente (ADR-13-R2).
 *
 * `fileDest` consente ai test di scrivere su un file dedicato (default: file reale).
 */
export async function campionaRisposta(
  data: unknown,
  region: Region,
  endpoint: string,
  fileDest: string = PERCORSO_CAMPIONE,
): Promise<void> {
  try {
    const envelope = envelopeValida(data);
    if (!envelope) return; // risposta in errore o malformata: nessun campione

    const dir = path.dirname(fileDest);

    const st = await stat(fileDest).catch(() => null);
    if (st && st.size > MAX_BYTES) return; // cap raggiunto: smetti di crescere

    const riga =
      JSON.stringify({
        ts: new Date().toISOString(), // istante di RICEZIONE della risposta (orologio server locale)
        region,
        endpoint,
        payload: envelope,
      }) + "\n";

    await mkdir(dir, { recursive: true });
    await appendFile(fileDest, riga, "utf8");
  } catch {
    // silenzio intenzionale: il campionamento non deve mai impattare la dashboard
  }
}
