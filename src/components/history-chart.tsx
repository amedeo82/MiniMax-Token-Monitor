"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { formatCountdown, formatDateTimeRome, formatDuration, formatShortRome, formatTimeRome } from "@/lib/time";
import { detectCycles, movingAverage } from "@/lib/cycles";
import { rateSeries } from "@/lib/rate";
import type { EwmaProjection } from "@/lib/ewma";
import { exportHistoryCsv, exportHistoryJson } from "@/lib/export";
import { fetchServerHistory, fetchServerHourly, serverPointsToHistory } from "@/lib/server-history";
import { serverHourlyToHistory } from "@/lib/downsample";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { TrendingDown, TrendingUp, Activity, Hourglass, Gauge, Download, Database, ShieldCheck, AlertTriangle, Info, Spline, Layers, Timer, PiggyBank, Coffee } from "lucide-react";

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

/** I68 — scarica dal server la grana ORARIA derivata e la salva nel formato richiesto. */
async function exportHourlyFromServer(format: "csv" | "json"): Promise<void> {
  const server = await fetchServerHourly(10_000);
  if (!server || server.hours.length === 0) {
    toast.error("Nessun bucket orario disponibile sul server");
    return;
  }
  const points = serverHourlyToHistory(server.hours);
  if (format === "csv") exportHistoryCsv(points);
  else exportHistoryJson(points);
  toast.success(`Esportate ${points.length} ore dallo storico orario del server`);
}

/** Grafico dell'andamento della quota rimanente nel tempo. */
export function HistoryChart({ history, window: win, onWindowChange, serverCount = null }: HistoryChartProps) {
  const [showSma, setShowSma] = React.useState(false);
  /** I32: overlay dei cicli di finestra (fasce alternate + marker dei reset). */
  const [showCycles, setShowCycles] = React.useState(true);

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

  /**
   * I32 — Cicli rilevati sull'intero storico della finestra selezionata, poi
   * ritagliati sull'arco visibile (ultimi 120 punti). Le fasce alternano lo
   * sfondo per distinguere i cicli contigui; il marker «reset»compare solo sui
   * cicli il cui inizio è un reset osservato (il primo è parziale per costruzione).
   */
  const bands = React.useMemo(() => {
    if (!showCycles || history.length < 2 || data.length < 2) return [];
    const lo = data[0].t;
    const hi = data[data.length - 1].t;
    return detectCycles(history, win)
      .filter((c) => c.endT >= lo && c.startT <= hi)
      .map((c) => ({
        index: c.index,
        x1: Math.max(c.startT, lo),
        x2: Math.min(c.endT, hi),
        reset: c.index > 1 && c.startT >= lo && c.startT <= hi ? c.startT : null,
      }));
  }, [showCycles, history, win, data]);
  const showBands = bands.length >= 2; // con un solo ciclo l'alternanza non dice nulla

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
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <div className="min-w-0 space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Activity className="size-4 shrink-0 text-zinc-400" />
            Andamento quota rimanente
          </CardTitle>
          <CardDescription className="break-words text-xs text-zinc-500">
            Cronologia degli ultimi rilevamenti (orario Europe/Rome)
            {serverCount !== null && serverCount > 0
              ? ` · ${serverCount.toLocaleString("it-IT")} punti salvati sul server`
              : ""}
          </CardDescription>
        </div>
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
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
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showCycles}
            aria-label="Mostra o nascondi i cicli di finestra sul grafico"
            onClick={() => setShowCycles((v) => !v)}
            title="Fasce alternate per ciclo di finestra e marker dei reset rilevati"
            className={`h-8 gap-1.5 border-white/10 text-xs ${
              showCycles
                ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/20!"
                : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"
            }`}
          >
            <Layers className="size-3.5" />
            Cicli
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
                  <DropdownMenuLabel className="flex items-center gap-1.5 text-[11px]! text-zinc-500!">
                    <Database className="size-3" />
                    Storico orario (I68, grana derivata)
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => void exportHourlyFromServer("csv")}
                    className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
                  >
                    <Download className="size-3.5" />
                    CSV orario · ultimo valore per ora
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void exportHourlyFromServer("json")}
                    className="text-xs! focus:bg-white/[0.08]! focus:text-zinc-100! data-[disabled]:opacity-40"
                  >
                    <Download className="size-3.5" />
                    JSON orario · ultimo valore per ora
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
          <>
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
                {/* I32: fasce dei cicli (dietro ai dati) + marker dei reset osservati */}
                {showBands
                  ? bands.map((b) => (
                      <ReferenceArea
                        key={`band-${b.index}`}
                        x1={b.x1}
                        x2={b.x2}
                        fill="#ffffff"
                        fillOpacity={b.index % 2 === 0 ? 0.035 : 0.075}
                        stroke="none"
                      />
                    ))
                  : null}
                {bands.map((b) =>
                  b.reset !== null ? (
                    <ReferenceLine
                      key={`reset-${b.index}`}
                      x={b.reset}
                      stroke="#f43f5e"
                      strokeDasharray="4 4"
                      strokeOpacity={0.65}
                      label={{
                        value: "reset",
                        position: "insideTopLeft",
                        fill: "#fb7185",
                        fontSize: 9,
                      }}
                    />
                  ) : null,
                )}
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
          {showCycles && bands.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-zinc-600">
              <Layers className="size-3 shrink-0" />
              Fasce alternate = cicli di finestra rilevati (I26)
              {bands.some((b) => b.reset !== null) ? " · linee rosse = reset osservati" : ""}.
            </p>
          ) : null}
          </>
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
  /** I31: epoch ms dell'ultimo rilevamento usato per il trend. */
  lastT: number | null;
  /** I31: residuo osservato all'ultimo rilevamento (%). */
  lastValue: number | null;
}

