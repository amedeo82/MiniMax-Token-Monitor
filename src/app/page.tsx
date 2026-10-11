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
import { EventLog } from "@/components/event-log";
import { PanoramicTable } from "@/components/model-table";
import { LongTermAnalysis } from "@/components/analysis-panel";
import { DiagnosticaPanel } from "@/components/diagnostica-panel";
import { SectionNav } from "@/components/section-nav";
import { SectionBoundary } from "@/components/section-boundary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TabIdentity } from "@/lib/tab-identity";
import { filterHistoryByPreset, RANGE_PRESETS, type RangePreset } from "@/lib/interval";
import { readCompactMode } from "@/lib/compact";
import { RateChart } from "@/components/history-chart";
import {
  deriveBanner,
  evaluateTransitions,
  appendEvents,
  loadEvents,
  clearEvents,
  replaceEvents,
  makeEvent,
  notifyBrowser,
  migrateLegacyThresholds,
  type UsageEvent,
  type BannerInfo,
} from "@/lib/usage-events";
import { Region, UsageSnapshot, ApiError, findModel, parseUsageResponse, inferServerTime } from "@/lib/minimax";
import { delayAfterFailure } from "@/lib/backoff";
import { makeDemoSnapshot, makeDemoHistory } from "@/lib/demo";
import {
  pushPointToServer,
  fetchServerHistory,
  mergeHistories,
  serverPointsToHistory,
} from "@/lib/server-history";
import {
  pushEventsToServer,
  fetchServerEvents,
  mergeEvents,
  serverEventsToEvents,
  clearServerEvents,
} from "@/lib/server-events";
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
  AlertTriangle,
  AlertOctagon,
  Maximize2,
} from "lucide-react";

const SETTINGS_KEY = "mm-dash-settings-v1";
const HISTORY_KEY = "mm-dash-history-v1";
const HISTORY_MAX = 600;

