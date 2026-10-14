"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { coloreContinuo, glowStyle, AnimatedPercent } from "@/lib/ring-color";

/** Colori disponibili per l'anello, mappati a gradienti SVG. */
export type RingColor = "ok" | "good" | "warn" | "crit";

const RING_GRADIENTS: Record<RingColor, { from: string; to: string }> = {
  ok: { from: "#34d399", to: "#10b981" }, // emerald
  good: { from: "#a3e635", to: "#84cc16" }, // lime
  warn: { from: "#fbbf24", to: "#f59e0b" }, // amber
  crit: { from: "#fb7185", to: "#ef4444" }, // rose/red
};

export const RING_TEXT_CLASS: Record<RingColor, string> = {
  ok: "text-emerald-400",
  good: "text-lime-400",
  warn: "text-amber-400",
  crit: "text-rose-400",
};

export const RING_TRACK_CLASS: Record<RingColor, string> = {
  ok: "stroke-emerald-500/15",
  good: "stroke-lime-500/15",
  warn: "stroke-amber-500/15",
  crit: "stroke-rose-500/15",
};

interface QuotaRingProps {
  /** Percentuale rimanente 0–100 (o null per N/D). */
  value: number | null;
  size?: number;
  strokeWidth?: number;
  color: RingColor;
  label?: string;
  sublabel?: string;
  bigValue?: string;
  className?: string;
  gradientId: string;
  /** I65 — colore continuo HSL + glow dinamico + count-up (solo anelli principali). */
  continuous?: boolean;
}

/**
 * Anello di avanzamento SVG con gradiente, animato via CSS (transizioni).
 * Mostra la quota rimanente.
 */
export function QuotaRing({
  value,
  size = 168,
  strokeWidth = 12,
  color,
  label,
  sublabel,
  bigValue,
  className,
  gradientId,
  continuous = false,
}: QuotaRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - pct / 100);
  const grad = RING_GRADIENTS[color];
  const tinta = coloreContinuo(value);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size, ...(continuous ? glowStyle(value) : {}) }}
    >
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? "Quota"}: ${bigValue ?? ""}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={continuous ? tinta : grad.from} />
            <stop offset="100%" stopColor={continuous ? tinta : grad.to} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={continuous ? "stroke-white/[0.06]" : RING_TRACK_CLASS[color]}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        {continuous ? (
          <AnimatedPercent
            value={value}
            className={cn("font-mono text-3xl font-bold tabular-nums tracking-tight")}
          />
        ) : (
          <span className={cn("font-mono text-3xl font-bold tabular-nums tracking-tight", RING_TEXT_CLASS[color])}>
            {bigValue ?? (value === null ? "—" : `${Math.round(value)}%`)}
          </span>
        )}
        {label ? <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</span> : null}
        {sublabel ? <span className="text-[10px] text-zinc-500">{sublabel}</span> : null}
      </div>
    </div>
  );
}

/** Barra di avanzamento orizzontale sottile. */
export function MiniBar({ value, color }: { value: number | null; color: RingColor }) {
  const pct = value === null ? 0 : Math.min(100, Math.max(0, value));
  const grad = RING_GRADIENTS[color];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${grad.from}, ${grad.to})` }}
      />
    </div>
  );
}