/** Statistiche derivate dalla storia: consumo medio e proiezione. */
export function computeTrend(history: HistoryPoint[], win: "interval" | "weekly"): TrendStats {
  const pts = history.slice(-60);
  const key = win === "interval" ? "interval" : "weekly";
  const last = pts.length > 0 ? pts[pts.length - 1] : null;
  const base: TrendStats = {
    ratePerHour: null,
    exhaustionMs: null,
    exhaustionAt: null,
    samples: pts.length,
    windowMs: last && pts.length > 1 ? last.t - pts[0].t : 0,
    lastT: last ? last.t : null,
    lastValue: last ? last[key] : null,
  };
  if (pts.length < 2 || !last) return base;

  const first = pts[0];
  const dtHours = (last.t - first.t) / 3600_000;
  const dv = first[key] - last[key];
  const ratePerHour = dtHours > 0 ? dv / dtHours : null;

  if (ratePerHour !== null && ratePerHour > 0.01 && last[key] > 0) {
    const hoursLeft = last[key] / ratePerHour;
    return {
      ...base,
      ratePerHour,
      exhaustionMs: hoursLeft * 3600_000,
      exhaustionAt: last.t + hoursLeft * 3600_000,
    };
  }
  return { ...base, ratePerHour };
}

/* ------------------------------------------------------------------ */
/* I31 — Pace e quota sprecata (stesso filone del verdetto I23)        */
/* ------------------------------------------------------------------ */

/**
 * Confronta il ritmo attuale con quello che servirebbe per sfruttare la
 * finestra fino all'ultimo, quantificando:
 * - il **ritmo di pareggio** (%/h che azzererebbe la quota ESATTAMENTE al reset);
 * - la **quota sprecata**: residuo previsto al reset se il consumo proseguisse
 *   al ritmo attuale (quota che il piano ricaricherà senza che sia stata usata);
 * - il **fermo tecnico**: tempo senza quota tra l'esaurimento stimato e il
 *   reset, quando il ritmo supera quello di pareggio.
 *
 * Tutto è calcolato sullo stesso modello lineare di I23 (ancorato all'ultimo
 * rilevamento), così i numeri restano coerenti con il verdetto mostrato accanto.
 */
export interface PaceInfo {
  /** Ore dall'ultimo rilevamento al reset; null se il reset è ignoto o già passato. */
  hoursToReset: number | null;
  /** Ritmo attuale (uguale a trend.ratePerHour), %/h. */
  currentPace: number | null;
  /** Ritmo di pareggio per azzerare la quota esattamente al reset, %/h. */
  breakevenPace: number | null;
  /** Residuo previsto al reset al ritmo attuale (punti %); 0 se si esaurisce prima. */
  wastedQuota: number | null;
  /** Tempo di consumo al ritmo attuale equivalente alla quota sprecata. */
  wastedForMs: number | null;
  /** Se la quota si esaurisce prima del reset: tempo «morto» fino al reset. */
  downtimeMs: number | null;
}

const EMPTY_PACE: PaceInfo = {
  hoursToReset: null,
  currentPace: null,
  breakevenPace: null,
  wastedQuota: null,
  wastedForMs: null,
  downtimeMs: null,
};

