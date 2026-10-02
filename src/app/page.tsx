"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ModelCard, MainWindows } from "@/components/quota-cards";
import { HistoryChart, StatsPanel, computeTrend, HistoryPoint, TrendBadge } from "@/components/history-chart";
import { SettingsDialog, DashboardSettings, DEFAULT_SETTINGS } from "@/components/settings-dialog";
import { RawJsonPanel, TechInfo } from "@/components/tech-panels";
import { Region, UsageSnapshot, ApiError, findModel, parseUsageResponse, inferServerTime } from "@/lib/minimax";
import { makeDemoSnapshot, makeDemoHistory } from "@/lib/demo";
import { formatCountdown, formatDateRome, formatTimeRome, nowRomeTime, romeZoneInfo, msUntil } from "@/lib/time";
import { toast } from "sonner";
import {
  RefreshCw,
  Settings2,
  Zap,
  Coins,
  FlaskConical,
  KeyRound,
  MapPin,
  CircleAlert,
  Sparkles,
  ChevronRight,
  ClipboardPaste,
} from "lucide-react";

const SETTINGS_KEY = "mm-dash-settings-v1";
const HISTORY_KEY = "mm-dash-history-v1";
const HISTORY_MAX = 600;

function loadSettings(): DashboardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadHistory(): HistoryPoint[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryPoint[];
    return Array.isArray(parsed) ? parsed.slice(-HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export default function DashboardPage() {
  const [mounted, setMounted] = React.useState(false);
  const [settings, setSettings] = React.useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = React.useState<UsageSnapshot | null>(null);
  const [rawJson, setRawJson] = React.useState<unknown | null>(null);
  const [lastEndpoint, setLastEndpoint] = React.useState<string>("");
  const [lastOk, setLastOk] = React.useState<boolean | null>(null);
  const [lastFetch, setLastFetch] = React.useState<number | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [history, setHistory] = React.useState<HistoryPoint[]>([]);
  const [chartWindow, setChartWindow] = React.useState<"interval" | "weekly">("interval");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [now, setNow] = React.useState<number>(() => Date.now());

  /* ----------------------------- init ----------------------------- */
  React.useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setHistory(loadHistory());
    setMounted(true);
    setNow(Date.now());
  }, []);

  /* Orologio vivo: tick ogni secondo */
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* --------------------------- fetching ---------------------------- */
  const pushHistory = React.useCallback((snap: UsageSnapshot) => {
    const general = findModel(snap, "general");
    const interval = general?.interval?.remainingPercent;
    const weekly = general?.weekly?.remainingPercent;
    if (interval === null && weekly === null && general === undefined) return;
    setHistory((prev) => {
      const point: HistoryPoint = {
        t: snap.fetchedAt,
        interval: interval ?? prev[prev.length - 1]?.interval ?? 100,
        weekly: weekly ?? prev[prev.length - 1]?.weekly ?? 100,
      };
      // Deduplica: se l'ultimo punto è più vecchio di 20s accoda, altrimenti sostituisci
      const last = prev[prev.length - 1];
      const next = last && point.t - last.t < 20_000 ? [...prev.slice(0, -1), point] : [...prev, point];
      const trimmed = next.slice(-HISTORY_MAX);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      } catch {
        /* quota piena: ignora */
      }
      return trimmed;
    });
  }, []);

  const fetchData = React.useCallback(
    async (s: DashboardSettings, silent = false) => {
      if (!s.demoMode && !s.apiKey) {
        setSettingsOpen(true);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);

      try {
        if (s.demoMode) {
          // Piccolo ritardo per realismo
          await new Promise((r) => setTimeout(r, 350));
          const snap = makeDemoSnapshot(s.region);
          setSnapshot(snap);
          setRawJson({
            base_resp: { status_code: 0, status_msg: "success (demo)" },
            current_subscribe_title: snap.planTitle,
            credits_balance: snap.credits,
            model_remains: snap.models.map((m) => ({
              model_name: m.modelName,
              ...(m.interval
                ? {
                    current_interval_remaining_percent: m.interval.remainingPercent,
                    start_time: m.interval.start,
                    end_time: m.interval.end,
                    remains_time: m.interval.remainsTimeMs,
                  }
                : {}),
              ...(m.weekly
                ? {
                    current_weekly_remaining_percent: m.weekly.remainingPercent,
                    weekly_start_time: m.weekly.start,
                    weekly_end_time: m.weekly.end,
                    weekly_remains_time: m.weekly.remainsTimeMs,
                  }
                : {}),
            })),
          });
          setLastEndpoint("demo://token_plan/remains");
          setLastOk(true);
          setLastFetch(snap.fetchedAt);
          // Popola la storia demo se vuota
          setHistory((prev) => {
            if (prev.length >= 10) return prev;
            const demoHist = makeDemoHistory();
            try {
              localStorage.setItem(HISTORY_KEY, JSON.stringify(demoHist));
            } catch {
              /* noop */
            }
            return demoHist;
          });
          if (!silent) setLoading(false);
          return;
        }

        const res = await fetch("/api/minimax/usage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: s.apiKey, region: s.region }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          status?: number;
          data?: unknown;
          error?: ApiError;
          fetchedAt?: number;
          endpoint?: string;
        };

        setLastEndpoint(json.endpoint ?? "");
        setLastFetch(json.fetchedAt ?? Date.now());

        if (json.ok && json.data) {
          try {
            const snap = parseUsageResponse(json.data, {
              source: "api",
              region: s.region,
              fetchedAt: json.fetchedAt,
            });
            setSnapshot(snap);
            setRawJson(json.data);
            setLastOk(true);
            pushHistory(snap);
          } catch (e) {
            // Errore di business dell'API (es. status_code 1004) o parsing
            setLastOk(false);
            setRawJson(json.data);
            const err = e as Error & { statusCode?: number };
            setError({
              code: err.statusCode ? `api_${err.statusCode}` : "parse",
              message: err.message,
            });
          }
        } else {
          setLastOk(false);
          setRawJson(json.data ?? null);
          setError(
            json.error ?? {
              code: "unknown",
              message: "Errore sconosciuto durante la sincronizzazione.",
            },
          );
        }
      } catch (e) {
        setLastOk(false);
        setError({
          code: "client",
          message: e instanceof Error ? e.message : "Errore imprevisto lato client.",
        });
      } finally {
        setLoading(false);
      }
    },
    [pushHistory],
  );

  /* Prima sincronizzazione al mount */
  React.useEffect(() => {
    if (!mounted) return;
    if (settings.demoMode || settings.apiKey) void fetchData(settings);
  }, [mounted, settings.demoMode, settings.apiKey, settings.region, fetchData, settings]);

  /* Aggiornamento automatico */
  React.useEffect(() => {
    if (!mounted || settings.refreshSeconds === 0) return;
    const id = setInterval(() => void fetchData(settings, true), settings.refreshSeconds * 1000);
    return () => clearInterval(id);
  }, [mounted, settings, fetchData]);

  const handleSaveSettings = (s: DashboardSettings) => {
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* noop */
    }
    setSnapshot(null);
    setError(null);
    void fetchData(s);
  };

  /** Importa una risposta JSON incollata manualmente (senza chiamare l'API). */
  const handleImportJson = (raw: unknown) => {
    try {
      const snap = parseUsageResponse(raw, {
        source: "api",
        region: settings.region,
        fetchedAt: Date.now(),
      });
      if (snap.models.length === 0) {
        throw new Error("Nessun modello trovato: verifica che il JSON contenga l'array model_remains.");
      }
      setSnapshot(snap);
      setRawJson(raw);
      setLastEndpoint("json://incollato (risposta API importata manualmente)");
      setLastOk(true);
      setLastFetch(snap.fetchedAt);
      setError(null);
      pushHistory(snap);
      toast.success("JSON importato: analisi completata");
    } catch (e) {
      const message = e instanceof Error ? e.message : "JSON non interpretabile.";
      setError({ code: "parse", message });
      toast.error(message);
    }
  };

  /* ---------------------------- derived ---------------------------- */
  const general = snapshot ? findModel(snapshot, "general") : undefined;
  const otherModels = snapshot ? snapshot.models.filter((m) => m.modelName.toLowerCase() !== "general") : [];
  const trend = React.useMemo(() => computeTrend(history, chartWindow), [history, chartWindow]);
  const serverTime = React.useMemo(() => (snapshot ? inferServerTime(snapshot.models) : null), [snapshot]);
  const sourceLabel = !lastEndpoint
    ? undefined
    : lastEndpoint.startsWith("json://")
      ? "Risposta JSON importata manualmente"
      : lastEndpoint.startsWith("demo://")
        ? "Modalità demo (nessuna chiamata reale)"
        : lastEndpoint;
  const nextRefreshIn =
    settings.refreshSeconds > 0 && lastFetch && !settings.demoMode
      ? msUntil(lastFetch + settings.refreshSeconds * 1000, now)
      : null;

  const needsSetup = !settings.demoMode && !settings.apiKey;

  /* ---------------------------- render ----------------------------- */
  return (
    <div className="relative min-h-screen bg-[#09090b] text-zinc-100">
      {/* Decorazioni di sfondo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(700px 380px at 12% -5%, rgba(244,63,94,0.10), transparent 60%), radial-gradient(800px 420px at 88% 0%, rgba(245,158,11,0.07), transparent 60%)",
        }}
      />

      <div className="relative flex min-h-screen flex-col">
        {/* ------------------------------ Header ------------------------------ */}
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/20">
                <Zap className="size-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight sm:text-base">MiniMax Token Monitor</h1>
                <p className="text-[11px] text-zinc-500">Quota · Reset · Statistiche</p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Orologio Roma */}
              <div className="hidden items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 md:flex">
                <MapPin className="size-3.5 text-rose-400" />
                <div className="text-right leading-tight">
                  <p className="font-mono text-sm font-semibold tabular-nums text-zinc-100">{mounted ? nowRomeTime() : "--:--:--"}</p>
                  <p className="text-[10px] text-zinc-500">Europe/Rome · {romeZoneInfo(now)}</p>
                </div>
              </div>

              <span className="sr-only" aria-live="polite">
                Ora corrente a Roma: {mounted ? nowRomeTime() : ""}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchData(settings)}
                disabled={loading || needsSetup}
                className="h-9 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Sincronizzo…" : "Aggiorna"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Apri impostazioni"
                onClick={() => setSettingsOpen(true)}
                className="h-9 w-9 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
              >
                <Settings2 className="size-4" />
              </Button>
            </div>
          </div>

          {/* Riga badge stato */}
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
            {snapshot?.planTitle ? (
              <Badge className="gap-1 border-transparent bg-gradient-to-r from-rose-500/15 to-orange-500/15 text-rose-300 hover:from-rose-500/15">
                <Sparkles className="size-3" />
                {snapshot.planTitle}
              </Badge>
            ) : null}
            {snapshot?.credits !== null && snapshot?.credits !== undefined ? (
              <Badge variant="outline" className="gap-1 border-white/10 text-xs text-amber-300">
                <Coins className="size-3" />
                Crediti: {snapshot.credits.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Badge>
            ) : null}
            {lastOk === false ? (
              <Badge variant="outline" className="gap-1 border-rose-400/30 bg-rose-400/10 text-xs text-rose-300">
                <CircleAlert className="size-3" />
                API in errore
              </Badge>
            ) : snapshot?.source === "demo" || (snapshot === null && settings.demoMode) ? (
              <Badge variant="outline" className="gap-1 border-violet-400/30 bg-violet-400/10 text-xs text-violet-300">
                <FlaskConical className="size-3" />
                Modalità demo — dati simulati
              </Badge>
            ) : lastEndpoint.startsWith("json://") ? (
              <Badge variant="outline" className="gap-1 border-sky-400/30 bg-sky-400/10 text-xs text-sky-300">
                <ClipboardPaste className="size-3" />
                JSON importato manualmente
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-emerald-400/30 bg-emerald-400/10 text-xs text-emerald-300">
                <KeyRound className="size-3" />
                API connessa
              </Badge>
            )}
            {lastFetch ? (
              <Badge variant="outline" className="border-white/10 text-[11px] font-normal text-zinc-400">
                Ultimo rilevamento: {formatTimeRome(lastFetch)}
                {settings.refreshSeconds > 0 && !settings.demoMode
                  ? nextRefreshIn !== null
                    ? ` · prossimo tra ${formatCountdown(nextRefreshIn)}`
                    : ""
                  : ""}
              </Badge>
            ) : null}
            <TrendBadge trend={trend} />
          </div>
        </header>

        {/* ------------------------------ Main ------------------------------ */}
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          {/* Errore */}
          {error ? (
            <Alert variant="destructive" className="border-rose-500/30 bg-rose-950/40 text-rose-100">
              <CircleAlert className="size-4" />
              <AlertTitle>Impossibile recuperare i dati di utilizzo</AlertTitle>
              <AlertDescription className="text-rose-200/90">
                {error.message}
                <span className="mt-2 block text-xs text-rose-200/60">
                  Codice: {error.code}
                  {error.httpStatus ? ` · HTTP ${error.httpStatus}` : ""}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Setup iniziale */}
          {needsSetup ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-white/[0.07] bg-white/[0.04] p-8 text-center backdrop-blur">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-500/20">
                <KeyRound className="size-7 text-rose-400" />
              </div>
              <h2 className="text-lg font-bold">Configura il tuo monitor</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-zinc-400">
                Inserisci la <strong className="text-zinc-200">Subscription Key</strong> del tuo Token Plan MiniMax
                per iniziare a monitorare quota, finestre di reset e statistiche d&apos;uso. Oppure prova la
                modalità demo con dati simulati.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Button
                  onClick={() => setSettingsOpen(true)}
                  className="gap-1.5 bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:from-rose-400 hover:to-orange-400"
                >
                  Inserisci la chiave
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    handleSaveSettings({ ...settings, demoMode: true })
                  }
                  className="gap-1.5 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                >
                  <FlaskConical className="size-4 text-violet-300" />
                  Prova la demo
                </Button>
              </div>
              <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
                La chiave si trova nella console MiniMax → Plan Details. Viene salvata solo nel tuo browser.
              </p>
            </div>
          ) : !mounted ? (
            /* Skeleton al primo rendering */
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
                ))}
              </div>
              <div className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
            </div>
          ) : snapshot ? (
            <>
              {/* Anelli principali */}
              <MainWindows general={general} now={now} />

              {/* Data odierna a Roma */}
              <p className="text-center text-xs text-zinc-500">
                Oggi a Roma: <span className="font-medium text-zinc-400">{formatDateRome(now)}</span>
              </p>

              {/* Grafico + statistiche */}
              <HistoryChart history={history} window={chartWindow} onWindowChange={setChartWindow} />
              <StatsPanel trend={trend} win={chartWindow} />

              {/* Altri modelli */}
              {otherModels.length > 0 ? (
                <section className="space-y-3" aria-label="Altri modelli">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-200">Altri modelli</h2>
                    <Separator className="flex-1 bg-white/[0.06]" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {otherModels.map((m, i) => (
                      <ModelCard key={m.modelName} model={m} now={now} delay={i * 60} />
                    ))}
                  </div>
                </section>
              ) : null}

              {/* Card dettaglio "general" se ha dati extra (es. stato, boost) */}
              {general ? null : null}

              {/* JSON + dettagli tecnici */}
              <div className="grid gap-4 lg:grid-cols-2">
                <RawJsonPanel rawJson={rawJson} fetchedAt={lastFetch} endpoint={lastEndpoint} ok={lastOk} />
                <TechInfo
                  region={settings.region as Region}
                  demoMode={settings.demoMode}
                  lastFetch={lastFetch}
                  refreshSeconds={settings.refreshSeconds}
                  serverTime={serverTime}
                  sourceLabel={sourceLabel}
                />
              </div>
            </>
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              <RefreshCw className="mr-2 size-4 animate-spin" /> Sincronizzazione in corso…
            </div>
          ) : null}
        </main>

        {/* ----------------------------- Footer ----------------------------- */}
        <footer className="mt-auto border-t border-white/[0.06] bg-[#09090b]/80 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-zinc-600 sm:flex-row sm:px-6">
            <p>
              MiniMax Token Monitor · dashboard non ufficiale per il Token Plan di{" "}
              <a
                href="https://platform.minimax.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 underline-offset-2 hover:underline"
              >
                platform.minimax.io
              </a>
            </p>
            <p>
              Fuso orario: Europe/Rome ({romeZoneInfo(now)}) · Orario locale:{" "}
              <span className="font-mono tabular-nums">{mounted ? nowRomeTime() : "--:--:--"}</span>
            </p>
          </div>
        </footer>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onImportJson={handleImportJson}
      />
    </div>
  );
}
