"use client";

import * as React from "react";

/**
 * I52 — Registrazione del Service Worker e passaggio dei SEGRETI (ADR-14).
 *
 * La Subscription Key vive solo nel localStorage della pagina: per permettere
 * le notifiche a tab chiuso, viene inoltrata AL SERVICE WORKER via postMessage
 * e conservata SOLO in IndexedDB dal SW (mai in Cache Storage, mai nel codice).
 * - In demo mode o senza chiave → messaggio con apiKey null (il SW cancella
 *   ogni segreto e stato: nessuna notifica e nessun dato residuo).
 * - Il messaggio viene re-inviato quando le impostazioni cambiano (evento
 *   custom `mm-dash-settings-updated` emesso da page.tsx) e al focus della
 *   finestra (dopo un possibile aggiornamento del SW o del localStorage).
 *
 * I101 — Prompt «nuova versione disponibile»: quando un nuovo SW finisce di
 * installarsi (state «installed» con un controller già attivo = aggiornamento
 * in ATTESA) appare un banner persistente «Nuova versione disponibile —
 * Ricarica». NIENTE auto-skip: l'attivazione della nuova versione è SEMPRE
 * esplicita (decisione docs/08 I101) — prima il passaggio era silenzioso e
 * l'utente restava sulla versione vecchia senza saperlo. Al click: SKIP_WAITING
 * al SW in attesa + ricarica quando prende il controllo (controllerchange).
 */
export function PwaRegister() {
  const [aggiornamentoPronto, setAggiornamentoPronto] = React.useState(false);
  const registrationRef = React.useRef<ServiceWorkerRegistration | null>(null);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;

    const inviaSegreti = () => {
      const target = registration?.active;
      if (!target) return;
      try {
        const raw = localStorage.getItem("mm-dash-settings-v1");
        if (!raw) return;
        const s = JSON.parse(raw) as {
          demoMode?: boolean;
          apiKey?: string;
          region?: string;
          thresholds?: unknown;
          alertsEnabled?: boolean;
          notifyReset?: boolean;
        };
        if (s.demoMode || !s.apiKey) {
          target.postMessage({ type: "SECRETS", apiKey: null });
          return;
        }
        target.postMessage({
          type: "SECRETS",
          apiKey: s.apiKey,
          region: s.region,
          thresholds: s.thresholds,
          alertsEnabled: s.alertsEnabled,
          notifyReset: s.notifyReset,
        });
      } catch {
        /* localStorage non disponibile o JSON corrotto: niente segreti */
      }
    };

    const richiediCheck = () => {
      registration?.active?.postMessage({ type: "CHECK_NOW" });
    };

    /* I92 — handler NOMINATI e TUTTI rimossi nel cleanup: la versione
       precedente lasciava appesi visibilitychange (freccia anonima) e il
       listener message del SW — con StrictMode (mount→unmount→mount) il
       primo set restava attivo per sempre. */
    const onVisibilita = () => {
      if (document.visibilityState === "visible") richiediCheck();
    };
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === "SW_READY") inviaSegreti();
      // Rientro dal CHECK_NOW: niente toast (la notifica arriva dal SW)
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        registrationRef.current = reg;
        inviaSegreti();
        // Il SW potrebbe non essere ancora attivo al primo giro: ascolta
        // il suo segnale di prontezza e re-invia i segreti.
        navigator.serviceWorker.addEventListener("message", onSwMessage);
        // I101 — nuovo SW installato con controller attivo = aggiornamento in
        // attesa: BANNER esplicito (niente SKIP_WAITING automatico).
        reg.addEventListener("updatefound", () => {
          const nuovo = reg.installing;
          nuovo?.addEventListener("statechange", () => {
            if (nuovo.state === "installed" && navigator.serviceWorker.controller) {
              setAggiornamentoPronto(true);
            }
          });
        });
      })
      .catch(() => {
        /* SW non disponibile (http non sicuro, restrizioni): la pagina funziona comunque */
      });

    window.addEventListener("mm-dash-settings-updated", inviaSegreti);
    window.addEventListener("focus", richiediCheck);
    document.addEventListener("visibilitychange", onVisibilita);

    return () => {
      window.removeEventListener("mm-dash-settings-updated", inviaSegreti);
      window.removeEventListener("focus", richiediCheck);
      document.removeEventListener("visibilitychange", onVisibilita);
      navigator.serviceWorker.removeEventListener("message", onSwMessage);
    };
  }, []);

  /* I101 — attivazione esplicita: SKIP_WAITING al SW in attesa, poi ricarica
     quando la NUOVA versione prende il controllo (controllerchange, once:
     il listener vive solo per questo passaggio e non si accumula ai click). */
  const ricarica = () => {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => window.location.reload(),
      { once: true },
    );
    registrationRef.current?.waiting?.postMessage({ type: "SKIP_WAITING" });
  };

  if (!aggiornamentoPronto) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-banner"
      className="fixed inset-x-0 bottom-16 z-[100] flex justify-center px-4 md:bottom-6"
    >
      <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/95 px-4 py-3 shadow-xl backdrop-blur dark:bg-zinc-900/95">
        <span className="text-sm text-zinc-100">
          Nuova versione disponibile
        </span>
        <button
          type="button"
          onClick={ricarica}
          data-testid="pwa-update-reload"
          className="rounded-md bg-emerald-500/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
        >
          Ricarica
        </button>
      </div>
    </div>
  );
}
