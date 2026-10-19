"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Eye,
  EyeOff,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  ClipboardPaste,
  BellRing,
  Database,
  History,
  Palette,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { REGION_LABELS, regioneAlt, Region } from "@/lib/minimax";
import type { AlertThresholds, WindowThresholdKey } from "@/lib/usage-events";
import { svuotaStoricoLocale } from "@/lib/storage-chiavi";
import {
  cancellaTokenAdmin,
  esitoSondaAdmin,
  headerAdmin,
  leggiTokenAdmin,
  salvaTokenAdmin,
} from "@/lib/admin-token";
import { Textarea } from "@/components/ui/textarea";

export interface DashboardSettings {
  apiKey: string;
  /** I53 — chiave della SECONDA regione (regioneAlt); "" = monitoraggio solo primaria. */
  apiKeyAlt: string;
  region: Region;
  /** Intervallo di aggiornamento automatico in secondi; 0 = disattivato. */
  refreshSeconds: number;
  demoMode: boolean;
  /** Motore avvisi attivo (banner + toast). */
  alertsEnabled: boolean;
  /** Soglie di avviso per tipo di finestra (I28): 5h / 24h / settimanale. */
  thresholds: AlertThresholds;
  /** Notifica quando una finestra si resetta. */
  notifyReset: boolean;
  /** Usa anche le notifiche del browser (Notification API). */
  browserNotifications: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  apiKey: "",
  apiKeyAlt: "",
  region: "eu",
  refreshSeconds: 60,
  demoMode: true,
  alertsEnabled: true,
  thresholds: {
    h5: { warn: 25, crit: 10 },
    h24: { warn: 25, crit: 10 },
    weekly: { warn: 25, crit: 10 },
  },
  notifyReset: true,
  browserNotifications: false,
};

const REFRESH_OPTIONS = [
  { value: 0, label: "Manuale (disattivato)" },
  { value: 30, label: "Ogni 30 secondi" },
  { value: 60, label: "Ogni minuto" },
  { value: 300, label: "Ogni 5 minuti" },
];

const THRESHOLD_OPTIONS = [
  { value: 0, label: "Disattivata" },
  { value: 5, label: "5% residuo" },
  { value: 10, label: "10% residuo" },
  { value: 25, label: "25% residuo" },
  { value: 50, label: "50% residuo" },
];

/** I28 — righe della matrice soglie per finestra (tab Avvisi). */
const THRESHOLD_ROWS: { key: WindowThresholdKey; label: string; hint: string }[] = [
  { key: "h5", label: "5 ore", hint: "Modelli testo" },
  { key: "h24", label: "24 ore", hint: "Video" },
  { key: "weekly", label: "7 giorni", hint: "Tutti i modelli" },
];

/**
 * Opzioni della select con la soglia corrente sempre rappresentata: un valore
 * legacy migrato non allineato alle opzioni fisse (es. 40%) resterebbe altrimenti
 * invisibile nella select (Radix non trova l'item corrispondente).
 */
function thresholdOptionsFor(value: number): { value: number; label: string }[] {
  if (THRESHOLD_OPTIONS.some((o) => o.value === value)) return THRESHOLD_OPTIONS;
  return [...THRESHOLD_OPTIONS, { value, label: `${value}% residuo` }].sort((a, b) => a.value - b.value);
}

type SettingsTab = "connection" | "alerts" | "aspetto" | "data";

/** I107 — risposta di GET /api/persistenza (diagnostica senza credenziali). */
interface StatoPersistenza {
  ok: true;
  modalita: "locale" | "turso";
  host: string;
  test: { ok: boolean; latenzaMs: number };
  tabelle: { tabella: string; etichetta: string; righe: number }[];
  totale: number;
  generatoIl: string;
}

/** Forma standard degli errori delle route API (contratto I99). */
interface ErroreApi {
  ok: false;
  error: { code: string; message: string };
}

/* ================= I118 — Registro manutenzione (pannello tab Dati) =================
 * Visualizzazione NELL'APP del registro delle esecuzioni (I117): il dialog
 * consuma GET /api/manutenzione (SOLO LETTURA, stesso perimetro di
 * /api/persistenza) e rende il riepilogo del rapporto corrente (storage,
 * quota, integrità) + le ultime esecuzioni del cron/manuale — la prova
 * DURATURA che il cron è passato, ora anche senza passare da curl o dai
 * runtime logs della piattaforma. */

/** I118 — riga del registro (contratto `RigaRegistro` di manutenzione-db.ts). */
interface RigaRegistro {
  id: number;
  /** Istante dell'esecuzione (ISO 8601). */
  t: string;
  /** Chi ha innescato il ciclo: "cron" | "post" (altri valori: resi grezzi). */
  innesco: string;
  /** Esito del ciclo: "ok" | "fallito". */
  esito: string;
  /** Durata in ms (null se non misurata). */
  durataMs: number | null;
  /** Dettaglio compatto JSON (bytes, quota, integrità, eliminati, vacuum | errore | { grezzo }). */
  dettaglio: Record<string, unknown>;
}

