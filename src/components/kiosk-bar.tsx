"use client";

/**
 * I45 — Barra di controllo della modalità kiosk/TV.
 *
 * È il sostituto del footer mentre il kiosk è attivo: sticky a fondo pagina
 * («mt-auto» + «sticky bottom-0») così il bottone di uscita resta SEMPRE
 * disponibile a qualunque scroll — criterio di accettazione esplicito.
 *
 * Contenuto: indicatore di modalità, cambio schermata manuale (Quote /
 * Grafico / Analisi), rotazione automatica tra schermate con intervallo
 * configurabile, dimming notturno (22:00–06:59 Europe/Rome) e uscita
 * (bottone o Esc).
 *
 * I133 — chiarezza del selettore: l'etichetta era il solo «Rotazione», che non
 * diceva CHE COSA ruotasse né cosa succedesse quando è spento. Ora: etichetta
 * esplicita «Rotazione tra schermate», hint visibile del funzionamento nei due
 * stati (ciclo automatico con l'ordine delle schermate / solo cambio manuale)
 * e title esplicativo sul selettore dell'intervallo. Terminologia unificata
 * «schermata» (le visuali Quote → Grafico → Analisi) anche nel countdown.
 *
 * Su schermi stretti la barra va a capo (flex-wrap) senza overflow.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, MonitorOff, MoonStar, RotateCw } from "lucide-react";
import { KIOSK_ROTATION_OPTIONS, KIOSK_VIEWS, type KioskState, type KioskView } from "@/lib/kiosk";
import { useOrologio } from "@/lib/orologio";
import { formatCountdown } from "@/lib/time";
import { APP_VERSION } from "@/lib/version";

interface KioskBarProps {
  state: KioskState;
  view: KioskView;
  /** True quando il dimming è EFFETTIVAMENTE attivo (kiosk + preferenza + ora notturna). */
  nightDimActive: boolean;
  /** I132 — epoch (ms) del prossimo cambio vista programmato; null = non armato. */
  prossimaRotazione?: number | null;
  onView: (v: KioskView) => void;
  onPrefs: (patch: Partial<Pick<KioskState, "rotation" | "rotationSeconds" | "nightDim">>) => void;
  onExit: () => void;
}

/**
 * I132 — Countdown della rotazione («prossima schermata tra 12s»): foglia VIVA
 * che si abbona all'orologio condiviso a 1 Hz (I96) — la pagina NON
 * re-renderizza al secondo, solo questo span. È l'unica evidenza continua che
 * il timer della rotazione gira: con un intervallo lungo (fino a 5 minuti)
 * prima l'utente non aveva alcun riscontro finché il cambio schermata non
 * avveniva. I133 — «vista» → «schermata» per uniformità col selettore.
 */
function CountdownRotazione({ scade }: { scade: number | null }) {
  const adesso = useOrologio();
  if (scade === null) return null;
  const base = adesso > 0 ? adesso : Date.now();
  return (
    <span
      className="hidden font-mono text-[10px] text-zinc-500 lg:inline"
      aria-label="Prossima rotazione schermata"
    >
      prossima schermata tra {formatCountdown(Math.max(0, scade - base))}
    </span>
  );
}

export function KioskBar({ state, view, nightDimActive, prossimaRotazione = null, onView, onPrefs, onExit }: KioskBarProps) {
  return (
    <div className="mt-auto sticky bottom-0 z-50 border-t border-white/[0.08] bg-[#09090b]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        {/* Indicatore di modalità + versione (I46: fonte unica version.ts) */}
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300">
          <Monitor className="size-3.5" />
          Kiosk
        </span>
        <span className="font-mono text-[10px] text-zinc-600">v {APP_VERSION}</span>

        {/* Cambio schermata manuale (disponibile anche con la rotazione attiva) */}
        <div className="flex items-center gap-1" role="group" aria-label="Schermata kiosk">
          {KIOSK_VIEWS.map((v) => (
            <Button
              key={v.key}
              size="sm"
              variant="outline"
              aria-pressed={view === v.key}
              onClick={() => onView(v.key)}
              className={`h-8 border-white/10 text-xs ${
                view === v.key
                  ? "bg-rose-500/15 text-rose-200 hover:bg-rose-500/20!"
                  : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]!"
              }`}
            >
              {v.label}
            </Button>
          ))}
        </div>

        {/* I133 — Rotazione tra schermate: etichetta esplicita (prima solo
            «Rotazione», non diceva cosa ruotasse) + hint del funzionamento. */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <RotateCw className={`size-3.5 ${state.rotation ? "text-rose-300" : "text-zinc-500"}`} />
          <span className="hidden sm:inline">Rotazione tra schermate</span>
          <Switch
            checked={state.rotation}
            onCheckedChange={(v) => onPrefs({ rotation: v })}
            aria-label="Rotazione automatica tra le schermate (Quote → Grafico → Analisi)"
          />
        </label>

        {/* I133 — hint del funzionamento nei due stati: l'informazione che
            mancava (cosa ruota, in che ordine, cosa succede quando è spento).
            Nascosto sugli schermi stretti come le altre etichette (flex-wrap). */}
        <span className={`hidden text-[10px] xl:inline ${state.rotation ? "text-zinc-500" : "text-zinc-600"}`}>
          {state.rotation
            ? "ciclo automatico: Quote → Grafico → Analisi, poi ricomincia"
            : "rotazione spenta: cambio schermata solo coi bottoni"}
        </span>

        {/* Intervallo di rotazione (solo con la rotazione attiva);
            I133 — aria-label esplicita + title che spiega il selettore. */}
        {state.rotation ? (
          <Select
            value={String(state.rotationSeconds)}
            onValueChange={(v) => onPrefs({ rotationSeconds: Number(v) })}
          >
            <SelectTrigger
              size="sm"
              aria-label="Intervallo di rotazione delle schermate"
              title="Ogni quanto cambia la schermata durante la rotazione automatica"
              className="h-8 w-[128px] border-white/10 bg-white/[0.04] text-xs text-zinc-300"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10! bg-zinc-950! text-zinc-100!">
              {KIOSK_ROTATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)} className="text-xs!">
                  ogni {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {/* I132 — countdown del prossimo cambio schermata (solo con la rotazione
            attiva): riscontro continuo che il timer gira anche quando il cambio
            è lontano (fino a 5 minuti) o lo schermo è nello stato d'attesa dati. */}
        {state.rotation ? <CountdownRotazione scade={prossimaRotazione} /> : null}

        {/* Dimming notturno (22:00–06:59 Europe/Rome) */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <MoonStar className={`size-3.5 ${nightDimActive ? "text-amber-300" : state.nightDim ? "text-zinc-300" : "text-zinc-500"}`} />
          <span className="hidden sm:inline">Dimming notturno</span>
          <Switch
            checked={state.nightDim}
            onCheckedChange={(v) => onPrefs({ nightDim: v })}
            aria-label="Dimming notturno automatico (22:00–06:59)"
          />
        </label>

        {/* Uscita: sempre disponibile (criterio di accettazione) */}
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={onExit}
            className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
          >
            <MonitorOff className="size-3.5" />
            Esci dal kiosk
            <kbd className="ml-0.5 rounded border border-white/10 bg-white/[0.06] px-1 py-0.5 font-mono text-[9px] font-normal text-zinc-400">
              Esc
            </kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
