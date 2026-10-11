"use client";

/**
 * I76 — Error boundary per sezione.
 *
 * Un crash in un pannello (es. un dato inatteso in un grafico) NON deve buttare
 * giù l'intera dashboard: ogni sezione principale è avvolta in un boundary
 * indipendente che, React non avendo alternative dichiarative in render
 * function, è implementato come class component con `componentDidCatch`.
 *
 * Il fallback è uno SKELETON della stessa altezza della card, con il titolo
 * della sezione, il messaggio tecnico (in mono, troncato) e un pulsante
 * «Riprova» che resetta lo stato interno del boundary e rimonta i children
 * (utile per errori transitori; se il dato è davvero rotto, il boundary
 * ricompila il fallback senza impedire il funzionamento delle altre sezioni).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

interface SectionBoundaryProps {
  /** Nome della sezione mostrato nel fallback (es. «Analisi di lungo periodo»). */
  title: string;
  /** Altezza stimata del fallback skeleton (classi Tailwind, es. "h-64"). */
  fallbackHeight?: string;
  children: React.ReactNode;
}

interface SectionBoundaryState {
  error: Error | null;
}

export class SectionBoundary extends React.Component<SectionBoundaryProps, SectionBoundaryState> {
  constructor(props: SectionBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): SectionBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Diagnostica minima in console: nessun dato sensibile, solo il messaggio
    // e il componente — la sezione resta identificabile nei log del browser.
    console.error(`[SectionBoundary:${this.props.title}]`, error.message, info.componentStack ?? "");
  }

  private riprova = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/25 bg-amber-950/20 p-5 backdrop-blur"
          data-section-boundary={this.props.title}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-200">{this.props.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
                Questa sezione è temporaneamente non disponibile a causa di un errore interno.
                Le altre sezioni della dashboard continuano a funzionare.
              </p>
              <p className="mt-2 truncate font-mono text-[10px] text-amber-200/50">
                {this.state.error.message}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={this.riprova}
              className="h-8 shrink-0 gap-1.5 border-amber-400/30 bg-amber-400/10 text-xs text-amber-200 hover:bg-amber-400/20!"
            >
              <RotateCcw className="size-3.5" />
              Riprova
            </Button>
          </div>
          <div
            aria-hidden
            className={`mt-4 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.03] ${this.props.fallbackHeight ?? "h-32"}`}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
