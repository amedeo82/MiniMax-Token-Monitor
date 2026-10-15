/**
 * I98 — unico punto di scrittura localStorage con gestione esplicita della quota.
 *
 * Problema (docs/08, proposta I98): con il localStorage pieno (storico 600 +
 * eventi 200 + model-history 2000 + impostazioni) le scritture fallivano IN
 * SILENZIO — ogni `setItem` era in try/catch che ignorava l'errore — e l'utente
 * scopriva la perdita solo dai buchi nei dati (QuotaExceededError non appariva
 * mai nel codice).
 *
 * Comportamento documentato:
 * 1. **scrittura-diretta** — `setItem` riesce al primo colpo (caso normale);
 * 2. **ridotto-fifo** — su QuotaExceededError e con `riduci` fornito: fallback
 *    FIFO (conserva i più recenti, stessa semantica del pruning I16/I27) —
 *    dimezza il numero di elementi e riprova fino a un minimo di 25;
 * 3. **rinuncia** — nessun fallback possibile (valore non riducibile, es.
 *    impostazioni; quota occupata da altro; errore non-di-quota, es. storage
 *    bloccato): il valore resta solo in memoria per questa sessione.
 *
 * Nei casi 2 e 3 notifica UNA TANTUM per sessione tramite il notifier
 * registrato con `setQuotaNotifier` (cablato in page.tsx: toast sonner +
 * evento tecnico `error` nel registro). La notifica vive FUORI da questo
 * modulo per due motivi: (a) evitare l'import ciclico usage-events ↔ persist-json;
 * (b) un registro pieno che si notifica via `appendEvents` rischierebbe lo
 * stesso errore che sta mitigando — una tantum per sessione rompe il loop.
 *
 * Retrocompatibilità totale: nessuna chiave o formato cambia, i chiamanti
 * passano gli stessi valori di prima.
 */

/** Esito della scrittura, loggabile nei test e in Diagnostica. */
export type PersistEsito = "scrittura-diretta" | "ridotto-fifo" | "rinuncia";

/** Avviso di quota emesso una tantum per sessione. */
export interface QuotaNotice {
  key: string;
  esito: "ridotto-fifo" | "rinuncia";
  /** Messaggio leggibile per il registro tecnico e il toast. */
  message: string;
}

export type QuotaNotifier = (notice: QuotaNotice) => void;

/** Sotto questa soglia non ha senso continuare a dimezzare (dati inutilizzabili). */
const MIN_ELEMENTI = 25;

let notifier: QuotaNotifier | null = null;
let notificato = false;

/** Registra la notifica una tantum per sessione (toast + evento tecnico, vedi page.tsx). */
export function setQuotaNotifier(fn: QuotaNotifier | null): void {
  notifier = fn;
}

/** Ripristina lo stato di notifica (solo test: permette di coprire più rami). */
export function resetQuotaNotifica(): void {
  notificato = false;
}

/**
 * true se l'errore è riempimento della quota: QuotaExceededError standard
 * (Chrome ≥ 110, Safari, Firefox) e alias storico Firefox
 * NS_ERROR_DOM_QUOTA_REACHED. happy-dom solleva DOMException con lo stesso name.
 */
export function isQuotaError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

function notificaUnaTantum(key: string, esito: "ridotto-fifo" | "rinuncia", etichetta: string, residui: number): void {
  if (notificato) return;
  notificato = true;
  const message =
    esito === "ridotto-fifo"
      ? `Storage locale pieno: ${etichetta} ridotto a ${residui} elementi per stare nella quota (i più vecchi sono stati scartati, il server conserva la replica)`
      : `Storage locale pieno: impossibile salvare ${etichetta} — i dati restano in memoria per questa sessione e verranno persi alla chiusura`;
  notifier?.({ key, esito, message });
}

/**
 * Scrive `value` come JSON nella chiave `key` con gestione esplicita della quota.
 *
 * @param options.riduci      riduzione FIFO a `n` elementi (obbligatoria per il fallback;
 *                            per valori non-array come le impostazioni non fornirla)
 * @param options.etichetta   nome leggibile nel messaggio (es. «storico», «registro eventi»)
 */
export function persistJson<T>(
  key: string,
  value: T,
  options?: {
    riduci?: (value: T, n: number) => T;
    etichetta?: string;
  },
): PersistEsito {
  const etichetta = options?.etichetta ?? key;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return "scrittura-diretta";
  } catch (e) {
    const riduci = options?.riduci;
    if (!isQuotaError(e) || typeof riduci !== "function") {
      notificaUnaTantum(key, "rinuncia", etichetta, 0);
      return "rinuncia";
    }
    // Fallback FIFO: dimezza finché ci sta o si raggiunge il minimo.
    // Se anche il minimo non entra, la quota è occupata da ALTRE chiavi:
    // non si cancellano mai dati di terzi — si rinuncia.
    let n = Math.floor((Array.isArray(value) ? value.length : 0) / 2);
    while (n >= MIN_ELEMENTI) {
      try {
        localStorage.setItem(key, JSON.stringify(riduci(value, n)));
        notificaUnaTantum(key, "ridotto-fifo", etichetta, n);
        return "ridotto-fifo";
      } catch (e2) {
        if (!isQuotaError(e2)) {
          notificaUnaTantum(key, "rinuncia", etichetta, 0);
          return "rinuncia";
        }
        n = Math.floor(n / 2);
      }
    }
    notificaUnaTantum(key, "rinuncia", etichetta, 0);
    return "rinuncia";
  }
}
