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
  detectCyclesFinestre,
  heatmapConsumption,
  summarizeCycles,
  weekdayConsumption,
  WEEKDAY_LABELS,
  senzaDemo,
  sprecoPerCiclo,
  prevedibilitaCicli,
  evoluzionePrevedibilita,
  evoluzioneMedia,
  consumoGiornaliero,
  distribuzioneResiduo,
  oggiVsMedia,
  type Cycle,
  type CycleSummary,
  type HeatmapGrid,
  type WasteStats,
  type Prevedibilita,
  type PrevedibilitaEvoluzione,
  type EvoluzioneMedia,
  type CalendarGrid,
  type Distribuzione,
  type OggiVsMedia,
} from "@/lib/cycles";
import { mergeHistories, fetchServerHistory, serverPointsToHistory } from "@/lib/server-history";
import { fetchServerModelHistory, historyForModel, modelRowsToPoints } from "@/lib/model-history";
import { formatDateTimeRome, formatDuration } from "@/lib/time";
import { descrizioneCalendario, descrizioneHeatmap } from "@/lib/a11y";
import type { HistoryPoint } from "@/components/history-chart";
import type { TooltipContentProps } from "recharts";
import { CalendarDays, Database, Flame, Info, Layers, RefreshCw } from "lucide-react";

/* I96 — costanti Recharts a livello modulo (identità stabili tra i render). */
const MARGIN_BAR = { top: 8, right: 8, bottom: 0, left: -18 } as const;
const TICK_STYLE = { fill: "#71717a", fontSize: 10 } as const;
const AXIS_LINE_TENUE = { stroke: "rgba(255,255,255,0.08)" } as const;
const TICK_PERCENTO = (v: number) => `${Math.round(v)}%`;
const TOOLTIP_CURSOR = { fill: "rgba(255,255,255,0.04)" } as const;

/** Tooltip del consumo per giorno: finestra 5h + settimanale. */
function tooltipGiorni(props: TooltipContentProps) {
  const { active, payload, label } = props;
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
}

interface LongTermAnalysisProps {
  /** Storico fuso locale+server già presente nella pagina (fonte primaria). */
  history: HistoryPoint[];
  /** I82 — modello pivot dell'analisi: «general» usa lo storico flat server,
   *  gli altri modelli il proprio storico per-modello (/api/history/models). */
  nomeModello?: string;
  /** I82 — etichetta breve della finestra «interval» del modello pivot (es. «5 ore», «24 ore»). */
  intervalLabel?: string;
}

