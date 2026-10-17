/**
 * I120 — Token admin lato client per le scritture protette dalla guardia I95.
 *
 * Contesto (docs/11 §5.2): in produzione il server può esigere l'header
 * `x-admin-token` su OGNI scrittura (POST/DELETE) degli archivi — la variabile
 * d'ambiente `ADMIN_TOKEN` decide (guardia I95 attiva solo se impostata).
 * Il WRITER dei dati è il browser (replica fire-and-forget di storico, eventi
 * e punti per-modello): senza questo modulo, attivare la guardia sul server
 * romperebbe la replica IN SILENZIO (le repliche tacciono gli errori per
 * design) — gli archivi server smetterebbero di ricevere dati senza segnali.
 *
 * Contratto:
 * - il token vive SOLO nel localStorage del browser
 *   (`mm-dash-admin-token-v1`, convenzione mm-dash-*-v1): come la chiave
 *   MiniMax, mai nel codice, mai nel bundle, mai nei log;
 * - `headerAdmin()` è DOM-side e SSR-safe: fuori dal browser restituisce {}
 *   e le fetch di scrittura restano IDENTICHE a prima del I120;
 * - il token è OPZIONALE: se il server non richiede la guardia, un header in
 *   più è semplicemente ignorato — nessun comportamento cambia;
 * - `esitoSondaAdmin()` classifica la sonda di verifica del dialog
 *   Impostazioni (POST /api/manutenzione con azione inesistente): la guardia
 *   I95 gira PRIMA del parsing del body, quindi 401 = identità rifiutata,
 *   400 = accettata (o guardia spenta), 429 = accettata ma budget scritture
 *   esaurito (il rate limit corre DOPO il controllo identità). La sonda non
 *   scrive nulla sul database: il body viene rifiutato con 400.
 */

export const ADMIN_TOKEN_STORAGE_KEY = "mm-dash-admin-token-v1";

/** Legge il token dal localStorage del browser (null se assente, vuoto o SSR). */
export function leggiTokenAdmin(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const t = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    return typeof t === "string" && t.trim() !== "" ? t.trim() : null;
  } catch {
    /* localStorage indisponibile (privacy estremo, storage bloccato): nessun token */
    return null;
  }
}

/** Salva il token nel browser (tagliato ai bordi; stringa vuota = rimozione). */
export function salvaTokenAdmin(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = token.trim();
    if (t === "") window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    else window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, t);
  } catch {
    /* storage pieno o bloccato: il resto dell'app non ne dipende */
  }
}

/** Rimuove il token dal browser. */
export function cancellaTokenAdmin(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/** PURA — header da allegare a una scrittura: `{}` se il token manca. */
export function headerAdminDa(token: string | null): Record<string, string> {
  const t = token?.trim();
  return t ? { "x-admin-token": t } : {};
}

/** DOM-side — header pronti per le fetch di scrittura ({} su SSR o senza token). */
export function headerAdmin(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return headerAdminDa(leggiTokenAdmin());
}

export interface EsitoSonda {
  ok: boolean;
  messaggio: string;
}

/**
 * PURA — classifica la risposta della sonda di identità (mai una scrittura).
 * I codici significativi sono quelli che `bloccoScrittura` (I95) può emettere
 * PRIMA del parsing del body di /api/manutenzione.
 */
export function esitoSondaAdmin(status: number): EsitoSonda {
  if (status === 401) {
    return {
      ok: false,
      messaggio:
        "Il server richiede il token e l'ha RIFIUTATO (401): le scritture dal browser fallirebbero. Confronta il valore con ADMIN_TOKEN impostato sul server.",
    };
  }
  if (status === 400) {
    return {
      ok: true,
      messaggio:
        "Identità accettata dal server (o guardia non attiva): le scritture dal browser funzioneranno.",
    };
  }
  if (status === 429) {
    return {
      ok: true,
      messaggio:
        "Identità accettata, ma il budget di scritture del minuto è esaurito: la verifica è positiva, riprova più tardi per conferma.",
    };
  }
  return { ok: false, messaggio: `Risposta inattesa dal server (HTTP ${status}).` };
}
