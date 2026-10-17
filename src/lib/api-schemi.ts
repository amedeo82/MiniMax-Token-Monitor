/**
 * I103 — Schemi zod per i corpi delle API (proxy + archivi).
 *
 * Prima di I103 la validazione dei body era sparsa e ripetuta: check manuali
 * `typeof`/`Array.isArray` nelle route, cap batch a mano, normalizzazioni
 * inline — mentre **zod era già dipendenza ma mai importato** in `src/`.
 *
 * Contratto esterno INVARIATO (criterio di accettazione docs/08): le stesse
 * richieste producono le stesse risposte — i test route-level I99
 * (tests/lib/api-archivi.test.ts, api-proxy.test.ts) fissano il contratto e
 * fanno da rete di sicurezza della riscrittura. Le semantiche dei campi
 * restano quelle estratte in I91 (`lib/http-validate.ts`: toEpoch/toFloat),
 * ora COMPOSTE dentro gli schemi invece di ripetute nelle route:
 *
 * - gli schemi-oggetto descrivono il corpo; il cap batch 500 è una
 *   transform (troncamento silenzioso, come il `slice(0, 500)` storico);
 * - gli schemi-riga normalizzano ogni elemento: i campi non interpretabili
 *   diventano null e la route scarta la riga (identico al `continue` storico);
 * - i messaggi 400 restano quelli del contratto (bad_request / missing_key /
 *   «Nessun punto valido…»).
 */

import { z } from "zod";
import { toEpoch, toFloat } from "@/lib/http-validate";

/* ------------------------------------------------------------------ */
/* Campi                                                               */
/* ------------------------------------------------------------------ */

/** Epoch ms o secondi → ms (semantiche toEpoch I91); null se non interpretabile. */
/* NB zod 4: i campi unknown di un oggetto sono «nonoptional» — per accettare
   anche le CHIAVI MANCANTI (contratto: assente = non interpretabile →
   default/null) serve `.optional()` prima della transform. */
const epoch = z.unknown().optional().transform((v) => toEpoch(v));

/** Percentuale 0–100 da numero o stringa numerica (toFloat I91); null altrimenti. */
const percentuale = z.unknown().optional().transform((v) => toFloat(v));

/** Stringa-nullable del contratto eventi (optionalString): TRIM usato solo per
    la verifica di non-vuotezza, il taglio avviene sul valore originale. */
const stringaEventuale = (max: number) =>
  z.unknown().optional().transform((v) =>
    typeof v === "string" && v.trim() !== "" ? v.slice(0, max) : null,
  );

/** Nome modello del contratto per-modello (toModelName): trim + taglio + non-vuoto. */
const nomeModello = z.unknown().optional().transform((v) => {
  if (typeof v !== "string") return null;
  const nome = v.trim().slice(0, 32);
  return nome.length > 0 ? nome : null;
});

/** Sorgente del punto (contratto storico): stringa non vuota tagliata a 16, altrimenti «api». */
const sorgente = z.unknown().optional().transform((v) =>
  typeof v === "string" && v !== "" ? v.slice(0, 16) : "api",
);

/** Regione del contratto storico: solo «cn» è esplicita, tutto il resto è «eu». */
const regione = z.unknown().optional().transform((v) => (v === "cn" ? "cn" : "eu"));

/* ------------------------------------------------------------------ */
/* Corpi delle richieste                                               */
/* ------------------------------------------------------------------ */

/** Proxy /api/minimax/usage (I3/I18/I51): chiave obbligatoria, regione eu|cn.
    Una regione non nota DEGRADA a «eu» (`.catch`), come il ternario storico. */
export const schemaCorpoProxy = z.object({
  apiKey: z.string().trim().min(1),
  region: z.enum(["eu", "cn"]).catch("eu"),
});

/** Corpo degli archivi con cap batch 500: array mancante/non-array → []
    (la route risponde 400 «Nessun punto valido…» come prima di I103). */
const corpoArchivio = (campo: "points" | "events") =>
  z
    .object({ [campo]: z.array(z.unknown()).catch([]) })
    .transform((body) => ((body[campo] as unknown[]) ?? []).slice(0, 500));

export const schemaCorpoPunti = corpoArchivio("points");
export const schemaCorpoEventi = corpoArchivio("events");

/* ------------------------------------------------------------------ */
/* Righe degli archivi                                                 */
/* ------------------------------------------------------------------ */

/** Punto flat dello storico (I16): t null → riga scartata dalla route. */
export const schemaPuntoStorico = z.object({
  t: epoch,
  interval: percentuale,
  weekly: percentuale,
  source: sorgente,
  region: regione,
});

/** Evento del registro (I27): id/t/kind/message null → riga scartata;
    model/win null → riga SALVATA con null (contratto invariato). */
export const schemaEventoIngresso = z.object({
  id: stringaEventuale(64),
  t: epoch,
  kind: z.enum(["reset", "warn", "crit", "error", "info"]).nullable().catch(null),
  model: stringaEventuale(64),
  win: z.enum(["interval", "weekly"]).nullable().catch(null),
  message: stringaEventuale(500),
  value: percentuale,
});

/** Punto per-modello LONG (I82): t/model null → riga scartata; le finestre
    non nulle generano una riga ciascuna (upsert dedup model+win+t). */
export const schemaPuntoModello = z.object({
  t: epoch,
  model: nomeModello,
  interval: percentuale,
  weekly: percentuale,
  source: sorgente,
  region: regione,
});

/** Azione di manutenzione (I111): «pulizia» = ritenuta+caps, «vacuum» =
    recupero pagine libere, «manutenzione» = ciclo completo (misura →
    integrità → quota → pulizia → VACUUM automatico se ha eliminato).
    I122 — «rimuovi-demo» = DELETE selettivo dei soli punti source="demo"
    (falsi reset nelle analisi), con backup delle righe nella risposta;
    `dryRun` (opzionale, solo per rimuovi-demo) = conteggio + backup SENZA
    cancellare. */
export const schemaAzioneManutenzione = z.object({
  azione: z.enum(["pulizia", "vacuum", "manutenzione", "rimuovi-demo"]),
  dryRun: z.boolean().optional(),
});
