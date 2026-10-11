"use client";

/**
 * I66 — Navigazione interna sticky con scrollspy.
 *
 * Barra sticky sotto l'header con le 8 ancore della pagina (Quota, Grafico,
 * Ritmo, Panoramica, Analisi, Diagnostica, Tecnici, Eventi). Un
 * IntersectionObserver individua la sezione visibile e la marca con
 * `aria-current="true"`; il click scorre alla sezione rispettando
 * `scroll-margin-top` (classe `.mm-anchor` in globals.css), che legge la
 * variabile CSS `--nav-offset` = altezza header + 56px (calcolata al mount).
 * Su schermi stretti la barra scorre orizzontalmente.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface Sezione {
  id: string;
  label: string;
}

/** Le 8 sezioni ancorate della dashboard (ordine di lettura). */
export const SEZIONI: Sezione[] = [
  { id: "quota", label: "Quota" },
  { id: "grafico", label: "Grafico" },
  { id: "ritmo", label: "Ritmo" },
  { id: "panoramica", label: "Panoramica" },
  { id: "analisi", label: "Analisi" },
  { id: "diagnostica", label: "Diagnostica" },
  { id: "tecnici", label: "Tecnici" },
  { id: "eventi", label: "Eventi" },
];

export function SectionNav() {
  const [attiva, setAttiva] = React.useState<string>(SEZIONI[0].id);
  const [offset, setOffset] = React.useState(130);

  React.useEffect(() => {
    // --nav-offset = altezza reale dell'header + 56px (barra + respiro)
    const header = document.querySelector("header");
    const h = (header?.offsetHeight ?? 106) + 56;
    setOffset(h);
    document.documentElement.style.setProperty("--nav-offset", `${h}px`);
  }, []);

  React.useEffect(() => {
    const osservatore = new IntersectionObserver(
      (entries) => {
        // la sezione più visibile vince
        const visibile = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visibile?.target.id) setAttiva(visibile.target.id);
      },
      { rootMargin: `-${offset - 80}px 0px -55% 0px`, threshold: [0, 0.1, 0.25, 0.5] },
    );
    for (const s of SEZIONI) {
      const el = document.getElementById(s.id);
      if (el) osservatore.observe(el);
    }
    return () => osservatore.disconnect();
  }, [offset]);

  return (
    <nav
      aria-label="Sezioni della dashboard"
      className="sticky z-30 -mx-4 mb-2 border-b border-white/[0.06] bg-[#09090b]/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6"
      style={{ top: `${offset - 56}px` }}
    >
      <div className="flex max-w-7xl gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SEZIONI.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={attiva === s.id ? "true" : undefined}
            onClick={() => setAttiva(s.id)}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              attiva === s.id
                ? "bg-white/[0.10] text-zinc-100"
                : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300",
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