function loadSettings(): DashboardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DashboardSettings> & Record<string, unknown>;
    /* I28 — migrazione delle vecchie soglie globali (alertThresholdWarn/Crit):
       i valori legacy si applicano a TUTTE le finestre, così il comportamento
       scelto dall'utente resta identico dopo l'aggiornamento. */
    const thresholds = migrateLegacyThresholds(parsed) ?? DEFAULT_SETTINGS.thresholds;
    const cleaned: Record<string, unknown> = { ...parsed };
    delete cleaned.alertThresholdWarn;
    delete cleaned.alertThresholdCrit;
    return { ...DEFAULT_SETTINGS, ...cleaned, thresholds } as DashboardSettings;
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
  const [events, setEvents] = React.useState<UsageEvent[]>([]);
  const [chartWindow, setChartWindow] = React.useState<"interval" | "weekly">("interval");
  /* I69 — intervallo temporale selezionato (grafico/ritmo/analisi; default: tutto) */
  const [rangePreset, setRangePreset] = React.useState<RangePreset>("all");
  /* I73 — modalità compatta ?compact=1 (widget: anelli + countdown + ritmo) */
  const [compact, setCompact] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [now, setNow] = React.useState<number>(() => Date.now());
  /** I16: punti conservati sul server; null = server non ancora raggiunto. */
  const [serverCount, setServerCount] = React.useState<number | null>(null);
  /** I27: eventi conservati nell'archivio server; null = server non ancora raggiunto. */
  const [serverEventsCount, setServerEventsCount] = React.useState<number | null>(null);
  /** Mirror sincrono dello storico per costruire i punti senza race. */
  const historyRef = React.useRef<HistoryPoint[]>([]);

  /* Riferimenti per il confronto tra rilevamenti consecutivi (transizioni) */
  const prevSnapRef = React.useRef<UsageSnapshot | null>(null);
  const prevOkRef = React.useRef<boolean | null>(null);

  /* I51 — stato dello scheduler con backoff: tentativi consecutivi falliti,
     ultimo Retry-After ricevuto e ritardo attualmente programmato. */
  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptRef = React.useRef(0);
  const lastRetryAfterRef = React.useRef<number | null>(null);
  const pollDelayRef = React.useRef<number | null>(null);
  /* I18 — true se l'ultimo rilevamento riuscito è arrivato dall'endpoint
     alternativo coding_plan/remains (per gli eventi solo su transizione). */
  const fallbackActiveRef = React.useRef(false);
  /** Mirror sincrono delle impostazioni per scheduler/fetch senza re-trigger. */
  const settingsRef = React.useRef(settings);

  /* ----------------------------- init ----------------------------- */
  React.useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    const local = loadHistory();
    historyRef.current = local;
    setHistory(local);
    setEvents(loadEvents());
    setMounted(true);
    setNow(Date.now());
    /* I73 — la querystring si legge solo lato client (non esiste in SSR) */
    setCompact(readCompactMode(window.location.search));

    /* I16: scarica lo storico conservato sul server e fondilo con quello locale,
       così la cronologia sopravvive a cache svuotate e resta disponibile a lungo. */
    void (async () => {
      const server = await fetchServerHistory(2000);
      if (!server) {
        setServerCount(null);
        return;
      }
      setServerCount(server.total);
      if (server.points.length === 0) return;
      const remote = serverPointsToHistory(server.points);
      const merged = mergeHistories(historyRef.current, remote).slice(-HISTORY_MAX);
      historyRef.current = merged;
      setHistory(merged);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
      } catch {
        /* quota piena: ignora */
      }
    })();

    /* I27: scarica l'archivio eventi conservato sul server e fondilo con il
       registro locale (dedup per id): il diario resta limitato a 200 voci,
       il server conserva l'archivio completo per l'export di lungo periodo. */
    void (async () => {
      const server = await fetchServerEvents(5000);
      if (!server) {
        setServerEventsCount(null);
        return;
      }
      setServerEventsCount(server.total);
      if (server.events.length === 0) return;
      const remote = serverEventsToEvents(server.events);
      setEvents(replaceEvents(mergeEvents(loadEvents(), remote)));
    })();
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
    const prev = historyRef.current;
    const point: HistoryPoint = {
      t: snap.fetchedAt,
      interval: interval ?? prev[prev.length - 1]?.interval ?? 100,
      weekly: weekly ?? prev[prev.length - 1]?.weekly ?? 100,
    };
    // Deduplica: se l'ultimo punto è più vecchio di 20s accoda, altrimenti sostituisci
    const last = prev[prev.length - 1];
    const next = last && point.t - last.t < 20_000 ? [...prev.slice(0, -1), point] : [...prev, point];
    const trimmed = next.slice(-HISTORY_MAX);
    historyRef.current = trimmed;
    setHistory(trimmed);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota piena: ignora */
    }
    // I16: replica il punto sul server (fire-and-forget, silenzioso in caso di errore)
    pushPointToServer(point, {
      source: snap.source,
      region: snap.region,
      onTotal: (total) => setServerCount(total),
    });
  }, []);

  /** I27: registra gli eventi nel registro locale e li replica sull'archivio server (fire-and-forget). */
  const addEvents = React.useCallback((evs: UsageEvent | UsageEvent[]) => {
    const list = Array.isArray(evs) ? evs : [evs];
    if (list.length === 0) return;
    setEvents(appendEvents(list));
    pushEventsToServer(list, { onTotal: (total) => setServerEventsCount(total) });
  }, []);

  /** Registra lo stato "errore" (con evento solo sulla transizione ok → errore). */
  const markError = React.useCallback(
    (message: string) => {
      setLastOk(false);
      if (prevOkRef.current !== false) {
        prevOkRef.current = false;
        addEvents(makeEvent("error", `Rilevamento fallito: ${message}`));
      }
    },
    [addEvents],
  );

  /** Registra lo stato "connesso". */
  const markOk = React.useCallback(() => {
    setLastOk(true);
    prevOkRef.current = true;
  }, []);

  const fetchData = React.useCallback(
    async (s: DashboardSettings, silent = false): Promise<boolean> => {
      if (!s.demoMode && !s.apiKey) {
        setSettingsOpen(true);
        return false;
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
          markOk();
          setLastFetch(snap.fetchedAt);
          // Popola la storia demo se vuota, fondendo il backfill con l'eventuale
          // storico appena scaricato dal server (non deve sovrascriverlo)
          if (historyRef.current.length < 10) {
            const demoHist = makeDemoHistory();
            const merged = mergeHistories(historyRef.current, demoHist).slice(-HISTORY_MAX);
            historyRef.current = merged;
            setHistory(merged);
            try {
              localStorage.setItem(HISTORY_KEY, JSON.stringify(merged));
            } catch {
              /* noop */
            }
          }
          // Registra anche i rilevamenti demo nello storico (locale + replica server, source "demo")
          pushHistory(snap);
          if (!silent) setLoading(false);
          return true;
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
          fallback?: { used: boolean; primaryEndpoint?: string; reason?: string };
          fallbackTried?: boolean;
        };

        setLastEndpoint(json.endpoint ?? "");
        setLastFetch(json.fetchedAt ?? Date.now());
        lastRetryAfterRef.current = json.ok ? null : json.error?.retryAfterMs ?? null;

        /* I18 — evento tecnico SOLO sulla transizione primario ↔ fallback
           (nessuno spam a ogni poll): attivazione quando i dati arrivano da
           coding_plan/remains, ritorno al primario al primo successo senza
           fallback. Tornare al primario con un errore è silenzioso: se ne
           occupa già l'evento «Rilevamento fallito» di markError. */
        const fbUsed = json.ok === true && json.fallback?.used === true;
        if (fbUsed && !fallbackActiveRef.current) {
          fallbackActiveRef.current = true;
          addEvents(
            makeEvent(
              "info",
              `Endpoint primario non disponibile (${json.fallback?.reason ?? "motivo non specificato"}): dati da coding_plan/remains`,
            ),
          );
        } else if (!fbUsed && fallbackActiveRef.current && json.ok) {
          fallbackActiveRef.current = false;
          addEvents(makeEvent("info", "Ritorno all'endpoint primario token_plan/remains"));
        } else if (!fbUsed && fallbackActiveRef.current) {
          fallbackActiveRef.current = false;
        }

        if (json.ok && json.data) {
          try {
            const snap = parseUsageResponse(json.data, {
              source: "api",
              region: s.region,
              fetchedAt: json.fetchedAt,
            });
            setSnapshot(snap);
            setRawJson(json.data);
            markOk();
            pushHistory(snap);
            if (!silent) setLoading(false);
            return true;
          } catch (e) {
            // Errore di business dell'API (es. status_code 1004) o parsing
            setRawJson(json.data);
            const err = e as Error & { statusCode?: number };
            markError(err.message);
            setError({
              code: err.statusCode ? `api_${err.statusCode}` : "parse",
              message: err.message,
            });
            if (!silent) setLoading(false);
            return false;
          }
        } else {
          const message = json.error?.message ?? "Errore sconosciuto durante la sincronizzazione.";
          markError(message);
          setRawJson(json.data ?? null);
          setError(
            json.error ?? {
              code: "unknown",
              message,
            },
          );
          if (!silent) setLoading(false);
          return false;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Errore imprevisto lato client.";
        markError(message);
        setError({
          code: "client",
          message,
        });
        if (!silent) setLoading(false);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [pushHistory, markError, markOk],
  );

  /* I51 — prima sincronizzazione e ri-sync SOLO quando cambia la CONNESSIONE
     (chiave/regione/demo). Il vecchio effetto dipendeva dall'oggetto settings:
     ogni salvataggio (anche solo soglie o refresh) faceva un doppio fetch. */
  React.useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const lastConnKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!mounted) return;
    const connKey = settings.demoMode ? "demo" : `${settings.apiKey}|${settings.region}`;
    if (lastConnKeyRef.current === connKey) return;
    lastConnKeyRef.current = connKey;
    void fetchData(settingsRef.current);
  }, [mounted, settings.demoMode, settings.apiKey, settings.region, fetchData]);

  /* I51 — Aggiornamento automatico con backoff: al successo si torna
     all'intervallo scelto dall'utente; a ogni fallimento il ritardo cresce
     esponenzialmente con jitter (base 2s, cap 10 min, floor 1s) e non scende
     mai sotto il Retry-After dichiarato dal proxy. */
  React.useEffect(() => {
    if (!mounted || settings.refreshSeconds === 0) return;
    if (!settings.demoMode && !settings.apiKey) return;

    let cancelled = false;
    const schedule = (ms: number) => {
      pollDelayRef.current = ms;
      pollTimerRef.current = setTimeout(() => {
        if (!cancelled) void tick();
      }, ms);
    };
    const tick = async () => {
      const s = settingsRef.current;
      const ok = await fetchData(s, true);
      if (cancelled) return;
      if (ok) {
        pollAttemptRef.current = 0;
        lastRetryAfterRef.current = null;
        schedule(Math.max(5, s.refreshSeconds) * 1000);
      } else {
        const delay = delayAfterFailure(pollAttemptRef.current, lastRetryAfterRef.current);
        pollAttemptRef.current += 1;
        schedule(delay);
      }
    };
    schedule(Math.max(5, settings.refreshSeconds) * 1000);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollDelayRef.current = null;
    };
  }, [mounted, settings.demoMode, settings.apiKey, settings.refreshSeconds, fetchData]);

  /* Transizioni tra snapshot: toast + notifiche browser + eventi nel registro */
  React.useEffect(() => {
    if (!snapshot) return;
    const result = evaluateTransitions(prevSnapRef.current, snapshot, settings);
    prevSnapRef.current = snapshot;
    if (result.resets.length === 0 && result.alerts.length === 0) return;

    if (result.events.length > 0) addEvents(result.events);

    for (const r of result.resets) {
      toast.success("Finestra resettata", {
        description: `${r.modelLabel} — ${r.winLabel} tornata al ${r.to.toFixed(1)}%`,
      });
      if (settings.browserNotifications) {
        notifyBrowser("MiniMax · Finestra resettata", `${r.modelLabel}: quota tornata al ${r.to.toFixed(1)}%`);
      }
    }
    for (const a of result.alerts) {
      const title = a.level === "crit" ? "Quota quasi esaurita" : "Soglia di attenzione superata";
      const desc = `${a.modelLabel} — ${a.winLabel} al ${a.to.toFixed(1)}%`;
      if (a.level === "crit") toast.error(title, { description: desc });
      else toast.warning(title, { description: desc });
      if (settings.browserNotifications) notifyBrowser(`MiniMax · ${title}`, desc);
    }
  }, [snapshot, settings, addEvents]);

  const handleSaveSettings = (s: DashboardSettings) => {
    /* I51 — la connessione è cambiata solo se chiave/regione/demo differiscono:
       in quel caso lo stato va azzerato e l'effetto connKey rifà il fetch
       UNA volta sola; per le altre impostazioni (soglie, refresh, avvisi) non
       serve alcun rifetch immediato, lo scheduler si adatta da solo. */
    const connChanged =
      s.demoMode !== settings.demoMode ||
      (!s.demoMode && (s.apiKey !== settings.apiKey || s.region !== settings.region));
    setSettings(s);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
      // I52 — il Service Worker legge i segreti dal localStorage solo via
      // postMessage: avvisalo che le impostazioni sono cambiate.
      window.dispatchEvent(new Event("mm-dash-settings-updated"));
    } catch {
      /* noop */
    }
    if (connChanged) {
      setSnapshot(null);
      setError(null);
    }
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
      markOk();
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

  const handleClearEvents = () => {
    clearEvents();
    setEvents([]);
    // I27: svuota anche l'archivio server (altrimenti al prossimo avvio il merge
    // ripristinerebbe gli eventi cancellati dal dispositivo).
    void clearServerEvents().then((deleted) => {
      if (deleted !== null) setServerEventsCount(0);
    });
    toast.success("Registro eventi svuotato (anche la copia sul server)");
  };

  /* ---------------------------- derived ---------------------------- */
  const general = snapshot ? findModel(snapshot, "general") : undefined;
  const otherModels = snapshot ? snapshot.models.filter((m) => m.modelName.toLowerCase() !== "general") : [];
  /* I69 — storico filtrato per l'intervallo selezionato: la finestra scivola anche col
     solo scorrere del tempo (il tick `now` la aggiorna senza nuovi fetch). La
     Diagnostica resta deliberatamente sullo storico COMPLETO: guasti e blocchi
     teorici vanno giudicati sull'intera osservazione, non sull'ultimo tratto. */
  const filteredHistory = React.useMemo(
    () => filterHistoryByPreset(history, rangePreset, now),
    [history, rangePreset, now],
  );
  const trend = React.useMemo(() => computeTrend(filteredHistory, chartWindow), [filteredHistory, chartWindow]);
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
      ? msUntil(lastFetch + (pollDelayRef.current ?? settings.refreshSeconds * 1000), now)
      : null;

  const needsSetup = !settings.demoMode && !settings.apiKey;

  /* I67 — identità del tab: residuo 5h nel titolo + favicon dinamica */
  const residuoPerTab = general?.interval?.remainingPercent ?? null;

  /* Banner quota bassa (deriva solo dallo snapshot corrente) */
  const banner = React.useMemo<BannerInfo | null>(() => deriveBanner(snapshot, settings), [snapshot, settings]);

  /* Finestra selezionata nel grafico: reset e residuo per il verdetto di proiezione */
  const selectedWindow = chartWindow === "interval" ? general?.interval : general?.weekly;
  const selectedWindowEnd = selectedWindow?.end ?? null;
  const selectedWindowRemaining = selectedWindow?.remainingPercent ?? null;

  /* I69 — selettore a chips dell'intervallo, condiviso da vista completa e compatta */
  const rangeSelector = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Intervallo temporale">
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Intervallo</span>
      <ToggleGroup
        type="single"
        value={rangePreset}
        onValueChange={(v) => {
          if (v !== "") setRangePreset(v as RangePreset);
        }}
        className="gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
      >
        {RANGE_PRESETS.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            aria-label={`Intervallo ${p.label}`}
            className="h-7 rounded-full border-0 px-3! text-[11px] font-medium text-zinc-400 data-[state=on]:bg-white/[0.10]! data-[state=on]:text-zinc-100!"
          >
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );

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
        {/* I67 — titolo e favicon dinamici */}
        <TabIdentity remainingPercent={residuoPerTab} demo={settings.demoMode} />
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
                className="h-9 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
              >
                <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Sincronizzo…" : "Aggiorna"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Apri impostazioni"
                onClick={() => setSettingsOpen(true)}
                className="h-9 w-9 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]!"
              >
                <Settings2 className="size-4" />
              </Button>
              {/* I73 — uscita dalla modalità compatta (torna alla dashboard completa) */}
              {compact ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Torna alla vista completa"
                  title="Torna alla vista completa"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                  className="h-9 w-9 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]!"
                >
                  <Maximize2 className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>

          {/* Riga badge stato — nascosta in modalità compatta (I73: widget minimale) */}
          {!compact ? (
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
          ) : null}
        </header>

        {/* ------------------------------ Main ------------------------------ */}
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        {/* I66 — navigazione interna sticky con scrollspy (assente in modalità compatta) */}
        {!compact ? <SectionNav /> : null}

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
                  className="gap-1.5 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]!"
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
            compact ? (
              /* I73 — skeleton ridotto del widget */
              <div className="space-y-6">
                <div className="h-72 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
                <div className="h-56 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
              </div>
            ) : (
              /* Skeleton al primo rendering */
              <div className="space-y-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
                  ))}
                </div>
                <div className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-white/[0.03]" />
              </div>
            )
          ) : snapshot ? (
            compact ? (
              /* I73 — VISTA COMPATTA (widget): solo anelli principali + countdown + ritmo.
                 Niente nav, banner, grafico, panoramica, analisi, diagnostica, tecnici,
                 registro, footer. Errore API e schermata di setup restano visibili sopra
                 (fuori da questo branch: servono alla funzione del widget). */
              <>
                <div id="quota" className="mm-anchor">
                  <SectionBoundary title="Finestre principali" fallbackHeight="h-64">
                    <MainWindows general={general} now={now} />
                  </SectionBoundary>
                </div>
                <div id="ritmo" className="mm-anchor space-y-3">
                  {rangeSelector}
                  <SectionBoundary title="Ritmo di consumo" fallbackHeight="h-56">
                    <RateChart history={filteredHistory} window={chartWindow} />
                  </SectionBoundary>
                </div>
              </>
            ) : (
            <>
              {/* Banner quota bassa (avvisi di soglia) */}
              {banner ? (
                <Alert
                  className={
                    banner.level === "crit"
                      ? "border-rose-500/30 bg-rose-950/40 text-rose-100"
                      : "border-amber-500/30 bg-amber-950/40 text-amber-100"
                  }
                >
                  {banner.level === "crit" ? <AlertOctagon className="size-4" /> : <AlertTriangle className="size-4" />}
                  <AlertTitle>
                    {banner.level === "crit"
                      ? "Quota quasi esaurita"
                      : "Soglia di attenzione superata"}
                  </AlertTitle>
                  <AlertDescription>
                    <ul className={`mt-1 space-y-0.5 ${banner.level === "crit" ? "text-rose-200/90" : "text-amber-200/90"}`}>
                      {banner.items.map((item) => (
                        <li key={`${item.model}-${item.win}`}>
                          {item.modelLabel} · {item.winLabel}{" "}
                          al <strong>{item.remaining.toFixed(1)}%</strong> (soglia {item.threshold}%)
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Anelli principali */}
              <div id="quota" className="mm-anchor">
                <SectionBoundary title="Finestre principali" fallbackHeight="h-64">
                  <MainWindows general={general} now={now} />
                </SectionBoundary>
              </div>

              {/* Data odierna a Roma */}
              <p className="text-center text-xs text-zinc-500">
                Oggi a Roma: <span className="font-medium text-zinc-400">{formatDateRome(now)}</span>
              </p>

              {/* Grafico + statistiche — I69: selettore intervallo e storico filtrato */}
              <div id="grafico" className="mm-anchor space-y-3">
                {rangeSelector}
                <SectionBoundary title="Grafico storico" fallbackHeight="h-64">
                  <HistoryChart
                    history={filteredHistory}
                    window={chartWindow}
                    onWindowChange={setChartWindow}
                    serverCount={serverCount}
                  />
                </SectionBoundary>
              </div>
              <SectionBoundary title="Statistiche di proiezione" fallbackHeight="h-40">
                <StatsPanel
                  trend={trend}
                  win={chartWindow}
                  resetAt={selectedWindowEnd}
                  remaining={selectedWindowRemaining}
                  serverCount={serverCount}
                />
              </SectionBoundary>

              {/* I59 — ritmo di consumo %/h sotto il grafico (I69: storico filtrato) */}
              <div id="ritmo" className="mm-anchor">
                <SectionBoundary title="Ritmo di consumo" fallbackHeight="h-56">
                  <RateChart history={filteredHistory} window={chartWindow} />
                </SectionBoundary>
              </div>

              {/* Vista panoramica: tutte le finestre del piano a confronto */}
              <div id="panoramica" className="mm-anchor">
                <SectionBoundary title="Vista panoramica" fallbackHeight="h-48">
                  <PanoramicTable models={snapshot.models} now={now} />
                </SectionBoundary>
              </div>

              {/* Analisi di lungo periodo: cicli, calendario, distribuzione, heatmap (I26 + batch abbellimenti)
                  I69: segue l'intervallo selezionato; la Diagnostica sotto resta sullo storico COMPLETO */}
              <div id="analisi" className="mm-anchor">
                <SectionBoundary title="Analisi di lungo periodo" fallbackHeight="h-64">
                  <LongTermAnalysis history={filteredHistory} />
                </SectionBoundary>
              </div>

              {/* I60/I62 — diagnostica: orologio dei reset + salute del monitor (storico completo, fuori da I69) */}
              <div id="diagnostica" className="mm-anchor">
                <SectionBoundary title="Diagnostica" fallbackHeight="h-48">
                  <DiagnosticaPanel
                    history={history}
                    events={events}
                    backoffAttivo={lastOk === false}
                    backoffDelayMs={pollDelayRef.current}
                  />
                </SectionBoundary>
              </div>

              {/* Altri modelli */}
              {otherModels.length > 0 ? (
                <section className="space-y-3" aria-label="Altri modelli">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-zinc-200">Altri modelli</h2>
                    <Separator className="flex-1 bg-white/[0.06]" />
                  </div>
                  <SectionBoundary title="Altri modelli" fallbackHeight="h-40">
                    <div className="grid gap-4 md:grid-cols-2">
                      {otherModels.map((m, i) => (
                        <ModelCard key={m.modelName} model={m} now={now} delay={i * 60} />
                      ))}
                    </div>
                  </SectionBoundary>
                </section>
              ) : null}

              {/* Card dettaglio "general" se ha dati extra (es. stato, boost) */}
              {general ? null : null}

              {/* JSON + dettagli tecnici (min-w-0: permette alle card di restringersi
                  sotto il min-content del <pre> JSON, evitando overflow orizzontale) */}
              <SectionBoundary title="Pannelli tecnici" fallbackHeight="h-48">
                <div id="tecnici" className="mm-anchor grid min-w-0 gap-4 lg:grid-cols-2">
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
              </SectionBoundary>

              {/* Registro eventi: reset, soglie, errori (archivio server I27) — filtri client-side I77 */}
              <div id="eventi" className="mm-anchor">
                <SectionBoundary title="Registro eventi" fallbackHeight="h-56">
                  <EventLog events={events} onClear={handleClearEvents} serverCount={serverEventsCount} />
                </SectionBoundary>
              </div>
            </>
            )
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              <RefreshCw className="mr-2 size-4 animate-spin" /> Sincronizzazione in corso…
            </div>
          ) : null}
        </main>

        {/* ----------------------------- Footer ----------------------------- */}
        {!compact ? (
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
        ) : null}
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
