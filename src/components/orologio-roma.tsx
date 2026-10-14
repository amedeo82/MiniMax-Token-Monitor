"use client";

/**
 * I96 — Foglie vive dell'orologio: si aggiornano al secondo SENZA ri-renderizzare
 * la pagina. Si abbonano all'orologio condiviso a 1 Hz (lib/orologio.ts): finché
 * lo store non è attivo (SSR e prima idratazione) renderizzano il segnaposto,
 * identico all'HTML server → nessun mismatch di idratazione.
 *
 * Prima: `now` (stato pagina, tick 1 s) alimentava header e footer → ogni secondo
 * l'INTERO albero si ri-renderizzava (misura: 60,9 render/min, docs/04 §3 I96).
 */

import { formatTimeRome, romeZoneInfo } from "@/lib/time";
import { useOrologio } from "@/lib/orologio";
import { MapPin } from "lucide-react";

/** Blocco orologio dell'header (desktop): ora Roma + info fuso, tick 1 Hz. */
export function OrologioRoma() {
  const now = useOrologio();
  return (
    <div className="hidden items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 md:flex">
      <MapPin className="size-3.5 text-rose-400" />
      <div className="text-right leading-tight">
        <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
          {now === 0 ? "--:--:--" : formatTimeRome(now)}
        </p>
        <p className="text-[10px] text-zinc-500">
          Europe/Rome · {now === 0 ? "--" : romeZoneInfo(now)}
        </p>
      </div>
    </div>
  );
}

/** Solo l'ora viva in linea (footer): tick 1 Hz, segnaposto finché lo store è a riposo. */
export function OraRomaViva() {
  const now = useOrologio();
  return <span className="font-mono tabular-nums">{now === 0 ? "--:--:--" : formatTimeRome(now)}</span>;
}
