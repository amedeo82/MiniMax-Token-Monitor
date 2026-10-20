/**
 * I126 — Test di componente: la demo NON è più il default (opt-in esplicito).
 *
 * Contesto: fino a I125 DEFAULT_SETTINGS.demoMode era TRUE — ogni contesto
 * browser senza impostazioni salvate nasceva in modalità demo, con replica
 * dei tick demo sul server (causa storica dei punti demo in produzione,
 * task 69; azione di pulizia I122). Dal I126:
 *
 * 1. DEFAULT_SETTINGS.demoMode = FALSE → il primo avvio senza chiave mostra
 *    la needsSetup card di page.tsx («Inserisci la chiave» / «Prova la demo»);
 * 2. handleSave NON forza più `demoMode: demoMode || !apiKey.trim()`: la scelta
 *    dell'utente viene salvata così com'è — il caso «api senza chiave» è
 *    governato dalla needsSetup card e dal guard di fetchData, non
 *    ri-attivando dati simulati a insaputa dell'utente.
 *
 * Il provider next-themes è REALE (pattern theme-toggle/I78, persistenza/I107);
 * il fetch globale è mockato (il dialog interroga /api/persistenza e
 * /api/manutenzione all'apertura del tab Dati — I118) e la cleanup() esplicita
 * tra i test è OBBLIGATORIA (convenzione I79, presidio audit I123: il document
 * happy-dom è condiviso in-process e tra i file sopravvive il render dell'ultimo
 * test di ciascun file).
 */
import "./setup-dom";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { SettingsDialog, DEFAULT_SETTINGS, type DashboardSettings } from "@/components/settings-dialog";

/* ------------------------------------------------------------------ */
/* Fixture e mock del fetch globale                                     */
/* ------------------------------------------------------------------ */

/* Il dialog all'apertura interroga DUE endpoint in parallelo (I118): le
   risposte devono essere COMPLETE a livello di contratto — una risposta
   minimale ({ ok: true }) alimenta il pannello Persistenza con
   statoPersistenza.test === undefined e il flush asincrono del re-render
   (document happy-dom condiviso in-process) esplode TRA i test dei file
   successivi: la stessa famiglia di bombe d'ordine smontata in I122/I123.
   La regola è: ogni file di test è SELF-CONTAINED a livello di contratto.
   Valori DIVERSI da quelli di settings-persistenza.test.tsx per igiene del
   document condiviso (nessuna sovrapposizione di testi residuali). */
const RISPOSTA_PERSISTENZA = {
  ok: true,
  modalita: "turso",
  host: "altro-progetto.turso.io",
  test: { ok: true, latenzaMs: 7 },
  tabelle: [
    { tabella: "UsagePoint", etichetta: "Punti storici", righe: 39 },
  ],
  totale: 39,
  generatoIl: new Date().toISOString(),
};

const RISPOSTA_MANUTENZIONE = {
  ok: true,
  modalita: "turso",
  manutenzione: {
    misura: { bytes: 131072 },
    quota: { livello: "ok" },
    integrita: { eseguito: true, ok: true },
  },
  ultimeEsecuzioni: [],
  generatoIl: new Date().toISOString(),
};

const fetchOriginale = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = fetchOriginale;
});

beforeEach(() => {
  cleanup();
  globalThis.fetch = (async (input: unknown) => {
    const corpo = String(input).includes("/api/manutenzione")
      ? RISPOSTA_MANUTENZIONE
      : RISPOSTA_PERSISTENZA;
    return new Response(JSON.stringify(corpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});

function mount(salvate: DashboardSettings[]) {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SettingsDialog
        open
        onOpenChange={() => {}}
        settings={DEFAULT_SETTINGS}
        onSave={(s) => salvate.push(s)}
        onImportJson={() => {}}
      />
    </ThemeProvider>,
  );
}

function salvaImpostazioni() {
  fireEvent.click(screen.getByRole("button", { name: "Salva impostazioni" }));
}

const switchDemo = () => screen.getByRole("switch", { name: "Modalità demo" });

describe("I126 componenti: demo opt-in (default FALSE, niente forzamento al salvataggio)", () => {
  test("DEFAULT_SETTINGS.demoMode è FALSE — il primo avvio mostra la needsSetup card, non dati simulati", () => {
    expect(DEFAULT_SETTINGS.demoMode).toBe(false);
  });

  test("il dialog si apre con lo switch demo SPENTO sui default", () => {
    mount([]);
    expect(switchDemo().getAttribute("aria-checked")).toBe("false");
  });

  test("salvare senza chiave NON ri-attiva la demo: la scelta viene rispettata", () => {
    const salvate: DashboardSettings[] = [];
    mount(salvate);
    salvaImpostazioni();
    expect(salvate).toHaveLength(1);
    expect(salvate[0].demoMode).toBe(false);
    expect(salvate[0].apiKey).toBe("");
  });

  test("attivare la demo resta una scelta ESPLICITA: switch acceso → salvata accesa", () => {
    const salvate: DashboardSettings[] = [];
    mount(salvate);
    fireEvent.click(switchDemo());
    expect(switchDemo().getAttribute("aria-checked")).toBe("true");
    salvaImpostazioni();
    expect(salvate).toHaveLength(1);
    expect(salvate[0].demoMode).toBe(true);
  });

  test("chiave inserita + demo spenta: salvata così com'è (chiave trimmata, demo FALSE)", () => {
    const salvate: DashboardSettings[] = [];
    mount(salvate);
    fireEvent.change(screen.getByLabelText("Subscription Key"), {
      target: { value: "  eyJhbGciOi.Key  " },
    });
    salvaImpostazioni();
    expect(salvate).toHaveLength(1);
    expect(salvate[0].apiKey).toBe("eyJhbGciOi.Key");
    expect(salvate[0].demoMode).toBe(false);
  });
});
