/**
 * I132 — Test degli helper puri della rotazione kiosk.
 *
 * Contesto: la rotazione è I87 (effetto setInterval in page.tsx) ma il
 * bug segnalato dall'utente («il flag rotazione con timer non ha alcun
 * effetto») ha rivelato due difetti: il kiosk ereditava i rami loading/null
 * della dashboard senza snapshot (rotazione INVISIBILE) e il timer non dava
 * alcun riscontro continuo. Il fix estrae qui la matematica dell'intervallo
 * (già inlinea in page.tsx dalla I87) e la arma a monte del countdown.
 */
import { describe, test, expect } from "bun:test";
import {
  intervalloRotazioneMs,
  KIOSK_ROTATION_MIN_SECONDS,
  prossimaRotazioneEpoch,
} from "@/lib/kiosk";

describe("I132 lib: rotazione kiosk", () => {
  test("intervalloRotazioneMs: secondi → ms sui valori del selettore", () => {
    expect(intervalloRotazioneMs(15)).toBe(15_000);
    expect(intervalloRotazioneMs(30)).toBe(30_000);
    expect(intervalloRotazioneMs(60)).toBe(60_000);
    expect(intervalloRotazioneMs(120)).toBe(120_000);
    expect(intervalloRotazioneMs(300)).toBe(300_000);
  });

  test("intervalloRotazioneMs: clamp al minimo KIOSK_ROTATION_MIN_SECONDS", () => {
    expect(KIOSK_ROTATION_MIN_SECONDS).toBe(5);
    // valore strozzato dal selettore? il clamp I87 resta: mai sotto 5s
    expect(intervalloRotazioneMs(5)).toBe(5_000);
    expect(intervalloRotazioneMs(3)).toBe(5_000);
    expect(intervalloRotazioneMs(0)).toBe(5_000);
    expect(intervalloRotazioneMs(-10)).toBe(5_000);
  });

  test("prossimaRotazioneEpoch: istante + intervallo (matematica chiusa)", () => {
    expect(prossimaRotazioneEpoch(1_000_000, 15)).toBe(1_015_000);
    expect(prossimaRotazioneEpoch(1_000_000, 300)).toBe(1_300_000);
    // clamp anche qui: 2s richiesti → 5s reali
    expect(prossimaRotazioneEpoch(1_000_000, 2)).toBe(1_005_000);
    // zero come istante (SSR/orologio non attivo): resta coerente
    expect(prossimaRotazioneEpoch(0, 30)).toBe(30_000);
  });

  test("coerenza: prossimaRotazioneEpoch = now + intervalloRotazioneMs", () => {
    for (const s of [5, 15, 30, 60, 120, 300, 1, 7]) {
      expect(prossimaRotazioneEpoch(42_000, s)).toBe(42_000 + intervalloRotazioneMs(s));
    }
  });
});
