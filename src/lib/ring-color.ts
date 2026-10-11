/**
 * I65 — Colore continuo dei ring, glow dinamico e count-up della percentuale.
 *
 * - `coloreContinuo`: la tonalità interpola linearmente tra i colori DISCRETI
 *   già usati dalla dashboard (crit → warn → good → ok, con le soglie di
 *   `quotaLevel` 10/30/60 come casi limite): l'anello cambia tinta in modo
 *   fluido senza tradire la semantica dei colori esistenti.
 * - `glowStyle`: ombra dinamica proporzionale all'intensità del colore.
 * - `AnimatedPercent`: count-up con requestAnimationFrame; se l'utente ha
 *   `prefers-reduced-motion` attivo il valore appare subito (niente animazione).
 *
 * La prop `continuous` del QuotaRing è attiva SOLO sugli anelli principali
 * (MainWindows); le card degli altri modelli restano sui gradienti discreti.
 */

import * as React from "react";

/** Soglie e tinte di ancoraggio (stessa semantica di quotaLevel). */
const STOPS: { at: number; hue: number }[] = [
  { at: 0, hue: 0 }, // crit (rosa/rosso)
  { at: 10, hue: 8 }, // limite crit
  { at: 30, hue: 35 }, // limite good (ambra/arancio)
  { at: 60, hue: 100 }, // limite ok (verde lime)
  { at: 100, hue: 142 }, // ok pieno (emerald)
];

/**
 * Colore HSL continuo per la percentuale residua 0–100 (null → tinta neutra
 * di attenzione, come quotaLevel(null)). Saturazione e luminosità fisse
 * coerenti con la palette scura della dashboard.
 */
export function coloreContinuo(remainingPercent: number | null): string {
  if (remainingPercent === null || !isFinite(remainingPercent)) {
    return "hsl(38 78% 55%)"; // ambra neutra (N/D)
  }
  const v = Math.max(0, Math.min(100, remainingPercent));
  let hue = STOPS[STOPS.length - 1].hue;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (v >= a.at && v <= b.at) {
      const k = (v - a.at) / (b.at - a.at);
      hue = a.hue + (b.hue - a.hue) * k;
      break;
    }
  }
  return `hsl(${hue.toFixed(1)} 78% 55%)`;
}

/** Glow dinamico: più la quota è bassa, più il bagliore è intenso. */
export function glowStyle(remainingPercent: number | null): React.CSSProperties {
  const color = coloreContinuo(remainingPercent);
  const v = remainingPercent === null ? 50 : Math.max(0, Math.min(100, remainingPercent));
  const intensita = 1 - v / 100; // 0 = piena quota (bagliore minimo), 1 = a secco
  const blur = 10 + 22 * intensita;
  const alpha = 0.25 + 0.45 * intensita;
  return {
    filter: `drop-shadow(0 0 ${blur.toFixed(1)}px ${color.replace("hsl(", "hsla(").replace(")", ` / ${alpha.toFixed(2)})`)})`,
  };
}

interface AnimatedPercentProps {
  /** Valore target (percentuale). */
  value: number | null;
  /** Durata dell'animazione (ms, default 900). */
  durationMs?: number;
  className?: string;
  /** Suffisso del display (default "%"). */
  suffix?: string;
}

/**
 * Count-up della percentuale con requestAnimationFrame; rispetta
 * `prefers-reduced-motion` (mostra subito il valore finale) e null → «—».
 * Componente senza JSX per vivere in un modulo .ts puro.
 */
export function AnimatedPercent({ value, durationMs = 900, className, suffix = "%" }: AnimatedPercentProps): React.ReactElement {
  const [display, setDisplay] = React.useState<number | null>(value);

  React.useEffect(() => {
    if (value === null) {
      setDisplay(null);
      return;
    }
    const ridotto =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (ridotto) {
      setDisplay(value);
      return;
    }
    const from = display === null ? 0 : display;
    const delta = value - from;
    if (Math.abs(delta) < 0.05) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs);
      // ease-out cubic: decelera verso il valore finale
      const eased = 1 - (1 - k) ** 3;
      setDisplay(from + delta * eased);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `display` non è una dipendenza: l'animazione parte sempre dal valore
    // renderizzato precedente verso il nuovo target (regla off nel progetto).
  }, [value, durationMs]);

  return React.createElement(
    "span",
    { className },
    display === null ? "—" : `${display.toFixed(display < 10 ? 1 : 0)}${suffix}`,
  );
}