/** I118 — risposta di GET /api/manutenzione: SOLO i campi consumati dal pannello. */
interface RispostaManutenzione {
  ok: true;
  manutenzione: {
    misura: { bytes: number };
    quota: { livello: string };
    integrita: { eseguito: boolean; ok: boolean };
  };
  ultimeEsecuzioni: RigaRegistro[];
}

/** I118 — specchio CLIENT di `formattaBytes` (manutenzione-db.ts è codice del
 * server: importarlo da un componente trascinerebbe prisma nel bundle del
 * browser). Stessa aritmetica 1024-based e stessa resa it-IT della fonte. */
export function formattaBytesClient(n: number): string {
  const valore = Math.max(0, Number(n) || 0);
  const unita: Array<[string, number]> = [
    ["B", 1],
    ["KB", 1024],
    ["MB", 1024 ** 2],
    ["GB", 1024 ** 3],
    ["TB", 1024 ** 4],
  ];
  let scelta = unita[0];
  for (const u of unita) if (valore >= u[1]) scelta = u;
  const q = valore / scelta[1];
  const dec = scelta[0] === "B" ? 0 : q >= 100 ? 0 : q >= 10 ? 1 : 2;
  return `${q.toFixed(dec).replace(".", ",")} ${scelta[0]}`;
}

/** I118 — durata leggibile: ms sotto il secondo, altrimenti secondi con la
 * virgola it-IT; non misurata → «—» (onesto, mai uno 0 che non c'è). */
