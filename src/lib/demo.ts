/**
 * Generatore di dati dimostrativi per la modalità Demo.
 *
 * I125 — La simulazione è ANCORATA ALLE FINESTRE VERIFICATE dell'API MiniMax
 * (stessa base di `src/lib/cycles.ts` e `docs/02` §5/§10), non più a finestre
 * «rolling» relativi al momento della chiamata:
 * - finestra breve (general): il BLOCCO FISSO corrente a orario UTC
 *   {00,05,10,15,20} (verdetto V8, offset 0 ms su 205 campioni; l'ultimo
 *   blocco 20:00→mezzanotta dura 4h reali) — a ogni confine il residuo torna
 *   verso il 100% come fa il server reale;
 * - finestra settimanale (tutti i modelli, livello di piano): la settimana
 *   corrente da LUNEDÌ 00:00 UTC (`inizioSettimanaUtc`);
 * - finestra giornaliera del video: 24h allineata a mezzanotte UTC (invariata,
 *   già fedele — docs/02 §5 osservazione 2).
 *
 * Conseguenza di fedeltà: un tick demo che attraversa un confine di blocco
 * mostra il SALTO verso il 100% (reset), riproducendo il comportamento
 * osservato sull'API con chiave reale — prima il «3,2h fa» rolling non
 * mostrava MAI il reset (la finestra scivolava con «now»).
 */

import { fineFinestra5h, inizioFinestra5h, inizioSettimanaUtc } from "./cycles";
import { parseUsageResponse, Region, UsageSnapshot } from "./minimax";
import type { ModelHistoryPoint } from "./model-history";
import type { HistoryPoint } from "@/components/history-chart";

const WEEK_MS = 7 * 24 * 3600_000;

/** Curve di consumo plausibili: calo più rapido nelle prime ore d'uso intensivo. */
function simulatedRemaining(elapsedMs: number, totalMs: number, startPercent: number, floorPercent: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / totalMs));
  // easing quadratica: consumo accelerato verso metà finestra
  const eased = progress * progress * (3 - 2 * progress);
  return Math.max(floorPercent, startPercent - (startPercent - floorPercent) * eased);
}

function jitter(max: number): number {
  return (Math.random() * 2 - 1) * max;
}

/** I125 — le percentuali dell'API sono sempre in [0,100]: il jitter non le deve sforare. */
function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function makeDemoSnapshot(region: Region = "eu", now: number = Date.now()): UsageSnapshot {
  // Finestra breve (general): il BLOCCO FISSO corrente (I125, verdetto V8).
  // La durata del blocco è 5h nominali, 4h reali nell'ultimo (20:00→mezzanotta):
  // la curva di consumo si comprime di conseguenza — come sul server reale.
  const intervalStart = inizioFinestra5h(now);
  const intervalEnd = fineFinestra5h(now);
  const intervalRemaining =
    simulatedRemaining(now - intervalStart, intervalEnd - intervalStart, 100, 12) + jitter(1.2);

  // Finestra settimanale: la settimana corrente da LUNEDÌ 00:00 UTC (I125).
  const weeklyStart = inizioSettimanaUtc(now);
  const weeklyEnd = weeklyStart + WEEK_MS;
  const weeklyRemaining = simulatedRemaining(now - weeklyStart, WEEK_MS, 100, 31) + jitter(0.8);

  // Modello video: finestra settimanale condivisa, consumo più elevato
  const videoWeeklyRemaining = simulatedRemaining(now - weeklyStart, WEEK_MS, 100, 18) + jitter(1.5);

  // Finestra giornaliera del video: allineata a mezzanotte UTC (02:00 Roma in CEST)
  const DAY_MS = 24 * 3600_000;
  const videoDayStart = Math.floor(now / DAY_MS) * DAY_MS; // mezzanotte UTC corrente
  const videoDayEnd = videoDayStart + DAY_MS;
  const videoDailyRemaining = 100; // video mai usato oggi → finestra intatta (stato 3)

  const raw = {
    base_resp: { status_code: 0, status_msg: "success" },
    current_subscribe_title: "M Plan · Explore (Demo)",
    credits_balance: 42.75,
    model_remains: [
      {
        model_name: "general",
        current_interval_remaining_percent: round1(clampPct(intervalRemaining)),
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: 1,
        start_time: intervalStart,
        end_time: intervalEnd,
        remains_time: Math.max(0, intervalEnd - now),
        current_weekly_remaining_percent: round1(clampPct(weeklyRemaining)),
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        current_weekly_status: 1,
        weekly_start_time: weeklyStart,
        weekly_end_time: weeklyEnd,
        weekly_remains_time: Math.max(0, weeklyEnd - now),
      },
      {
        // Il modello "video" nella risposta reale espone anche una finestra
        // giornaliera di 24h (allineata a mezzanotte UTC = 02:00 a Roma in CEST),
        // oltre a quella settimanale condivisa.
        model_name: "video",
        current_interval_remaining_percent: round1(clampPct(videoDailyRemaining)),
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: 3,
        start_time: videoDayStart,
        end_time: videoDayEnd,
        remains_time: Math.max(0, videoDayEnd - now),
        current_weekly_remaining_percent: round1(clampPct(videoWeeklyRemaining)),
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        // I48 — stato 1 («attiva · in uso»): la simulazione ha un consumo
        // settimanale del video, quindi la finestra DEVE risultare in uso
        // (stato «3» con percentuale < 100 era incoerente; la verifica
        // «demo ↔ API ufficiale» del 12/10 l'ha corretta — vedi docs/01 §11).
        current_weekly_status: 1,
        weekly_start_time: weeklyStart,
        weekly_end_time: weeklyEnd,
        weekly_remains_time: Math.max(0, weeklyEnd - now),
      },
    ],
  };

  return parseUsageResponse(raw, { source: "demo", region, fetchedAt: now });
}

