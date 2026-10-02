"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { formatCountdown, formatDateTimeRome, formatShortRome, formatTimeRome } from "@/lib/time";
import { movingAverage } from "@/lib/cycles";
import { exportHistoryCsv, exportHistoryJson } from "@/lib/export";
import { fetchServerHistory, serverPointsToHistory } from "@/lib/server-history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, Activity, Hourglass, Gauge, Download, Database, ShieldCheck, AlertTriangle, Info, Spline } from "lucide-react";

export interface HistoryPoint {
  t: number;
  interval: number;
  weekly: number;
}

/** Ampiezza della media mobile (SMA) sovrapponibile al grafico. */
const SMA_K = 10;

interface HistoryChartProps {
  history: HistoryPoint[];
  window: "interval" | "weekly";
  onWindowChange: (w: "interval" | "weekly") => void;
  /** Punti attualmente conservati sul server (I16); null = server non raggiunto. */
  serverCount?: number | null;
}

interface ChartDatum {
  t: number;
  label: string;
  value: number;
}

/** Scarica dal server lo storico completo e lo salva nel formato richiesto. */
async function exportFullFromServer(format: "csv" | "json"): Promise<void> {
  const server = await fetchServerHistory(10_000);
  if (!server || server.points.length === 0) {
    toast.error("Nessuno storico disponibile sul server");
    return;
  }
  const points = serverPointsToHistory(server.points);
  if (format === "csv") exportHistoryCsv(points);
  else exportHistoryJson(points);
  toast.success(`Esportati ${points.length} punti dallo storico server`);
}

