"use client";

/**
 * I26 — Pannello «Analisi di lungo periodo».
 *
 * Usa lo storico fuso locale+server (fino a 10.000 punti scaricati da
 * /api/history, see lib/cycles.ts) per mostrare:
 * - cicli di finestra 5h e settimanali rilevati sui dati persistenti,
 *   con durata, consumo e ritmo medi (confronto tra finestre consecutive);
 * - consumo medio per giorno della settimana (Europe/Rome);
 * - l'arco temporale e la quantità di dati su cui l'analisi è calcolata.
 *
 * Lo storico completo viene scaricato automaticamente al mount e ricaricabile
 * con l'apposito pulsante; la UI resta comunque funzionante con soli 2 punti.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  detectCycles,
  summarizeCycles,
  weekdayConsumption,
  type Cycle,
  type CycleSummary,
} from "@/lib/cycles";
import { mergeHistories, fetchServerHistory, serverPointsToHistory } from "@/lib/server-history";
import { formatDateTimeRome, formatDuration } from "@/lib/time";
import type { HistoryPoint } from "@/components/history-chart";
import { CalendarDays, Database, Info, Layers, RefreshCw } from "lucide-react";

interface LongTermAnalysisProps {
  /** Storico fuso locale+server già presente nella pagina (fonte primaria). */
  history: HistoryPoint[];
}