/** Analisi di lungo periodo: cicli, calendario, distribuzione, heatmap (memoizzata: I96). */
function LongTermAnalysisBase({ history, nomeModello = "general", intervalLabel = "5 ore" }: LongTermAnalysisProps) {
  const [loading, setLoading] = React.useState(false);
  const [loadedAt, setLoadedAt] = React.useState<number | null>(null);
  /* I90 — i punti server sono STATO (servono al render nel merge): la vecchia
     coppia remoteRef + serverVersion leggeva una ref in render (regola v7). */
  const [remote, setRemote] = React.useState<HistoryPoint[] | null>(null);

  /** Scarica (o ri-scarica) lo storico completo dal server. Con pivot non-general
   *  la fonte è lo storico PER-MODELLO (I82): lo storico flat di /api/history è
   *  solo di «general», fonderlo a un altro modello falserebbe le analisi. */
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (nomeModello === "general") {
        const server = await fetchServerHistory(10_000);
        if (server && server.points.length > 0) {
          setRemote(serverPointsToHistory(server.points));
          setLoadedAt(Date.now());
        }
      } else {
        const server = await fetchServerModelHistory(10_000);
        if (server && server.rows.length > 0) {
          setRemote(historyForModel(modelRowsToPoints(server.rows), nomeModello));
          setLoadedAt(Date.now());
        }
      }
    } finally {
      setLoading(false);
    }
  }, [nomeModello]);

  /* Al cambio di pivot i punti server del modello precedente vanno DROPPATI:
     il merge per timestamp non distingue i modelli. I90 — aggiustamento di
     stato in fase di render (pattern React «adjusting state when a prop
     changes») al posto del reset sincrono in effect (regola v7). */
  const [prevModello, setPrevModello] = React.useState(nomeModello);
  if (prevModello !== nomeModello) {
    setPrevModello(nomeModello);
    setRemote(null);
  }

  // Prima analisi: scarica lo storico completo appena il pannello monta.
  // I90 — avvio differito di un tick: load (che scrive stato con setLoading)
  // parte in callback, non sincrono nel corpo dell'effetto (regola v7); il
  // fetch è comunque asincrone, il timing effettivo non cambia.
  React.useEffect(() => {
    const avvio = setTimeout(() => void load(), 0);
    return () => clearTimeout(avvio);
  }, [load]);

  /** Serie d'analisi: storico pagina + punti server (dedup per timestamp).
   *  I124 — i punti demo (source="demo", locali e server) sono ESCLUSI da
   *  TUTTE le analisi (proposal (a) task 69: generano falsi reset e falsi
   *  consumi); i punti senza marca (legacy) restano inclusi. */
  const data = React.useMemo(() => {
    const fuso = remote ? mergeHistories(history, remote) : history;
    return senzaDemo(fuso);
  }, [history, remote]);

  /* I124 — segmentazione a FINESTRE UFFICIALI dove la cadenza è verificata:
   * - «interval» di general → blocchi fissi 5h UTC (verdetto V8, docs/02);
   * - «weekly» → settimane da lunedì 00:00 UTC (finestra a livello di piano,
   *   valida per qualunque modello);
   * - «interval» degli ALTRI modelli → euristica dei salti (detectCycles):
   *   la finestra breve varia per modello (5h general, 24h video) senza una
   *   cadenza verificata per ciascuno — inventare un allineamento produrrebbe
   *   cicli sbagliati con dati silenziosamente plausibili. */
  const intervalCycles = React.useMemo(
    () =>
      nomeModello === "general"
        ? detectCyclesFinestre(data, "interval")
        : detectCycles(data, "interval"),
    [data, nomeModello],
  );
  const weeklyCycles = React.useMemo(() => detectCyclesFinestre(data, "weekly"), [data]);
  const intervalSummary = React.useMemo(() => summarizeCycles(intervalCycles), [intervalCycles]);
  const weeklySummary = React.useMemo(() => summarizeCycles(weeklyCycles), [weeklyCycles]);
  const weekdayWeekly = React.useMemo(() => weekdayConsumption(data, "weekly"), [data]);
  const weekdayInterval = React.useMemo(() => weekdayConsumption(data, "interval"), [data]);
  const heatInterval = React.useMemo(() => heatmapConsumption(data, "interval"), [data]);
  const heatWeekly = React.useMemo(() => heatmapConsumption(data, "weekly"), [data]);

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
  const fromServer = remote?.length ?? 0;

  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="size-4 text-zinc-400" />
            Analisi di lungo periodo
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Cicli di finestra, consumo per giorno e per ora, statistiche sui dati persistiti · orario Europe/Rome
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
          <TabsList className="mb-3 h-auto max-w-full flex-wrap justify-start bg-white/[0.06]">
            <TabsTrigger value="cicli-interval" className="text-xs data-[state=active]:text-zinc-900">
              Cicli {intervalLabel}
            </TabsTrigger>
            <TabsTrigger value="cicli-weekly" className="text-xs data-[state=active]:text-zinc-900">
              Cicli settimanali
            </TabsTrigger>
            <TabsTrigger value="giorni" className="text-xs data-[state=active]:text-zinc-900">
              Per giorno
            </TabsTrigger>
            <TabsTrigger value="calendario" className="text-xs data-[state=active]:text-zinc-900">
              Calendario
            </TabsTrigger>
            <TabsTrigger value="ore" className="text-xs data-[state=active]:text-zinc-900">
              Per ora
            </TabsTrigger>
            <TabsTrigger value="distribuzione" className="text-xs data-[state=active]:text-zinc-900">
              Distribuzione
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cicli-interval" className="mt-0">
            <CycleSection
              cycles={intervalCycles}
              summary={intervalSummary}
              winLabel={`finestra di ${intervalLabel}`}
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
            <div className="space-y-4">
              <TodayComparison history={data} intervalLabel={intervalLabel} />
              <WeekdaySection weekly={weekdayWeekly} interval={weekdayInterval} />
            </div>
          </TabsContent>

          <TabsContent value="calendario" className="mt-0">
            <CalendarSection history={data} intervalLabel={intervalLabel} />
          </TabsContent>

          <TabsContent value="ore" className="mt-0">
            <HeatmapSection interval={heatInterval} weekly={heatWeekly} intervalLabel={intervalLabel} />
          </TabsContent>

          <TabsContent value="distribuzione" className="mt-0">
            <DistributionSection history={data} intervalLabel={intervalLabel} />
          </TabsContent>
        </Tabs>

        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed text-zinc-600">
          <Info className="size-3 shrink-0" />
          Analisi su {data.length.toLocaleString("it-IT")} rilevamenti su un arco di {formatDuration(spanMs)}
          {loadedAt ? ` · storico server caricato alle ${formatDateTimeRome(loadedAt).split(" ")[1]}` : ""}.
          Il primo ciclo può essere parziale (storico iniziato a finestra in corso); i punti demo sono
          esclusi dalle analisi (I124).
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
  const waste = React.useMemo(() => sprecoPerCiclo(cycles), [cycles]);
  const prev = React.useMemo(() => prevedibilitaCicli(cycles), [cycles]);
  // I128 — come si è mosso l'indice al crescere del campione (contesto del caveat I127).
  const evo = React.useMemo(() => evoluzionePrevedibilita(cycles), [cycles]);
  // I129 — stessa lettura d'evoluzione per ritmo medio e spreco medio (sui completati,
  // in ordine cronologico; ratePerHour null con consumo nullo è escluso dal ritmo).
  const evoRitmo = React.useMemo(
    () => evoluzioneMedia(cycles.filter((c) => !c.ongoing).map((c) => c.ratePerHour).filter((r): r is number => r !== null)),
    [cycles],
  );
  const evoSpreco = React.useMemo(
    () => evoluzioneMedia(cycles.filter((c) => !c.ongoing).map((c) => Math.max(0, c.endValue))),
    [cycles],
  );

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

      {/* I129 — evoluzione del ritmo medio: i cicli recenti stanno ancora spostando la media? */}
      {evoRitmo && evoRitmo.serie.length >= 2 ? (
        <EvoluzioneMediaLine
          etichetta="Evoluzione del ritmo medio"
          evo={evoRitmo}
          format={(m) => `${m.toFixed(2)} %/h`}
        />
      ) : null}

      {/* I57 — spreco per ciclo + I63 — prevedibilità + I128 — evoluzione dell'indice */}
      <CycleWaste waste={waste} />
      <PrevedibilitaStrip prev={prev} evo={evo} />

      {/* I129 — evoluzione dello spreco medio (residuo al reset) */}
      {evoSpreco && evoSpreco.serie.length >= 2 ? (
        <EvoluzioneMediaLine
          etichetta="Evoluzione dello spreco medio"
          evo={evoSpreco}
          format={(m) => `${m.toFixed(1)}%`}
        />
      ) : null}

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
                <TableHead className="text-[11px] text-zinc-500">Reset finestra</TableHead>
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
                  {/* I124 — momento ufficiale del reset (confine di finestra):
                      il ciclo si chiude qui anche senza campioni successivi;
                      per il ciclo in corso è il PROSSIMO reset. */}
                  <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-zinc-400">
                    {c.windowEndT !== undefined ? formatDateTimeRome(c.windowEndT) : "—"}
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
      {/* I124 — semantica delle finestre ufficiali (per i cicli allineati). */}
      {cycles.some((c) => c.windowEndT !== undefined) ? (
        <p className="text-[11px] leading-relaxed text-zinc-600">
          I cicli sono allineati alle finestre ufficiali e si chiudono al loro reset anche senza
          rilevamenti successivi (le finestre proseguono il conteggio lato MiniMax); le finestre
          senza rilevamenti non compaiono. Con campionamento sparso durata e ritmo sono limiti
          inferiori (primo → ultimo rilevamento osservato).
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
          <BarChart data={data} margin={MARGIN_BAR} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={AXIS_LINE_TENUE}
            />
            <YAxis
              tick={TICK_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={TICK_PERCENTO}
            />
            <Tooltip cursor={TOOLTIP_CURSOR} content={tooltipGiorni} />
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

/* ------------------------------------------------------------------ */
/* I57 — Spreco per ciclo + I63 — Prevedibilità                        */
/* ------------------------------------------------------------------ */

function CycleWaste({ waste }: { waste: WasteStats | null }) {
  if (!waste) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Spreco medio</p>
        <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-amber-300">{waste.media.toFixed(1)}%</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">residuo al reset</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Spreco mediano</p>
        <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-zinc-100">{waste.mediana.toFixed(1)}%</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">su {waste.n} cicli completati</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Peggiore spreco</p>
        <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-rose-300">{waste.max.toFixed(1)}%</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">reset più anticipo</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cicli puliti</p>
        <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-emerald-300">{waste.percClean.toFixed(0)}%</p>
        <p className="mt-0.5 text-[10px] text-zinc-500">{waste.clean}/{waste.n} con spreco &lt; 5%</p>
      </div>
    </div>
  );
}

function PrevedibilitaStrip({
  prev,
  evo,
}: {
  prev: Prevedibilita | null;
  evo?: PrevedibilitaEvoluzione | null;
}) {
  if (!prev) return null;
  const lettura = prev.indice >= 70 ? "Cicli regolari" : prev.indice >= 40 ? "Cicli variabili" : "Cicli irregolari";
  const tone = prev.indice >= 70 ? "text-emerald-300" : prev.indice >= 40 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Prevedibilità</p>
      <p className={`text-xs font-semibold ${tone}`}>
        {lettura} · indice {prev.indice}/100
      </p>
      <p className="text-[11px] text-zinc-500">
        durata media {formatDuration(prev.mediaMs)} · σ {formatDuration(prev.sigmaMs)} · CV {(prev.cv * 100).toFixed(0)}% · {prev.n} cicli
        {/* I127 — onestà statistica: con pochi cicli completati la σ è dominata
            dai singoli valori e le durate sono limiti inferiori (campionamento
            sparso): l'indice resta calcolato ma va letto come indicativo. */}
        {prev.campioneRidotto ? (
          <span className="text-amber-300/90"> · campione ridotto (indice fragile)</span>
        ) : null}
      </p>
      {/* I128 — evoluzione dell'indice al crescere del campione: il contesto
          del caveat «campione ridotto». Con ≥2 punti mostra il percorso
          (chip n → indice) con l'ultimo Δ e il salto massimo: Δ piccoli =
          l'indice si sta stabilizzando, salti ampi = la lettura è ancora
          dominata dai cicli arrivati di recente. */}
      {evo && evo.serie.length >= 2 ? <PrevedibilitaEvoLine evo={evo} /> : null}
    </div>
  );
}

/** I128 — riga dell'evoluzione: chip «n → indice» (ultimi 8 punti) + ultimo Δ + salto max. */
function PrevedibilitaEvoLine({ evo }: { evo: PrevedibilitaEvoluzione }) {
  const visibili = evo.serie.slice(-8);
  const troncata = evo.serie.length > visibili.length;
  const ultimo = visibili[visibili.length - 1];
  const deltaTone =
    ultimo.delta === null || ultimo.delta === 0
      ? "text-zinc-400"
      : ultimo.delta > 0
        ? "text-emerald-300"
        : "text-rose-300";
  const chipTone = (indice: number) =>
    indice >= 70 ? "text-emerald-300/90" : indice >= 40 ? "text-amber-300/90" : "text-rose-300/90";
  return (
    <p className="text-[11px] text-zinc-500" aria-label="Evoluzione dell'indice Prevedibilità al crescere del campione">
      <span className="text-zinc-400">Evoluzione dell&apos;indice: </span>
      {troncata ? <span className="text-zinc-600">… </span> : null}
      {visibili.map((p, i) => (
        <span key={p.n}>
          {i > 0 ? <span className="text-zinc-600"> → </span> : null}
          <span className="font-mono tabular-nums">
            <span className="text-zinc-600">{p.n}→</span>
            <span className={chipTone(p.indice)}>{p.indice}</span>
          </span>
        </span>
      ))}
      <span className="text-zinc-600">
        {" "}
        ·{" "}
      </span>
      <span className={deltaTone}>
        ultimo Δ {ultimo.delta === null ? "—" : ultimo.delta > 0 ? `+${ultimo.delta}` : ultimo.delta}
      </span>
      <span className="text-zinc-600"> · salti max {evo.maxSalto}</span>
    </p>
  );
}

/**
 * I129 — riga dell'evoluzione di una media cumulativa (ritmo medio, spreco
 * medio): chip «n → media» (ultimi 8 punti, «…» se troncata) + ultimo Δ +
 * salto max, stesso linguaggio visivo di PrevedibilitaEvoLine (I128) ma con
 * delta NEUTRO (grigio): a differenza dell'indice, la direzione del Δ di una
 * media (ritmo più veloce/lento, spreco maggiore/minore) non ha una valenza
 * buona/cattiva univoca — il colore qui dichiarerebbe un giudizio che non è
 * del codice. `format` decide l'unità (%/h, %). Visibile con ≥2 punti (il
 * gate è del chiamante).
 */
function EvoluzioneMediaLine({
  etichetta,
  evo,
  format,
}: {
  etichetta: string;
  evo: EvoluzioneMedia;
  format: (media: number) => string;
}) {
  const visibili = evo.serie.slice(-8);
  const troncata = evo.serie.length > visibili.length;
  const ultimo = visibili[visibili.length - 1];
  const segno = ultimo.delta === null ? "" : ultimo.delta > 0 ? "+" : "";
  return (
    <p className="text-[11px] text-zinc-500" aria-label={`${etichetta} al crescere del campione`}>
      <span className="text-zinc-400">{etichetta}: </span>
      {troncata ? <span className="text-zinc-600">… </span> : null}
      {visibili.map((p, i) => (
        <span key={p.n}>
          {i > 0 ? <span className="text-zinc-600"> → </span> : null}
          <span className="font-mono tabular-nums">
            <span className="text-zinc-600">{p.n}→</span>
            <span className="text-zinc-300">{format(p.media)}</span>
          </span>
        </span>
      ))}
      <span className="text-zinc-600">
        {" "}
        ·{" "}
      </span>
      <span className="text-zinc-400">
        ultimo Δ {ultimo.delta === null ? "—" : `${segno}${format(ultimo.delta)}`}
      </span>
      <span className="text-zinc-600"> · salti max {format(evo.maxSalto)}</span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* I64 — Oggi vs media degli stessi weekday                            */
/* ------------------------------------------------------------------ */

function TodayComparison({ history, intervalLabel = "5 ore" }: { history: HistoryPoint[]; intervalLabel?: string }) {
  const [win, setWin] = React.useState<"interval" | "weekly">("interval");
  const confronto = React.useMemo(() => oggiVsMedia(history, win, 5), [history, win]);
  const o: OggiVsMedia = confronto;
  const diffTone = o.senzaMedia ? "text-zinc-400" : o.differenza > 0.05 ? "text-rose-300" : o.differenza < -0.05 ? "text-emerald-300" : "text-zinc-300";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Finestra del confronto">
        <Button variant="outline" size="sm" aria-pressed={win === "interval"} onClick={() => setWin("interval")}
          className={`h-8 border-white/10 text-xs ${win === "interval" ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          {intervalLabel}
        </Button>
        <Button variant="outline" size="sm" aria-pressed={win === "weekly"} onClick={() => setWin("weekly")}
          className={`h-8 border-white/10 text-xs ${win === "weekly" ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          Settimanale
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Oggi</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">{o.oggi.toFixed(1)}%</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">consumo del giorno</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Media stessi giorni</p>
          <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-zinc-100">{o.senzaMedia ? "—" : `${o.media.toFixed(1)}%`}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">ultime 5 settimane (oggi escluso)</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Differenza</p>
          <p className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${diffTone}`}>
            {o.senzaMedia ? "—" : `${o.differenza > 0 ? "+" : ""}${o.differenza.toFixed(1)}%`}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            {o.senzaMedia ? "nessun giorno confrontabile" : `su ${o.giorniConsiderati} giorni`}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I58 — Calendario del consumo (stile GitHub)                         */
/* ------------------------------------------------------------------ */

const CAL_SETTIMANE = 20;

function CalendarSection({ history, intervalLabel = "5 ore" }: { history: HistoryPoint[]; intervalLabel?: string }) {
  const [win, setWin] = React.useState<"interval" | "weekly">("interval");
  const grid: CalendarGrid = React.useMemo(() => consumoGiornaliero(history, win, CAL_SETTIMANE), [history, win]);
  const winLabel = win === "interval" ? `finestra di ${intervalLabel}` : "finestra settimanale";

  const cellColor = (v: number | null): string | undefined => {
    if (v === null || v <= 0) return undefined;
    const alpha = 0.12 + 0.78 * Math.sqrt(v / (grid.max || 1));
    return `rgba(52, 211, 153, ${alpha.toFixed(3)})`;
  };

  if (grid.total <= 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 text-center">
        <CalendarDays className="size-5 text-zinc-600" />
        <p className="text-xs leading-relaxed text-zinc-500">
          Nessun consumo attribuibile a un giorno di calendario ({winLabel}): servono rilevamenti in calo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Finestra del calendario">
        <Button variant="outline" size="sm" aria-pressed={win === "interval"} onClick={() => setWin("interval")}
          className={`h-8 border-white/10 text-xs ${win === "interval" ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          {intervalLabel}
        </Button>
        <Button variant="outline" size="sm" aria-pressed={win === "weekly"} onClick={() => setWin("weekly")}
          className={`h-8 border-white/10 text-xs ${win === "weekly" ? "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          Settimanale
        </Button>
        <span className="ml-auto text-[10px] text-zinc-600">ultime {CAL_SETTIMANE} settimane · la corrente è l&apos;ultima colonna</span>
      </div>

      {/* I79 — descrizione testuale della griglia per screen reader */}
      <p className="sr-only">{descrizioneCalendario(grid, winLabel)}</p>

      <div className="overflow-x-auto rounded-xl border border-white/[0.07] p-2">
        <div className="space-y-[3px]" aria-hidden>
          {grid.weeks.map((settimana, wi) => (
            <div key={wi} className="flex items-center gap-[3px]">
              {settimana.map((cella, ci) => (
                <div
                  key={ci}
                  title={cella.date ? `${cella.date} — consumo ${cella.value?.toFixed(1) ?? "0"}%` : "giorno futuro"}
                  className="h-5 w-5 shrink-0 rounded-[4px] border border-white/[0.04]"
                  style={{ backgroundColor: cellColor(cella.value) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        <span>0%</span>
        <span aria-hidden className="h-2 w-28 rounded-full" style={{ background: "linear-gradient(90deg, rgba(52,211,153,0.12), rgba(52,211,153,0.9))" }} />
        <span>{grid.max.toFixed(1)}% (picco giornaliero)</span>
        <span className="ml-auto">{grid.giorni} giorni con consumo · totale {grid.total.toFixed(1)}%</span>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Consumo per giorno di calendario (Europe/Rome, DST-safe via date stringhe), attribuito al punto medio
        tra i rilevamenti con la stessa semantica drawdown delle altre analisi. Le colonne sono lun→dom;
        la settimana corrente è sempre l&apos;ultima.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I61 — Istogramma del residuo                                        */
/* ------------------------------------------------------------------ */

function DistributionSection({ history, intervalLabel = "5 ore" }: { history: HistoryPoint[]; intervalLabel?: string }) {
  const [win, setWin] = React.useState<"interval" | "weekly">("interval");
  const dist: Distribuzione = React.useMemo(() => distribuzioneResiduo(history, win), [history, win]);
  const winLabel = win === "interval" ? `finestra di ${intervalLabel}` : "finestra settimanale";

  if (dist.n === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 text-center">
        <Layers className="size-5 text-zinc-600" />
        <p className="text-xs leading-relaxed text-zinc-500">Nessun rilevamento da distribuire ({winLabel}).</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Finestra della distribuzione">
        <Button variant="outline" size="sm" aria-pressed={win === "interval"} onClick={() => setWin("interval")}
          className={`h-8 border-white/10 text-xs ${win === "interval" ? "bg-sky-500/15 text-sky-200 hover:bg-sky-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          {intervalLabel}
        </Button>
        <Button variant="outline" size="sm" aria-pressed={win === "weekly"} onClick={() => setWin("weekly")}
          className={`h-8 border-white/10 text-xs ${win === "weekly" ? "bg-sky-500/15 text-sky-200 hover:bg-sky-500/20!" : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"}`}>
          Settimanale
        </Button>
        <span className="ml-auto text-[10px] text-zinc-600">{dist.n} rilevamenti distribuiti</span>
      </div>

      <div className="space-y-1.5">
        {[...dist.fasce].reverse().map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-500">{f.label}%</span>
            <div className="h-4 flex-1 overflow-hidden rounded-md bg-white/[0.04]">
              <div
                className="h-full rounded-md transition-[width] duration-500"
                style={{ width: `${(f.count / (dist.max || 1)) * 100}%`, backgroundColor: f.color }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-400">
              {f.count} · {((f.count / dist.n) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Quante volte la quota è stata osservata in ciascuna fascia di residuo (assegnazione con
        ceil: 84,5% cade in 80–90). Le fasce rosse a sinistra = momenti di scarsità; un istogramma
        spostato a destra indica un piano usato con ampio margine.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sezione heatmap: consumo per giorno × ora (I32)                     */
/* ------------------------------------------------------------------ */

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Heatmap 7×24 del consumo (I32): righe = giorni della settimana, colonne =
 * ore del giorno (Europe/Rome). L'intensità è proporzionale al consumo
 * attribuito alla cella (scala con radice quadrata per valorizzare i valori
 * bassi); il tooltip mostra il valore e il numero di cali attribuiti.
 */
function HeatmapSection({
  interval,
  weekly,
  intervalLabel = "5 ore",
}: {
  interval: HeatmapGrid;
  weekly: HeatmapGrid;
  /** I82 — etichetta breve della finestra «interval» del modello pivot. */
  intervalLabel?: string;
}) {
  const [hw, setHw] = React.useState<"interval" | "weekly">("interval");
  const grid = hw === "interval" ? interval : weekly;
  const winLabel = hw === "interval" ? `finestra di ${intervalLabel}` : "finestra settimanale";

  /** Cella con il consumo massimo (picco della griglia corrente). */
  let peak: { day: number; hour: number; value: number } | null = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = grid.cells[d][h];
      if (v > 0 && (!peak || v > peak.value)) peak = { day: d, hour: h, value: v };
    }
  }

  if (grid.total <= 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 text-center">
        <Flame className="size-5 text-zinc-600" />
        <p className="text-xs leading-relaxed text-zinc-500">
          Nessun consumo attribuibile a un&apos;ora del giorno ({winLabel}): servono rilevamenti in calo
          nello stesso giorno (Europe/Rome).
        </p>
      </div>
    );
  }

  const cellColor = (v: number): string | undefined => {
    if (v <= 0) return undefined;
    const alpha = 0.08 + 0.82 * Math.sqrt(v / (grid.max || 1));
    return `rgba(167, 139, 250, ${alpha.toFixed(3)})`;
  };

  return (
    <div className="space-y-3">
      {/* Selettore finestra */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Finestra della heatmap">
        <Button
          variant="outline"
          size="sm"
          aria-pressed={hw === "interval"}
          onClick={() => setHw("interval")}
          className={`h-8 border-white/10 text-xs ${
            hw === "interval"
              ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/20!"
              : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"
          }`}
        >
          {intervalLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={hw === "weekly"}
          onClick={() => setHw("weekly")}
          className={`h-8 border-white/10 text-xs ${
            hw === "weekly"
              ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/20!"
              : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"
          }`}
        >
          Settimanale
        </Button>
        <span className="ml-auto text-[10px] text-zinc-600">ore Europe/Rome</span>
      </div>

      {/* KPI della griglia corrente */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Consumo attribuito</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-zinc-100">
            {grid.total.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">{winLabel}</p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ora di picco</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-zinc-100">
            {peak ? `${WEEKDAY_LABELS[peak.day]} ${String(peak.hour).padStart(2, "0")}:00` : "—"}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
            {peak ? `${peak.value.toFixed(1)}% nel blocco orario` : "nessun picco"}
          </p>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Celle attive</p>
          <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-zinc-100">
            {grid.populated}
            <span className="text-sm font-medium text-zinc-500">/168</span>
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">blocchi giorno × ora con consumo</p>
        </div>
      </div>

      {/* I79 — descrizione testuale della griglia per screen reader */}
      <p className="sr-only">{descrizioneHeatmap(grid, winLabel)}</p>

      {/* Griglia 7×24 */}
      <div className="overflow-x-auto rounded-xl border border-white/[0.07] p-2">
        <div className="min-w-[560px] space-y-[3px]" aria-hidden>
          {WEEKDAY_LABELS.map((label, d) => (
            <div key={label} className="flex items-center gap-[3px]">
              <span className="w-8 shrink-0 text-right text-[10px] capitalize text-zinc-500">{label}</span>
              {HOURS.map((h) => {
                const v = grid.cells[d][h];
                const n = grid.events[d][h];
                return (
                  <div
                    key={h}
                    title={`${label} ${String(h).padStart(2, "0")}:00 — consumo ${v.toFixed(1)}% (${n} ${
                      n === 1 ? "calo" : "cali"
                    })`}
                    className="h-6 flex-1 rounded-[3px] border border-white/[0.04]"
                    style={{ backgroundColor: cellColor(v) }}
                  />
                );
              })}
            </div>
          ))}
          <div className="flex items-center gap-[3px] pt-0.5">
            <span className="w-8 shrink-0" />
            {HOURS.map((h) => (
              <span key={h} className="flex-1 text-center text-[8px] tabular-nums text-zinc-600">
                {h % 2 === 0 ? h : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
        <span>0%</span>
        <span
          aria-hidden
          className="h-2 w-28 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(167,139,250,0.08), rgba(167,139,250,0.9))",
          }}
        />
        <span>{grid.max.toFixed(1)}% (picco)</span>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Consumo per (giorno × ora) in orario Europe/Rome, calcolato sul calo del minimo progressivo della
        quota tra i rilevamenti — i rimbalzi senza reset non sono consumo — e attribuito al punto medio tra
        i due rilevamenti. Le celle più intense indicano le fasce orarie in cui il piano si consuma di più;
        passando con il mouse su una cella si vedono il consumo attribuito e il numero di cali.
      </p>
    </div>
  );
}

export const LongTermAnalysis = React.memo(LongTermAnalysisBase);