export function computePace(trend: TrendStats, resetAt: number | null): PaceInfo {
  if (resetAt === null || trend.lastT === null || trend.lastValue === null) {
    return { ...EMPTY_PACE, currentPace: trend.ratePerHour };
  }
  const hoursToReset = (resetAt - trend.lastT) / 3600_000;
  if (!isFinite(hoursToReset) || hoursToReset <= 0) {
    return { ...EMPTY_PACE, currentPace: trend.ratePerHour };
  }

  const breakevenPace = trend.lastValue / hoursToReset;
  const pace = trend.ratePerHour;

  // Esaurimento stimato PRIMA del reset: niente quota sprecata, ma fermo tecnico
  if (trend.exhaustionAt !== null && trend.exhaustionAt < resetAt) {
    return {
      hoursToReset,
      currentPace: pace,
      breakevenPace,
      wastedQuota: 0,
      wastedForMs: 0,
      downtimeMs: Math.max(0, resetAt - trend.exhaustionAt),
    };
  }

  // Residuo previsto al reset sul modello lineare (consumo ~null → residuo = attuale)
  const residual = pace !== null ? trend.lastValue - pace * hoursToReset : trend.lastValue;
  const wastedQuota = Math.max(0, residual);
  return {
    hoursToReset,
    currentPace: pace,
    breakevenPace,
    wastedQuota,
    wastedForMs: pace !== null && pace > 0.01 ? (wastedQuota / pace) * 3600_000 : null,
    downtimeMs: null,
  };
}