/** Grafico dell'andamento della quota rimanente nel tempo. */
export function HistoryChart({ history, window: win, onWindowChange, serverCount = null }: HistoryChartProps) {
  const [showSma, setShowSma] = React.useState(false);

  const data: ChartDatum[] = React.useMemo(
    () =>
      history
        .map((h) => ({
          t: h.t,
          label: formatShortRome(h.t),
          value: win === "interval" ? h.interval : h.weekly,
        }))
        .slice(-120),
    [history, win],
  );

  /** Con media mobile attiva aggiunge il campo `sma` ai punti visibili. */
  const chartData: (ChartDatum & { sma: number | null })[] = React.useMemo(() => {
    if (!showSma) return data.map((d) => ({ ...d, sma: null }));
    const sma = movingAverage(
      data.map((d) => d.value),
      SMA_K,
    );
    return data.map((d, i) => ({ ...d, sma: sma[i] }));
  }, [data, showSma]);

  const domain = React.useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 100];
    const values = data.map((d) => d.value).filter((v) => v !== null);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(5, (max - min) * 0.15);
    return [Math.max(0, Math.floor(min - pad)), Math.min(100, Math.ceil(max + pad))];
  }, [data]);

  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Activity className="size-4 text-zinc-400" />
            Andamento quota rimanente
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Cronologia degli ultimi rilevamenti (orario Europe/Rome)
            {serverCount !== null && serverCount > 0
              ? ` · ${serverCount.toLocaleString("it-IT")} punti salvati sul server`
              : ""}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showSma}
            aria-label="Mostra o nascondi la media mobile"
            onClick={() => setShowSma((v) => !v)}
            title={`Media mobile semplice su ${SMA_K} rilevamenti`}
            className={`h-8 gap-1.5 border-white/10 text-xs ${
              showSma
                ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/20!"
                : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"
            }`}
          >
            <Spline className="size-3.5" />
            Media mobile
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Esporta lo storico"
                disabled={history.length === 0 && (serverCount === null || serverCount === 0)}
                className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
              >
                <Download className="size-3.5 text-zinc-400" />
                Esporta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-white/10! bg-zinc-950! text-zinc-100!">
              <DropdownMenuLabel className="text-[11px]! text-zinc-500!">Storico locale</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={history.length === 0}
                onClick={() => exportHistoryCsv(history)}
                className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
              >
                <Download className="size-3.5" />
                CSV · {history.length} punti in memoria
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={history.length === 0}
                onClick={() => exportHistoryJson(history)}
                className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
              >
                <Download className="size-3.5" />
                JSON · {history.length} punti in memoria
              </DropdownMenuItem>
              {serverCount !== null ? (
                <>
                  <DropdownMenuSeparator className="bg-white/[0.06]!" />
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px]! text-zinc-500!">
                    <Database className="size-3" />
                    Storico server (fino a 10.000 punti)
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={serverCount === 0}
                    onClick={() => void exportFullFromServer("csv")}
                    className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
                  >
                    <Download className="size-3.5" />
                    CSV completo · {serverCount.toLocaleString("it-IT")} punti
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={serverCount === 0}
                    onClick={() => void exportFullFromServer("json")}
                    className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
                  >
                    <Download className="size-3.5" />
                    JSON completo · {serverCount.toLocaleString("it-IT")} punti
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tabs value={win} onValueChange={(v) => onWindowChange(v as "interval" | "weekly")}>
            <TabsList className="bg-white/[0.06]">
              <TabsTrigger value="interval" className="h-7 text-xs text-zinc-400 hover:text-zinc-200 data-[state=inactive]:hover:bg-white/[0.05] data-[state=active]:text-zinc-100">5 ore</TabsTrigger>
              <TabsTrigger value="weekly" className="h-7 text-xs text-zinc-400 hover:text-zinc-200 data-[state=inactive]:hover:bg-white/[0.05] data-[state=active]:text-zinc-100">Settimanale</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
            Raccogli almeno due rilevamenti per visualizzare il grafico. Attiva l&apos;aggiornamento automatico oppure
            premi «Aggiorna» di tanto in tanto.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gradInterval" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradWeekly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => formatShortRome(t)}
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  minTickGap={48}
                />
                <YAxis
                  domain={domain}
                  tick={{ fill: "#71717a", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v)}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as ChartDatum & { sma: number | null };
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                        <p className="font-medium text-zinc-200">{p.label}</p>
                        <p className="mt-1 font-mono tabular-nums text-emerald-400">
                          Rimasto: {p.value.toFixed(1)}%
                        </p>
                        {p.sma !== null ? (
                          <p className="font-mono tabular-nums text-rose-300">
                            Media mobile: {p.sma.toFixed(1)}%
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={10} stroke="rgba(244,63,94,0.4)" strokeDasharray="4 4" />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={win === "interval" ? "#34d399" : "#fbbf24"}
                  strokeWidth={2}
                  fill={win === "interval" ? "url(#gradInterval)" : "url(#gradWeekly)"}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={{ r: 3.5, fill: win === "interval" ? "#34d399" : "#fbbf24" }}
                />
                {showSma ? (
                  <Line
                    type="monotone"
                    dataKey="sma"
                    stroke="#f472b6"
                    strokeWidth={1.8}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TrendStats {
  /** Velocità media di consumo in punti percento all'ora (positiva = consumo). */
  ratePerHour: number | null;
  /** Tempo stimato (ms) fino all'esaurimento, se il consumo prosegue lineare. */
  exhaustionMs: number | null;
  exhaustionAt: number | null;
  samples: number;
  windowMs: number;
}

/** Statistiche derivate dalla storia: consumo medio e proiezione. */
export function computeTrend(history: HistoryPoint[], win: "interval" | "weekly"): TrendStats {
  const pts = history.slice(-60);
  if (pts.length < 2) return { ratePerHour: null, exhaustionMs: null, exhaustionAt: null, samples: pts.length, windowMs: 0 };

  const first = pts[0];
  const last = pts[pts.length - 1];
  const dtHours = (last.t - first.t) / 3600_000;
  const dv = first[win === "interval" ? "interval" : "weekly"] - last[win === "interval" ? "interval" : "weekly"];
  const ratePerHour = dtHours > 0 ? dv / dtHours : null;

  const current = last[win === "interval" ? "interval" : "weekly"];
  if (ratePerHour !== null && ratePerHour > 0.01 && current > 0) {
    const hoursLeft = current / ratePerHour;
    return {
      ratePerHour,
      exhaustionMs: hoursLeft * 3600_000,
      exhaustionAt: last.t + hoursLeft * 3600_000,
      samples: pts.length,
      windowMs: last.t - first.t,
    };
  }
  return { ratePerHour, exhaustionMs: null, exhaustionAt: null, samples: pts.length, windowMs: last.t - first.t };
}

/** Pannello statistiche: consumo medio, proiezione esaurimento, rilevamenti, verdetto vs reset. */
export function StatsPanel({
  trend,
  win,
  resetAt = null,
  remaining = null,
  serverCount = null,
}: {
  trend: TrendStats;
  win: "interval" | "weekly";
  /** Epoch ms del reset previsto della finestra selezionata (end_time). */
  resetAt?: number | null;
  /** Percentuale residua attuale della finestra selezionata. */
  remaining?: number | null;
  /** Punti conservati sul server (I16); null = server non raggiunto. */
  serverCount?: number | null;
}) {
  const winLabel = win === "interval" ? "5 ore" : "settimanale";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {trend.ratePerHour !== null && trend.ratePerHour > 0 ? (
            <TrendingDown className="size-3.5 text-rose-400" />
          ) : (
            <TrendingUp className="size-3.5 text-emerald-400" />
          )}
          Consumo medio
        </div>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums text-zinc-100">
          {trend.ratePerHour === null
            ? "N/D"
            : `${trend.ratePerHour > 0 ? "+" : ""}${trend.ratePerHour.toFixed(2)} %/h`}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {trend.ratePerHour === null
            ? "Servono almeno due rilevamenti"
            : trend.ratePerHour > 0
              ? `Stai consumando quota ${winLabel}`
              : "Quota stabile o in recupero (reset)"}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <Hourglass className="size-3.5 text-amber-400" />
          Esaurimento previsto
        </div>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums text-zinc-100">
          {trend.exhaustionMs === null ? "—" : formatCountdown(trend.exhaustionMs)}
        </p>
        <p className="mt-1 truncate text-[11px] text-zinc-500">
          {trend.exhaustionAt === null
            ? "Nessun esaurimento previsto al ritmo attuale"
            : `Raggiungibile il ${formatDateTimeRome(trend.exhaustionAt)}`}
        </p>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <Gauge className="size-3.5 text-zinc-400" />
          Rilevamenti salvati
        </div>
        <p className="mt-2 font-mono text-xl font-bold tabular-nums text-zinc-100">{trend.samples}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {serverCount !== null && serverCount > 0
            ? `Sul server ${serverCount.toLocaleString("it-IT")} punti totali`
            : trend.windowMs > 0
              ? `Su un arco di ${formatCountdown(trend.windowMs)}`
              : "La cronologia è salvata sul tuo dispositivo"}
        </p>
      </div>

      {/* Verdetto: esaurimento stimato vs orario di reset */}
      <ProjectionVerdict trend={trend} resetAt={resetAt} remaining={remaining} win={win} />
    </div>
  );
}

/** Riga di verdetto: la quota durerà fino al reset o si esaurirà prima? */
function ProjectionVerdict({
  trend,
  resetAt,
  remaining,
  win,
}: {
  trend: TrendStats;
  resetAt: number | null;
  remaining: number | null;
  win: "interval" | "weekly";
}) {
  const winLabel = win === "interval" ? "di 5 ore" : "settimanale";
  if (trend.samples < 2 || trend.ratePerHour === null) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          <div>
            <p className="text-xs font-semibold text-zinc-300">Verdetto d’esaurimento</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Raccogli almeno due rilevamenti con la finestra «{winLabel}» attiva per stimare se la quota
              durerà fino al reset o si esaurirà prima.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const exhaustedBeforeReset =
    trend.exhaustionAt !== null && resetAt !== null && trend.exhaustionAt < resetAt;

  if (exhaustedBeforeReset) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-xs font-semibold text-amber-200">Rischio esaurimento prima del reset</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/70">
              Al ritmo attuale (+{trend.ratePerHour.toFixed(2)} %/h) la quota {winLabel} ({remaining?.toFixed(1)}%)
              si esaurirà il <strong>{formatDateTimeRome(trend.exhaustionAt)}</strong>, PRIMA del reset previsto
              per le <strong>{formatTimeRome(resetAt)}</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (trend.exhaustionAt !== null && resetAt !== null) {
    return (
      <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          <div>
            <p className="text-xs font-semibold text-emerald-200">Quota sufficiente fino al reset</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-200/70">
              Al ritmo attuale (+{trend.ratePerHour.toFixed(2)} %/h) l’esaurimento è previsto solo il{" "}
              <strong>{formatDateTimeRome(trend.exhaustionAt)}</strong>: la finestra {winLabel} si ricaricherà
              alle <strong>{formatTimeRome(resetAt)}</strong>, prima di esaurirsi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Consumo ~zero o negativo: nessun rischio stimato
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:col-span-3">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-zinc-500" />
        <div>
          <p className="text-xs font-semibold text-zinc-300">Nessun esaurimento previsto al ritmo attuale</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            {trend.ratePerHour > 0
              ? `Il consumo è quasi nullo (+${trend.ratePerHour.toFixed(2)} %/h): la quota ${winLabel} durerà agevolmente fino al reset${resetAt ? ` delle ${formatTimeRome(resetAt)}` : ""}.`
              : `Quota stabile o in recupero (reset avvenuto): nessun rischio di esaurimento per la finestra ${winLabel}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Badge sintetico del trend, per l'header. */
export function TrendBadge({ trend }: { trend: TrendStats }) {
  if (trend.ratePerHour === null) return null;
  const up = trend.ratePerHour > 0;
  return (
    <Badge variant="outline" className="gap-1 border-white/10 text-[10px] text-zinc-400">
      {up ? <TrendingDown className="size-3 text-rose-400" /> : <TrendingUp className="size-3 text-emerald-400" />}
      {up ? "+" : ""}
      {trend.ratePerHour.toFixed(2)} %/h
    </Badge>
  );
}