export function LongTermAnalysis({ history }: LongTermAnalysisProps) {
  const [loading, setLoading] = React.useState(false);
  const [loadedAt, setLoadedAt] = React.useState<number | null>(null);
  const [serverVersion, setServerVersion] = React.useState(0);
  const remoteRef = React.useRef<HistoryPoint[] | null>(null);

  /** Scarica (o ri-scarica) lo storico completo dal server. */
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const server = await fetchServerHistory(10_000);
      if (server && server.points.length > 0) {
        remoteRef.current = serverPointsToHistory(server.points);
        setServerVersion((v) => v + 1);
        setLoadedAt(Date.now());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Prima analisi: scarica lo storico completo appena il pannello monta
  React.useEffect(() => {
    void load();
  }, [load]);

  /** Serie d'analisi: storico pagina + punti server (dedup per timestamp). */
  const data = React.useMemo(() => {
    void serverVersion; // dipendenza esplicita: ricalcola quando il server risponde
    return remoteRef.current ? mergeHistories(history, remoteRef.current) : history;
  }, [history, serverVersion]);

  const intervalCycles = React.useMemo(() => detectCycles(data, "interval"), [data]);
  const weeklyCycles = React.useMemo(() => detectCycles(data, "weekly"), [data]);
  const intervalSummary = React.useMemo(() => summarizeCycles(intervalCycles), [intervalCycles]);
  const weeklySummary = React.useMemo(() => summarizeCycles(weeklyCycles), [weeklyCycles]);
  const weekdayWeekly = React.useMemo(() => weekdayConsumption(data, "weekly"), [data]);
  const weekdayInterval = React.useMemo(() => weekdayConsumption(data, "interval"), [data]);

  if (data.length < 2) {
    return (
      <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="size-4 text-zinc-400" />
            Analisi di lungo periodo
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Cicli di finestra, consumo medio e statistiche sui dati persistiti
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
            Servono almeno due rilevamenti per avviare l&apos;analisi di lungo periodo.
          </div>
        </CardContent>
      </Card>
    );
  }

  const spanMs = data[data.length - 1].t - data[0].t;
  const fromServer = remoteRef.current?.length ?? 0;

  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="size-4 text-zinc-400" />
            Analisi di lungo periodo
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Cicli di finestra, consumo medio e statistiche sui dati persistiti · orario Europe/Rome
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 border-white/10 text-[10px] font-normal text-zinc-400">
            <Database className="size-3" />
            {data.length.toLocaleString("it-IT")} punti
            {fromServer > 0 ? ` · ${fromServer.toLocaleString("it-IT")} dal server` : ""}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            aria-label="Ricarica lo storico completo dal server"
            disabled={loading}
            onClick={() => void load()}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
          >
            <RefreshCw className={`size-3.5 text-zinc-400 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Carico…" : "Ricarica dal server"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="cicli-interval">
          <TabsList className="mb-3 bg-white/[0.06]">
            <TabsTrigger value="cicli-interval" className="text-xs data-[state=active]:text-zinc-900">
              Cicli 5 ore
            </TabsTrigger>
            <TabsTrigger value="cicli-weekly" className="text-xs data-[state=active]:text-zinc-900">
              Cicli settimanali
            </TabsTrigger>
            <TabsTrigger value="giorni" className="text-xs data-[state=active]:text-zinc-900">
              Per giorno
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cicli-interval" className="mt-0">
            <CycleSection
              cycles={intervalCycles}
              summary={intervalSummary}
              winLabel="finestra di 5 ore"
              onGoingLabel="Ciclo in corso"
            />
          </TabsContent>

          <TabsContent value="cicli-weekly" className="mt-0">
            <CycleSection
              cycles={weeklyCycles}
              summary={weeklySummary}
              winLabel="finestra settimanale"
              onGoingLabel="Settimana in corso"
            />
          </TabsContent>

          <TabsContent value="giorni" className="mt-0">
            <WeekdaySection weekly={weekdayWeekly} interval={weekdayInterval} />
          </TabsContent>
        </Tabs>

        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed text-zinc-600">
          <Info className="size-3 shrink-0" />
          Analisi su {data.length.toLocaleString("it-IT")} rilevamenti su un arco di {formatDuration(spanMs)}
          {loadedAt ? ` · storico server caricato alle ${formatDateTimeRome(loadedAt).split(" ")[1]}` : ""}.
          Il primo ciclo può essere parziale (storico iniziato a finestra in corso).
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Sezione cicli: KPI + tabella                                        */
/* ------------------------------------------------------------------ */

function CycleSection({
  cycles,
  summary,
  winLabel,
  onGoingLabel,
}: {
  cycles: Cycle[];
  summary: CycleSummary;
  winLabel: string;
  onGoingLabel: string;
}) {
  const visible = [...cycles].slice(-8).reverse(); // i più recenti prima

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cicli rilevati</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">{summary.total}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {summary.completed} completati
            {summary.ongoing ? " · 1 in corso" : ""}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Durata media</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">
            {summary.avgDurationMs === null ? "—" : formatDuration(summary.avgDurationMs)}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">per ciclo completato</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Consumo medio</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">
            {summary.avgConsumed === null ? "—" : `${summary.avgConsumed.toFixed(1)}%`}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">per ciclo completato</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ritmo medio</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">
            {summary.avgRatePerHour === null ? "—" : `${summary.avgRatePerHour.toFixed(2)} %/h`}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">minimo registrato {summary.minEver?.toFixed(1) ?? "—"}%</p>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
          Nessun ciclo rilevato sulla {winLabel}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.07] hover:bg-transparent">
                <TableHead className="text-[11px] text-zinc-500">Inizio</TableHead>
                <TableHead className="text-[11px] text-zinc-500">Fine</TableHead>
                <TableHead className="text-[11px] text-zinc-500">Durata</TableHead>
                <TableHead className="text-right text-[11px] text-zinc-500">Consumo</TableHead>
                <TableHead className="text-right text-[11px] text-zinc-500">Residuo min</TableHead>
                <TableHead className="text-right text-[11px] text-zinc-500">Ritmo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => (
                <TableRow
                  key={c.index}
                  className={c.ongoing ? "border-white/[0.07] bg-amber-400/[0.04]" : "border-white/[0.07]"}
                >
                  <TableCell className="whitespace-nowrap text-xs text-zinc-300">
                    {formatDateTimeRome(c.startT)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-zinc-300">
                    {c.ongoing ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-400/30 bg-amber-400/10 text-[10px] text-amber-300"
                      >
                        {onGoingLabel}
                      </Badge>
                    ) : (
                      formatDateTimeRome(c.endT)
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs tabular-nums text-zinc-300">
                    {formatDuration(c.durationMs)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-rose-300">
                    −{c.consumed.toFixed(1)}%
                    <span className="ml-1 text-zinc-600">
                      ({c.startValue.toFixed(0)}→{c.endValue.toFixed(0)})
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-300">
                    {c.minValue.toFixed(1)}%
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-300">
                    {c.ratePerHour === null ? "—" : `${c.ratePerHour.toFixed(2)} %/h`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {cycles.length > 8 ? (
        <p className="text-[11px] text-zinc-600">
          Mostrati gli ultimi 8 di {cycles.length} cicli rilevati sulla {winLabel}.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sezione per giorno della settimana                                  */
/* ------------------------------------------------------------------ */

interface WeekdayDatum {
  day: string;
  "Finestra 5h": number;
  Settimanale: number;
}

function WeekdaySection({
  weekly,
  interval,
}: {
  weekly: ReturnType<typeof weekdayConsumption>;
  interval: ReturnType<typeof weekdayConsumption>;
}) {
  const data: WeekdayDatum[] = weekly.map((w, i) => ({
    day: w.label,
    "Finestra 5h": Math.round((interval[i]?.avgPerDay ?? 0) * 10) / 10,
    Settimanale: Math.round(w.avgPerDay * 10) / 10,
  }));

  const hasData = data.some((d) => d["Finestra 5h"] > 0 || d.Settimanale > 0);
  const totalDays = weekly.reduce((acc, s) => acc + s.days, 0);

  if (!hasData) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 text-center">
        <CalendarDays className="size-5 text-zinc-600" />
        <p className="text-xs leading-relaxed text-zinc-500">
          Nessun consumo attribuibile a un giorno della settimana: servono almeno un paio di
          rilevamenti in calo nello stesso giorno (Europe/Rome).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fill: "#71717a", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            />
            <YAxis
              tick={{ fill: "#71717a", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${Math.round(v)}%`}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as WeekdayDatum;
                return (
                  <div className="rounded-lg border border-white/10 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                    <p className="font-medium capitalize text-zinc-200">{label}</p>
                    <p className="mt-1 font-mono tabular-nums text-emerald-400">
                      5h: {p["Finestra 5h"].toFixed(1)} %/giorno
                    </p>
                    <p className="font-mono tabular-nums text-amber-400">
                      Settimanale: {p.Settimanale.toFixed(1)} %/giorno
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="Finestra 5h" fill="#34d399" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Settimanale" fill="#fbbf24" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Consumo medio per giorno della settimana (punti percento persi nel giorno, orario Europe/Rome),
        calcolato sul calo del minimo progressivo della quota tra i rilevamenti — i rimbalzi senza reset
        non sono consumo — e normalizzato sui giorni presenti nello storico ({totalDays} giorni osservati).
        I giorni senza consumo registrato compaiono a 0.
      </p>
    </div>
  );
}
