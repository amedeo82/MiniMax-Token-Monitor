"use client";

/**
 * I75 — Report settimanale stampabile.
 *
 * Blocco `hidden print:block` (visibile SOLO sulla carta) composto per la
 * stampa: verdetto di proiezione lineare + EWMA (I23/I72), riepilogo cicli per
 * entrambe le finestre (I26), spreco per ciclo (I57), consumo per giorno della
 * settimana e calendario GitHub-style (I58). Tutto è calcolato sullo STORICO
 * COMPLETO (non sull'intervallo selezionato I69): la carta deve riassumere
 * l'intera osservazione, non l'ultimo tratto.
 *
 * Lancio: voce «Stampa report settimanale» nel menu Esporta del grafico →
 * `stampaReportSettimanale()` (lib/print.ts) aggiunge `print-report` a <body>
 * e le regole `@media print` di globals.css riducono il foglio a SOLO questo
 * blocco (`.print-report-root`). Nessuna interazione: niente bottoni, solo
 * tabelle e testo.
 */

import * as React from "react";
import {
  detectCyclesFinestre,
  senzaDemo,
  summarizeCycles,
  sprecoPerCiclo,
  weekdayConsumption,
  consumoGiornaliero,
  WEEKDAY_LABELS,
  type CycleSummary,
  type WasteStats,
  type WeekdayStat,
  type CalendarGrid,
  type WindowKey,
} from "@/lib/cycles";
import { computeTrend, type HistoryPoint, type TrendStats } from "@/components/history-chart";
import { ewmaProjection, type EwmaProjection } from "@/lib/ewma";
import { formatDateTimeRome, formatFullRome, formatDuration } from "@/lib/time";

export interface PrintReportProps {
  /** Storico COMPLETO (riassumerà l'intera osservazione, non l'intervallo I69). */
  history: HistoryPoint[];
  /** Finestra selezionata nel grafico: il verdetto in testa segue questa. */
  win: "interval" | "weekly";
  /** true = dati demo (ritmo evidente in testa al report). */
  demo?: boolean;
}

const fmtPct = (v: number | null | undefined, dec = 1): string =>
  v === null || v === undefined ? "—" : `${v.toFixed(dec)}%`;