/** Pannello statistiche: consumo medio, proiezione esaurimento, rilevamenti, verdetto vs reset. */
export function StatsPanel({
  trend,
  win,
  resetAt = null,
  remaining = null,
  serverCount = null,
  ewma = null,
}: {
  trend: TrendStats;
  win: "interval" | "weekly";
  /** Epoch ms del reset previsto della finestra selezionata (end_time). */
  resetAt?: number | null;
  /** Percentuale residua attuale della finestra selezionata. */
  remaining?: number | null;
  /** Punti conservati sul server (I16); null = server non raggiunto. */
  serverCount?: number | null;
  /** I72 — proiezione EWMA (A/B affiancata al verdetto, non sostitutiva). */
  ewma?: EwmaProjection | null;
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

      {/* I31 — pace di consumo e quota sprecata (stesso filone del verdetto) */}
      <PacePanel trend={trend} resetAt={resetAt} remaining={remaining} win={win} />

      {/* I72 — proiezione EWMA: secondo parere affiancato al verdetto lineare */}
      <EwmaCard trend={trend} ewma={ewma} />
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

/* ------------------------------------------------------------------ */
/* I31 — Pannello pace e quota sprecata (stesso filone del verdetto)   */
/* ------------------------------------------------------------------ */

/** Sotto questa soglia (punti percento) il residuo previsto al reset conta come pareggio. */
const PACE_EPSILON = 2;

/** Formatta un ritmo %/h con segno esplicito quando positivo. */
function fmtRate(r: number | null): string {
  return r === null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(2)} %/h`;
}

/**
 * Riga di sintesi pace: confronta il ritmo attuale con quello di pareggio e
 * quantifica la quota che resterà inutilizzata al reset (o il fermo tecnico
 * quando la quota si esaurisce prima del ricaricamento).
 */
function PacePanel({
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
  const pace = computePace(trend, resetAt);

  if (trend.samples < 2 || pace.hoursToReset === null || pace.breakevenPace === null) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <Timer className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          <div>
            <p className="text-xs font-semibold text-zinc-300">Pace e quota sprecata</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Con almeno due rilevamenti e una finestra con reset noto il monitor confronta il ritmo attuale
              con quello di pareggio (%/h che azzererebbe la quota esattamente al reset) e stima quanta
              quota resterà inutilizzata.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* Captured as const: preserves the null-narrowing of the guard within the kpis closure */
  const breakevenPace: number = pace.breakevenPace;

  const kpis = (label: string, value: string, valueClass: string) => (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ritmo attuale</p>
        <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-100">{fmtRate(pace.currentPace)}</p>
      </div>
      <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ritmo di pareggio</p>
        <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-100">
          +{breakevenPace.toFixed(2)} %/h
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        <p className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
      </div>
    </div>
  );

  // 1) Fermo tecnico: la quota si esaurisce PRIMA del reset → ore senza quota
  if (pace.downtimeMs !== null && pace.downtimeMs > 0) {
    return (
      <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <Coffee className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-amber-200">Fermo tecnico prima del reset</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-200/70">
              Al ritmo attuale la quota {winLabel} ({remaining?.toFixed(1)}%) si esaurirà PRIMA del reset
              previsto per le <strong>{formatTimeRome(resetAt)}</strong>: senza quota disponibile per circa{" "}
              <strong>{formatCountdown(pace.downtimeMs)}</strong>. Per azzerarla esattamente al reset il ritmo
              dovrebbe scendere a +{breakevenPace.toFixed(2)} %/h.
            </p>
            {kpis("Fermo tecnico stimato", formatCountdown(pace.downtimeMs), "text-amber-200")}
          </div>
        </div>
      </div>
    );
  }

  // 2) Quota sprecata: residuo apprezzabile al momento del reset
  if (pace.wastedQuota !== null && pace.wastedQuota > PACE_EPSILON) {
    const wasted = pace.wastedQuota.toFixed(1);
    return (
      <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <PiggyBank className="mt-0.5 size-4 shrink-0 text-violet-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-violet-200">Quota sprecata: ~{wasted}% al reset</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-violet-200/70">
              {pace.currentPace === null
                ? "Nessun consumo osservato negli ultimi rilevamenti: alla fine della finestra"
                : "Al ritmo attuale, alla fine della finestra"}{" "}
              {winLabel} resterà circa il <strong>{wasted}%</strong> della quota, che il reset delle{" "}
              <strong>{formatTimeRome(resetAt)}</strong> azzererà senza che sia stata usata
              {pace.wastedForMs !== null
                ? ` — l’equivalente di ${formatCountdown(pace.wastedForMs)} di consumo al ritmo attuale`
                : ""}
              . Per sfruttarla tutta il ritmo dovrebbe salire a +{breakevenPace.toFixed(2)} %/h.
            </p>
            {kpis("Residuo previsto al reset", `~${wasted}%`, "text-violet-200")}
          </div>
        </div>
      </div>
    );
  }

  // 3) Pareggio: residuo trascurabile, la quota si esaurirà vicino al reset
  const residual = pace.wastedQuota ?? 0;
  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4 sm:col-span-3">
      <div className="flex items-start gap-2.5">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-emerald-200">Ritmo quasi di pareggio</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-200/70">
            Il residuo previsto al reset è ~{residual.toFixed(1)}%: la quota {winLabel} si esaurirà poco prima
            del ricaricamento previsto per le <strong>{formatTimeRome(resetAt)}</strong> (pareggio a +
            {breakevenPace.toFixed(2)} %/h, ritmo attuale {fmtRate(pace.currentPace)}).
          </p>
          {kpis("Residuo previsto al reset", `~${residual.toFixed(1)}%`, "text-emerald-200")}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I72 — Proiezione EWMA: secondo parere A/B affiancato al verdetto     */
/* ------------------------------------------------------------------ */

/**
 * Card di confronto A/B tra la proiezione lineare di I23/I31 (corda su 60
 * punti, quel che alimenta il Verdetto d'esaurimento) e la proiezione
 * esponenzialmente pesata (`lib/ewma.ts`, mezza vita 2h). AFFIANCATA, non
 * sostitutiva: il verdetto ufficiale resta quello lineare. L'EWMA reagisce
 * prima ai cambi di ritmo recenti; la differenza tra i due orari è la
 * misura visiva di quanto il ritmo recente si sta discostando dalla media
 * della finestra osservata.
 */
function EwmaCard({
  trend,
  ewma,
}: {
  trend: TrendStats;
  ewma: EwmaProjection | null;
}) {
  // Non calcolabile: servono almeno due ritmi istantanei validi
  if (ewma === null || ewma.campioni < 2 || ewma.ritmo === null) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:col-span-3">
        <div className="flex items-start gap-2.5">
          <Spline className="mt-0.5 size-4 shrink-0 text-zinc-500" />
          <div>
            <p className="text-xs font-semibold text-zinc-300">
              Proiezione EWMA (A/B)
              <Badge variant="outline" className="ml-1.5 border-white/10 px-1.5 py-0 text-[9px] uppercase tracking-wider text-zinc-500">
                sperimentale
              </Badge>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              Servono almeno due ritmi misurabili (rilevamenti ravvicinati, senza reset) per stimare
              l’esaurimento anche con la media esponenzialmente pesata e confrontarlo con il verdetto lineare.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const lineare = trend.exhaustionAt;
  const ewmaAt = ewma.esaurimentoAt;

  /** Differenza tra i due orari stimati (negativa = EWMA anticipa il lineare). */
  const deltaMs = lineare !== null && ewmaAt !== null ? ewmaAt - lineare : null;

  const lettura =
    trend.ratePerHour !== null && deltaMs !== null
      ? deltaMs < -1_800_000
        ? "Il ritmo recente è più alto della media della finestra: l’EWMA ANTICIPA il verdetto lineare."
        : deltaMs > 1_800_000
          ? "Il ritmo recente è più basso della media della finestra: l’EWMA ALLONTANA l’esaurimento stimato."
          : "Il ritmo recente conferma la media della finestra: i due modelli concordano."
      : null;

  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-4 sm:col-span-3">
      <div className="flex items-start gap-2.5">
        <Spline className="mt-0.5 size-4 shrink-0 text-sky-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-sky-200">
            Proiezione EWMA (A/B)
            <Badge variant="outline" className="ml-1.5 border-sky-400/30 px-1.5 py-0 text-[9px] uppercase tracking-wider text-sky-300/80">
              sperimentale · non sostitutiva
            </Badge>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-sky-200/70">
            Secondo parere con media esponenzialmente pesata dei ritmi istantanei (mezza vita{" "}
            {formatCountdown(ewma.halfLifeMs)}): reagisce prima ai cambi di ritmo recenti, al prezzo di più
            rumore. Il verdetto ufficiale resta quello lineare.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Lineare (I23/I31)</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-100">
                {lineare !== null ? formatDateTimeRome(lineare) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">EWMA</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-sky-200">
                {ewmaAt !== null ? formatDateTimeRome(ewmaAt) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Differenza</p>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-100">
                {deltaMs === null
                  ? "—"
                  : deltaMs === 0
                    ? "coincidenti"
                    : `${deltaMs < 0 ? "−" : "+"}${formatCountdown(Math.abs(deltaMs))}`}
              </p>
            </div>
          </div>
          {lettura ? <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{lettura}</p> : null}
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

/* ------------------------------------------------------------------ */
/* I59 — RateChart: ritmo di consumo %/h sotto il grafico               */
/* ------------------------------------------------------------------ */

/**
 * Grafico del ritmo istantaneo di consumo (%/h) calcolato con `rateSeries`
 * (gap > 30 min e reset → null, SMA-3 sui valori validi). Le interruzioni
 * della linea sono informative: corrispondono a buchi di campionamento o
 * reset, non sono dati mancanti da riempire.
 */
export function RateChart({ history, window: win }: { history: HistoryPoint[]; window: "interval" | "weekly" }) {
  const rate = React.useMemo(() => rateSeries(history, win), [history, win]);
  const winLabel = win === "interval" ? "finestra 5 ore" : "finestra settimanale";

  const dati = React.useMemo(
    () =>
      history.map((p, i) => ({
        t: p.t,
        ritmo: rate.series[i],
      })),
    [history, rate],
  );

  const maxScale = Math.max(5, Math.ceil((rate.max * 1.15) / 5) * 5);

  return (
    <div className="space-y-1.5" aria-label="Ritmo di consumo">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
          <Gauge className="size-3.5 text-zinc-500" />
          Ritmo di consumo (%/h) — {winLabel}
        </p>
        <span className="ml-auto font-mono text-[11px] tabular-nums text-zinc-500">
          media {rate.media.toFixed(2)} %/h · picco {rate.max.toFixed(2)} %/h · {rate.validi} campioni
        </span>
      </div>
      <div className="h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dati} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => formatShortRome(t)} tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} minTickGap={48} />
            <YAxis tick={{ fill: "#71717a", fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, maxScale]} tickFormatter={(v: number) => `${v}`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { t: number; ritmo: number | null };
                if (p.ritmo === null) return null;
                return (
                  <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                    <p className="text-zinc-400">{formatDateTimeRome(p.t)}</p>
                    <p className="mt-0.5 font-mono tabular-nums text-sky-300">{p.ritmo.toFixed(2)} %/h</p>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="ritmo" stroke="#38bdf8" strokeWidth={1.8} fill="rgba(56,189,248,0.10)" connectNulls={false} isAnimationActive={false} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-600">
        Pendenza locale della quota (drawdown/ora): le interruzioni corrispondono a buchi &gt; 30 min o reset
        (non sono consumo). Valori smorzati con media mobile a 3 campioni.
      </p>
    </div>
  );
}
