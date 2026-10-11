"use client";

/**
 * I75 — Flusso di stampa del report settimanale.
 *
 * La voce «Stampa report settimanale» del menu Esporta aggiunge la classe
 * `print-report` a <body>, apre il dialogo di stampa del browser e la rimuove
 * quando la stampa è conclusa (evento `afterprint`, anche in caso di
 * annullamento). Con quella classe le regole `@media print` di globals.css
 * nascondono TUTTO il contenuto di <main> tranne il blocco
 * `.print-report-root` (components/print-report.tsx): il foglio contiene SOLO
 * il report.
 *
 * Le dipendenze (document/window) sono iniettabili per i test.
 */

export const PRINT_REPORT_BODY_CLASS = "print-report";

export interface StampaTarget {
  body: {
    classList: { add(c: string): void; remove(c: string): void };
  };
  print(): void;
  addEventListener(type: "afterprint", listener: () => void, options?: { once?: boolean }): void;
}

/** Imposta il body per la stampa del report, stampa e ripristina su afterprint. */
export function stampaReportSettimanale(target: StampaTarget = window as unknown as StampaTarget): void {
  target.body.classList.add(PRINT_REPORT_BODY_CLASS);
  const ripristina = () => target.body.classList.remove(PRINT_REPORT_BODY_CLASS);
  // afterprint scatta anche quando l'utente annulla: la classe non resta appesa
  target.addEventListener("afterprint", ripristina, { once: true });
  target.print();
}
