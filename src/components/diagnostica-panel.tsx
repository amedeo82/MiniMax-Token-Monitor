"use client";

/**
 * I60 + I62 — Pannello «Diagnostica» del monitor.
 *
 * - **ResetClock** (I60): dot plot SVG a 24 ore con asse UTC che confronta i
 *   reset OSSERVATI nello storico (finestra 5h e settimanale, rilevati da
 *   `detectCycles`) con i BLOCCHI TEORICI UTC (00/05/10/15/20 — gli orari
 *   fissi dei reset MiniMax, cf. campagna V8). Ogni dot ha un tooltip nativo
 *   con orario Roma e UTC; serve a vedere a colpo d'occhio se i reset cadono
 *   sui blocchi fissi o scivolano.
 * - **MonitorHealth** (I62): salute del monitor dagli eventi `error` del
 *   registro — episodi raggruppati (errori a meno di 15 minuti = stesso
 *   guasto), ultimo errore, messaggio più frequente — con badge dello stato
 *   del backoff (I51) quando lo scheduler è in modalità attesa.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectCycles } from "@/lib/cycles";
import { saluteMonitor, type SaluteMonitor } from "@/lib/health";
import { formatDateTimeRome, formatTimeRome, formatCountdown } from "@/lib/time";
import type { HistoryPoint } from "@/components/history-chart";
import type { UsageEvent } from "@/lib/usage-events";
import { Activity, Clock4, HeartPulse, TimerReset } from "lucide-react";

/* ------------------------------------------------------------------ */
/* I60 — Orologio dei reset                                            */
/* ------------------------------------------------------------------ */

/** Blocchi teorici dei reset MiniMax (ore UTC). */
const BLOCCHI_UTC = [0, 5, 10, 15, 20];

interface ResetOsservato {
  t: number;
  win: "interval" | "weekly";
}

