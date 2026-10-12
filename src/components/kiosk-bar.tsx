"use client";

/**
 * I45 — Barra di controllo della modalità kiosk/TV.
 *
 * È il sostituto del footer mentre il kiosk è attivo: sticky a fondo pagina
 * («mt-auto» + «sticky bottom-0») così il bottone di uscita resta SEMPRE
 * disponibile a qualunque scroll — criterio di accettazione esplicito.
 *
 * Contenuto: indicatore di modalità, cambio vista manuale (Quote / Grafico /
 * Analisi), rotazione automatica con intervallo configurabile, dimming
 * notturno (22:00–06:59 Europe/Rome) e uscita (bottone o Esc).
 *
 * Su schermi stretti la barra va a capo (flex-wrap) senza overflow.
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Monitor, MonitorOff, MoonStar, RotateCw } from "lucide-react";
import { KIOSK_ROTATION_OPTIONS, KIOSK_VIEWS, type KioskState, type KioskView } from "@/lib/kiosk";
import { APP_VERSION } from "@/lib/version";

interface KioskBarProps {
  state: KioskState;
  view: KioskView;
  /** True quando il dimming è EFFETTIVAMENTE attivo (kiosk + preferenza + ora notturna). */
  nightDimActive: boolean;
  onView: (v: KioskView) => void;
  onPrefs: (patch: Partial<Pick<KioskState, "rotation" | "rotationSeconds" | "nightDim">>) => void;
  onExit: () => void;
}

export function KioskBar({ state, view, nightDimActive, onView, onPrefs, onExit }: KioskBarProps) {
  return (
    <div className="mt-auto sticky bottom-0 z-50 border-t border-white/[0.08] bg-[#09090b]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        {/* Indicatore di modalità + versione (I46: fonte unica version.ts) */}
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-300">
          <Monitor className="size-3.5" />
          Kiosk
        </span>
        <span className="font-mono text-[10px] text-zinc-600">v {APP_VERSION}</span>

        {/* Cambio vista manuale (disponibile anche con la rotazione attiva) */}
        <div className="flex items-center gap-1" role="group" aria-label="Vista kiosk">
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

        {/* Rotazione automatica tra le viste */}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
          <RotateCw className={`size-3.5 ${state.rotation ? "text-rose-300" : "text-zinc-500"}`} />
          <span className="hidden sm:inline">Rotazione</span>
          <Switch
            checked={state.rotation}
            onCheckedChange={(v) => onPrefs({ rotation: v })}
            aria-label="Rotazione automatica delle viste"
          />
        </label>

        {/* Intervallo di rotazione (solo con la rotazione attiva) */}
        {state.rotation ? (
          <Select
            value={String(state.rotationSeconds)}
            onValueChange={(v) => onPrefs({ rotationSeconds: Number(v) })}
          >
            <SelectTrigger
              size="sm"
              aria-label="Intervallo di rotazione"
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
