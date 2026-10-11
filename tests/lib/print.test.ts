/**
 * I75 — Test del flusso di stampa del report settimanale.
 *
 * `stampaReportSettimanale` con target iniettabile: aggiunge `print-report`
 * al body, chiama window.print e registra la rimozione su afterprint (che
 * scatta anche in caso di annullamento — la classe non resta appesa).
 */
import { describe, test, expect } from "bun:test";
import { PRINT_REPORT_BODY_CLASS, stampaReportSettimanale, type StampaTarget } from "@/lib/print";

function fintoTarget(): StampaTarget & { aggiunte: string[]; rimozioni: string[]; stampe: number; afterprint: (() => void)[] } {
  // Un UNICO oggetto: i contatori mutano su sé stesso (Object.assign copierebbe
  // i primitivi per valore e i contatori non si vedrebbero da fuori).
  const target = {
    aggiunte: [] as string[],
    rimozioni: [] as string[],
    stampe: 0,
    afterprint: [] as (() => void)[],
    body: {
      classList: {
        add(c: string) {
          target.aggiunte.push(c);
        },
        remove(c: string) {
          target.rimozioni.push(c);
        },
      },
    },
    print() {
      target.stampe += 1;
    },
    addEventListener(type: "afterprint", listener: () => void) {
      if (type === "afterprint") target.afterprint.push(listener);
    },
  };
  return target;
}

describe("I75 lib: stampaReportSettimanale", () => {
  test("costante della classe body coerente col CSS (print-report)", () => {
    expect(PRINT_REPORT_BODY_CLASS).toBe("print-report");
  });

  test("aggiunge la classe, stampa e NON rimuove subito", () => {
    const t = fintoTarget();
    stampaReportSettimanale(t);
    expect(t.aggiunte).toEqual(["print-report"]);
    expect(t.stampe).toBe(1);
    expect(t.rimozioni).toEqual([]);
    expect(t.afterprint).toHaveLength(1);
  });

  test("afterprint rimuove la classe (anche con stampa annullata)", () => {
    const t = fintoTarget();
    stampaReportSettimanale(t);
    // l'utente annulla il dialogo: il browser emette comunque afterprint
    t.afterprint[0]!();
    expect(t.rimozioni).toEqual(["print-report"]);
  });

  test("doppia stampa: due listener indipendenti (once)", () => {
    const t = fintoTarget();
    stampaReportSettimanale(t);
    stampaReportSettimanale(t);
    expect(t.stampe).toBe(2);
    expect(t.afterprint).toHaveLength(2);
    // solo UNA classe aggiunta per invocazione (nessuna duplicazione a vuoto:
    // classList.add è idempotente nel DOM reale, qui contiamo le chiamate)
    expect(t.aggiunte).toEqual(["print-report", "print-report"]);
    t.afterprint.forEach((l) => l());
    expect(t.rimozioni).toEqual(["print-report", "print-report"]);
  });
});
