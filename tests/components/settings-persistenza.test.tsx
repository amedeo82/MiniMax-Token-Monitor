/**
 * I107 — Test di componente: pannello «Persistenza» nel tab Dati delle impostazioni.
 *
 * Il pannello consuma GET /api/persistenza (diagnostica SOLO LETTURA) e rende:
 * modalità attiva (Turso/SQLite), host sanificato, esito del test di connessione
 * e conteggi per tabella. Qui si verifica la VISTA con fetch globale mockato
 * (contratto API già coperto da tests/lib/api-persistenza.test.ts):
 * stati caricamento/dati/errore, formattazione it-IT dei conteggi e ricarica
 * manuale con «Aggiorna».
 *
 * Il provider next-themes è REALE (pattern theme-toggle/I78): il dialog usa
 * useTheme nel tab Aspetto e il provider evita mock del modulo.
 */
import "./setup-dom";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { SettingsDialog, DEFAULT_SETTINGS } from "@/components/settings-dialog";

/* ------------------------------------------------------------------ */
/* Fixture e mock del fetch globale                                     */
/* ------------------------------------------------------------------ */

const STATO_TURSO = {
  ok: true,
  modalita: "turso",
  host: "monitor-org.turso.io",
  test: { ok: true, latenzaMs: 12 },
  tabelle: [
    { tabella: "UsagePoint", etichetta: "Punti storici", righe: 1234 },
    { tabella: "DownsampledPoint", etichetta: "Bucket orari", righe: 56 },
    { tabella: "UsageEventRecord", etichetta: "Eventi", righe: 7 },
    { tabella: "ModelUsagePoint", etichetta: "Punti per modello", righe: 89 },
  ],
  totale: 1386,
  generatoIl: new Date().toISOString(),
};

let risposta: unknown = STATO_TURSO;
let statoHttp = 200;
const chiamate: string[] = [];

function mockFetch() {
  globalThis.fetch = (async (input: unknown) => {
    chiamate.push(String(input));
    return new Response(JSON.stringify(risposta), {
      status: statoHttp,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

const fetchOriginale = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = fetchOriginale;
});

function mount() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SettingsDialog
        open
        onOpenChange={() => {}}
        settings={DEFAULT_SETTINGS}
        onSave={() => {}}
        onImportJson={() => {}}
      />
    </ThemeProvider>,
  );
}

/** Apre il tab Dati (il dialog parte su «Connessione»). I trigger Radix Tabs
 * attivano su mousedown, non su click — verificato con dump del DOM in happy-dom. */
async function apriTabDati() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Dati" }));
  await waitFor(() => expect(screen.getByText("Persistenza server")).toBeDefined());
}

beforeEach(() => {
  cleanup();
  risposta = STATO_TURSO;
  statoHttp = 200;
  chiamate.length = 0;
  mockFetch();
});

describe("I107 componenti: pannello Persistenza (tab Dati)", () => {
  test("modalità Turso: badge, host sanificato, test di connessione e conteggi in it-IT", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("Turso (libsql)")).toBeDefined());
    expect(screen.getByText("monitor-org.turso.io")).toBeDefined();
    expect(screen.getByText("ok · 12 ms")).toBeDefined();
    expect(screen.getByText("Punti storici")).toBeDefined();
    /* Il separatore delle migliaia dipende dai dati ICU del runtime (locale
       «1.234»; su runner con ICU parziale può usare lo spazio): l'asserzione
       usa lo STESSO formatter della UI per verificare il collegamento, non i
       dati ICU della macchina. */
    expect(screen.getByText((1234).toLocaleString("it-IT"))).toBeDefined();
    expect(screen.getByText("Bucket orari")).toBeDefined();
    expect(screen.getByText("Punti per modello")).toBeDefined();
    expect(screen.getByText("89")).toBeDefined();
  });

  test("modalità locale: badge SQLite e percorso del file dal contratto", async () => {
    risposta = { ...STATO_TURSO, modalita: "locale", host: "db/custom.db" };
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("SQLite locale")).toBeDefined());
    expect(screen.getByText("db/custom.db")).toBeDefined();
    expect(screen.queryByText("Turso (libsql)")).toBeNull();
  });

  test("API in errore: messaggio con la causa, nessun pannello dati", async () => {
    risposta = { ok: false, error: { code: "db_read", message: "database bloccato" } };
    statoHttp = 500;
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/Verifica non disponibile: database bloccato/)).toBeDefined());
    expect(screen.queryByText("Turso (libsql)")).toBeNull();
    expect(screen.queryByText("Punti storici")).toBeNull();
  });

  test("la verifica parte all'apertura del dialogo e «Aggiorna» rifà la richiesta", async () => {
    mount();
    await waitFor(() => expect(chiamate).toEqual(["/api/persistenza"]));
    await apriTabDati();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna" }));
    await waitFor(() => expect(chiamate).toHaveLength(2));
    expect(chiamate.every((c) => c === "/api/persistenza")).toBe(true);
  });

  test("il pannello dichiara che le credenziali restano nell'ambiente (nota di sicurezza)", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/credenziali restano nell/)).toBeDefined());
  });
});
