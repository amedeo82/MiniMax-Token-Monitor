/**
 * I124 — Chiavi localStorage dello storico, fonte unica.
 *
 * Prima le chiavi vivevano sparpagliate (HISTORY_KEY in page.tsx,
 * MODEL_HISTORY_KEY in model-history.ts): l'azione «Svuota storico locale»
 * del dialog Impostazioni → Persistenza deve cancellare ESATTAMENTE le stesse
 * chiavi che la pagina scrive — una fonte unica elimina il rischio di
 * deriva tra le due (cancellare una chiave sbagliata o rinominata = svuotare
 * il browser senza riuscire a pulire lo storico, o peggio: cancellare dati
 * di altre funzionalità).
 *
 * NON includono la chiave API né il token admin: restano nelle rispettive
 * librerie (settings, admin-token) e NON vengono toccati dallo svuotamento.
 */

/** Storico flat «general» (max 600 punti, FIFO). Prima in page.tsx (I16). */
export const CHIAVE_STORICO = "mm-dash-history-v1";

/** Storico per-modello (max 2.000 punti, FIFO). Prima in model-history.ts (I82). */
export const CHIAVE_STORICO_MODELLI = "mm-dash-modelhistory-v1";

/**
 * I124 — Svuota lo storico locale del browser (flat + per-modello): i punti
 * server NON sono toccati e vengono riscaricati e fusi al prossimo avvio
 * (offline-first, I16/I82). Scopo: ripartire da una serie locale pulita —
 * es. per eliminare i punti demo legacy pre-I124, non discriminabili a
 * posteriori perché privi della marca `source`. Ritorna le chiavi rimosse.
 */
export function svuotaStoricoLocale(): string[] {
  if (typeof window === "undefined") return [];
  const rimosse: string[] = [];
  for (const chiave of [CHIAVE_STORICO, CHIAVE_STORICO_MODELLI]) {
    if (window.localStorage.getItem(chiave) !== null) rimosse.push(chiave);
    window.localStorage.removeItem(chiave);
  }
  return rimosse;
}
