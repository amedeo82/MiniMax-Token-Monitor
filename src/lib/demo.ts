/**
 * Generatore di dati dimostrativi per la modalità Demo.
 * Simula in modo plausibile il consumo di un Token Plan MiniMax:
 * - finestra 5h iniziata 3,2 ore fa (quota in calo);
 * - finestra settimanale iniziata 2,7 giorni fa;
 * - modello "video" soggetto solo alla finestra settimanale;
 * - leggero jitter ad ogni generazione così il grafico di storia si muove.
 */

import { parseUsageResponse, Region, UsageSnapshot } from "./minimax";
import type { ModelHistoryPoint } from "./model-history";

const FIVE_HOURS_MS = 5 * 3600_000;
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

export function makeDemoSnapshot(region: Region = "eu", now: number = Date.now()): UsageSnapshot {
  // Finestra 5h: iniziata 3,2h fa
  const intervalStart = now - Math.round(3.2 * 3600_000);
  const intervalEnd = intervalStart + FIVE_HOURS_MS;
  const intervalRemaining = simulatedRemaining(now - intervalStart, FIVE_HOURS_MS, 100, 12) + jitter(1.2);

  // Finestra settimanale: iniziata 2,7 giorni fa
  const weeklyStart = now - Math.round(2.7 * 24 * 3600_000);
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
        current_interval_remaining_percent: Math.round(intervalRemaining * 10) / 10,
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: 1,
        start_time: intervalStart,
        end_time: intervalEnd,
        remains_time: Math.max(0, intervalEnd - now),
        current_weekly_remaining_percent: Math.round(weeklyRemaining * 10) / 10,
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
        current_interval_remaining_percent: Math.round(videoDailyRemaining * 10) / 10,
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: 3,
        start_time: videoDayStart,
        end_time: videoDayEnd,
        remains_time: Math.max(0, videoDayEnd - now),
        current_weekly_remaining_percent: Math.round(videoWeeklyRemaining * 10) / 10,
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

/** Genera uno storico fittizio plausibile per popolare il grafico al primo avvio demo. */
export function makeDemoHistory(samples = 40, stepMs = 5 * 60_000): { t: number; interval: number; weekly: number }[] {
  const now = Date.now();
  const out: { t: number; interval: number; weekly: number }[] = [];
  const intervalStart = now - Math.round(3.2 * 3600_000);
  const weeklyStart = now - Math.round(2.7 * 24 * 3600_000);

  for (let i = samples; i >= 0; i--) {
    const t = now - i * stepMs;
    if (t < intervalStart) continue;
    const interval = simulatedRemaining(t - intervalStart, FIVE_HOURS_MS, 100, 12) + jitter(1.5);
    const weekly = simulatedRemaining(t - weeklyStart, WEEK_MS, 100, 31) + jitter(1.0);
    out.push({
      t,
      interval: Math.max(0, Math.min(100, Math.round(interval * 10) / 10)),
      weekly: Math.max(0, Math.min(100, Math.round(weekly * 10) / 10)),
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
      out.push({ t, model: m.modelName, interval, weekly });
    }
  }
  return out;
}