export function formattaDurataRegistro(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

/** I118 — istante in forma compatta it-IT «gg/mm hh:mm»; data invalida o vuota
 * → testo grezzo (mai una data inventata: la lezione I111 vale anche qui). */
export function formattaQuandoRegistro(t: string): string {
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t;
  return d.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Lettore numerico sicuro del dettaglio (Record<string, unknown>): mai un
 * crash su contenuti imprevisti — stesso spirito della lettura I117 lato server.
 * null/undefined = campo NON applicabile (es. eliminati senza pulizia) → null:
 * Number(null) sarebbe 0 e produrrebbe un falso «eliminati 0». */
function numeroDettaglio(dettaglio: Record<string, unknown>, chiave: string): number | null {
  const v = dettaglio[chiave];
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Lettore testuale sicuro del dettaglio. */
function testoDettaglio(dettaglio: Record<string, unknown>, chiave: string): string | null {
  const v = dettaglio[chiave];
  return v === null || v === undefined ? null : String(v);
}

/** I118 — sintesi del dettaglio JSON: solo i campi PRESENTI nell'ordine del
 * rapporto (bytes · quota · integrità · eliminati · vacuum); dettaglio vuoto
 * o non interpretabile ({ grezzo }) → stringa vuota (la riga non si finge). */
export function sintesiDettaglio(dettaglio: Record<string, unknown>): string {
  const pezzi: string[] = [];
  const bytes = numeroDettaglio(dettaglio, "bytes");
  if (bytes !== null) pezzi.push(formattaBytesClient(bytes));
  const quota = testoDettaglio(dettaglio, "quota");
  if (quota !== null) pezzi.push(`quota ${quota}`);
  const integrita = testoDettaglio(dettaglio, "integrita");
  if (integrita !== null) pezzi.push(`integrità ${integrita}`);
  const eliminati = numeroDettaglio(dettaglio, "eliminati");
  if (eliminati !== null) pezzi.push(`eliminati ${eliminati.toLocaleString("it-IT")}`);
  const vacuum = testoDettaglio(dettaglio, "vacuum");
  if (vacuum !== null) pezzi.push(`vacuum ${vacuum}`);
  return pezzi.join(" · ");
}

/** I78 — opzioni del tema (next-themes: class su <html>, default scuro). */
const THEME_OPTIONS = [
  { value: "system", label: "Sistema (segue il dispositivo)" },
  { value: "light", label: "Chiaro" },
  { value: "dark", label: "Scuro" },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DashboardSettings;
  onSave: (s: DashboardSettings) => void;
  /** Importa una risposta JSON incollata manualmente dall'utente. */
  onImportJson: (raw: unknown) => void;
}

export function SettingsDialog({ open, onOpenChange, settings, onSave, onImportJson }: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();
  const [apiKey, setApiKey] = React.useState(settings.apiKey);
  const [apiKeyAlt, setApiKeyAlt] = React.useState(settings.apiKeyAlt);
  const [region, setRegion] = React.useState<Region>(settings.region);
  const [refreshSeconds, setRefreshSeconds] = React.useState(settings.refreshSeconds);
  const [demoMode, setDemoMode] = React.useState(settings.demoMode);
  const [alertsEnabled, setAlertsEnabled] = React.useState(settings.alertsEnabled);
  const [thresholds, setThresholds] = React.useState<AlertThresholds>(settings.thresholds);
  const [notifyReset, setNotifyReset] = React.useState(settings.notifyReset);
  const [browserNotifications, setBrowserNotifications] = React.useState(settings.browserNotifications);
  const [showKey, setShowKey] = React.useState(false);
  const [jsonText, setJsonText] = React.useState("");
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("connection");

  /* I107 — diagnostica della persistenza server (tab Dati): modalità attiva,
     host sanificato, test di connessione e conteggi. SOLO LETTURA: il database
     si sceglie dall'AMBIENTE (I106, docs/09 §6–§8) — l'app lo rende visibile,
     non lo cambia a runtime, e non vede mai le credenziali (restano nel server). */
  const [statoPersistenza, setStatoPersistenza] = React.useState<StatoPersistenza | null>(null);
  const [caricamentoPersistenza, setCaricamentoPersistenza] = React.useState(false);
  const [errorePersistenza, setErrorePersistenza] = React.useState<string | null>(null);

  const caricaStatoPersistenza = React.useCallback(async () => {
    setCaricamentoPersistenza(true);
    setErrorePersistenza(null);
    try {
      const res = await fetch("/api/persistenza", { cache: "no-store" });
      const body = (await res.json()) as StatoPersistenza | ErroreApi;
      if (!res.ok || !body.ok) {
        throw new Error(("error" in body && body.error?.message) || `HTTP ${res.status}`);
      }
      setStatoPersistenza(body);
    } catch (e) {
      setStatoPersistenza(null);
      setErrorePersistenza(e instanceof Error ? e.message : "Verifica non disponibile.");
    } finally {
      setCaricamentoPersistenza(false);
    }
  }, []);

  /* I118 — registro delle esecuzioni della manutenzione (tab Dati): LETTURA
     del rapporto corrente + ultime esecuzioni del cron/manuale. Stesso
     perimetro pubblico read-only di /api/persistenza (nessuna chiave, nessuna
     scrittura — dimostrato dalla suite); i due pannelli hanno stati INDIPENDENTI:
     un endpoint guasto non maschera l'altro. */
  const [registro, setRegistro] = React.useState<RispostaManutenzione | null>(null);
  const [caricamentoRegistro, setCaricamentoRegistro] = React.useState(false);
  const [erroreRegistro, setErroreRegistro] = React.useState<string | null>(null);

  /* I120 — token admin per le scritture protette dalla guardia I95: vive SOLO
     nel localStorage del browser (mm-dash-admin-token-v1, come la chiave
     MiniMax) e viene allegato alle repliche di storico/eventi/modelli. La
     «Verifica» sonda il server con POST /api/manutenzione e azione inesistente:
     la guardia gira PRIMA del parsing del body → 401 = rifiutato, 400 =
     accettato (o guardia spenta), 429 = accettato ma budget esaurito. La sonda
     non scrive nulla sul database ed è indipendente dal «Salva» del dialogo.
     L'inizializzatore LAZY legge il token già al primo render (SSR-safe: la
     lettura è guardata); il blocco di reset lo riallinea a ogni apertura. */
  const [tokenAdmin, setTokenAdmin] = React.useState(() => leggiTokenAdmin() ?? "");
  const [mostraToken, setMostraToken] = React.useState(false);
  const [esitoToken, setEsitoToken] = React.useState<{ ok: boolean; messaggio: string } | null>(null);
  const [verificaInCorso, setVerificaInCorso] = React.useState(false);

  const caricaRegistro = React.useCallback(async () => {
    setCaricamentoRegistro(true);
    setErroreRegistro(null);
    try {
      const res = await fetch("/api/manutenzione", { cache: "no-store" });
      const body = (await res.json()) as RispostaManutenzione | ErroreApi;
      if (!res.ok || !body.ok) {
        throw new Error(("error" in body && body.error?.message) || `HTTP ${res.status}`);
      }
      setRegistro(body);
    } catch (e) {
      setRegistro(null);
      setErroreRegistro(e instanceof Error ? e.message : "Registro non disponibile.");
    } finally {
      setCaricamentoRegistro(false);
    }
  }, []);

  /* I124 — svuota lo storico LOCALE (flat + per-modello) con conferma esplicita:
     i punti del server restano al sicuro e tornano al prossimo avvio
     (offline-first I16/I82: riscaricati e fusi al boot). Il ricaricamento della
     pagina riavvia il bootstrap: la serie locale riparte pulita — è la via per
     eliminare i punti demo legacy pre-I124, privi della marca `source`. */
  const svuotaStoricoConConferma = React.useCallback(() => {
    const conferma = window.confirm(
      "Svuotare lo storico locale del browser (flat + per-modello)?\n\n" +
        "I punti conservati sul server NON vengono toccati: al prossimo avvio vengono riscaricati e fusi di nuovo.",
    );
    if (!conferma) return;
    svuotaStoricoLocale();
    window.location.reload();
  }, []);

  /* Caricamento all'APERTURA del dialogo (non al mount dell'app): le chiamate
     partono in microtask come da passata I90 (regola react-hooks/set-state-in-effect).
     I118: anche il registro parte all'apertura, in parallelo alla persistenza. */
  React.useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      void caricaStatoPersistenza();
      void caricaRegistro();
    });
  }, [open, caricaStatoPersistenza, caricaRegistro]);

  /* I90 — il reset del modulo a ogni apertura usa l'aggiustamento di stato in
     fase di render (pattern React «adjusting state when a prop changes») al
     posto del setState sincrono in effect (regola v7): stessa condizione del
     pre-refactoring (apertura, o cambio impostazioni a dialogo aperto),
     stessi valori, applicati già al render di apertura. */
  const [prevReset, setPrevReset] = React.useState({ open, settings });
  if (prevReset.open !== open || prevReset.settings !== settings) {
    setPrevReset({ open, settings });
    if (open) {
      setApiKey(settings.apiKey);
      setApiKeyAlt(settings.apiKeyAlt);
      setRegion(settings.region);
      setRefreshSeconds(settings.refreshSeconds);
      setDemoMode(settings.demoMode);
      setAlertsEnabled(settings.alertsEnabled);
      setThresholds(settings.thresholds);
      setNotifyReset(settings.notifyReset);
      setBrowserNotifications(settings.browserNotifications);
      setShowKey(false);
      setJsonText("");
      setJsonError(null);
      setTokenAdmin(leggiTokenAdmin() ?? "");
      setMostraToken(false);
      setEsitoToken(null);
      setActiveTab("connection");
    }
  }

  /** Chiede il permesso per le notifiche del browser e registra l'esito. */
  const handleBrowserNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setBrowserNotifications(false);
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserNotifications(false);
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setBrowserNotifications(true);
      } else {
        setBrowserNotifications(false);
      }
    } catch {
      setBrowserNotifications(false);
    }
  };

  const handleImport = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonText);
      onImportJson(parsed);
      onOpenChange(false);
    } catch (e) {
      setJsonError(
        e instanceof Error
          ? `JSON non valido: ${e.message}`
          : "JSON non valido: controlla che la risposta sia completa.",
      );
    }
  };

  /** I28 — aggiorna una soglia della matrice per finestra. */
  const setWindowThreshold = (key: WindowThresholdKey, part: "warn" | "crit", value: number) => {
    setThresholds((prev) => ({ ...prev, [key]: { ...prev[key], [part]: value } }));
  };

  /* I120 — il token ha effetto IMMEDIATO (fuori dal «Salva impostazioni»): è un
     segreto operativo, non una preferenza della dashboard. Stringa vuota = rimozione. */
  const handleSalvaToken = () => {
    salvaTokenAdmin(tokenAdmin);
    const t = tokenAdmin.trim();
    setTokenAdmin(t);
    setEsitoToken(
      t
        ? { ok: true, messaggio: "Token salvato nel browser: verrà allegato alle scritture degli archivi." }
        : { ok: true, messaggio: "Token rimosso dal browser." },
    );
  };

  const handleRimuoviToken = () => {
    cancellaTokenAdmin();
    setTokenAdmin("");
    setEsitoToken({ ok: true, messaggio: "Token rimosso dal browser." });
  };

  /* I120 — sonda di identità: POST /api/manutenzione con azione inesistente.
     Nessuna scrittura (il body è rifiutato con 400 dopo la guardia I95); la
     sonda serve solo a distinguere 401 (token rifiutato) da 400 (identità
     accettata) — 429 significa identità accettata ma budget esaurito. */
  const handleVerificaToken = async () => {
    setVerificaInCorso(true);
    setEsitoToken(null);
    salvaTokenAdmin(tokenAdmin); // la prova usa il valore mostrato, non uno stantio
    try {
      const res = await fetch("/api/manutenzione", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headerAdmin() },
        body: JSON.stringify({ azione: "__sonda_identita_i120__" }),
      });
      setEsitoToken(esitoSondaAdmin(res.status));
    } catch {
      setEsitoToken({
        ok: false,
        messaggio: "Server non raggiungibile: la verifica non è conclusiva, riprova.",
      });
    } finally {
      setVerificaInCorso(false);
    }
  };

  const handleSave = () => {
    onSave({
      apiKey: apiKey.trim(),
      apiKeyAlt: apiKeyAlt.trim(),
      region,
      refreshSeconds,
      demoMode: demoMode || !apiKey.trim(),
      alertsEnabled,
      thresholds,
      notifyReset,
      browserNotifications,
    });
    onOpenChange(false);
  };

  const selectTriggerClass = "border-white/10 bg-white/[0.05] text-xs";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Finestra a colonna: header e tablist fissi, contenuto scrollabile, footer sempre visibile. */}
      <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden border-white/10 bg-zinc-950/95 p-0 text-zinc-100 shadow-2xl sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 border-b border-white/[0.06] px-5 pb-3 pr-12 pt-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-rose-400" />
            Impostazioni
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Connessione, avvisi di soglia e importazione dati.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as SettingsTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* Tablist sempre visibile, fuori dall'area scrollabile */}
          <div className="shrink-0 border-b border-white/[0.06] px-5 py-2.5">
            <TabsList className="grid h-8 w-full grid-cols-4 gap-1 border border-white/[0.06] bg-white/[0.03]! p-0.5">
              <TabsTrigger
                value="connection"
                className="h-7 gap-1.5 text-xs text-zinc-400! data-[state=active]:border-white/10! data-[state=active]:bg-white/[0.08]! data-[state=active]:text-zinc-100!"
              >
                <KeyRound className="size-3.5" />
                Connessione
              </TabsTrigger>
              <TabsTrigger
                value="alerts"
                className="h-7 gap-1.5 text-xs text-zinc-400! data-[state=active]:border-white/10! data-[state=active]:bg-white/[0.08]! data-[state=active]:text-zinc-100!"
              >
                <BellRing className="size-3.5" />
                Avvisi
              </TabsTrigger>
              <TabsTrigger
                value="aspetto"
                className="h-7 gap-1.5 text-xs text-zinc-400! data-[state=active]:border-white/10! data-[state=active]:bg-white/[0.08]! data-[state=active]:text-zinc-100!"
              >
                <Palette className="size-3.5" />
                Aspetto
              </TabsTrigger>
              <TabsTrigger
                value="data"
                className="h-7 gap-1.5 text-xs text-zinc-400! data-[state=active]:border-white/10! data-[state=active]:bg-white/[0.08]! data-[state=active]:text-zinc-100!"
              >
                <ClipboardPaste className="size-3.5" />
                Dati
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Area scrollabile */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            {/* ---------------- Tab 1: Connessione ---------------- */}
            <TabsContent value="connection" className="mt-0 space-y-4 outline-none">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="api-key" className="text-xs font-medium text-zinc-300">
                    Subscription Key
                  </Label>
                  <a
                    href="https://platform.minimax.io/console/plan"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300"
                  >
                    Trova nella console
                    <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showKey ? "text" : "password"}
                    placeholder="eyJhbGciOi… (incolla qui la chiave)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="border-white/10 bg-white/[0.05] pr-10 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Nascondi chiave" : "Mostra chiave"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  Salvata solo nel tuo browser e inoltrata esclusivamente al server di questa dashboard.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-zinc-300">Regione API</Label>
                  <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                      {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">
                          {REGION_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-zinc-500">Per l&apos;Europa usa minimax.io</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-zinc-300">Aggiornamento automatico</Label>
                  <Select
                    value={String(refreshSeconds)}
                    onValueChange={(v) => setRefreshSeconds(Number(v))}
                  >
                    <SelectTrigger className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                      {REFRESH_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-zinc-500">Richieste frequenti possono innescare limiti</p>
                </div>
              </div>

              {/* I53 — seconda chiave per il monitoraggio PARALLELO dell'altra regione.
                  L'etichetta segue la select: la secondaria è sempre la regione opposta. */}
              <div className="space-y-2">
                <Label htmlFor="api-key-alt" className="text-xs font-medium text-zinc-300">
                  Seconda regione — {REGION_LABELS[regioneAlt(region)]}
                </Label>
                <div className="relative">
                  <Input
                    id="api-key-alt"
                    type={showKey ? "text" : "password"}
                    placeholder="Chiave dell'altra regione (opzionale)"
                    value={apiKeyAlt}
                    onChange={(e) => setApiKeyAlt(e.target.value)}
                    className="border-white/10 bg-white/[0.05] pr-10 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Nascondi seconda chiave" : "Mostra seconda chiave"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-500">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-500" />
                  Con una chiave qui, ogni aggiornamento interroga ENTRAMBE le regioni in parallelo
                  (panoramica della seconda nella sezione Panoramica); storico, avvisi e analisi
                  restano della regione primaria. Lascia vuoto per monitorare solo {REGION_LABELS[region]}.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="demo-mode" className="text-xs text-zinc-300">
                    Modalità demo
                  </Label>
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Dati simulati realistici senza chiamare l&apos;API.
                  </p>
                </div>
                <Switch id="demo-mode" checked={demoMode} onCheckedChange={setDemoMode} />
              </div>
            </TabsContent>

            {/* ---------------- Tab 2: Avvisi ---------------- */}
            <TabsContent value="alerts" className="mt-0 space-y-3 outline-none">
              <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="alerts-enabled" className="text-xs text-zinc-300">
                    Avvisi di soglia attivi
                  </Label>
                  <p className="text-[11px] leading-relaxed text-zinc-500">
                    Banner fisso + notifica a comparsa al superamento di una soglia.
                  </p>
                </div>
                <Switch id="alerts-enabled" checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
              </div>

              <div className={cn("space-y-3", !alertsEnabled && "pointer-events-none opacity-50")}>
                {/* I28 — matrice soglie per tipo di finestra */}
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="text-xs font-medium text-zinc-300">Soglie per finestra</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
                    Percentuale residua al di sotto della quale scatta l&apos;avviso; 0 = disattivata.
                  </p>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Finestra</span>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Attenzione</span>
                    <span className="text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Critica</span>
                    {THRESHOLD_ROWS.map((row) => (
                      <React.Fragment key={row.key}>
                        <div className="min-w-0 pr-1">
                          <p className="text-xs text-zinc-300">{row.label}</p>
                          <p className="text-[10px] leading-tight text-zinc-600">{row.hint}</p>
                        </div>
                        {(["warn", "crit"] as const).map((part) => (
                          <Select
                            key={part}
                            value={String(thresholds[row.key][part])}
                            onValueChange={(v) => setWindowThreshold(row.key, part, Number(v))}
                            disabled={!alertsEnabled}
                          >
                            <SelectTrigger className={cn(selectTriggerClass, "h-8 w-28 justify-between")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                              {thresholdOptionsFor(thresholds[row.key][part]).map((o) => (
                                <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="notify-reset" className="text-xs text-zinc-300">
                      Avvisa al reset delle finestre
                    </Label>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Notifica quando una finestra torna al 100% (reset tra due rilevamenti).
                    </p>
                  </div>
                  <Switch
                    id="notify-reset"
                    checked={notifyReset}
                    onCheckedChange={setNotifyReset}
                    disabled={!alertsEnabled}
                  />
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="browser-notifications" className="text-xs text-zinc-300">
                      Notifiche del browser
                    </Label>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Avvisi di sistema anche con il tab in secondo piano.
                    </p>
                  </div>
                  <Switch
                    id="browser-notifications"
                    checked={browserNotifications}
                    onCheckedChange={(v) => void handleBrowserNotifications(v)}
                    disabled={!alertsEnabled}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ---------------- Tab 3: Aspetto (I78) ---------------- */}
            <TabsContent value="aspetto" className="mt-0 space-y-4 outline-none">
              <div className="space-y-2">
                <Label htmlFor="theme-select" className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <Palette className="size-3.5 text-zinc-400" />
                  Tema dell&apos;interfaccia
                </Label>
                <Select value={theme ?? "dark"} onValueChange={(v) => setTheme(v)}>
                  <SelectTrigger id="theme-select" className={selectTriggerClass}>
                    <SelectValue placeholder="Scegli un tema" />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    {THEME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  La scelta si applica subito e resta salvata in questo browser (indipendente dalle altre
                  impostazioni). Il tema chiaro è pensato per stanze illuminate o stampa; grafici e blocchi
                  JSON restano leggibili su entrambi i fondi.
                </p>
              </div>

              <Separator className="bg-white/[0.06]" />

              <div className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500">
                <Sun className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                <p>
                  Scorciatoia: l&apos;icona sole/luna nell&apos;intestazione alterna subito chiaro e scuro senza
                  aprire questa finestra.
                </p>
              </div>
            </TabsContent>

            {/* ---------------- Tab 4: Dati ---------------- */}
            <TabsContent value="data" className="mt-0 space-y-4 outline-none">
              <div className="space-y-2">
                <Label htmlFor="json-paste" className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <ClipboardPaste className="size-3.5 text-zinc-400" />
                  Importa una risposta JSON
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Incolla la risposta di <span className="font-mono text-zinc-400">/v1/token_plan/remains</span> per
                  analizzarla nella dashboard senza configurare la chiave.
                </p>
                <Textarea
                  id="json-paste"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder='{ "base_resp": { "status_code": 0, … }, "model_remains": [ … ] }'
                  rows={5}
                  className="border-white/10 bg-white/[0.05] font-mono text-[11px] text-zinc-100 placeholder:text-zinc-600"
                  spellCheck={false}
                />
                {jsonError ? <p className="text-[11px] font-medium text-rose-400">{jsonError}</p> : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleImport}
                  disabled={!jsonText.trim()}
                  className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
                >
                  <ClipboardPaste className="size-3.5" />
                  Analizza il JSON incollato
                </Button>
              </div>

              <Separator className="bg-white/[0.06]" />

              {/* ---------------- I107 — Persistenza server ---------------- */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <Database className="size-3.5 text-zinc-400" />
                    Persistenza server
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void caricaStatoPersistenza()}
                    disabled={caricamentoPersistenza}
                    aria-label="Aggiorna persistenza"
                    className="h-7 px-2 text-[11px] text-zinc-400 hover:bg-white/5! hover:text-zinc-200!"
                  >
                    {caricamentoPersistenza ? "Verifica…" : "Aggiorna"}
                  </Button>
                </div>
                {errorePersistenza ? (
                  <p className="text-[11px] font-medium text-rose-400">
                    Verifica non disponibile: {errorePersistenza}
                  </p>
                ) : statoPersistenza ? (
                  <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-500">Modalità attiva</span>
                      <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-medium text-zinc-200">
                        {statoPersistenza.modalita === "turso" ? "Turso (libsql)" : "SQLite locale"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-500">Database</span>
                      <span
                        className="max-w-[220px] truncate font-mono text-zinc-400"
                        title={statoPersistenza.host}
                      >
                        {statoPersistenza.host}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-500">Test di connessione</span>
                      <span className="text-zinc-300">
                        {statoPersistenza.test.ok
                          ? `ok · ${statoPersistenza.test.latenzaMs} ms`
                          : "fallito"}
                      </span>
                    </div>
                    <Separator className="bg-white/[0.06]" />
                    {statoPersistenza.tabelle.map((t) => (
                      <div key={t.tabella} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-zinc-500">{t.etichetta}</span>
                        <span className="font-mono text-zinc-300">{t.righe.toLocaleString("it-IT")}</span>
                      </div>
                    ))}
                    {/* I107-fix2/fix3 — nota onesta del ramo locale: su serverless il file è
                    effimero (schema ricreato a ogni avvio, dati non sopravvivono), la durata
                    richiede Turso. */}
                    {statoPersistenza.modalita === "locale" && (
                      <p className="text-[10px] leading-relaxed text-zinc-600">
                        Il file SQLite vive sul filesystem del server: in ambienti serverless (es. Vercel,
                        dove solo /tmp è scrivibile) è effimero — lo schema viene ricreato a ogni avvio,
                        ma i dati non sopravvivono all&apos;istanza. Per la persistenza duratura imposta
                        TURSO_DATABASE_URL (README §Persistenza).
                      </p>
                    )}
                    <p className="pt-1 text-[10px] leading-relaxed text-zinc-600">
                      Il database si sceglie dalle variabili d&apos;ambiente del server (locale = SQLite,
                      cloud = Turso): questa verifica mostra solo modalità, host e conteggi — le
                      credenziali restano nell&apos;ambiente e non arrivano mai al browser.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">Verifica in corso…</p>
                )}
              </div>

              <Separator className="bg-white/[0.06]" />

              {/* ---------------- I118 — Registro manutenzione ---------------- */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                    <History className="size-3.5 text-zinc-400" />
                    Registro manutenzione
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void caricaRegistro()}
                    disabled={caricamentoRegistro}
                    aria-label="Aggiorna registro"
                    className="h-7 px-2 text-[11px] text-zinc-400 hover:bg-white/5! hover:text-zinc-200!"
                  >
                    {caricamentoRegistro ? "Verifica…" : "Aggiorna"}
                  </Button>
                </div>
                {erroreRegistro ? (
                  <p className="text-[11px] font-medium text-rose-400">
                    Registro non disponibile: {erroreRegistro}
                  </p>
                ) : registro ? (
                  <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-3">
                    {/* Riepilogo del rapporto corrente (GET read-only: misura, quota, integrità). */}
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-500">Storage attuale</span>
                      <span className="font-mono text-zinc-300">
                        {formattaBytesClient(registro.manutenzione.misura.bytes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-zinc-500">Quota / integrità</span>
                      <span className="text-zinc-300">
                        {registro.manutenzione.quota.livello} ·{" "}
                        {registro.manutenzione.integrita.eseguito
                          ? registro.manutenzione.integrita.ok
                            ? "ok"
                            : "ko"
                          : "omessa"}
                      </span>
                    </div>
                    <Separator className="bg-white/[0.06]" />
                    {registro.ultimeEsecuzioni.length === 0 ? (
                      <p className="text-[11px] text-zinc-500">
                        Nessuna esecuzione registrata: il cron popola il registro a ogni run notturno
                        (02:30 UTC) e l&apos;azione «manutenzione» a ogni uso manuale.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {registro.ultimeEsecuzioni.map((r) => {
                          const sintesi = sintesiDettaglio(r.dettaglio);
                          const errore = testoDettaglio(r.dettaglio, "errore");
                          return (
                            <div
                              key={r.id}
                              className="space-y-0.5 border-b border-white/[0.04] pb-1.5 last:border-b-0 last:pb-0"
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="shrink-0 rounded border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-medium text-zinc-300">
                                    {r.innesco === "post" ? "manuale" : r.innesco}
                                  </span>
                                  <span
                                    className={cn(
                                      r.esito === "ok"
                                        ? "text-emerald-400"
                                        : r.esito === "fallito"
                                          ? "font-medium text-rose-400"
                                          : "text-zinc-300",
                                    )}
                                  >
                                    {r.esito}
                                  </span>
                                  <span className="truncate text-zinc-500">
                                    {formattaDurataRegistro(r.durataMs)}
                                  </span>
                                </span>
                                <span className="shrink-0 font-mono text-zinc-400">
                                  {formattaQuandoRegistro(r.t)}
                                </span>
                              </div>
                              {sintesi ? (
                                <p className="pl-0.5 text-[10px] leading-relaxed text-zinc-500">{sintesi}</p>
                              ) : null}
                              {errore ? (
                                <p className="pl-0.5 text-[10px] leading-relaxed text-rose-400/90">{errore}</p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Nota onesta (stesso spirito di I117): cap FIFO alla scrittura, best-effort,
                    azioni parziali fuori dal registro — il pannello MOSTRA, non promette. */}
                    <p className="pt-1 text-[10px] leading-relaxed text-zinc-600">
                      Il registro conserva le ultime 100 esecuzioni (cap FIFO, scritto dal cron e
                      dall&apos;azione «manutenzione» — le azioni parziali pulizia/vacuum non si
                      registrano). La scrittura è best-effort: se il database rifiuta l&apos;INSERT la
                      riga manca, ma l&apos;esito resta nei runtime logs della piattaforma
                      ([manutenzione-cron]).
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">Verifica in corso…</p>
                )}
              </div>

              <Separator className="bg-white/[0.06]" />

              {/* ---------------- I124 — Storico locale (browser) ---------------- */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <History className="size-3.5 text-zinc-400" />
                  Storico locale (browser)
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Il browser conserva fino a 600 rilevamenti flat e 2.000 per-modello (localStorage).
                  Lo svuotamento rimuove SOLO i punti locali: l&apos;archivio server non è toccato e
                  viene riscaricato al prossimo avvio. Utile per ripartire da una serie pulita —
                  ad esempio per eliminare i punti demo precedenti a I124, non discriminabili a
                  posteriori perché privi della marca d&apos;origine.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={svuotaStoricoConConferma}
                  aria-label="Svuota lo storico locale del browser"
                  className="h-7 gap-1.5 border-white/10 bg-white/[0.04] text-[11px] text-zinc-300 hover:bg-white/[0.08]!"
                >
                  Svuota storico locale
                </Button>
              </div>

              <Separator className="bg-white/[0.06]" />

              {/* ---------------- I120 — Sicurezza scritture (ADMIN_TOKEN) ---------------- */}
              <div className="space-y-2">
                <Label htmlFor="admin-token" className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <ShieldCheck className="size-3.5 text-zinc-400" />
                  Sicurezza scritture
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Se il server ha la variabile <span className="font-mono text-zinc-400">ADMIN_TOKEN</span>, ogni
                  scrittura sugli archivi deve presentare quel token. Inseriscilo qui: resta nel localStorage
                  del browser (come la chiave API — mai nel codice, mai nei log) e viene allegato
                  automaticamente alle repliche di storico, eventi e punti per-modello.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    id="admin-token"
                    type={mostraToken ? "text" : "password"}
                    value={tokenAdmin}
                    onChange={(e) => setTokenAdmin(e.target.value)}
                    placeholder="vuoto = nessun token inviato"
                    autoComplete="off"
                    spellCheck={false}
                    className="border-white/10 bg-white/[0.05] font-mono text-[11px] text-zinc-100 placeholder:text-zinc-600"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMostraToken((v) => !v)}
                    aria-label={mostraToken ? "Nascondi token" : "Mostra token"}
                    className="h-8 shrink-0 px-2 text-zinc-400 hover:bg-white/5! hover:text-zinc-200!"
                  >
                    {mostraToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSalvaToken}
                    className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
                  >
                    <ShieldCheck className="size-3.5" />
                    Salva token
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleVerificaToken()}
                    disabled={verificaInCorso}
                    className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]!"
                  >
                    {verificaInCorso ? "Verifica…" : "Verifica col server"}
                  </Button>
                  {tokenAdmin.trim() ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRimuoviToken}
                      className="h-8 px-2 text-[11px] text-zinc-400 hover:bg-white/5! hover:text-zinc-200!"
                    >
                      Rimuovi
                    </Button>
                  ) : null}
                </div>
                {esitoToken ? (
                  <p className={cn("text-[11px] font-medium", esitoToken.ok ? "text-emerald-400" : "text-rose-400")}>
                    {esitoToken.messaggio}
                  </p>
                ) : null}
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  «Verifica col server» invia un&apos;azione di manutenzione inesistente: il server la rifiuta
                  senza toccare il database — serve solo a confermare l&apos;identità (401 = token rifiutato,
                  400 = accettato). Il salvataggio è immediato e indipendente dal pulsante «Salva
                  impostazioni».
                </p>
              </div>

              <Separator className="bg-white/[0.06]" />

              <div className="flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500">
                <Database className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
                <p>
                  Chiave, impostazioni e storico dei rilevamenti (max 600 punti) risiedono esclusivamente nel
                  localStorage del tuo browser: nessun dato viene inviato a servizi di terze parti.
                </p>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer sempre visibile */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
          <p className="hidden truncate text-[11px] text-zinc-600 sm:block">
            Le modifiche si applicano al salvataggio
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-zinc-400 hover:bg-white/5! hover:text-zinc-200!"
            >
              Annulla
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              className="bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:from-rose-400 hover:to-orange-400"
            >
              Salva impostazioni
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