const fmtRate = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${v.toFixed(2)} %/h`;

function RigaKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-black/15 py-1">
      <span className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="font-mono text-sm font-semibold text-black">{value}</span>
    </div>
  );
}

function SezioneReport({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <section className="mm-print-section">
      <h2 className="mb-2 border-b border-black/60 pb-1 text-sm font-bold uppercase tracking-wide">{titolo}</h2>
      {children}
    </section>
  );
}

function TabellaCicli({ win, summary, waste }: { win: WindowKey; summary: CycleSummary | null; waste: WasteStats | null }) {
  const label = win === "interval" ? "5 ore" : "settimanale";
  if (!summary || summary.total === 0) {
    return <p className="text-xs text-zinc-600">Nessun ciclo osservato sulla finestra {label}.</p>;
  }
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-black/40 text-left">
          <th className="py-1 pr-2 font-semibold">Metrica ({label})</th>
          <th className="py-1 pr-2 text-right font-semibold">Valore</th>
        </tr>
      </thead>
      <tbody className="font-mono">
        <tr>
          <td className="border-b border-black/10 py-1 pr-2">Cicli osservati (completati)</td>
          <td className="border-b border-black/10 py-1 text-right">
            {summary.total} ({summary.completed})
          </td>
        </tr>
        <tr>
          <td className="border-b border-black/10 py-1 pr-2">Durata media ciclo</td>
          <td className="border-b border-black/10 py-1 text-right">
            {summary.avgDurationMs !== null ? formatDuration(summary.avgDurationMs) : "—"}
          </td>
        </tr>
        <tr>
          <td className="border-b border-black/10 py-1 pr-2">Consumo medio per ciclo</td>
          <td className="border-b border-black/10 py-1 text-right">{fmtPct(summary.avgConsumed)}</td>
        </tr>
        <tr>
          <td className="border-b border-black/10 py-1 pr-2">Ritmo medio</td>
          <td className="border-b border-black/10 py-1 text-right">{fmtRate(summary.avgRatePerHour)}</td>
        </tr>
        <tr>
          <td className="border-b border-black/10 py-1 pr-2">Residuo minimo registrato</td>
          <td className="border-b border-black/10 py-1 text-right">{fmtPct(summary.minEver)}</td>
        </tr>
        {waste ? (
          <tr>
            <td className="border-b border-black/10 py-1 pr-2">Spreco medio al reset (puliti {waste.clean}/{waste.n})</td>
            <td className="border-b border-black/10 py-1 text-right">{fmtPct(waste.media)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function PrintReport({ history, win, demo = false }: PrintReportProps) {
  /* I124 — fuori dalla modalità demo i punti demo sono esclusi da TUTTE le
   * sezioni del report (cicli a finestre ufficiali, per giorno, calendario);
   * in demo mode il report è lui stesso una dimostrazione: serie demo non
   * filtrata, altrimenti sarebbe vuota. Cicli: segmentazione a FINESTRE
   * UFFICIALI (blocchi 5h UTC / settimane lunedì 00 UTC — il report riassume
   * lo storico flat di «general»). */
  const serie = React.useMemo(() => (demo ? history : senzaDemo(history)), [demo, history]);
  const trend = React.useMemo<TrendStats>(() => computeTrend(serie, win), [serie, win]);
  const ewma = React.useMemo<EwmaProjection | null>(() => ewmaProjection(serie, win), [serie, win]);

  const cicli5h = React.useMemo(() => summarizeCycles(detectCyclesFinestre(serie, "interval")), [serie]);
  const cicliWeekly = React.useMemo(() => summarizeCycles(detectCyclesFinestre(serie, "weekly")), [serie]);
  const spreco5h = React.useMemo(() => sprecoPerCiclo(detectCyclesFinestre(serie, "interval")), [serie]);
  const sprecoWeekly = React.useMemo(() => sprecoPerCiclo(detectCyclesFinestre(serie, "weekly")), [serie]);
  const perGiorno = React.useMemo<WeekdayStat[]>(() => weekdayConsumption(serie, win), [serie, win]);
  const calendario = React.useMemo<CalendarGrid>(() => consumoGiornaliero(serie, win, 12), [serie, win]);

  const arco =
    serie.length > 0
      ? `${formatDateTimeRome(serie[0].t)} → ${formatDateTimeRome(serie[serie.length - 1].t)}`
      : "nessun dato";
  const ultimo = serie.length > 0 ? serie[serie.length - 1] : null;
  const winLabel = win === "interval" ? "finestra 5 ore" : "finestra settimanale";

  return (
    <div className="print-report-root hidden text-black" aria-label="Report settimanale stampabile">
      <div className="mx-auto max-w-3xl space-y-5 p-2">
        {/* Intestazione — NOTA: è un <div>, non un <header>: la regola print
            generica nasconde il cromo della pagina (header/footer/nav) e un
            <header> qui verrebbe nascosto anch'esso. */}
        <div className="mm-print-header border-b-2 border-black pb-2">
          <h1 className="text-lg font-black tracking-tight">MiniMax Token Monitor — Report settimanale</h1>
          <p className="mt-1 text-xs text-zinc-700">
            Generato il {formatFullRome(Date.now())} · dati {demo ? "DEMO (simulati)" : "API reali"} ·
            arco osservato: {arco} · {serie.length} rilevamenti
          </p>
        </div>

        {/* Verdetto */}
        <SezioneReport titolo={`Verdetto di proiezione — ${winLabel}`}>
          <div className="grid grid-cols-2 gap-x-6">
            <div>
              <RigaKpi label="Residuo ultimo rilevamento" value={fmtPct(ultimo ? ultimo[win === "interval" ? "interval" : "weekly"] : null)} />
              <RigaKpi label="Ritmo attuale (lineare)" value={fmtRate(trend.ratePerHour)} />
              <RigaKpi
                label="Esaurimento stimato"
                value={trend.exhaustionAt !== null ? formatDateTimeRome(trend.exhaustionAt) : "non prevedibile"}
              />
            </div>
            <div>
              <RigaKpi
                label="Esaurimento EWMA (A/B)"
                value={ewma?.esaurimentoAt != null ? formatDateTimeRome(ewma.esaurimentoAt) : "non prevedibile"}
              />
              <RigaKpi
                label="Differenza lineare vs EWMA"
                value={
                  trend.exhaustionAt !== null && ewma?.esaurimentoAt != null
                    ? formatDuration(Math.abs(ewma.esaurimentoAt - trend.exhaustionAt))
                    : "—"
                }
              />
              <RigaKpi label="Campioni usati (lineare)" value={String(trend.samples)} />
            </div>
          </div>
        </SezioneReport>

        {/* Cicli + spreco */}
        <SezioneReport titolo="Cicli e spreco per ciclo">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TabellaCicli win="interval" summary={cicli5h} waste={spreco5h} />
            <TabellaCicli win="weekly" summary={cicliWeekly} waste={sprecoWeekly} />
          </div>
        </SezioneReport>

        {/* Consumo per giorno della settimana */}
        <SezioneReport titolo={`Consumo medio per giorno della settimana — ${winLabel}`}>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-black/40 text-left">
                {WEEKDAY_LABELS.map((g) => (
                  <th key={g} className="py-1 pr-2 font-semibold">
                    {g}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              <tr>
                {perGiorno.map((s) => (
                  <td key={s.key} className="border-b border-black/10 py-1 pr-2">
                    {fmtPct(s.avgPerDay)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </SezioneReport>

        {/* Calendario consumo (ultime 12 settimane) */}
        <SezioneReport titolo="Calendario del consumo (ultime 12 settimane)">
          <p className="mb-1 text-[11px] text-zinc-600">
            Consumo totale attribuito {fmtPct(calendario.total)} su {calendario.giorni} giorni con dati ·
            celle vuote = senza rilevamenti. Colonne lun → dom.
          </p>
          <table className="w-full border-collapse text-[10px]">
            <tbody className="font-mono">
              {calendario.weeks.map((settimana, i) => (
                <tr key={i}>
                  {settimana.map((cella, j) => (
                    <td
                      key={j}
                      className="border border-black/20 px-1 py-0.5 text-center"
                      title={cella.date ?? undefined}
                    >
                      {cella.date ? (cella.value !== null ? cella.value.toFixed(0) : "·") : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-zinc-500">
            Valori = punti percento di quota consumati nel giorno (drawdown, Europe/Rome); «·» = giorno senza
            consumo osservato.
          </p>
        </SezioneReport>
      </div>
    </div>
  );
}
