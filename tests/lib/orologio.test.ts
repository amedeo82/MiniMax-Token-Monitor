/**
 * I96 — Test dell'orologio condiviso a 1 Hz (lib/orologio.ts).
 *
 * Copre le decisioni documentate nel modulo:
 * - il primo abbonato ottiene SUBITO il tempo reale (nessun flash da 1 s);
 * - i tick avanzano l'epoch letto da tutti gli abbonati;
 * - l'ultimo disiscritto ferma il timer (l'epoch resta all'ultimo valore);
 * - la ri-sottoscrizione dopo il riposo riallinea l'epoch al presente.
 */

import { describe, expect, test } from "bun:test";
import { iscriviOrologio, orologioAdesso } from "../../src/lib/orologio";

const attesa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("I96 lib/orologio: store condiviso a 1 Hz", () => {
  test("primo abbonato: tempo reale immediato e avanzamento al tick", async () => {
    const prima = orologioAdesso();
    expect(prima === 0 || prima > 0).toBeTrue(); // 0 solo se nessun abbonato è mai arrivato

    const viste: number[] = [];
    const disiscrivi = iscriviOrologio(() => viste.push(orologioAdesso()));

    const alMomento = orologioAdesso();
    expect(alMomento).toBeGreaterThan(0);
    // Tempo reale: entro una tolleranza larga (il test non misura la precisione)
    expect(Math.abs(Date.now() - alMomento)).toBeLessThan(5_000);

    await attesa(1_250); // almeno un tick pieno
    const dopo = orologioAdesso();
    expect(dopo).toBeGreaterThanOrEqual(alMomento);
    expect(Date.now() - dopo).toBeLessThan(5_000);

    disiscrivi();
  }, 10_000);

  test("ultimo disiscritto: il timer si ferma (epoch congelato)", async () => {
    const disiscrivi = iscriviOrologio(() => {});
    await attesa(1_100); // almeno un tick
    const congelato = orologioAdesso();
    disiscrivi();

    await attesa(1_400); // più di un tick: nessuno deve avanzare l'epoch
    expect(orologioAdesso()).toBe(congelato);

    // Ri-sottoscrizione: riallinea al presente
    const disiscrivi2 = iscriviOrologio(() => {});
    expect(orologioAdesso()).toBeGreaterThanOrEqual(congelato);
    expect(Date.now() - orologioAdesso()).toBeLessThan(5_000);
    disiscrivi2();
  }, 10_000);

  test("più abbonati: tutti ricevono il tick, il timer vive finché resta uno", async () => {
    let ticA = 0;
    let ticB = 0;
    const a = iscriviOrologio(() => (ticA += 1));
    const b = iscriviOrologio(() => (ticB += 1));

    await attesa(1_250);
    expect(ticA).toBeGreaterThanOrEqual(1);
    expect(ticB).toBe(ticA); // stessa sorgente: stesso numero di notifiche

    a(); // resta un abbonato: il timer continua
    const ticBPrima = ticB;
    await attesa(1_150);
    expect(ticB).toBeGreaterThan(ticBPrima);

    b(); // zero abbonati: timer fermo
    const epochStop = orologioAdesso();
    await attesa(1_150);
    expect(orologioAdesso()).toBe(epochStop);
  }, 12_000);
});
