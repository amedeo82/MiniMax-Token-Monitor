"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuotaRing, MiniBar, RingColor, RING_TEXT_CLASS } from "@/components/quota-ring";
import { ModelQuota, quotaLevel, WINDOW_LABELS } from "@/lib/minimax";
import {
  formatCountdown,
  formatDateTimeRome,
  formatTimeRome,
  msUntil,
  windowProgress,
  formatDuration,
} from "@/lib/time";
import { Timer, CalendarClock, RotateCcw, Info } from "lucide-react";

function colorFor(remaining: number | null): RingColor {
  return quotaLevel(remaining).color;
}

interface WindowDetailsProps {
  title: string;
  desc: string;
  start: number | null;
  end: number | null;
  now: number;
}

/** Riga di dettaglio con inizio/fine/reset di una finestra. */
function WindowDetails({ title, desc, start, end, now }: WindowDetailsProps) {
  const remainingMs = msUntil(end, now);
  const progress = windowProgress(start, end, now);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          {title === WINDOW_LABELS.interval.long ? <Timer className="size-3.5 text-zinc-400" /> : <CalendarClock className="size-3.5 text-zinc-400" />}
          {title}
        </span>
        {remainingMs !== null ? (
          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-amber-300">
            reset tra {formatCountdown(remainingMs)}
          </span>
        ) : (
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-400">in attesa di reset…</span>
        )}
      </div>
      <div className="space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
        <p className="flex items-center gap-1.5">
          <RotateCcw className="size-3 shrink-0 text-zinc-500" />
          {end ? (
            <span>
              Reimpostazione al <strong className="font-semibold text-zinc-200">{formatDateTimeRome(end)}</strong>
            </span>
          ) : (
            <span>Data di reset non ancora determinata</span>
          )}
        </p>
        <p className="text-zinc-500">
          {start ? <>Aperta il {formatDateTimeRome(start)} · </> : null}
          {desc}
        </p>
        {progress !== null && progress > 0 ? (
          <p className="text-zinc-500">
            Avanzamento finestra: <span className="font-mono tabular-nums text-zinc-400">{Math.round(progress)}%</span>
            {start && end ? ` (durata ${formatDuration(end - start)})` : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

interface ModelCardProps {
  model: ModelQuota;
  now: number;
  delay?: number;
}

/** Card di un singolo modello con le sue finestre di quota. */
export function ModelCard({ model, now, delay = 0 }: ModelCardProps) {
  const { interval, weekly } = model;
  const mainRemaining = interval?.remainingPercent ?? weekly?.remainingPercent ?? null;
  const color = colorFor(mainRemaining);
  const level = quotaLevel(mainRemaining);

  return (
    <Card
      className="group border-white/[0.07] bg-white/[0.04] backdrop-blur transition-colors hover:border-white/[0.14]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-semibold text-zinc-100">{model.label}</CardTitle>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">{model.modelName}</p>
          </div>
          <Badge variant="outline" className={`${RING_TEXT_CLASS[color]} shrink-0 border-current/30 text-[10px]`}>
            {level.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {interval ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-zinc-300">Finestra 5 ore</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${RING_TEXT_CLASS[colorFor(interval.remainingPercent)]}`}>
                {interval.remainingPercent !== null ? `${interval.remainingPercent.toFixed(1)}%` : "N/D"}
              </span>
            </div>
            <MiniBar value={interval.remainingPercent} color={colorFor(interval.remainingPercent)} />
            <p className="mt-2 text-[11px] text-zinc-500">
              Reset previsto: {interval.end ? formatTimeRome(interval.end) : "—"} ·{" "}
              <span className="font-mono tabular-nums">tra {formatCountdown(msUntil(interval.end, now))}</span>
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.08] p-3 text-[11px] text-zinc-500">
            <Info className="size-3.5 shrink-0" />
            Finestra 5 ore non applicabile a questo modello
          </div>
        )}

        {weekly ? (
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-zinc-300">Finestra settimanale</span>
              <span className={`font-mono text-lg font-bold tabular-nums ${RING_TEXT_CLASS[colorFor(weekly.remainingPercent)]}`}>
                {weekly.remainingPercent !== null ? `${weekly.remainingPercent.toFixed(1)}%` : "N/D"}
              </span>
            </div>
            <MiniBar value={weekly.remainingPercent} color={colorFor(weekly.remainingPercent)} />
            <p className="mt-2 text-[11px] text-zinc-500">
              Reset previsto: {weekly.end ? formatDateTimeRome(weekly.end) : "—"} ·{" "}
              <span className="font-mono tabular-nums">tra {formatCountdown(msUntil(weekly.end, now))}</span>
            </p>
          </div>
        ) : null}

        {interval && interval.end ? (
          <WindowDetails
            title={WINDOW_LABELS.interval.long}
            desc={WINDOW_LABELS.interval.desc}
            start={interval.start}
            end={interval.end}
            now={now}
          />
        ) : null}
        {weekly && weekly.end ? (
          <WindowDetails
            title={WINDOW_LABELS.weekly.long}
            desc={WINDOW_LABELS.weekly.desc}
            start={weekly.start}
            end={weekly.end}
            now={now}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

interface MainWindowsProps {
  general: ModelQuota | undefined;
  now: number;
}

/** Pannello principale: anelli grandi per le due finestre del modello "general". */
export function MainWindows({ general, now }: MainWindowsProps) {
  const interval = general?.interval ?? null;
  const weekly = general?.weekly ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5 backdrop-blur lg:col-span-1">
        <div className="text-center">
          <QuotaRing
            value={interval?.remainingPercent ?? null}
            color={colorFor(interval?.remainingPercent ?? null)}
            gradientId="ring-5h"
            label="rimanente"
            sublabel="finestra 5 ore"
          />
          <div className="mt-3">
            <p className="text-xs text-zinc-400">
              Reset:{" "}
              <span className="font-semibold text-zinc-200">{interval?.end ? formatTimeRome(interval.end) : "—"}</span>
              {interval?.end && msUntil(interval.end, now) !== null ? (
                <span className="ml-1 font-mono tabular-nums text-amber-300">(tra {formatCountdown(msUntil(interval.end, now))})</span>
              ) : null}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] p-5 backdrop-blur lg:col-span-1">
        <div className="text-center">
          <QuotaRing
            value={weekly?.remainingPercent ?? null}
            color={colorFor(weekly?.remainingPercent ?? null)}
            gradientId="ring-weekly"
            label="rimanente"
            sublabel="finestra settimanale"
          />
          <div className="mt-3">
            <p className="text-xs text-zinc-400">
              Reset:{" "}
              <span className="font-semibold text-zinc-200">{weekly?.end ? formatDateTimeRome(weekly.end) : "—"}</span>
            </p>
            {weekly?.end && msUntil(weekly.end, now) !== null ? (
              <p className="mt-0.5 font-mono text-xs tabular-nums text-amber-300">tra {formatCountdown(msUntil(weekly.end, now))}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3 lg:col-span-1">
        {interval && interval.end ? (
          <WindowDetails
            title={WINDOW_LABELS.interval.long}
            desc={WINDOW_LABELS.interval.desc}
            start={interval.start}
            end={interval.end}
            now={now}
          />
        ) : (
          <WindowDetails title={WINDOW_LABELS.interval.long} desc={WINDOW_LABELS.interval.desc} start={null} end={null} now={now} />
        )}
        {weekly && weekly.end ? (
          <WindowDetails
            title={WINDOW_LABELS.weekly.long}
            desc={WINDOW_LABELS.weekly.desc}
            start={weekly.start}
            end={weekly.end}
            now={now}
          />
        ) : (
          <WindowDetails title={WINDOW_LABELS.weekly.long} desc={WINDOW_LABELS.weekly.desc} start={null} end={null} now={now} />
        )}
      </div>
    </div>
  );
}
