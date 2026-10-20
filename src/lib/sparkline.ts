/**
 * I131 — geometria della sparkline (puro, testabile senza DOM).
 *
 * Le righe di evoluzione (I128 indice, I129 ritmo/spreco, I130 consumo) sono
 * nate come chip testuali «n → valore» troncate agli ultimi 8 punti: al
 * crescere del campione la storia si perde dietro il «…» e la riga diventa
 * una sequenza di numeri difficile da leggere d'un fiato. La sparkline mostra
 * TUTTI i punti come FORMA (polilinea SVG normalizzata) accanto all'ultimo
 * valore: nessun troncamento, la tendenza si legge a colpo d'occhio e i
 * valori intermedi esatti restano nell'aria-label/title.
 *
 * Funzione PURA: riceve i valori e il viewport e restituisce le coordinate dei
 * punti, con y INVERTITA (valore alto = y piccolo) perché l'origine del
 * sistema di coordinate SVG è in ALTO a sinistra — invertire il segno è l'
 * errore classico che disegna la serie al contrario. Serie piatta
 * (min === max) → tutti i punti a metà altezza (una media costante è una
 * lettura legittima, non un errore). Meno di 2 punti → array vuoto: una retta
 * non è una forma (le righe di evoluzione hanno comunque il gate ≥2 punti).
 */

export interface PuntoSparkline {
  x: number;
  y: number;
}

/** Viewport di default: allineato al testo 11px delle righe di evoluzione. */
export const SPARKLINE_W = 96;
export const SPARKLINE_H = 24;
export const SPARKLINE_PAD = 2;

export function puntiSparkline(
  values: number[],
  w: number = SPARKLINE_W,
  h: number = SPARKLINE_H,
  pad: number = SPARKLINE_PAD,
): PuntoSparkline[] {
  if (values.length < 2) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const usableW = w - 2 * pad;
  const usableH = h - 2 * pad;
  return values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * usableW,
    // y invertita: 1 - (v-min)/range porta il MASSIMO a y piccolo (in alto).
    y: range === 0 ? h / 2 : pad + (1 - (v - min) / range) * usableH,
  }));
}
