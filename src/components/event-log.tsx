"use client";

/**
 * Registro eventi della dashboard: timeline cronologica di reset rilevati,
 * soglie superate, errori di rilevamento e note informative.
 * Persistito in localStorage ("mm-dash-events-v1", max 200 — vedi lib/usage-events.ts).
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RotateCcw,
  AlertTriangle,
  AlertOctagon,
  WifiOff,
  Info,
  ScrollText,
  Trash2,
  Download,
} from "lucide-react";
import { formatDateTimeRome } from "@/lib/time";
import type { UsageEvent, UsageEventKind } from "@/lib/usage-events";
import { exportEventsCsv } from "@/lib/export";

const KIND_META: Record<UsageEventKind, { label: string; icon: React.ReactNode; className: string }> = {
  reset: { label: "Reset", icon: <RotateCcw className="size-3.5" />, className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  warn: { label: "Attenzione", icon: <AlertTriangle className="size-3.5" />, className: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  crit: { label: "Critico", icon: <AlertOctagon className="size-3.5" />, className: "text-rose-400 border-rose-400/30 bg-rose-400/10" },
  error: { label: "Errore", icon: <WifiOff className="size-3.5" />, className: "text-orange-400 border-orange-400/30 bg-orange-400/10" },
  info: { label: "Info", icon: <Info className="size-3.5" />, className: "text-sky-400 border-sky-400/30 bg-sky-400/10" },
};

interface EventLogProps {
  events: UsageEvent[];
  onClear: () => void;
}

/** Timeline del registro eventi, dal più recente al più vecchio. */
export function EventLog({ events, onClear }: EventLogProps) {
  const sorted = React.useMemo(() => [...events].sort((a, b) => b.t - a.t), [events]);
  // Raggruppa per giorno (Europe/Rome) per una lettura tipo diario
  const groups = React.useMemo(() => {
    const dayFmt = new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const map = new Map<string, UsageEvent[]>();
    for (const e of sorted) {
      const day = dayFmt.format(e.t);
      const arr = map.get(day) ?? [];
      arr.push(e);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [sorted]);

  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <ScrollText className="size-4 text-zinc-400" />
            Registro eventi
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Reset rilevati, soglie superate ed errori · salvati sul dispositivo (max 200)
          </CardDescription>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={events.length === 0}
            onClick={() => exportEventsCsv(events)}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]"
          >
            <Download className="size-3.5" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={events.length === 0}
            onClick={onClear}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs text-zinc-400 hover:bg-white/[0.08] hover:text-rose-300"
          >
            <Trash2 className="size-3.5" />
            Svuota
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-xs leading-relaxed text-zinc-500">
            Nessun evento registrato. Gli eventi compaiono quando una finestra si resetta, una soglia viene
            superata o un rilevamento fallisce.
          </div>
        ) : (
          <ScrollArea className="h-64 pr-3">
            <div className="space-y-4">
              {groups.map(([day, list]) => (
                <div key={day} className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">{day}</p>
                  <ul className="space-y-2">
                    {list.map((e) => {
                      const meta = KIND_META[e.kind];
                      return (
                        <li
                          key={e.id}
                          className="flex items-start gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                        >
                          <Badge variant="outline" className={`mt-0.5 shrink-0 gap-1 text-[10px] ${meta.className}`}>
                            {meta.icon}
                            {meta.label}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-relaxed text-zinc-300">{e.message}</p>
                            <p className="mt-0.5 font-mono text-[10px] tabular-nums text-zinc-600">
                              {formatDateTimeRome(e.t)}
                              {e.value !== null ? ` · ${e.value.toFixed(1)}% residuo` : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