export function ResetClock({ history }: { history: HistoryPoint[] }) {
  const resetti = React.useMemo<ResetOsservato[]>(() => {
    const out: ResetOsservato[] = [];
    for (const win of ["interval", "weekly"] as const) {
      const cicli = detectCycles(history, win);
      // il primo punto di ogni ciclo (a parte il primo) è il PRIMO rilevamento
      // dopo un reset: il tempo del reset vero è tra la fine del ciclo
      // precedente e questo; usiamo la MEZZA via tra i due rilevamenti.
      for (let i = 1; i < cicli.length; i++) {
        const finePrev = cicli[i - 1].endT;
        const inizioNext = cicli[i].startT;
        out.push({ t: (finePrev + inizioNext) / 2, win });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }, [history]);

  // Finestra temporale mostrata: gli ultimi 7 giorni di dati
  const ora = history.length > 0 ? history[history.length - 1].t : Date.now();
  const da = ora - 7 * 86_400_000;
  const visibili = resetti.filter((r) => r.t >= da);

  /** x = posizione orizzontale (0–24h UTC) di un timestamp. */
  const x = (t: number) => {
    const d = new Date(t);
    const hUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    return 20 + (hUTC / 24) * (760 - 40);
  };

  const lanes = { interval: 62, weekly: 92, teorici: 122 } as const;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
        <svg viewBox="0 0 760 150" className="min-w-[640px]" role="img" aria-label="Orologio dei reset: reset osservati contro blocchi teorici UTC">
          {/* blocchi teorici di fondo */}
          {BLOCCHI_UTC.map((h) => (
            <line key={h} x1={20 + (h / 24) * (760 - 40)} y1={30} x2={20 + (h / 24) * (760 - 40)} y2={132} stroke="rgba(255,255,255,0.10)" strokeDasharray="3 4" />
          ))}
          {/* etichette corsie */}
          <text x={4} y={lanes.interval + 4} fill="#71717a" fontSize="10">5h</text>
          <text x={4} y={lanes.weekly + 4} fill="#71717a" fontSize="10">sett</text>
          <text x={4} y={lanes.teorici + 4} fill="#71717a" fontSize="10">UTC</text>
          {/* asse orario */}
          <line x1={20} y1={132} x2={740} y2={132} stroke="rgba(255,255,255,0.14)" />
          {Array.from({ length: 25 }, (_, h) => (h % 2 === 0 ? h : null)).map(
            (h) =>
              h !== null ? (
                <text key={h} x={20 + (h / 24) * (760 - 40)} y={146} fill="#52525b" fontSize="9" textAnchor="middle">
                  {String(h).padStart(2, "0")}
                </text>
              ) : null,
          )}

          {/* blocchi teorici: marker di fondo */}
          {BLOCCHI_UTC.map((h) => (
            <circle key={`t-${h}`} cx={20 + (h / 24) * (760 - 40)} cy={lanes.teorici} r={4} fill="rgba(255,255,255,0.28)" />
          ))}

          {/* reset osservati */}
          {visibili.map((r, i) => (
            <circle key={`${r.win}-${i}`} cx={x(r.t)} cy={lanes[r.win]} r={5} fill={r.win === "interval" ? "#34d399" : "#fbbf24"} fillOpacity={0.9}>
              <title>{`Reset ${r.win === "interval" ? "5 ore" : "settimanale"}\nRoma: ${formatDateTimeRome(r.t)}\nUTC: ${new Date(r.t).toISOString().slice(0, 16).replace("T", " ")}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-400" /> reset finestra 5h</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-400" /> reset settimanale</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-zinc-400" /> blocchi teorici UTC (00/05/10/15/20)</span>
        <span className="ml-auto">ultimi 7 giorni · {visibili.length} reset osservati</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I62 — Salute del monitor                                            */
/* ------------------------------------------------------------------ */

export function MonitorHealth({
  salute,
  backoffAttivo,
  backoffDelayMs,
}: {
  salute: SaluteMonitor;
  backoffAttivo: boolean;
  backoffDelayMs: number | null;
}) {
  return (
    <div className="space-y-3">
      {/* Stato operativo */}
      <div className="flex flex-wrap items-center gap-2">
        {backoffAttivo ? (
          <Badge variant="outline" className="gap-1 border-amber-400/30 bg-amber-400/10 text-[11px] text-amber-300">
            <TimerReset className="size-3" />
            Backoff attivo (I51){backoffDelayMs ? ` · prossimo tentativo tra ${formatCountdown(backoffDelayMs)}` : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-emerald-400/30 bg-emerald-400/10 text-[11px] text-emerald-300">
            <HeartPulse className="size-3" />
            Scheduler regolare
          </Badge>
        )}
        <span className="text-[10px] text-zinc-600">
          {salute.totale === 0
            ? "nessun episodio di errore negli ultimi 7 giorni"
            : `${salute.totale} ${salute.totale === 1 ? "episodio" : "episodi"} negli ultimi 7 giorni`}
        </span>
      </div>

      {salute.ultimoErrore ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ultimo errore</p>
          <p className="mt-1 text-xs text-zinc-300">{salute.ultimoErrore.message}</p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-600">{formatDateTimeRome(salute.ultimoErrore.t)}</p>
        </div>
      ) : null}

      {salute.piuFrequente && salute.piuFrequente.conteggio > 1 ? (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Guasto più frequente</p>
          <p className="mt-1 text-xs text-zinc-300">{salute.piuFrequente.message}</p>
          <p className="mt-0.5 text-[10px] text-zinc-600">× {salute.piuFrequente.conteggio} occorrenze</p>
        </div>
      ) : null}

      {salute.episodi.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Inizio episodio</th>
                <th className="px-3 py-2 font-medium">Durata</th>
                <th className="px-3 py-2 font-medium">Errori</th>
                <th className="px-3 py-2 font-medium">Ultimo messaggio</th>
              </tr>
            </thead>
            <tbody>
              {salute.episodi.slice(0, 6).map((e, i) => (
                <tr key={i} className="border-b border-white/[0.04] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-300">{formatDateTimeRome(e.inizio)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-zinc-400">
                    {formatTimeRome(e.fine)} ({Math.max(1, Math.round((e.fine - e.inizio) / 60000))} min)
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-zinc-300">{e.conteggio}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-zinc-500" title={e.ultimoMessaggio}>
                    {e.ultimoMessaggio}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
          Nessun errore registrato: monitor in salute.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pannello completo                                                   */
/* ------------------------------------------------------------------ */

interface DiagnosticaPanelProps {
  history: HistoryPoint[];
  events: UsageEvent[];
  backoffAttivo: boolean;
  backoffDelayMs: number | null;
}

export function DiagnosticaPanel({ history, events, backoffAttivo, backoffDelayMs }: DiagnosticaPanelProps) {
  const salute = React.useMemo(() => saluteMonitor(events), [events]);

  return (
    <Card className="border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Activity className="size-4 text-zinc-400" />
          Diagnostica del monitor
        </CardTitle>
        <CardDescription className="text-xs text-zinc-500">
          Orologio dei reset (blocchi UTC) e salute del rilevamento · orario Europe/Rome
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section aria-label="Orologio dei reset">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Clock4 className="size-3.5 text-zinc-500" />
            Orologio dei reset
          </h3>
          <ResetClock history={history} />
        </section>
        <section aria-label="Salute del monitor">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <HeartPulse className="size-3.5 text-zinc-500" />
            Salute del monitor
          </h3>
          <MonitorHealth salute={salute} backoffAttivo={backoffAttivo} backoffDelayMs={backoffDelayMs} />
        </section>
      </CardContent>
    </Card>
  );
}
