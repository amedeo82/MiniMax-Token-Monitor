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
 * - **Anomalie del ritmo** (I70): z-score robusto (mediana + MAD) sui ritmi
 *   GREZZI di `rateSeries`: evidenzia scoppi e pause fuori regime.
 * - **Qualità del campionamento** (I71): copertura attesa/osservata per
 *   giorno Roma + gap > 15 min: quanto lo storico è «buono» prima di
 *   fidarsi delle analisi.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectCycles } from "@/lib/cycles";
import { saluteMonitor, type SaluteMonitor } from "@/lib/health";
import { detectRateAnomalies, type RateAnomalies } from "@/lib/rate-anomalies";
import { samplingQuality, type SamplingQuality } from "@/lib/sampling";
import { formatDateTimeRome, formatTimeRome, formatCountdown, formatDuration } from "@/lib/time";
import { descrizioneResetClock } from "@/lib/a11y";
import type { HistoryPoint } from "@/components/history-chart";
import type { UsageEvent } from "@/lib/usage-events";
import { Activity, Clock4, EyeOff, HeartPulse, TimerReset, Radar, Gauge, WifiOff } from "lucide-react";

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
        {/* I79 — l'aria-label del role="img" è generato dai dati (lib/a11y):
            descrive reset osservati, ultimo reset Roma e blocchi teorici UTC */}
        <svg viewBox="0 0 760 150" className="min-w-[640px]" role="img" aria-label={descrizioneResetClock(resetti, da, ora)}>
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
  pollCausa,
}: {
  salute: SaluteMonitor;
  backoffAttivo: boolean;
  backoffDelayMs: number | null;
  /** I100 — causa dell'attesa attuale (fuori dal normale scheduling): offline o tab nascosta. */
  pollCausa: "offline" | "tab-nascosto" | null;
}) {
  return (
    <div className="space-y-3">
      {/* Stato operativo */}
      <div className="flex flex-wrap items-center gap-2">
        {pollCausa === "offline" ? (
          <Badge variant="outline" className="gap-1 border-red-400/30 bg-red-400/10 text-[11px] text-red-300">
            <WifiOff className="size-3" />
            Offline — al rientro della rete tick immediato (I100)
          </Badge>
        ) : null}
        {pollCausa === "tab-nascosto" ? (
          <Badge variant="outline" className="gap-1 border-sky-400/30 bg-sky-400/10 text-[11px] text-sky-300">
            <EyeOff className="size-3" />
            Tab nascosta — polling dilatato ×4 (I100)
          </Badge>
        ) : null}
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
/* I70 — Anomalie del ritmo (z-score robusto mediana + MAD)            */
/* ------------------------------------------------------------------ */

/** Massimo numero di anomalie mostrate (dalla più recente). */
const MAX_ANOMALIE_VISIBILI = 8;

/**
 * Sezione «Anomalie del ritmo»: il regime atteso (mediana dei ritmi %/h) e
 * i momenti in cui il consumo ne è deviato in modo netto (|z| > 3.5). Come
 * per I60/I62 si giudica lo storico COMPLETO: il regime va misurato sull'
 * intera osservazione, non sull'ultimo tratto.
 */
export function RateAnomaliesPanel({ history }: { history: HistoryPoint[] }) {
  const anomalie = React.useMemo<RateAnomalies>(
    () => detectRateAnomalies(history, "interval"),
    [history],
  );

  if (anomalie.validi < 8) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-xs text-zinc-500">
        Servono almeno 8 ritmi misurabili (rilevamenti ravvicinati senza reset) per stimare il regime e
        cercare anomalie; ora ce ne sono {anomalie.validi}.
      </div>
    );
  }

  const ultime = [...anomalie.anomalie].reverse().slice(0, MAX_ANOMALIE_VISIBILI);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            anomalie.anomalie.length === 0
              ? "gap-1 border-emerald-400/30 bg-emerald-400/10 text-[11px] text-emerald-300"
              : "gap-1 border-amber-400/30 bg-amber-400/10 text-[11px] text-amber-300"
          }
        >
          <Radar className="size-3" />
          {anomalie.anomalie.length === 0
            ? "Nessuna anomalia fuori regime"
            : `${anomalie.anomalie.length} ${anomalie.anomalie.length === 1 ? "anomalia" : "anomalie"}`}
        </Badge>
        <span className="text-[10px] text-zinc-600">
          regime atteso {anomalie.mediana.toFixed(2)} %/h · soglia |z| &gt; {anomalie.soglia} ·{" "}
          {anomalie.validi} campioni · finestra 5 ore
        </span>
      </div>

      {anomalie.anomalie.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Rilevamento (Roma)</th>
                <th className="px-3 py-2 font-medium">Ritmo</th>
                <th className="px-3 py-2 font-medium">z robusto</th>
                <th className="px-3 py-2 font-medium">Lettura</th>
              </tr>
            </thead>
            <tbody>
              {ultime.map((a) => (
                <tr key={a.i} className="border-b border-white/[0.04] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-300">{formatDateTimeRome(a.t)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-zinc-100">
                    {a.valore.toFixed(2)} %/h
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">
                    <span className={a.z > 0 ? "text-rose-300" : "text-sky-300"}>
                      {a.z > 0 ? "+" : ""}
                      {a.z.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500">
                    {a.z > 0 ? "scoppio di consumo" : "pausa anomala nel consumo"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {anomalie.anomalie.length > MAX_ANOMALIE_VISIBILI ? (
            <p className="border-t border-white/[0.04] px-3 py-1.5 text-[10px] text-zinc-600">
              Mostrate le {MAX_ANOMALIE_VISIBILI} più recenti di {anomalie.anomalie.length}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
          Il ritmo resta nel proprio regime normale sull’intera osservazione.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* I71 — Qualità del campionamento                                     */
/* ------------------------------------------------------------------ */

/** Massimo numero di gap mostrati (dal più recente). */
const MAX_GAP_VISIBILI = 6;

/**
 * Sezione «Qualità del campionamento»: quanto lo storico è denso e privo di
 * buchi prima di fidarsi delle analisi. Complementare alla campagna V8: V8
 * dice SE i reset cadono dove devono, la qualità dice SE i dati bastano
 * per dirlo.
 */
export function SamplingQualityPanel({ history }: { history: HistoryPoint[] }) {
  const qualita = React.useMemo<SamplingQuality>(() => samplingQuality(history), [history]);

  if (qualita.totalePunti < 2 || qualita.medianaIntervMs === 0) {
    return (
      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-white/10 px-4 text-center text-xs text-zinc-500">
        Servono almeno due rilevamenti per misurare l’intervallo di campionamento e la copertura.
      </div>
    );
  }

  const coperturaMedia =
    qualita.giorni.length > 0
      ? qualita.giorni.reduce((a, g) => a + g.copertura, 0) / qualita.giorni.length
      : 0;
  const ultimi7 = qualita.giorni.slice(-7);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            coperturaMedia >= 90
              ? "gap-1 border-emerald-400/30 bg-emerald-400/10 text-[11px] text-emerald-300"
              : coperturaMedia >= 60
                ? "gap-1 border-amber-400/30 bg-amber-400/10 text-[11px] text-amber-300"
                : "gap-1 border-rose-400/30 bg-rose-400/10 text-[11px] text-rose-300"
          }
        >
          <Gauge className="size-3" />
          Copertura {coperturaMedia.toFixed(0)}%
        </Badge>
        <span className="text-[10px] text-zinc-600">
          intervallo tipico {Math.round(qualita.medianaIntervMs / 60_000)} min ·{" "}
          {qualita.totalePunti.toLocaleString("it-IT")} punti · {qualita.gaps.length}{" "}
          {qualita.gaps.length === 1 ? "buco" : "buchi"} &gt; 15 min
        </span>
      </div>

      {/* Copertura per giorno (ultimi 7 giorni Roma) */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Copertura per giorno (Europe/Rome)
        </p>
        <div className="space-y-1.5">
          {ultimi7.map((g) => (
            <div key={g.key} className="flex items-center gap-2">
              <span className="w-[86px] shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">{g.key}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={
                    g.copertura >= 90
                      ? "h-full rounded-full bg-emerald-400/70"
                      : g.copertura >= 60
                        ? "h-full rounded-full bg-amber-400/70"
                        : "h-full rounded-full bg-rose-400/70"
                  }
                  style={{ width: `${Math.max(2, g.copertura)}%` }}
                />
              </div>
              <span className="w-[112px] shrink-0 text-right font-mono text-[10px] tabular-nums text-zinc-500">
                {g.osservati}/{Math.ceil(g.attesi)} · {g.copertura.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Gap > 15 min */}
      {qualita.gaps.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2 font-medium">Buco da</th>
                <th className="px-3 py-2 font-medium">A</th>
                <th className="px-3 py-2 font-medium">Durata</th>
              </tr>
            </thead>
            <tbody>
              {qualita.gaps.slice(0, MAX_GAP_VISIBILI).map((g, i) => (
                <tr key={`${g.from}-${i}`} className="border-b border-white/[0.04] last:border-0">
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-300">{formatDateTimeRome(g.from)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-zinc-300">{formatTimeRome(g.to, false)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-amber-300">
                    {formatDuration(g.ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {qualita.gaps.length > MAX_GAP_VISIBILI ? (
            <p className="border-t border-white/[0.04] px-3 py-1.5 text-[10px] text-zinc-600">
              Mostrati i {MAX_GAP_VISIBILI} più recenti di {qualita.gaps.length}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex h-14 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-zinc-500">
          Nessun buco di campionamento oltre i 15 minuti.
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
  /** I100 — causa dell'attesa: «offline» | «tab-nascosto» | null (scheduling regolare). */
  pollCausa: "offline" | "tab-nascosto" | null;
}

/** Diagnostica del monitor (memoizzata: I96) — gli orologi dei reset interni hanno il proprio ritmo. */
function DiagnosticaPanelBase({ history, events, backoffAttivo, backoffDelayMs, pollCausa }: DiagnosticaPanelProps) {
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
          <MonitorHealth salute={salute} backoffAttivo={backoffAttivo} backoffDelayMs={backoffDelayMs} pollCausa={pollCausa} />
        </section>
        <section aria-label="Anomalie del ritmo">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Radar className="size-3.5 text-zinc-500" />
            Anomalie del ritmo
          </h3>
          <RateAnomaliesPanel history={history} />
        </section>
        <section aria-label="Qualità del campionamento">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Gauge className="size-3.5 text-zinc-500" />
            Qualità del campionamento
          </h3>
          <SamplingQualityPanel history={history} />
        </section>
      </CardContent>
    </Card>
  );
}

export const DiagnosticaPanel = React.memo(DiagnosticaPanelBase);
