/**
 * I91 — Test di regressione di `flatPointFromGeneral` (lib/model-history.ts).
 *
 * Il bug: in `pushHistory` (page.tsx) la guardia
 * `interval === null && weekly === null && general === undefined` era codice
 * morto — con «general» assente i due valori sono UNDEFINED (optional
 * chaining), quindi mai `=== null`, e uno snapshot senza «general» (es. JSON
 * importato con soli modelli video) produceva un punto FINTO {100, 100} che
 * le analisi (RESET_TARGET 85) leggevano come falso reset. La costruzione del
 * punto flat è stata estratta in funzione pura: null quando il punto sarebbe
 * inventato, forward-fill (`?? precedente ?? 100`) quando c'è un precedente.
 */
import { describe, test, expect } from "bun:test";
import { flatPointFromGeneral } from "@/lib/model-history";
import type { HistoryPoint } from "@/components/history-chart";

const T = 1_760_000_000_000;

describe("flatPointFromGeneral: snapshot SENZA «general» (bug I91)", () => {
  test("entrambe le finestre null senza precedente: il punto NON è creato", () => {
    // Due casi confluiscono qui, entrambi protetti:
    // 1) «general» assente (es. JSON importato con soli modelli video) — il
    //    chiamante passa null/null e NON deve registrare nulla (prima del fix
    //    la guardia era codice morto e produceva un punto finto {100,100});
    // 2) «general» presente ma senza alcuna finestra osservata, senza storico:
    //    anche qui il punto sarebbe inventato → null.
    // NOTA: con un precedente la funzione fa forward-fill (comportamento
    // invariato, test sotto) — il caso «general assente CON storico» è
    // escluso dal chiamante, che non invoca la funzione senza il modello.
    expect(flatPointFromGeneral(T, null, null, [])).toBeNull();
  });
});

describe("flatPointFromGeneral: «general» presente, comportamento invariato", () => {
  test("entrambe le finestre misurate: punto fedele", () => {
    expect(flatPointFromGeneral(T, 57.3, 82.1, [])).toEqual({
      t: T,
      interval: 57.3,
      weekly: 82.1,
    });
  });

  test("primo punto con una finestra assente: endpoint documentato 100", () => {
    // general esiste ma la finestra interval non è osservata e non c'è un
    // precedente: l'endpoint di forward-fill documentato è 100 (come
    // historyForModel). Caso comunque non raggiungibile con l'API reale.
    const p = flatPointFromGeneral(T, null, 82, []);
    expect(p).toEqual({ t: T, interval: 100, weekly: 82 });
  });

  test("forward-fill SOLO della finestra mancante dal precedente", () => {
    const prev: HistoryPoint[] = [{ t: T - 60_000, interval: 57, weekly: 82 }];
    expect(flatPointFromGeneral(T, null, 80, prev)).toEqual({
      t: T,
      interval: 57,
      weekly: 80,
    });
    expect(flatPointFromGeneral(T, 55, null, prev)).toEqual({
      t: T,
      interval: 55,
      weekly: 82,
    });
  });

  test("entrambe le finestre null CON precedente: forward-fill completo", () => {
    const prev: HistoryPoint[] = [{ t: T - 60_000, interval: 57, weekly: 82 }];
    expect(flatPointFromGeneral(T, null, null, prev)).toEqual({
      t: T,
      interval: 57,
      weekly: 82,
    });
  });

  test("non muta il precedente e non dipende da punti oltre l'ultimo", () => {
    const prev: HistoryPoint[] = [
      { t: T - 120_000, interval: 10, weekly: 20 },
      { t: T - 60_000, interval: 57, weekly: 82 },
    ];
    const p = flatPointFromGeneral(T, null, 80, prev);
    expect(p?.interval).toBe(57); // fill dall'ULTIMO, non dal primo
    expect(prev).toHaveLength(2);
  });
});
