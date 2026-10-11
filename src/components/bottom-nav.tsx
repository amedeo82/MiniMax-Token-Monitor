"use client";

/**
 * I74 — Navigazione inferiore su mobile (bottom bar fissa <md).
 *
 * Alternativa alla nav sticky I66 su telefono: su schermi <md la nav superiore
 * è nascosta (wrapper `hidden md:block` in page.tsx) e questa barra fissa al
 * fondo offre le stesse 8 ancore con target touch più grandi. Condivide con
 * `SectionNav` lo scrollspy (`useScrollSpySezioni`, estratto in I74 dal
 * componente I66) e la variabile `--nav-offset` (impostata da entrambe: stesso
 * valore, nessun conflitto). Nasconde il footer? No: dopo il footer page.tsx
 * aggiunge uno spaziatore `h-16 md:hidden` perché l'ultima riga resti leggibile.
 *
 * La vista compatta (I73) non monta né nav né barra (widget minimale).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { SEZIONI, useScrollSpySezioni } from "@/components/section-nav";

export function BottomNav() {
  const [attiva, setAttiva] = useScrollSpySezioni();

  return (
    <nav
      aria-label="Navigazione sezioni (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#09090b]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="flex max-w-7xl gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SEZIONI.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={attiva === s.id ? "true" : undefined}
            onClick={() => setAttiva(s.id)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
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
