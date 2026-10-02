"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Send, Trash2, Calculator, CircleAlert, Clock, FlaskConical, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import type { Region } from "@/lib/minimax";
import {
  aggregateTokenLog,
  appendTokenCall,
  clearTokenLog,
  loadTokenLog,
  type TokenCallRecord,
} from "@/lib/token-log";
import { formatDateTimeRome } from "@/lib/time";

interface TokenTrackerProps {
  apiKey: string;
  region: Region;
  demoMode: boolean;
}

const MODEL_SUGGESTIONS = [
  "MiniMax-M3.1-Flash-Preview",
  "MiniMax-M3",
  "MiniMax-M2.7",
  "MiniMax-M2.5",
];

function fmtInt(n: number): string {
  return n.toLocaleString("it-IT");
}

/**
 * Pannello "Consumo token reale": invia richieste di chat completion via proxy
 * server-side, cattura il campo `usage` di ogni risposta e tiene un registro
 * locale (localStorage) con totali e ripartizione per modello.
 * In modalità demo simula il consumo senza chiamare l'API.
 */
export function TokenTracker({ apiKey, region, demoMode }: TokenTrackerProps) {
  const [log, setLog] = React.useState<TokenCallRecord[]>([]);
  const [model, setModel] = React.useState<string>(MODEL_SUGGESTIONS[0]);
  const [prompt, setPrompt] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [lastRecord, setLastRecord] = React.useState<TokenCallRecord | null>(null);
  const [lastContent, setLastContent] = React.useState<string | null>(null);
  const [contentOpen, setContentOpen] = React.useState(false);

  React.useEffect(() => {
    setLog(loadTokenLog());
  }, []);

  const totals = React.useMemo(() => aggregateTokenLog(log), [log]);

  const registra = React.useCallback((rec: TokenCallRecord, content: string | null) => {
    setLog(appendTokenCall(rec));
    setLastRecord(rec);
    setLastContent(content);
    setLastError(null);
  }, []);

  const invia = async () => {
    const testoPrompt = prompt.trim();
    if (!model.trim()) {
      toast.error("Inserisci l'ID del modello (es. MiniMax-M3.1-Flash-Preview).");
      return;
    }
    if (!testoPrompt) {
      toast.error("Scrivi un prompt da inviare.");
      return;
    }

    setSending(true);
    setContentOpen(false);

    try {
      if (demoMode) {
        // Simulazione fedele: usage plausibile in funzione della lunghezza del prompt
        await new Promise((r) => setTimeout(r, 800));
        const promptTokens = Math.max(8, Math.ceil(testoPrompt.length / 3.6));
        const completionTokens = 120 + Math.floor(Math.random() * 520);
        const rec: TokenCallRecord = {
          id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          t: Date.now(),
          model: model.trim(),
          region,
          promptChars: testoPrompt.length,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cachedTokens: 0,
          totalCharacters: testoPrompt.length + completionTokens * 4,
          source: "demo",
        };
        registra(rec, `[DEMO] Risposta simulata al prompt: «${testoPrompt.slice(0, 80)}${testoPrompt.length > 80 ? "…" : ""}»`);
        toast.success("Chiamata simulata registrata (modalità demo)");
        return;
      }

      if (!apiKey) {
        toast.error("Inserisci la Subscription Key nelle impostazioni per misurare il consumo reale.");
        return;
      }

      const res = await fetch("/api/minimax/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, region, model: model.trim(), prompt: testoPrompt }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        fetchedAt?: number;
        model?: string;
        content?: string;
        reasoning?: string | null;
        usage?: {
          promptTokens: number | null;
          completionTokens: number | null;
          totalTokens: number | null;
          totalCharacters: number | null;
          cachedTokens: number | null;
        };
        error?: { code: string; message: string };
      };

      if (!json.ok || !json.usage) {
        const msg = json.error?.message ?? "Chiamata fallita senza dettagli.";
        setLastError(msg);
        toast.error(msg);
        return;
      }

      const rec: TokenCallRecord = {
        id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        t: json.fetchedAt ?? Date.now(),
        model: json.model ?? model.trim(),
        region,
        promptChars: testoPrompt.length,
        promptTokens: json.usage.promptTokens,
        completionTokens: json.usage.completionTokens,
        totalTokens: json.usage.totalTokens,
        cachedTokens: json.usage.cachedTokens,
        totalCharacters: json.usage.totalCharacters,
        source: "api",
      };
      registra(rec, json.content ?? "");
      toast.success(`Consumo registrato: ${fmtInt(json.usage.totalTokens ?? 0)} token`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore di rete imprevisto.";
      setLastError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const svuota = () => {
    clearTokenLog();
    setLog([]);
    setLastRecord(null);
    setLastContent(null);
    setLastError(null);
    toast.success("Registro del consumo token svuotato");
  };

  return (
    <section
      aria-label="Consumo token reale"
      className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] backdrop-blur"
    >
      {/* Intestazione */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-white/[0.06]">
          <Calculator className="size-4 text-amber-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Consumo token reale</h2>
            {demoMode ? (
              <Badge variant="outline" className="gap-1 border-violet-400/30 bg-violet-400/10 text-[10px] text-violet-300">
                <FlaskConical className="size-2.5" /> demo simulata
              </Badge>
            ) : (
              <Badge variant="outline" className="border-white/10 text-[10px] font-normal text-zinc-400">
                /v1/chat/completions · campo usage
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            L&apos;endpoint di quota espone solo percentuali: questo strumento misura i token effettivi di ogni
            chiamata chat e li registra in locale (localStorage).
          </p>
        </div>
      </div>

      <div className="space-y-4 border-t border-white/[0.06] p-4">
        {/* Avviso consumo reale */}
        {!demoMode ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              Con la <strong>Subscription Key</strong> ogni chiamata misurata consuma realmente la quota del piano
              (con API Key pay-as-you-go consuma il saldo). Usa prompt brevi per i test.
            </p>
          </div>
        ) : null}

        {/* Form */}
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label htmlFor="token-model" className="mb-1 block text-[11px] font-medium text-zinc-400">
                Modello
              </label>
              <Input
                id="token-model"
                list="mm-model-suggestions"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="MiniMax-M3.1-Flash-Preview"
                className="h-9 border-white/10 bg-white/[0.05] font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
              />
              <datalist id="mm-model-suggestions">
                {MODEL_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => void invia()}
                disabled={sending || !prompt.trim()}
                className="h-9 gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 px-4 text-xs font-semibold text-white hover:from-amber-400 hover:to-orange-400"
              >
                <Send className={`size-3.5 ${sending ? "animate-pulse" : ""}`} />
                {sending ? "Invio…" : demoMode ? "Simula chiamata" : "Invia e misura"}
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor="token-prompt" className="mb-1 block text-[11px] font-medium text-zinc-400">
              Prompt
            </label>
            <Textarea
              id="token-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Scrivi un breve messaggio di prova…"
              className="resize-none border-white/10 bg-white/[0.05] text-xs text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* Errore ultima chiamata */}
        {lastError ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-950/30 p-3 text-[11px] leading-relaxed text-rose-200">
            {lastError}
          </div>
        ) : null}

        {/* Ultima chiamata */}
        {lastRecord ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-zinc-300">Ultima chiamata</span>
              <Badge variant="outline" className="gap-1 border-white/10 text-[10px] font-normal text-zinc-400">
                <Clock className="size-2.5" /> {formatDateTimeRome(lastRecord.t)}
              </Badge>
              <Badge variant="outline" className="max-w-[220px] truncate border-white/10 font-mono text-[10px] font-normal text-zinc-400">
                {lastRecord.model}
              </Badge>
              {lastRecord.cachedTokens !== null && lastRecord.cachedTokens > 0 ? (
                <Badge variant="outline" className="border-sky-400/30 bg-sky-400/10 text-[10px] text-sky-300">
                  cache: {fmtInt(lastRecord.cachedTokens)}
                </Badge>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="border-transparent bg-zinc-500/15 text-zinc-300 hover:bg-zinc-500/15">
                prompt: <span className="font-mono font-semibold">{fmtInt(lastRecord.promptTokens ?? 0)}</span>
              </Badge>
              <Badge className="border-transparent bg-amber-500/15 text-amber-300 hover:bg-amber-500/15">
                risposta: <span className="font-mono font-semibold">{fmtInt(lastRecord.completionTokens ?? 0)}</span>
              </Badge>
              <Badge className="border-transparent bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">
                totali: <span className="font-mono font-semibold">{fmtInt(lastRecord.totalTokens ?? 0)}</span>
              </Badge>
            </div>
            {lastContent ? (
              <Collapsible open={contentOpen} onOpenChange={setContentOpen} className="mt-2">
                <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-left text-[11px] text-zinc-400 transition-colors hover:text-zinc-200">
                  <MessageSquare className="size-3" />
                  Risposta del modello
                  <ChevronDown className={`size-3 transition-transform duration-200 ${contentOpen ? "rotate-180" : ""}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-300">
                    {lastContent}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </div>
        ) : null}

        {/* Totali */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Totali registrati</h3>
            <Separator className="flex-1 bg-white/[0.06]" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Chiamate", value: fmtInt(totals.calls), tone: "text-zinc-100" },
              { label: "Token prompt", value: fmtInt(totals.promptTokens), tone: "text-zinc-100" },
              { label: "Token risposta", value: fmtInt(totals.completionTokens), tone: "text-amber-300" },
              { label: "Token totali", value: fmtInt(totals.totalTokens), tone: "text-emerald-300" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {totals.byModel.length > 1 ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.07]">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-white/[0.04] text-zinc-500">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Modello</th>
                    <th className="px-3 py-1.5 text-right font-medium">Chiamate</th>
                    <th className="px-3 py-1.5 text-right font-medium">Token totali</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05] text-zinc-300">
                  {totals.byModel.map((m) => (
                    <tr key={m.model}>
                      <td className="max-w-[220px] truncate px-3 py-1.5 font-mono" title={m.model}>
                        {m.model}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtInt(m.calls)}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmtInt(m.totalTokens)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {/* Storico */}
        {log.length > 0 ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Storico ({fmtInt(log.length)} chiamate)
                </h3>
                <Separator className="flex-1 bg-white/[0.06]" />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={svuota}
                className="h-7 gap-1 border-white/10 bg-transparent px-2 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-rose-300"
              >
                <Trash2 className="size-3" />
                Svuota registro
              </Button>
            </div>
            <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {[...log]
                .slice(-12)
                .reverse()
                .map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-1.5 text-[11px]"
                  >
                    <span className="font-mono tabular-nums text-zinc-500">{formatDateTimeRome(r.t)}</span>
                    <span className="max-w-[200px] truncate font-mono text-zinc-400" title={r.model}>
                      {r.model}
                    </span>
                    {r.source === "demo" ? (
                      <Badge variant="outline" className="border-violet-400/30 bg-violet-400/10 px-1 py-0 text-[9px] text-violet-300">
                        demo
                      </Badge>
                    ) : null}
                    <span className="ml-auto font-mono tabular-nums text-emerald-300">
                      +{fmtInt(r.totalTokens ?? (r.promptTokens ?? 0) + (r.completionTokens ?? 0))} token
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
