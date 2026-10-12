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
 *
 * I74 — la logica di scrollspy è estratta in `useScrollSpySezioni()` e
 * condivisa con `BottomNav` (barra inferiore su mobile): stesso stato attivo,
 * stessa `--nav-offset`, due superfici diverse.
 *
 * I85 — la nav è figlia DIRETTA di <main> (niente wrapper: un contenitore
 * alto quanto la barra non darebbe corsa allo sticky) e porta essa stessa
 * `hidden md:block`: su <md scompare e lascia il posto alla barra inferiore
 * fissa di I74. Così la barra resta FISSA in alto, sotto l'header, per tutto
 * lo scroll della pagina.
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

/**
 * Scrollspy condiviso (I66 nav superiore / I74 barra mobile): misura l'header,
 * imposta `--nav-offset` e osserva le 8 sezioni. Ritorna [sezione attiva,
 * setter manuale (usato al click per il feedback immediato), offset misurato].
 *
 * I85 — le sezioni ancorate montano SOLO quando arriva il primo snapshot
 * (prima c'è lo skeleton): all'attivazione del componente `getElementById`
 * trova zero elementi e l'observer nasce vuoto (scrollspy morto in silenzio,
 * scoperto con la verifica I85). Ora l'osservazione RIPROVA finché le 8
 * sezioni non sono tutte nel DOM (250 ms × 120 = 30 s, oltre: pagina senza
 * sezioni, es. setup — si rinuncia in silenzio).
 */
export function useScrollSpySezioni(): [
  string,
  React.Dispatch<React.SetStateAction<string>>,
  number,
] {
  const [attiva, setAttiva] = React.useState<string>(SEZIONI[0].id);

  /* I90 — l'offset è una misura del DOM (sistema esterno): useSyncExternalStore
     la espone al render senza setState sincrono in effect (regola v7). Snapshot
     server 130 = il valore iniziale pre-refactoring; durante l'idratazione vale
     lo snapshot server, poi React rilegge il client snapshot (nessun mismatch).
     La misura è fissa come prima del refactoring (l'header ha altezza statica):
     la sottoscrizione non ha eventi, il valore viene riletto a ogni render. */
  const misuraOffset = () => {
    const header = document.querySelector("header");
    return (header?.offsetHeight ?? 106) + 56;
  };
  const offset = React.useSyncExternalStore(
    () => () => {},
    misuraOffset,
    () => 130,
  );

  React.useEffect(() => {
    // --nav-offset = altezza reale dell'header + 56px (aggiornamento del DOM:
    // sistema esterno — nessun setState, regola v7 soddisfatta)
    document.documentElement.style.setProperty("--nav-offset", `${offset}px`);
  }, [offset]);

  React.useEffect(() => {
    let osservatore: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let tentativi = 0;
    const MAX_TENTATIVI = 120; // 250ms × 120 = 30s di attesa al massimo

    const osserva = () => {
      osservatore?.disconnect();
      osservatore = new IntersectionObserver(
        (entries) => {
          // la sezione più visibile vince
          const visibile = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (visibile?.target.id) setAttiva(visibile.target.id);
        },
        { rootMargin: `-${offset - 80}px 0px -55% 0px`, threshold: [0, 0.1, 0.25, 0.5] },
      );

      let trovate = 0;
      for (const s of SEZIONI) {
        const el = document.getElementById(s.id);
        if (el) {
          osservatore.observe(el);
          trovate++;
        }
      }
      // sezioni non ancora montate (snapshot in arrivo): riprova
      if (trovate < SEZIONI.length && tentativi++ < MAX_TENTATIVI) {
        timer = setTimeout(osserva, 250);
      }
    };

    osserva();
    return () => {
      if (timer) clearTimeout(timer);
      osservatore?.disconnect();
    };
  }, [offset]);

  return [attiva, setAttiva, offset];
}

export function SectionNav() {
  const [attiva, setAttiva, offset] = useScrollSpySezioni();

  return (
    <nav
      aria-label="Sezioni della dashboard"
      className="sticky z-30 hidden -mx-4 mb-2 border-b border-white/[0.06] bg-[#09090b]/85 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 md:block"
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
