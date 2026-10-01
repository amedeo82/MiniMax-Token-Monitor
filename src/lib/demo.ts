/**
 * Generatore di dati dimostrativi per la modalità Demo.
 * Simula in modo plausibile il consumo di un Token Plan MiniMax:
 * - finestra 5h iniziata 3,2 ore fa (quota in calo);
 * - finestra settimanale iniziata 2,7 giorni fa;
 * - modello "video" soggetto solo alla finestra settimanale;
 * - leggero jitter ad ogni generazione così il grafico di storia si muove.
 */

import { parseUsageResponse, Region, UsageSnapshot } from "./minimax";

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

  // Modello video: solo finestra settimanale, consumo più elevato
  const videoWeeklyRemaining = simulatedRemaining(now - weeklyStart, WEEK_MS, 100, 18) + jitter(1.5);

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
        current_interval_status: "normal",
        start_time: intervalStart,
        end_time: intervalEnd,
        remains_time: Math.max(0, intervalEnd - now),
        current_weekly_remaining_percent: Math.round(weeklyRemaining * 10) / 10,
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        current_weekly_status: "normal",
        weekly_start_time: weeklyStart,
        weekly_end_time: weeklyEnd,
        weekly_remains_time: Math.max(0, weeklyEnd - now),
      },
      {
        model_name: "video",
        current_weekly_remaining_percent: Math.round(videoWeeklyRemaining * 10) / 10,
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        current_weekly_status: "normal",
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