/** Genera uno storico fittizio plausibile per popolare il grafico al primo avvio demo.
 *  I124 — punti marcati source «demo»: le analisi li escludono (senzaDemo).
 *  I125 — la curva di ogni punto è ancorata al PROPRIO blocco/periodo: quando
 *  l'arco temporale attraversa un confine di blocco il residuo torna verso il
 *  100% (curva a sega), riproducendo i reset osservati sull'API reale — prima
 *  la finestra «3,2h fa» saltava i punti pre-finestra e non mostrava mai il
 *  reset. */
export function makeDemoHistory(samples = 40, stepMs = 5 * 60_000): HistoryPoint[] {
  const now = Date.now();
  const out: HistoryPoint[] = [];

  for (let i = samples; i >= 0; i--) {
    const t = now - i * stepMs;
    // I125 — ancoraggio PER PUNTO: ogni campione simula il consumo dentro la
    // SUA finestra (blocco 5h corrente / settimana corrente).
    const blockStart = inizioFinestra5h(t);
    const blockEnd = fineFinestra5h(t);
    const interval = clampPct(simulatedRemaining(t - blockStart, blockEnd - blockStart, 100, 12) + jitter(1.5));
    const weekStart = inizioSettimanaUtc(t);
    const weekly = clampPct(simulatedRemaining(t - weekStart, WEEK_MS, 100, 31) + jitter(1.0));
    out.push({
      t,
      interval: round1(interval),
      weekly: round1(weekly),
      source: "demo",
    });
  }
  return out;
}

/**
 * I82 — Storico demo PER-MODELLO: rigenera snapshot sintetici nel passato con
 * la STESSA `makeDemoSnapshot(t)` (curve identiche ai tick demo dal vivo) e ne
 * estrae tutti i modelli. Serve al primo avvio demo: senza backfill le analisi
 * dei modelli non-general resterebbero vuote fino ad accumulo di tick live.
 * Nota: il video demo non ha mai usato la finestra giornaliera (interval
 * piatto a 100), la sua curva visibile è quella settimanale.
 */
export function makeDemoModelHistory(samples = 40, stepMs = 5 * 60_000): ModelHistoryPoint[] {
  const now = Date.now();
  const out: ModelHistoryPoint[] = [];
  for (let i = samples; i >= 1; i--) {
    const t = now - i * stepMs;
    const snap = makeDemoSnapshot("eu", t);
    for (const m of snap.models) {
      const interval = m.interval?.remainingPercent ?? null;
      const weekly = m.weekly?.remainingPercent ?? null;
      if (interval === null && weekly === null) continue;
      // I124 — anche il backfill per-modello è marcato «demo» (escluso dalle analisi).
      out.push({ t, model: m.modelName, interval, weekly, source: "demo" });
    }
  }
  return out;
}
