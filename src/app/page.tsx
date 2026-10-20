"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ModelCard, MainWindows, windowShortLabel } from "@/components/quota-cards";
import { HistoryChart, StatsPanel, computeTrend, computeSessionTrend, HistoryPoint, TrendBadge } from "@/components/history-chart";
import { SettingsDialog, DashboardSettings, DEFAULT_SETTINGS } from "@/components/settings-dialog";
import { RawJsonPanel, TechInfo } from "@/components/tech-panels";
import { RegionAltPanel } from "@/components/region-alt-panel";
import { EventLog } from "@/components/event-log";
import { PanoramicTable } from "@/components/model-table";
import { LongTermAnalysis } from "@/components/analysis-panel";
import { DiagnosticaPanel } from "@/components/diagnostica-panel";
import { SectionNav } from "@/components/section-nav";
import { BottomNav } from "@/components/bottom-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { PrintReport } from "@/components/print-report";
import { KioskBar } from "@/components/kiosk-bar";
import { stampaReportSettimanale } from "@/lib/print";
import { APP_VERSION } from "@/lib/version";
import {
  isNightRome,
  kioskHref,
  KIOSK_DEFAULTS,
  loadKioskState,
  nextKioskView,
  readKioskMode,
  saveKioskState,
  type KioskState,
  type KioskView,
} from "@/lib/kiosk";
import { SectionBoundary } from "@/components/section-boundary";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrologioRoma, OraRomaViva } from "@/components/orologio-roma";
import { useOrologio } from "@/lib/orologio";
import { TabIdentity } from "@/lib/tab-identity";
import { filterHistoryByPreset, RANGE_PRESETS, type RangePreset } from "@/lib/interval";
import { readCompactMode } from "@/lib/compact";
import { ewmaProjection } from "@/lib/ewma";
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
import { Region, REGION_LABELS, UsageSnapshot, ApiError, chiaviPerRegione, findModel, parseUsageResponse, inferServerTime, regioneAlt } from "@/lib/minimax";
import { persistJson, setQuotaNotifier } from "@/lib/persist-json";
import { CHIAVE_STORICO } from "@/lib/storage-chiavi";
import { delayAfterFailure, ritardoPolling, tickAllaVisibilita } from "@/lib/backoff";
import { headerAdmin } from "@/lib/admin-token";
import { makeDemoSnapshot, makeDemoHistory, makeDemoModelHistory } from "@/lib/demo";
import {
  appendModelPoints,
  fetchServerModelHistory,
  historyForModel,
  flatPointFromGeneral,
  loadModelHistory,
  mergeModelHistories,
  MODEL_HISTORY_MAX,
  modelNamesOsservati,
  modelRowsToPoints,
  pushModelPointsToServer,
  saveModelHistory,
  type ModelHistoryPoint,
} from "@/lib/model-history";
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
  Monitor,
} from "lucide-react";

const SETTINGS_KEY = "mm-dash-settings-v1";
/* I124 — la chiave dello storico vive in lib/storage-chiavi.ts (fonte unica:
   l'azione «Svuota storico locale» del dialog cancella esattamente le stesse
   chiavi che la pagina scrive). */
const HISTORY_KEY = CHIAVE_STORICO;
const HISTORY_MAX = 600;

/* I100 — iscrizioni a sistemi esterni per useSyncExternalStore (livello modulo:
   stabili tra i render, rimosse allo smontaggio da React). */
