/**
 * I96 — Orologio condiviso a 1 Hz per le «foglie vive» del render.
 *
 * Problema: lo stato `now` della pagina ticchettava ogni secondo → re-render
 * dell'INTERO albero (page.tsx, ~1.600 righe, con Grafico/Analisi/Diagnostica
 * inclusi) 60 volte al minuto, con dati fermi. Misura pre-refactoring
 * (scripts/verifiche/misura-render-i96.py): 60,9 render/min di pagina E grafico.
 *
 * Soluzione: le viste che richiedono il secondo (orologio header/footer,
 * countdown dei reset, «prossimo aggiornamento») sono FOGlie minimi che si
 * abbonano a questo store; la pagina mantiene un orologio a MINUTO (30 s)
 * sufficiente a finestra scorrevole, data, dimming notturno e fuso.
 *
 * Semantica:
 * - l'intervallo parte al primo abbonato e si ferma all'ultimo disiscritto
 *   (zero timer con zero foglie vive);
 * - `adesso` parte da 0: SSR e prima idratazione leggono 0 e renderizzano il
 *   segnaposto («--:--:--» / «—») — nessun mismatch di idratazione; il primo
 *   abbonato ottiene subito il tempo reale (nessun flash da 1 s);
 * - le decisioni restano piccole e pure: questo file contiene solo store + hook
 *   (pattern useSyncExternalStore di I90/I100 per sistemi esterni al render).
 */

import * as React from "react";

/** Epoch corrente dello store; 0 = orologio non ancora attivo (SSR/idratazione). */
let adesso = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const ascoltatori = new Set<() => void>();

function tick(): void {
  adesso = Date.now();
  for (const ascoltatore of ascoltatori) ascoltatore();
}

/** Iscrizione diretta allo store (API pubblica: usata da useOrologio e dai test). */
export function iscriviOrologio(callback: () => void): () => void {
  if (ascoltatori.size === 0) {
    /* Primo abbonato: tempo reale IMMEDIATO (useSyncExternalStore ri-legge lo
       snapshot dopo la sottoscrizione e aggiorna le foglie senza attendere il tick). */
    adesso = Date.now();
    timer = setInterval(tick, 1000);
  }
  ascoltatori.add(callback);
  return () => {
    ascoltatori.delete(callback);
    if (ascoltatori.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      /* `adesso` resta all'ultimo valore: un abbonato successivo lo riallinea. */
    }
  };
}

/** Epoch dell'orologio condiviso (0 finché il primo abbonato non si registra). */
export function orologioAdesso(): number {
  return adesso;
}

/** I96 — hook delle foglie vive: si ri-renderizza al tick (1 Hz) solo la foglia. */
export function useOrologio(): number {
  return React.useSyncExternalStore(
    iscriviOrologio,
    () => adesso,
    () => 0,
  );
}
