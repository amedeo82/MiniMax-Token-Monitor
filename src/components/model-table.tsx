"use client";

/**
 * Vista panoramica comparativa: una riga per ogni combinazione modello × finestra
 * (general 5h, general settimanale, video 24h, video settimanale, …).
 * Permette di confrontare a colpo d'occhio percentuali, stati e reset di tutto il piano.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LayoutDashboard, TimerReset } from "lucide-react";
import { ModelQuota, QuotaWindow, statusLabel, quotaLevel } from "@/lib/minimax";
import { formatCountdown, formatDateTimeRome, msUntil } from "@/lib/time";
import { windowKindLabel } from "@/components/quota-cards";

const LEVEL_BAR: Record<"ok" | "good" | "warn" | "crit", string> = {
  ok: "bg-emerald-500",
  good: "bg-lime-500",
  warn: "bg-amber-500",
  crit: "bg-rose-500",
};

const STATUS_TONE: Record<"ok" | "idle" | "warn" | "crit", string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  idle: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  crit: "border-rose-400/30 bg-rose-400/10 text-rose-300",
};

/** Barra percentuale compatta per la tabella. */
function MiniBar({ value }: { value: number }) {
  const level = quotaLevel(value).color;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={`h-full rounded-full ${LEVEL_BAR[level]}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-zinc-200">{value.toFixed(1)}%</span>
    </div>
  );
}

function WindowRow({ model, win, kind, now }: { model: ModelQuota; win: QuotaWindow; kind: "interval" | "weekly"; now: number }) {
  const status = statusLabel(win.status);
  const resetIn = msUntil(win.end, now);
  return (
    <TableRow className="border-white/[0.05] hover:bg-white/[0.02]">
      <TableCell className="py-2.5">
        <p className="text-xs font-medium text-zinc-200">{model.label}</p>
        <p className="font-mono text-[10px] text-zinc-600">{model.modelName}</p>
      </TableCell>
      <TableCell className="py-2.5 text-xs text-zinc-400">{kind === "weekly" ? "Settimanale (7 giorni)" : windowKindLabel(win)}</TableCell>
      <TableCell className="py-2.5">
        {win.remainingPercent !== null ? (
          <MiniBar value={win.remainingPercent} />
        ) : (
          <span className="text-xs text-zinc-600">N/D</span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        {status ? (
          <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[status.tone]}`}>
            {status.label}
          </Badge>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        {resetIn !== null ? (
          <div className="flex items-center gap-1.5">
            <TimerReset className="size-3.5 shrink-0 text-zinc-500" />
            <div className="leading-tight">
              <p className="font-mono text-xs tabular-nums text-zinc-300">{formatCountdown(resetIn)}</p>
              <p className="text-[10px] text-zinc-600">{formatDateTimeRome(win.end)}</p>
            </div>
          </div>
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

interface PanoramicTableProps {
  models: ModelQuota[];
  now: number;
}

/** Tabella panoramica di tutti i modelli e tutte le finestre del piano. */
export function PanoramicTable({ models, now }: PanoramicTableProps) {
  if (models.length === 0) return null;
  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <LayoutDashboard className="size-4 text-zinc-400" />
          Panoramica modelli
        </CardTitle>
        <CardDescription className="text-xs text-zinc-500">
          Tutte le finestre del piano a confronto · orario Europe/Rome
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-white/[0.05]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.05] hover:bg-transparent">
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Modello</TableHead>
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Finestra</TableHead>
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Residuo</TableHead>
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Stato</TableHead>
                <TableHead className="h-9 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Reset</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <React.Fragment key={m.modelName}>
                  {m.interval ? <WindowRow model={m} win={m.interval} kind="interval" now={now} /> : null}
                  {m.weekly ? <WindowRow model={m} win={m.weekly} kind="weekly" now={now} /> : null}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