function iscriviVisibilita(callback: () => void): () => void {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
function iscriviRete(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Risposta del proxy /api/minimax/usage (forma storica I3 + estensioni I18/I51/I53). */
interface RispostaProxy {
  ok: boolean;
  status?: number;
  data?: unknown;
  error?: ApiError;
  fetchedAt?: number;
  endpoint?: string;
  fallback?: { used: boolean; primaryEndpoint?: string; reason?: string };
  fallbackTried?: boolean;
}

/** I53 — messaggio di errore sintetico quando la fetch verso il proxy si rifiuta. */
function motivoRifiuto(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Errore imprevisto nella richiesta al proxy.";
}

/**
 * I96 — foglia viva del countdown «prossimo aggiornamento» (badge «Ultimo
 * rilevamento» dell'header): si abbona all'orologio condiviso a 1 Hz e si
 * aggiorna da sola; prima il testo ricalcolava msUntil con `now` della pagina
 * a ogni tick (60 re-render/min dell'intero albero per un countdown). */
function ProssimoRefresh({ scadenza }: { scadenza: number | null }) {
  const now = useOrologio();
  if (scadenza === null || now === 0) return null;
  const ms = msUntil(scadenza, now);
  return ms === null ? null : <> · prossimo tra {formatCountdown(ms)}</>;
}

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
  /* I96 — sonda di misura neutra per le verifiche Playwright: conta i render
     della pagina su window (misura prima/dopo documentata in docs/04 §3 I96). */
  if (typeof window !== "undefined") {
    const w = window as typeof window & { __mmRenderPagina?: number };
    // Sonda diagnostica deliberata: il contatore è lo strumento di misura dell'item.
    // eslint-disable-next-line react-hooks/immutability
    w.__mmRenderPagina = (w.__mmRenderPagina ?? 0) + 1;
  }
  const [mounted, setMounted] = React.useState(false);
  const [settings, setSettings] = React.useState<DashboardSettings>(DEFAULT_SETTINGS);
  const [snapshot, setSnapshot] = React.useState<UsageSnapshot | null>(null);
  /* I53 — seconda regione (solo VISUALIZZAZIONE: mai storico, analisi né avvisi soglia).
     Il successo/fallimento complessivo del polling resta deciso dalla primaria. */
  const [snapshotAlt, setSnapshotAlt] = React.useState<UsageSnapshot | null>(null);
  const [altError, setAltError] = React.useState<string | null>(null);
  const [altFetch, setAltFetch] = React.useState<number | null>(null);
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
  /* I87 — modalità kiosk/TV (vista per monitor dedicato): stato persistito in una
     chiave localStorage SEPARATA dalle impostazioni (mm-dash-kiosk-v1: il dialog
     «Salva» riscrive l'intero oggetto settings e cancellerebbe le preferenze) +
     vista corrente della rotazione (quote/grafico/analisi). */
  const [kioskState, setKioskState] = React.useState<KioskState>(KIOSK_DEFAULTS);
  const [kioskView, setKioskView] = React.useState<KioskView>("quote");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [now, setNow] = React.useState<number>(() => Date.now());
  /** I16: punti conservati sul server; null = server non ancora raggiunto. */
  const [serverCount, setServerCount] = React.useState<number | null>(null);
  /** I27: eventi conservati nell'archivio server; null = server non ancora raggiunto. */
  const [serverEventsCount, setServerEventsCount] = React.useState<number | null>(null);
  /** Mirror sincrono dello storico per costruire i punti senza race. */
  const historyRef = React.useRef<HistoryPoint[]>([]);
  /* I82 — storico quota per-modello (tutti i modelli osservati) + pivot delle analisi. */
  const [modelHistory, setModelHistory] = React.useState<ModelHistoryPoint[]>([]);
  const modelHistoryRef = React.useRef<ModelHistoryPoint[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>("general");

  /* Riferimenti per il confronto tra rilevamenti consecutivi (transizioni) */
  const prevSnapRef = React.useRef<UsageSnapshot | null>(null);
  const prevOkRef = React.useRef<boolean | null>(null);
  /* I53 — stato connessione precedente della SECONDA regione (eventi solo su transizione). */
  const prevOkAltRef = React.useRef<boolean | null>(null);

  /* I51 — stato dello scheduler con backoff: tentativi consecutivi falliti,
     ultimo Retry-After ricevuto e ritardo attualmente programmato. */
  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptRef = React.useRef(0);
  const lastRetryAfterRef = React.useRef<number | null>(null);
  /* I100 — epoch dell'ultimo rilevamento COMPLETATO: guida il tick al ritorno
     in visibilità (tick solo se i dati sono più vecchi di metà intervallo base). */
  const lastRilevamentoRef = React.useRef<number | null>(null);
  /* I90 — il ritardo programmato serve al render (badge countdown, diagnostica):
     è STATO, non ref (le ref non si leggono durante il render, regola v7).
     Il ref era scrutto solo qui e nell'effetto scheduler — vedi schedule(). */
  const [pollDelayMs, setPollDelayMs] = React.useState<number | null>(null);
  /* I18 — true se l'ultimo rilevamento riuscito è arrivato dall'endpoint
     alternativo coding_plan/remains (per gli eventi solo su transizione). */
  const fallbackActiveRef = React.useRef(false);
  /** Mirror sincrono delle impostazioni per scheduler/fetch senza re-trigger. */
  const settingsRef = React.useRef(settings);

  /* ----------------------------- init ----------------------------- */
  /* I90 — il caricamento persisted avviene dopo l'idratazione (l'SSR renderizza
     le impostazioni di default: nessun mismatch); le scritture di stato sono
     differite a un microtask — nessun setState sincrono nel corpo dell'effetto
     (react-hooks/set-state-in-effect v7). Il microtask gira nello stesso task,
     prima del prossimo frame: timing di paint invariato. */
  React.useEffect(() => {
    queueMicrotask(() => {
      const s = loadSettings();
      setSettings(s);
      const local = loadHistory();
      historyRef.current = local;
      setHistory(local);
      setEvents(loadEvents());
      const mh = loadModelHistory();
      modelHistoryRef.current = mh;
      setModelHistory(mh);
      setMounted(true);
      setNow(Date.now());
      /* I73 — la querystring si legge solo lato client (non esiste in SSR) */
      setCompact(readCompactMode(window.location.search));

      /* I87 — stato kiosk da localStorage; il parametro URL ?kiosk=1 FORZA
         l'attivazione (bookmark/direct-link sul monitor dedicato). */
      const ks = loadKioskState();
      if (readKioskMode(window.location.search) && !ks.enabled) {
        ks.enabled = true;
        saveKioskState(ks);
      }
      setKioskState(ks);
    });

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
      // I98 — gestione esplicita della quota (riduzione FIFO + notifica una tantum)
      persistJson(HISTORY_KEY, merged, { riduci: (h, n) => h.slice(-n), etichetta: "storico" });
    })();

    /* I82 — scarica lo storico per-modello conservato sul server e fondilo con
       quello locale: le analisi dei modelli non-general sopravvivono alla cache. */
    void (async () => {
      const server = await fetchServerModelHistory(4000);
      if (!server) return;
      const remote = modelRowsToPoints(server.rows);
      if (remote.length === 0) return;
      const merged = mergeModelHistories(modelHistoryRef.current, remote).slice(-MODEL_HISTORY_MAX);
      modelHistoryRef.current = merged;
      setModelHistory(merged);
      saveModelHistory(merged);
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

  /* I96 — orologio di PAGINA a MINUTO (tick 30 s): alimenta la finestra
     scorrevole di filteredHistory, la data «Oggi a Roma», il dimming notturno
     e il fuso del footer — tutti consumi che non guadagnano nulla dal secondo.
     I countdown al secondo sono foglie vive (useOrologio in lib/orologio.ts):
     prima questo intervallo a 1 s ri-renderizzava l'INTERO albero 60 volte al
     minuto anche a dati fermi (misura pre-refactoring: 60,9 render/min —
     docs/04 §3 I96). */
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* I98 — notifica quota storage UNA TANTUM per sessione: toast sonner +
     evento tecnico «error» nel registro (fuori da persist-json per evitare
     l'import ciclico e il loop «registro pieno che si notifica»). */
  React.useEffect(() => {
    setQuotaNotifier((notice) => {
      toast.warning("Storage locale pieno", { description: notice.message });
      setEvents(appendEvents(makeEvent("error", notice.message)));
    });
    return () => setQuotaNotifier(null);
  }, []);

  /* I100 — stato rete/visibilità REATTIVO per la causa d'attesa in Diagnostica.
     useSyncExternalStore (pattern I90: use-mobile/theme-toggle): il documento e
     navigator.onLine sono SISTEMI ESTERNI al render — niente setState in effect;
     il listener «online» che fa il TICK vive nello scheduler, qui solo snapshot.
     Server snapshot false = nessun mismatch di idratazione. */
  const tabNascosta = React.useSyncExternalStore(
    iscriviVisibilita,
    () => document.visibilityState === "hidden",
    () => false,
  );
  const reteOffline = React.useSyncExternalStore(
    iscriviRete,
    () => !navigator.onLine,
    () => false,
  );

  /* --------------------------- kiosk (I87) --------------------------- */
  const kioskAttivo = mounted && !compact && kioskState.enabled;
  /* Dimming EFFETTIVO: kiosk + preferenza + finestra notturna 22:00–06:59 Roma. */
  const nightDimAttivo = kioskAttivo && kioskState.nightDim && isNightRome(now);

  /* Persistenza dello stato kiosk a ogni cambio. */
  React.useEffect(() => {
    if (!mounted) return;
    saveKioskState(kioskState);
  }, [mounted, kioskState]);

  /* Barra indirizzi coerente con lo stato (replaceState: nessuna navigazione). */
  React.useEffect(() => {
    if (!mounted || compact) return;
    const href = kioskHref(window.location.href, kioskState.enabled);
    if (href !== window.location.href) window.history.replaceState(null, "", href);
  }, [mounted, compact, kioskState.enabled]);

  /* Uscita con Esc (criterio di accettazione: uscita sempre disponibile). */
  React.useEffect(() => {
    if (!kioskAttivo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKioskState((s) => ({ ...s, enabled: false }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kioskAttivo]);

  /* Rotazione automatica delle viste (solo con la rotazione attiva). */
  React.useEffect(() => {
    if (!kioskAttivo || !kioskState.rotation) return;
    const ms = Math.max(5, kioskState.rotationSeconds) * 1000;
    const id = setInterval(() => setKioskView((v) => nextKioskView(v)), ms);
    return () => clearInterval(id);
  }, [kioskAttivo, kioskState.rotation, kioskState.rotationSeconds]);

  /* --------------------------- fetching ---------------------------- */
  const pushHistory = React.useCallback((snap: UsageSnapshot) => {
    const general = findModel(snap, "general");
    const prev = historyRef.current;
    /* I91 — il punto flat descrive SOLO «general»: se il modello manca (es.
       JSON importato con soli modelli video) NON si registra nulla. La vecchia
       guardia `interval === null && weekly === null && general === undefined`
       era codice morto (con general assente i due valori sono UNDEFINED, non
       null) e produceva un punto finto {interval: 100, weekly: 100}, che le
       analisi (RESET_TARGET 85) leggevano come falso reset. La costruzione
       testabile del punto vive in lib/model-history.ts (flatPointFromGeneral). */
    const base = general
      ? flatPointFromGeneral(
          snap.fetchedAt,
          general.interval?.remainingPercent ?? null,
          general.weekly?.remainingPercent ?? null,
          prev,
        )
      : null;
    /* I124 — la marca d'origine dello snapshot segue il punto: le analisi
       escludono i demo (senzaDemo in cycles.ts; il server la conserva già
       dalla colonna source di UsagePoint). */
    const point = base ? { ...base, source: snap.source } : null;
    if (point) {
      // Deduplica: se l'ultimo punto è più vecchio di 20s accoda, altrimenti sostituisci
      const last = prev[prev.length - 1];
      const next = last && point.t - last.t < 20_000 ? [...prev.slice(0, -1), point] : [...prev, point];
      const trimmed = next.slice(-HISTORY_MAX);
      historyRef.current = trimmed;
      setHistory(trimmed);
      // I98 — gestione esplicita della quota (riduzione FIFO + notifica una tantum)
      persistJson(HISTORY_KEY, trimmed, { riduci: (h, n) => h.slice(-n), etichetta: "storico" });
      // I16: replica il punto sul server (fire-and-forget, silenzioso in caso di errore)
      pushPointToServer(point, {
        source: snap.source,
        region: snap.region,
        onTotal: (total) => setServerCount(total),
      });
    }

    /* I82 — storico per-modello: un punto per OGNI modello del campione (non
       solo general), stesse regole di dedup 20s; replica server dei soli nuovi. */
    const sample = {
      t: snap.fetchedAt,
      // I124 — origine del campione replicata sui punti per-modello.
      source: snap.source,
      models: snap.models.map((m) => ({
        name: m.modelName,
        interval: m.interval?.remainingPercent ?? null,
        weekly: m.weekly?.remainingPercent ?? null,
      })),
    };
    const { points: mhPoints, nuovi } = appendModelPoints(modelHistoryRef.current, sample);
    if (nuovi.length > 0) {
      modelHistoryRef.current = mhPoints;
      setModelHistory(mhPoints);
      saveModelHistory(mhPoints);
      pushModelPointsToServer(nuovi, { source: snap.source, region: snap.region });
    }
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
        /* I53 — coppie {region, key} da interrogare in questa campagna: la primaria
           SEMPRE, la secondaria solo con chiave dedicata diversa (dedup in lib). */
        const coppie = chiaviPerRegione(s);

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
            // I98 — gestione esplicita della quota (riduzione FIFO + notifica una tantum)
            persistJson(HISTORY_KEY, merged, { riduci: (h, n) => h.slice(-n), etichetta: "storico" });
          }
          // Registra anche i rilevamenti demo nello storico (locale + replica server, source "demo")
          pushHistory(snap);
          // I82 — backfill demo anche dello storico per-modello: rigenera snapshot
          // sintetici nel passato (stesse curve dei tick demo dal vivo) per OGNI
          // modello, così le analisi di «video» sono subito sensate.
          if (modelHistoryRef.current.length < 10) {
            const merged = mergeModelHistories(modelHistoryRef.current, makeDemoModelHistory());
            modelHistoryRef.current = merged;
            setModelHistory(merged);
            saveModelHistory(merged);
          }
          /* I53 — demo coerente: anche la seconda regione (se configurata) mostra
             dati simulati nel suo pannello. Nessun evento, nessuno storico per
             la secondaria (solo visualizzazione, design docs/03 §5.21). */
          if (coppie.length > 1) {
            setSnapshotAlt(makeDemoSnapshot(regioneAlt(s.region)));
            setAltError(null);
            setAltFetch(Date.now());
            prevOkAltRef.current = true;
          } else {
            setSnapshotAlt(null);
            setAltError(null);
            prevOkAltRef.current = null;
          }
          if (!silent) setLoading(false);
          return true;
        }

        /* I53 — campagna PARALLELA: una chiamata al proxy per ogni regione
           configurata. Il proxy per-regione resta INVARIATO: fallback I18 e
           ritenti transitori I51 vivono dentro ogni singola chiamata.
           allSettled: il guasto di una regione non nega mai l'esito dell'altra. */
        const esiti = await Promise.allSettled(
          coppie.map((c) =>
            fetch("/api/minimax/usage", {
              method: "POST",
              /* I121 — la guardia I95 protegge ANCHE la POST del proxy (api-protezione.ts:
                 «POST/DELETE degli archivi, POST proxy»): con ADMIN_TOKEN impostato il
                 server esige l'header anche qui, altrimenti ogni aggiunta fallirebbe con
                 401 («Scrittura protetta: serve l'header x-admin-token»). headerAdmin()
                 è SSR-safe e senza token restituisce {}: richiesta IDENTICA a prima. */
              headers: { "Content-Type": "application/json", ...headerAdmin() },
              body: JSON.stringify({ apiKey: c.key, region: c.region }),
            }).then((res) => res.json() as Promise<RispostaProxy>),
          ),
        );

        /* Smistamento per regione: la primaria è SEMPRE la prima coppia
           (contratto di chiaviPerRegione); una fetch rifiutata (server locale
           irraggiungibile) diventa una risposta d'errore sintetica. */
        const esitoPrimario = esiti[0];
        const json: RispostaProxy =
          esitoPrimario.status === "fulfilled"
            ? esitoPrimario.value
            : {
                ok: false,
                fetchedAt: Date.now(),
                error: { code: "client", message: motivoRifiuto(esitoPrimario.reason) },
              };

        let esitoAlt: { region: Region; risposta: RispostaProxy | null; motivo: string | null } | null = null;
        if (esiti.length > 1 && esiti[1]) {
          const e = esiti[1];
          esitoAlt = {
            region: coppie[1].region,
            risposta: e.status === "fulfilled" ? e.value : null,
            motivo: e.status === "rejected" ? motivoRifiuto(e.reason) : null,
          };
        }

        /* ---- I53 — SECONDA regione: solo visualizzazione + eventi di transizione.
             Nessun pushHistory, nessun impatto su backoff/banner/avvisi soglia. */
        if (esitoAlt) {
          setAltFetch(esitoAlt.risposta?.fetchedAt ?? Date.now());
          const r = esitoAlt.risposta;
          const regionAlt = esitoAlt.region;
          let msgAlt: string | null = null;
          let snapAlt: UsageSnapshot | null = null;
          if (r && r.ok && r.data) {
            try {
              snapAlt = parseUsageResponse(r.data, {
                source: "api",
                region: regionAlt,
                fetchedAt: r.fetchedAt,
              });
            } catch (e) {
              /* Errore di business dell'API secondaria (es. 1004: chiave della
                 regione sbagliata) o risposta non interpretabile. */
              msgAlt = e instanceof Error ? e.message : "Risposta della seconda regione non interpretabile.";
            }
          } else if (r && !r.ok) {
            msgAlt = r.error?.message ?? "Errore sconosciuto della seconda regione.";
          } else if (!r) {
            msgAlt = esitoAlt.motivo ?? "Errore imprevisto della seconda regione.";
          }
          setSnapshotAlt(snapAlt);
          setAltError(msgAlt);
          /* Eventi SOLO sulle transizioni di stato connessione (lezione I18). */
          if (snapAlt !== null) {
            if (prevOkAltRef.current !== true) {
              addEvents(
                makeEvent("info", `Seconda regione (${REGION_LABELS[regionAlt]}) connessa: monitoraggio parallelo attivo`),
              );
            }
            prevOkAltRef.current = true;
          } else if (msgAlt !== null) {
            if (prevOkAltRef.current !== false) {
              addEvents(
                makeEvent("error", `Rilevamento della seconda regione (${REGION_LABELS[regionAlt]}) fallito: ${msgAlt}`),
              );
            }
            prevOkAltRef.current = false;
          }
        } else {
          /* Secondaria non configurata (o chiave duplicata della primaria):
             il pannello si azzera, senza eventi. */
          setSnapshotAlt(null);
          setAltError(null);
          prevOkAltRef.current = null;
        }

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
    /* I53 — anche la chiave secondaria fa parte della connessione: cambiarla
       rifà UN fetch (come primaria/regione). */
    const connKey = settings.demoMode ? "demo" : `${settings.apiKey}|${settings.region}|${settings.apiKeyAlt}`;
    if (lastConnKeyRef.current === connKey) return;
    lastConnKeyRef.current = connKey;
    /* I126 — primo avvio senza chiave (la demo non è più il default): nessun
       fetch e nessun dialog auto-aperto dal guard di fetchData — la needsSetup
       card È lo stato iniziale del monitor. Il primo fetch parte al salvataggio,
       quando connKey cambia (chiave inserita o «Prova la demo»). */
    if (!settings.demoMode && !settings.apiKey) return;
    void fetchData(settingsRef.current);
  }, [mounted, settings.demoMode, settings.apiKey, settings.region, settings.apiKeyAlt, fetchData]);

  /* I51 — Aggiornamento automatico con backoff: al successo si torna
     all'intervallo scelto dall'utente; a ogni fallimento il ritardo cresce
     esponenzialmente con jitter (base 2s, cap 10 min, floor 1s) e non scende
     mai sotto il Retry-After dichiarato dal proxy. */
  React.useEffect(() => {
    if (!mounted || settings.refreshSeconds === 0) return;
    if (!settings.demoMode && !settings.apiKey) return;

    let cancelled = false;
    const base = Math.max(5, settings.refreshSeconds) * 1000;
    const schedule = (ms: number) => {
      /* I100 — a tab nascosta il polling si DILATA ×4 (non si sospende). */
      const effettivo = ritardoPolling(ms, document.visibilityState === "hidden");
      setPollDelayMs(effettivo);
      pollTimerRef.current = setTimeout(() => {
        if (!cancelled) void tick();
      }, effettivo);
    };
    const tick = async () => {
      const s = settingsRef.current;
      const ok = await fetchData(s, true);
      if (cancelled) return;
      lastRilevamentoRef.current = Date.now();
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
    /* I100 — tick immediato con reset del backoff (rientro rete / visibilità):
       l'attempt riparte da 0, così un eventuale nuovo fallimento non eredita
       il ritardo cresciuto della vecchia serie. */
    const tickImmediato = () => {
      if (cancelled) return;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollAttemptRef.current = 0;
      lastRetryAfterRef.current = null;
      void tick();
    };
    /* I100 — rientro della rete: tick immediato (prima: attesa del prossimo
       tick di backoff, fino a 10 min di monitor cieco dopo un'interruzione). */
    const onOnline = () => tickImmediato();
    /* I100 — ritorno in visibilità: tick solo se l'ultimo rilevamento è più
       vecchio della metà dell'intervallo base (la dilatazione ×4 può aver
       lasciato dati stantii, ma un tick a ogni flap sarebbe rumore). */
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (tickAllaVisibilita(lastRilevamentoRef.current, Date.now(), base)) tickImmediato();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    /* I90 — avvio differito di un tick: schedule (che scrive stato) gira in
       callback, non sincrono nel corpo dell'effetto (regola v7). Finché il
       ritardo programmato è null il badge usa il fallback all'intervallo base
       (stessa semantica del ref a null pre-refactoring). */
    const avvio = setTimeout(() => schedule(base), 0);

    return () => {
      cancelled = true;
      clearTimeout(avvio);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      setPollDelayMs(null);
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
      (!s.demoMode &&
        (s.apiKey !== settings.apiKey || s.region !== settings.region || s.apiKeyAlt !== settings.apiKeyAlt));
    setSettings(s);
    // I98 — gestione esplicita della quota: le impostazioni NON sono riducibili
    // (oggetto senza elementi FIFO): su storage pieno la scrittura rinuncia e
    // notifica una tantum; le impostazioni restano in memoria per la sessione.
    persistJson(SETTINGS_KEY, s, { etichetta: "impostazioni" });
    // I52 — il Service Worker legge i segreti dal localStorage solo via
    // postMessage: avvisalo che le impostazioni sono cambiate (fuori dal try:
    // l'evento deve partire comunque, il salvataggio è gestito da persistJson).
    window.dispatchEvent(new Event("mm-dash-settings-updated"));
    if (connChanged) {
      setSnapshot(null);
      setError(null);
      /* I53 — azzera anche la seconda regione: il prossimo fetch rigenera il pannello. */
      setSnapshotAlt(null);
      setAltError(null);
      setAltFetch(null);
      prevOkAltRef.current = null;
      /* I91 — azzera anche lo snapshot precedente del motore transizioni: senza
         reset, il primo snapshot della NUOVA connessione veniva confrontato con
         l'ultimo della VECCHIA (es. regione eu → cn o demo → api) e valori non
         confrontabili potevano innescare transizioni FITTIZIE (falsi «Reset
         rilevato» / toast di soglia) con eventi falsi nel registro. Con prev
         null, evaluateTransitions non produce nulla sul primo snapshot. */
      prevSnapRef.current = null;
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

  /* I96 — handler stabile per il pulsante di stampa nel grafico: identità
     costante tra i render, così React.memo su HistoryChart non si rompe. */
  const handleStampaReport = React.useCallback(() => {
    stampaReportSettimanale();
  }, []);

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
  /* I82 — modello pivot delle analisi (default «general»): grafico/ritmo/analisi
     seguono lo storico del modello scelto; Diagnostica resta su general completo. */
  const pivotModel =
    selectedModel === "general"
      ? general
      : snapshot?.models.find((m) => m.modelName.toLowerCase() === selectedModel.toLowerCase());
  const pivotHistory = React.useMemo(
    () => (selectedModel === "general" ? history : historyForModel(modelHistory, selectedModel)),
    [history, modelHistory, selectedModel],
  );
  /* I82 — modelli selezionabili: osservati nello storico per-modello ∪ snapshot corrente. */
  const modelli = React.useMemo(() => {
    const nomi = modelNamesOsservati(modelHistory);
    for (const m of snapshot?.models ?? []) {
      if (!nomi.some((n) => n.toLowerCase() === m.modelName.toLowerCase())) nomi.push(m.modelName);
    }
    return nomi;
  }, [modelHistory, snapshot]);
  /* I69 — storico filtrato per l'intervallo selezionato: la finestra scivola anche col
     solo scorrere del tempo (il tick `now` la aggiorna senza nuovi fetch). La
     Diagnostica resta deliberatamente sullo storico COMPLETO: guasti e blocchi
     teorici vanno giudicati sull'intera osservazione, non sull'ultimo tratto. */
  const filteredHistory = React.useMemo(
    () => filterHistoryByPreset(pivotHistory, rangePreset, now),
    [pivotHistory, rangePreset, now],
  );
  /* I82 — etichetta breve della finestra «interval» del pivot («5 ore», «24 ore»…). */
  const intervalLabel = React.useMemo(() => windowShortLabel(pivotModel?.interval), [pivotModel]);
  const trend = React.useMemo(() => computeTrend(filteredHistory, chartWindow), [filteredHistory, chartWindow]);
  /* I127 — ritmo della finestra corrente (sessione): la proiezione del verdetto,
     della pace e della card «Esaurimento previsto» usa QUESTA base quando c'è
     (≥2 rilevamenti nella finestra attiva), altrimenti ricade sul trend lungo;
     l'etichetta della base è sempre dichiarata nell'interfaccia. */
  const sessionTrend = React.useMemo(
    () => computeSessionTrend(filteredHistory, chartWindow),
    [filteredHistory, chartWindow],
  );
  /* I72 — proiezione EWMA (A/B): segue l'intervallo selezionato come il trend lineare */
  const ewma = React.useMemo(() => ewmaProjection(filteredHistory, chartWindow), [filteredHistory, chartWindow]);
  const serverTime = React.useMemo(() => (snapshot ? inferServerTime(snapshot.models) : null), [snapshot]);
  const sourceLabel = !lastEndpoint
    ? undefined
    : lastEndpoint.startsWith("json://")
      ? "Risposta JSON importata manualmente"
      : lastEndpoint.startsWith("demo://")
        ? "Modalità demo (nessuna chiamata reale)"
        : lastEndpoint;
  /* I96 — scadenza del prossimo aggiornamento (epoch): il countdown al secondo
     la renderizza la foglia ProssimoRefresh, non lo stato della pagina. */
  const prossimaScadenza =
    settings.refreshSeconds > 0 && lastFetch && !settings.demoMode
      ? lastFetch + (pollDelayMs ?? settings.refreshSeconds * 1000)
      : null;

  /* I126 — needsSetup richiede mounted: SSR e primo render mostrano lo skeleton
     (comportamento invariato rispetto a quando demoMode era il default), poi il
     microtask di init decide — card di setup per i visitatori senza chiave,
     dashboard immediata per chi ha già salvato le impostazioni (niente flash
     della card di setup agli utenti di ritorno). */
  const needsSetup = mounted && !settings.demoMode && !settings.apiKey;

  /* I53 — seconda regione attiva SOLO con chiave dedicata diversa dalla primaria
     (la stessa chiave incollata due volte produrrebbe 1004: dedup, pannello assente). */
  const altConfigurata = chiaviPerRegione(settings).length > 1;

  /* I67 — identità del tab: residuo 5h nel titolo + favicon dinamica */
  const residuoPerTab = general?.interval?.remainingPercent ?? null;

  /* Banner quota bassa (deriva solo dallo snapshot corrente) */
  const banner = React.useMemo<BannerInfo | null>(() => deriveBanner(snapshot, settings), [snapshot, settings]);

  /* Finestra selezionata nel grafico: reset e residuo per il verdetto di proiezione.
     I82 — dal MODELLO PIVOT (non sempre general): la proiezione segue il grafico. */
  const selectedWindow = chartWindow === "interval" ? pivotModel?.interval : pivotModel?.weekly;
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

  /* Banner quota bassa come JSX condiviso (vista completa + kiosk I87). */
  const bannerAlert = banner ? (
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
  ) : null;

  /* I82 — selettore del modello pivot (grafico/ritmo/analisi); nascosto con un solo modello osservato. */
  const modelSelector =
    modelli.length > 1 ? (
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Modello delle analisi">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Modello</span>
        <ToggleGroup
          type="single"
          value={selectedModel}
          onValueChange={(v) => {
            if (v !== "") setSelectedModel(v);
          }}
          className="gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1"
        >
          {modelli.map((m) => (
            <ToggleGroupItem
              key={m}
              value={m}
              aria-label={`Modello ${m}`}
              className="h-7 rounded-full border-0 px-3! text-[11px] font-medium text-zinc-400 data-[state=on]:bg-white/[0.10]! data-[state=on]:text-zinc-100!"
            >
              {m}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    ) : null;

  /* ---------------------------- render ----------------------------- */
  return (
    <div className="relative min-h-screen bg-[#09090b] text-zinc-100">
      {/* Decorazioni di sfondo (no-print: I75 — sulla carta non servono) */}
      <div
        aria-hidden
        className="no-print pointer-events-none fixed inset-0"
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
              {/* Orologio Roma — I96: foglia viva a 1 Hz (prima: prop now della pagina) */}
              <OrologioRoma />

              {/* I79 — l'ora è già visibile accanto: niente live region (annunciava
                  OGNI SECONDO — spam per uno screen reader) */}
              <span className="sr-only" aria-hidden>
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
              {/* I87 — ingresso nella modalità kiosk/TV (fuori da compact e kiosk) */}
              {!compact && !kioskAttivo ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Attiva modalità kiosk"
                  title="Modalità kiosk/TV (?kiosk=1)"
                  onClick={() => setKioskState((s) => ({ ...s, enabled: true }))}
                  className="h-9 w-9 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]!"
                >
                  <Monitor className="size-4" />
                </Button>
              ) : null}
              {/* I78 — alternanza rapida tema chiaro/scuro */}
              <ThemeToggle />
              {/* I73 — uscita dalla modalità compatta (torna alla dashboard completa) */}
              {compact ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Torna alla vista completa"
                  title="Torna alla vista completa"
                  onClick={() => {
                    // I73: ricarica completa INTENZIONALE per uscire dalla compatta
                    // (remount pulito di sezioni, grafici e osservatori) — non è
                    // navigazione SPA, quindi la regola @next/next non si applica.
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
                <ProssimoRefresh scadenza={prossimaScadenza} />
              </Badge>
            ) : null}
            {/* I79 — regione live del polling: annuncia ogni snapshot riuscito
                (aria-live polite, testo solo quando c'è un ultimo rilevamento) */}
            <p className="sr-only" aria-live="polite">
              {lastFetch ? `Dati aggiornati alle ${formatTimeRome(lastFetch)} (Roma).` : ""}
            </p>
            <TrendBadge trend={trend} />
          </div>
          ) : null}
        </header>

        {/* ------------------------------ Main ------------------------------ */}
        {/* I102 — destinazione dello skip-link («Salta al contenuto» in layout.tsx);
            tabIndex -1 rende il main focalizzabile programmaticamente, focus:outline-none
            evita l'anello gigante attorno all'intera pagina (il focus visibile resta
            sugli elementi interattivi, famiglia focus-visible I79). */}
        <main id="contenuto" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6 outline-none focus:outline-none sm:px-6">
        {/* I85 — navigazione sempre visibile durante lo scrolling: la nav è
            figlia DIRETTA di <main>, così il suo contenitore sticky è tutta la
            pagina. Un wrapper alto quanto la barra non le darebbe corsa e
            sfilerebbe. (I66 scrollspy; I74: su <md la sostituisce la barra
            inferiore; entrambe assenti in modalità compatta) */}
        {!compact && !kioskAttivo ? <SectionNav /> : null}

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
                    <MainWindows general={general} />
                  </SectionBoundary>
                </div>
                <div id="ritmo" className="mm-anchor space-y-3">
                  {rangeSelector}
                  <SectionBoundary title="Ritmo di consumo" fallbackHeight="h-56">
                    <RateChart history={filteredHistory} window={chartWindow} />
                  </SectionBoundary>
                </div>
              </>
            ) : kioskAttivo ? (
              /* I87 — VISTA KIOSK/TV: solo la vista selezionata (+ banner soglie);
                 niente nav, panoramiche, diagnostica, tecnici, registro né footer —
                 la KioskBar sticky lo sostituisce (uscita sempre disponibile).
                 Errore API e schermata di setup restano visibili sopra (fuori da qui). */
              <>
                {bannerAlert}

                {kioskView === "quote" ? (
                  <>
                    <MainWindows general={general} />
                    <p className="text-center text-xs text-zinc-500">
                      Oggi a Roma: <span className="font-medium text-zinc-400">{formatDateRome(now)}</span>
                    </p>
                  </>
                ) : null}

                {kioskView === "grafico" ? (
                  <div className="space-y-3">
                    {rangeSelector}
                    {modelSelector}
                    <SectionBoundary title="Grafico storico" fallbackHeight="h-64">
                      <HistoryChart
                        history={filteredHistory}
                        window={chartWindow}
                        onWindowChange={setChartWindow}
                        serverCount={serverCount}
                        intervalLabel={intervalLabel}
                      />
                    </SectionBoundary>
                    <SectionBoundary title="Statistiche di proiezione" fallbackHeight="h-40">
                      <StatsPanel
                        trend={trend}
                        sessionTrend={sessionTrend}
                        win={chartWindow}
                        resetAt={selectedWindowEnd}
                        remaining={selectedWindowRemaining}
                        serverCount={serverCount}
                        ewma={ewma}
                        intervalLabel={intervalLabel}
                      />
                    </SectionBoundary>
                    <SectionBoundary title="Ritmo di consumo" fallbackHeight="h-56">
                      <RateChart history={filteredHistory} window={chartWindow} intervalLabel={intervalLabel} />
                    </SectionBoundary>
                  </div>
                ) : null}

                {kioskView === "analisi" ? (
                  <SectionBoundary title="Analisi di lungo periodo" fallbackHeight="h-64">
                    <LongTermAnalysis
                      history={filteredHistory}
                      nomeModello={selectedModel}
                      intervalLabel={intervalLabel}
                    />
                  </SectionBoundary>
                ) : null}
              </>
            ) : (
            <>
              {/* Banner quota bassa (avvisi di soglia) — JSX condiviso con il kiosk (I87) */}
              {bannerAlert}

              {/* Anelli principali */}
              <div id="quota" className="mm-anchor">
                <SectionBoundary title="Finestre principali" fallbackHeight="h-64">
                  <MainWindows general={general} />
                </SectionBoundary>
              </div>

              {/* Data odierna a Roma */}
              <p className="text-center text-xs text-zinc-500">
                Oggi a Roma: <span className="font-medium text-zinc-400">{formatDateRome(now)}</span>
              </p>

              {/* Grafico + statistiche — I69: selettore intervallo e storico filtrato; I82: pivot per modello */}
              <div id="grafico" className="mm-anchor space-y-3">
                {rangeSelector}
                {modelSelector}
                <SectionBoundary title="Grafico storico" fallbackHeight="h-64">
                  <HistoryChart
                    history={filteredHistory}
                    window={chartWindow}
                    onWindowChange={setChartWindow}
                    serverCount={serverCount}
                    onStampaReport={handleStampaReport}
                    intervalLabel={intervalLabel}
                  />
                </SectionBoundary>
              </div>
              <SectionBoundary title="Statistiche di proiezione" fallbackHeight="h-40">
                <StatsPanel
                  trend={trend}
                  sessionTrend={sessionTrend}
                  win={chartWindow}
                  resetAt={selectedWindowEnd}
                  remaining={selectedWindowRemaining}
                  serverCount={serverCount}
                  ewma={ewma}
                  intervalLabel={intervalLabel}
                />
              </SectionBoundary>

              {/* I59 — ritmo di consumo %/h sotto il grafico (I69: storico filtrato; I82: pivot) */}
              <div id="ritmo" className="mm-anchor">
                <SectionBoundary title="Ritmo di consumo" fallbackHeight="h-56">
                  <RateChart history={filteredHistory} window={chartWindow} intervalLabel={intervalLabel} />
                </SectionBoundary>
              </div>

              {/* Vista panoramica: tutte le finestre del piano a confronto */}
              <div id="panoramica" className="mm-anchor">
                <SectionBoundary title="Vista panoramica" fallbackHeight="h-48">
                  <PanoramicTable models={snapshot.models} />
                </SectionBoundary>
                {/* I53 — panoramica della SECONDA regione (solo con 2ª chiave configurata):
                    solo visualizzazione, nessun impatto su storico/analisi/avvisi. */}
                {altConfigurata ? (
                  <div className="mt-4">
                    <RegionAltPanel
                      region={regioneAlt(settings.region)}
                      snapshot={snapshotAlt}
                      errore={altError}
                      fetchedAt={altFetch}
                    />
                  </div>
                ) : null}
              </div>

              {/* Analisi di lungo periodo: cicli, calendario, distribuzione, heatmap (I26 + batch abbellimenti)
                  I69: segue l'intervallo selezionato; la Diagnostica sotto resta sullo storico COMPLETO.
                  I82: segue il modello pivot — con pivot non-general la fonte server è lo storico per-modello. */}
              <div id="analisi" className="mm-anchor">
                <SectionBoundary title="Analisi di lungo periodo" fallbackHeight="h-64">
                  <LongTermAnalysis
                    history={filteredHistory}
                    nomeModello={selectedModel}
                    intervalLabel={intervalLabel}
                  />
                </SectionBoundary>
              </div>

              {/* I60/I62 — diagnostica: orologio dei reset + salute del monitor (storico completo, fuori da I69) */}
              <div id="diagnostica" className="mm-anchor">
                <SectionBoundary title="Diagnostica" fallbackHeight="h-48">
                  <DiagnosticaPanel
                    history={history}
                    events={events}
                    backoffAttivo={lastOk === false}
                    backoffDelayMs={pollDelayMs}
                    pollCausa={reteOffline ? "offline" : tabNascosta ? "tab-nascosto" : null}
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
                        <ModelCard key={m.modelName} model={m} delay={i * 60} />
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
                    altRegion={altConfigurata ? regioneAlt(settings.region) : null}
                    altOk={altConfigurata ? (altError ? false : snapshotAlt !== null ? true : null) : null}
                  />
                </div>
              </SectionBoundary>

              {/* Registro eventi: reset, soglie, errori (archivio server I27) — filtri client-side I77 */}
              <div id="eventi" className="mm-anchor">
                <SectionBoundary title="Registro eventi" fallbackHeight="h-56">
                  <EventLog events={events} onClear={handleClearEvents} serverCount={serverEventsCount} />
                </SectionBoundary>
              </div>

              {/* I75 — report settimanale stampabile: invisibile a schermo, unico contenuto
                  del foglio quando si stampa via «Stampa report settimanale» (body.print-report) */}
              <PrintReport history={history} win={chartWindow} demo={settings.demoMode} />
            </>
            )
          ) : loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              <RefreshCw className="mr-2 size-4 animate-spin" /> Sincronizzazione in corso…
            </div>
          ) : null}
        </main>

        {/* ----------------------------- Footer ----------------------------- */}
        {!compact && !kioskAttivo ? (
        <footer className="mt-auto border-t border-white/[0.06] bg-[#09090b]/80 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-zinc-600 sm:flex-row sm:px-6">
            <p>
              MiniMax Token Monitor · v {APP_VERSION} · dashboard non ufficiale per il Token Plan di{" "}
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
              <OraRomaViva />
            </p>
          </div>
        </footer>
        ) : null}

        {/* I86 — marcatore di versione (I46): fonte unica src/lib/version.ts, aggiornato
            a ogni passata documentale (convenzione nell'header del file) */}

        {/* I74 — barra di navigazione inferiore su mobile (fuori dalla vista compatta
            e dal kiosk I87) + spaziatore che evita che il footer resti coperto */}
        {!compact && !kioskAttivo ? (
          <>
            <BottomNav />
            <div aria-hidden className="h-16 md:hidden" />
          </>
        ) : null}

        {/* I87 — barra di controllo kiosk: sostituisce footer e nav mobile mentre il
            kiosk è attivo; sticky a fondo pagina così l'uscita resta SEMPRE raggiungibile */}
        {kioskAttivo ? (
          <KioskBar
            state={kioskState}
            view={kioskView}
            nightDimActive={nightDimAttivo}
            onView={setKioskView}
            onPrefs={(patch) => setKioskState((s) => ({ ...s, ...patch }))}
            onExit={() => setKioskState((s) => ({ ...s, enabled: false }))}
          />
        ) : null}
      </div>

      {/* I87 — dimming notturno (22:00–06:59 Roma): overlay sopra il contenuto (header
          incluso) e sotto la barra kiosk (z-50, resta leggibile); pointer-events-none.
          Overlay al posto di filter:brightness() perché il filtro su un antenato crea
          un containing block che sposta i figli fixed/sticky. */}
      {kioskAttivo ? (
        <div
          aria-hidden
          className="no-print pointer-events-none fixed inset-0 z-[45] bg-black transition-opacity duration-700"
          style={{ opacity: nightDimAttivo ? 0.55 : 0 }}
        />
      ) : null}

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
