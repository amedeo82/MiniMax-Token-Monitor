"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFullRome, romeZoneInfo } from "@/lib/time";
import { REGION_ENDPOINTS, Region, REGION_LABELS, EXTRA_ENDPOINTS } from "@/lib/minimax";
import {
  Braces,
  ChevronDown,
  Copy,
  Check,
  Globe,
  Server,
  Clock,
  ShieldCheck,
  CircleCheck,
  CircleX,
  Plug,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

interface RawJsonPanelProps {
  rawJson: unknown | null;
  fetchedAt: number | null;
  endpoint: string;
  ok: boolean | null;
}

/** Pannello a scomparsa con la risposta JSON grezza dell'API. */
export function RawJsonPanel({ rawJson, fetchedAt, endpoint, ok }: RawJsonPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const jsonText = React.useMemo(
    () => (rawJson === null ? "" : JSON.stringify(rawJson, null, 2)),
    [rawJson],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      toast.success("JSON copiato negli appunti");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossibile copiare: i permessi del browser hanno negato l'accesso agli appunti");
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-white/[0.03]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
            <Braces className="size-4 text-zinc-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100">Risposta JSON dell&apos;API</p>
            <p className="truncate text-[11px] text-zinc-500">
              {fetchedAt ? `Ultima risposta ricevuta il ${formatFullRome(fetchedAt)}` : "Nessuna risposta ricevuta"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ok !== null ? (
            ok ? (
              <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
                <CircleCheck className="size-3" /> success
              </Badge>
            ) : (
              <Badge className="gap-1 border-transparent bg-rose-500/15 text-rose-400 hover:bg-rose-500/15">
                <CircleX className="size-3" /> errore
              </Badge>
            )
          ) : null}
          <ChevronDown className={`size-4 text-zinc-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-white/[0.06] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="truncate font-mono text-[11px] text-zinc-500" title={endpoint}>
              GET {endpoint}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={copy}
              disabled={!jsonText}
              className="h-7 gap-1.5 border-white/10 bg-transparent px-2 text-[11px] text-zinc-300 hover:bg-white/5!"
            >
              {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
              {copied ? "Copiato" : "Copia"}
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-xl border border-white/[0.06] bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-zinc-300">
            {jsonText ? (
              <code>
                {jsonText.split("\n").map((line, i) => {
                  // Evidenziazione semplice: chiavi, stringhe, numeri
                  const html = line
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/"([^"]+)":/g, '<span style="color:#f97583">"$1"</span>:')
                    .replace(/: "([^"]*)"/g, ': <span style="color:#9ecbff">"$1"</span>')
                    .replace(/: (\d+\.?\d*)/g, ': <span style="color:#a5d6a7">$1</span>')
                    .replace(/: (true|false|null)/g, ': <span style="color:#c792ea">$1</span>');
                  return <div key={i} dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }} />;
                })}
              </code>
            ) : (
              "Nessun dato — avvia una sincronizzazione o attiva la modalità demo."
            )}
          </pre>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface TechInfoProps {
  region: Region;
  demoMode: boolean;
  lastFetch: number | null;
  refreshSeconds: number;
  /** Ora del server dedotta da end_time − remains_time (epoch ms). */
  serverTime: number | null;
  /** Descrizione della sorgente dati (endpoint reale, demo o JSON importato). */
  sourceLabel?: string;
}

/** Scheda con i dettagli tecnici della connessione. */
export function TechInfo({ region, demoMode, lastFetch, refreshSeconds, serverTime, sourceLabel }: TechInfoProps) {
  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    {
      icon: <Globe className="size-3.5 text-zinc-400" />,
      label: "Sorgente dati",
      value: sourceLabel ?? (demoMode ? "Modalità demo (nessuna chiamata reale)" : REGION_ENDPOINTS[region]),
    },
    {
      icon: <Server className="size-3.5 text-zinc-400" />,
      label: "Regione",
      value: demoMode ? "—" : REGION_LABELS[region],
    },
    {
      icon: <Clock className="size-3.5 text-zinc-400" />,
      label: "Ultima sincronizzazione",
      value: lastFetch ? formatFullRome(lastFetch) : "Mai",
    },
    {
      icon: <Clock className="size-3.5 text-amber-400" />,
      label: "Ora del server dedotta",
      value: serverTime ? formatFullRome(serverTime) : "N/D",
    },
    {
      icon: <Clock className="size-3.5 text-zinc-400" />,
      label: "Aggiornamento automatico",
      value: refreshSeconds === 0 ? "Manuale" : `Ogni ${refreshSeconds} secondi`,
    },
    {
      icon: <ShieldCheck className="size-3.5 text-emerald-500" />,
      label: "Autenticazione",
      value: "Bearer Token (Subscription Key) via proxy server-side",
    },
  ];

  return (
    <Card className="min-w-0 border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-zinc-100">Dettagli tecnici</CardTitle>
        <CardDescription className="text-xs text-zinc-500">
          Informazioni sulla connessione all&apos;API MiniMax
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3 text-xs">
            <span className="flex shrink-0 items-center gap-1.5 text-zinc-500">
              {r.icon}
              {r.label}
            </span>
            <span className="min-w-0 text-right font-medium leading-relaxed text-zinc-300">{r.value}</span>
          </div>
        ))}
        <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] leading-relaxed text-zinc-500">
          Tutti gli orari mostrati sono calcolati nel fuso orario{" "}
          <span className="font-semibold text-zinc-300">Europe/Rome ({romeZoneInfo()})</span> con formattazione in
          italiano. I timestamp dell&apos;API (epoch) vengono convertiti localmente. L&apos;ora del server è dedotta
          come <span className="font-mono text-zinc-400">end_time − remains_time</span> e serve a sincronizzare i
          countdown senza fidarsi dell&apos;orologio locale.
        </div>

        {/* Riferimenti endpoint aggiuntivi */}
        <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Plug className="size-3.5" />
            Altri endpoint utili (dalla documentazione)
          </p>
          <ul className="space-y-2">
            {EXTRA_ENDPOINTS.map((e) => (
              <li key={e.url} className="text-[11px] leading-relaxed">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300">
                    {e.method}
                  </span>
                  <span className="truncate font-mono text-zinc-400" title={e.url}>
                    {e.url.replace("https://", "")}
                  </span>
                </div>
                <p className="mt-0.5 text-zinc-500">{e.desc}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-2.5 text-[11px] leading-relaxed text-amber-200/80">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-amber-300">
            <TriangleAlert className="size-3.5" />
            Semantica dei campi count
          </p>
          I campi <span className="font-mono">*_usage_count</span> contengono la quota <span className="font-semibold">residua</span>,
          non consumata (issue MiniMax-M2 #99): consumato = totale − residuo. Quando i conteggi sono 0, la quota è
          tracciata tramite le percentuali residue, che sono la metrica affidabile.
        </div>
      </CardContent>
    </Card>
  );
}
