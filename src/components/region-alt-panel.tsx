"use client";

/**
 * I53 — Pannello della SECONDA regione (multi-regione simultanea, docs/03 §5.21).
 *
 * Solo VISUALIZZAZIONE by design: lo snapshot della regione alternativa non
 * entra nello storico né nelle analisi (nessuna mescolanza di regioni nei
 * dati — trend/EWMA/cicli restano narrativa della primaria). Qui si mostrano
 * stato di connessione, piano, crediti, ultimo rilevamento, eventuale errore
 * e la panoramica dei modelli della seconda regione.
 *
 * Renderizzato SOLO quando la seconda chiave è configurata; vive dentro la
 * sezione «Panoramica» (nessuna nuova voce di nav) ed è assente in modalità
 * compatta e kiosk come il resto della sezione.
 */

import * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PanoramicTable } from "@/components/model-table";
import { REGION_ENDPOINTS, REGION_LABELS, type Region, type UsageSnapshot } from "@/lib/minimax";
import { formatFullRome } from "@/lib/time";
import {
  CircleCheck,
  CircleX,
  Clock,
  Coins,
  Globe,
  Hourglass,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

interface RegionAltPanelProps {
  /** Regione della secondaria (sempre regioneAlt della primaria). */
  region: Region;
  /** Snapshot della secondaria; null = nessun dato ricevuto ancora. */
  snapshot: UsageSnapshot | null;
  /** Messaggio dell'ultimo errore della secondaria (null = nessun errore). */
  errore: string | null;
  /** Epoch ms dell'ultimo rilevamento secondario (anche fallito). */
  fetchedAt: number | null;
}

/** Stato di connessione della secondaria → badge di testa. */
function BadgeStato({ ok, errore }: { ok: boolean; errore: boolean }) {
  if (errore) {
    return (
      <Badge className="gap-1 border-transparent bg-rose-500/15 text-rose-400 hover:bg-rose-500/15">
        <CircleX className="size-3" /> errore
      </Badge>
    );
  }
  if (ok) {
    return (
      <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">
        <CircleCheck className="size-3" /> connessa
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 border-transparent bg-zinc-500/15 text-zinc-400 hover:bg-zinc-500/15">
      <Hourglass className="size-3" /> in attesa
    </Badge>
  );
}

/** I53 — pannello della seconda regione (memoizzato: I96; i countdown della tabella sono foglie vive). */
export const RegionAltPanel = React.memo(function RegionAltPanel({ region, snapshot, errore, fetchedAt }: RegionAltPanelProps) {
  const conErrore = errore !== null && errore !== "";
  const ok = !conErrore && snapshot !== null;

  return (
    <Card className="min-w-0 border-white/[0.07] bg-white/[0.04] backdrop-blur">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Globe className="size-4 text-sky-400" />
            Seconda regione — {REGION_LABELS[region]}
          </CardTitle>
          <div className="flex items-center gap-2">
            {snapshot?.source === "demo" ? (
              <Badge className="gap-1 border-transparent bg-violet-500/15 text-violet-300 hover:bg-violet-500/15">
                <Sparkles className="size-3" /> dati simulati
              </Badge>
            ) : null}
            <BadgeStato ok={ok} errore={conErrore} />
          </div>
        </div>
        <CardDescription className="truncate text-xs text-zinc-500">
          Monitoraggio parallelo · <span className="font-mono">{REGION_ENDPOINTS[region]}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Riepilogo connessione (stesso stile righe di TechInfo) */}
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="flex shrink-0 items-center gap-1.5 text-zinc-500">
              <Sparkles className="size-3.5 text-zinc-400" />
              Piano
            </span>
            <span className="min-w-0 truncate text-right font-medium text-zinc-300">
              {snapshot?.planTitle ?? "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="flex shrink-0 items-center gap-1.5 text-zinc-500">
              <Coins className="size-3.5 text-zinc-400" />
              Crediti
            </span>
            <span className="min-w-0 text-right font-medium text-zinc-300">
              {snapshot?.credits !== null && snapshot?.credits !== undefined
                ? snapshot.credits.toLocaleString("it-IT", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3 text-xs">
            <span className="flex shrink-0 items-center gap-1.5 text-zinc-500">
              <Clock className="size-3.5 text-zinc-400" />
              Ultimo rilevamento
            </span>
            <span className="min-w-0 text-right font-medium text-zinc-300">
              {fetchedAt ? formatFullRome(fetchedAt) : "Mai"}
            </span>
          </div>
        </div>

        {/* Errore della secondaria (es. chiave cinese incollata al posto di quella europea → 1004) */}
        {conErrore ? (
          <Alert variant="destructive" className="border-rose-500/30 bg-rose-950/40 text-rose-100">
            <TriangleAlert className="size-4" />
            <AlertTitle>Rilevamento della seconda regione fallito</AlertTitle>
            <AlertDescription className="text-rose-200/90">{errore}</AlertDescription>
          </Alert>
        ) : null}

        {/* Modelli della seconda regione (nessun impatto su storico/analisi della primaria) */}
        {snapshot && snapshot.models.length > 0 ? (
          <div className="pt-1">
            <PanoramicTable models={snapshot.models} />
          </div>
        ) : !conErrore ? (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] leading-relaxed text-zinc-500">
            Nessun dato ancora: in attesa del primo rilevamento riuscito di questa regione.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
});
