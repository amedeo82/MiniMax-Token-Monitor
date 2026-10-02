"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, KeyRound, ExternalLink, ShieldCheck, ClipboardPaste, BellRing } from "lucide-react";
import { REGION_LABELS, Region } from "@/lib/minimax";
import { Textarea } from "@/components/ui/textarea";

export interface DashboardSettings {
  apiKey: string;
  region: Region;
  /** Intervallo di aggiornamento automatico in secondi; 0 = disattivato. */
  refreshSeconds: number;
  demoMode: boolean;
  /** Motore avvisi attivo (banner + toast). */
  alertsEnabled: boolean;
  /** Soglia "attenzione" in % residua; 0 = disattivata. */
  alertThresholdWarn: number;
  /** Soglia "critica" in % residua; 0 = disattivata. */
  alertThresholdCrit: number;
  /** Notifica quando una finestra si resetta. */
  notifyReset: boolean;
  /** Usa anche le notifiche del browser (Notification API). */
  browserNotifications: boolean;
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  apiKey: "",
  region: "eu",
  refreshSeconds: 60,
  demoMode: true,
  alertsEnabled: true,
  alertThresholdWarn: 25,
  alertThresholdCrit: 10,
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

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: DashboardSettings;
  onSave: (s: DashboardSettings) => void;
  /** Importa una risposta JSON incollata manualmente dall'utente. */
  onImportJson: (raw: unknown) => void;
}

export function SettingsDialog({ open, onOpenChange, settings, onSave, onImportJson }: SettingsDialogProps) {
  const [apiKey, setApiKey] = React.useState(settings.apiKey);
  const [region, setRegion] = React.useState<Region>(settings.region);
  const [refreshSeconds, setRefreshSeconds] = React.useState(settings.refreshSeconds);
  const [demoMode, setDemoMode] = React.useState(settings.demoMode);
  const [alertsEnabled, setAlertsEnabled] = React.useState(settings.alertsEnabled);
  const [alertThresholdWarn, setAlertThresholdWarn] = React.useState(settings.alertThresholdWarn);
  const [alertThresholdCrit, setAlertThresholdCrit] = React.useState(settings.alertThresholdCrit);
  const [notifyReset, setNotifyReset] = React.useState(settings.notifyReset);
  const [browserNotifications, setBrowserNotifications] = React.useState(settings.browserNotifications);
  const [showKey, setShowKey] = React.useState(false);
  const [jsonText, setJsonText] = React.useState("");
  const [jsonError, setJsonError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setApiKey(settings.apiKey);
      setRegion(settings.region);
      setRefreshSeconds(settings.refreshSeconds);
      setDemoMode(settings.demoMode);
      setAlertsEnabled(settings.alertsEnabled);
      setAlertThresholdWarn(settings.alertThresholdWarn);
      setAlertThresholdCrit(settings.alertThresholdCrit);
      setNotifyReset(settings.notifyReset);
      setBrowserNotifications(settings.browserNotifications);
      setShowKey(false);
      setJsonText("");
      setJsonError(null);
    }
  }, [open, settings]);

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

  const handleSave = () => {
    onSave({
      apiKey: apiKey.trim(),
      region,
      refreshSeconds,
      demoMode: demoMode || !apiKey.trim(),
      alertsEnabled,
      alertThresholdWarn,
      alertThresholdCrit,
      notifyReset,
      browserNotifications,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-950/95 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-rose-400" />
            Impostazioni
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configura la Subscription Key del Token Plan e le preferenze della dashboard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="text-xs font-medium text-zinc-300">
              Subscription Key
            </Label>
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
              La chiave è salvata solo in locale nel tuo browser (localStorage) e viene inviata esclusivamente al
              server di questa dashboard, che la inoltra all&apos;API MiniMax.
            </p>
            <a
              href="https://platform.minimax.io/console/plan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400 hover:text-rose-300"
            >
              Trova la Subscription Key nella console MiniMax
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-300">Regione API</Label>
              <Select value={region} onValueChange={(v) => setRegion(v as Region)}>
                <SelectTrigger className="border-white/10 bg-white/[0.05] text-xs">
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
                <SelectTrigger className="border-white/10 bg-white/[0.05] text-xs">
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
              <p className="text-[11px] text-zinc-500">Troppe richieste possono innescare limiti di frequenza</p>
            </div>
          </div>

          <Separator className="bg-white/[0.06]" />

          {/* ---------------- Avvisi e notifiche ---------------- */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5">
              <BellRing className="size-3.5 text-amber-400" />
              <Label className="text-xs font-medium text-zinc-300">Avvisi di soglia</Label>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="alerts-enabled" className="text-xs text-zinc-400">
                  Avvisa quando la quota scende sotto le soglie
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Banner fisso + notifica a comparsa al superamento di una soglia e al reset delle finestre.
                </p>
              </div>
              <Switch id="alerts-enabled" checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Soglia di attenzione</Label>
                <Select
                  value={String(alertThresholdWarn)}
                  onValueChange={(v) => setAlertThresholdWarn(Number(v))}
                  disabled={!alertsEnabled}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.05] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    {THRESHOLD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">Soglia critica</Label>
                <Select
                  value={String(alertThresholdCrit)}
                  onValueChange={(v) => setAlertThresholdCrit(Number(v))}
                  disabled={!alertsEnabled}
                >
                  <SelectTrigger className="border-white/10 bg-white/[0.05] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                    {THRESHOLD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)} className="text-xs">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="notify-reset" className="text-xs text-zinc-400">
                  Avvisa al reset delle finestre
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Notifica quando una finestra torna al 100% (reset rilevato tra due rilevamenti).
                </p>
              </div>
              <Switch id="notify-reset" checked={notifyReset} onCheckedChange={setNotifyReset} disabled={!alertsEnabled} />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="browser-notifications" className="text-xs text-zinc-400">
                  Notifiche del browser
                </Label>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Mostra gli avvisi anche come notifiche di sistema, anche quando il tab è in secondo piano.
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

          <Separator className="bg-white/[0.06]" />

          <div className="space-y-2">
            <Label htmlFor="json-paste" className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              <ClipboardPaste className="size-3.5 text-zinc-400" />
              Incolla una risposta JSON dell&apos;API
            </Label>
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Se hai già interrogato <span className="font-mono text-zinc-400">/v1/token_plan/remains</span> (ad esempio con
              curl), incolla qui la risposta per vederla analizzata nella dashboard senza configurare la chiave.
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
              className="h-8 gap-1.5 border-white/10 bg-white/[0.04] text-xs hover:bg-white/[0.08]"
            >
              <ClipboardPaste className="size-3.5" />
              Analizza il JSON incollato
            </Button>
          </div>

          <Separator className="bg-white/[0.06]" />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="demo-mode" className="text-xs font-medium text-zinc-300">
                Modalità demo
              </Label>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Mostra dati simulati realistici senza chiamare l&apos;API. Utile per esplorare la dashboard prima di
                inserire la chiave.
              </p>
            </div>
            <Switch id="demo-mode" checked={demoMode} onCheckedChange={setDemoMode} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-zinc-400 hover:text-zinc-200">
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            className="bg-gradient-to-r from-rose-500 to-orange-500 text-white hover:from-rose-400 hover:to-orange-400"
          >
            Salva impostazioni
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
