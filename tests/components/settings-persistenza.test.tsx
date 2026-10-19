/**
 * I107 — Test di componente: pannello «Persistenza» nel tab Dati delle impostazioni.
 *
 * Il pannello consuma GET /api/persistenza (diagnostica SOLO LETTURA) e rende:
 * modalità attiva (Turso/SQLite), host sanificato, esito del test di connessione
 * e conteggi per tabella. Qui si verifica la VISTA con fetch globale mockato
 * (contratto API già coperto da tests/lib/api-persistenza.test.ts):
 * stati caricamento/dati/errore, formattazione it-IT dei conteggi, ricarica
 * manuale con «Aggiorna» e nota I107-fix2 sull'effimero del file locale su
 * serverless (visibile solo nel ramo locale, mai in quello Turso).
 *
 * Il provider next-themes è REALE (pattern theme-toggle/I78): il dialog usa
 * useTheme nel tab Aspetto e il provider evita mock del modulo.
 */
import "./setup-dom";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { SettingsDialog, DEFAULT_SETTINGS } from "@/components/settings-dialog";
import { CHIAVE_STORICO, CHIAVE_STORICO_MODELLI } from "@/lib/storage-chiavi";

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

/* I118 — dall'apertura del dialogo il fetch parte verso DUE endpoint in
   parallelo: il mock instrada per URL (fixture dedicate per ciascuno), così
   i due pannelli del tab Dati sono indipendenti anche nei test. */
const RISPOSTA_MANUTENZIONE = {
  ok: true,
  modalita: "turso",
  manutenzione: {
    misura: { bytes: 151552 },
    quota: { livello: "ok" },
    integrita: { eseguito: true, ok: true },
  },
  ultimeEsecuzioni: [
    {
      id: 2,
      t: "2026-10-17T02:30:04.000Z",
      innesco: "cron",
      esito: "ok",
      durataMs: 2117,
      dettaglio: { bytes: 151552, quota: "ok", integrita: "ok", eliminati: 0, vacuum: "omesso" },
    },
  ],
  generatoIl: new Date().toISOString(),
};

let risposta: unknown = STATO_TURSO;
let rispostaManutenzione: unknown = RISPOSTA_MANUTENZIONE;
let statoHttp = 200;
const chiamate: string[] = [];

function mockFetch() {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    chiamate.push(url);
    const corpo = url.includes("/api/manutenzione") ? rispostaManutenzione : risposta;
    return new Response(JSON.stringify(corpo), {
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
  rispostaManutenzione = RISPOSTA_MANUTENZIONE;
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
    /* La nota sull'effimero è SOLO del ramo locale (I107-fix2): con Turso il
       database è remoto e duraturo — la nota non deve comparire. */
    expect(screen.queryByText(/effimero/)).toBeNull();
  });

  test("modalità locale: badge SQLite e percorso del file dal contratto", async () => {
    risposta = { ...STATO_TURSO, modalita: "locale", host: "db/custom.db" };
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("SQLite locale")).toBeDefined());
    expect(screen.getByText("db/custom.db")).toBeDefined();
    expect(screen.queryByText("Turso (libsql)")).toBeNull();
  });

  test("I107-fix2 — modalità locale su serverless: nota sull'effimero del file (host /tmp)", async () => {
    risposta = { ...STATO_TURSO, modalita: "locale", host: "/tmp/db/custom.db" };
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("SQLite locale")).toBeDefined());
    expect(screen.getByText("/tmp/db/custom.db")).toBeDefined();
    expect(screen.getByText(/effimero/)).toBeDefined();
    expect(screen.getByText(/i dati non sopravvivono/)).toBeDefined();
    expect(screen.getByText(/TURSO_DATABASE_URL/)).toBeDefined();
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
    /* I118 — all'apertura partono ENTRAMBI i fetch (persistenza + manutenzione,
       in parallelo): ogni endpoint è chiamato una volta. */
    await waitFor(() => expect(chiamate.filter((c) => c === "/api/persistenza")).toHaveLength(1));
    await apriTabDati();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna persistenza" }));
    await waitFor(() => expect(chiamate.filter((c) => c === "/api/persistenza")).toHaveLength(2));
    /* Il bottone del registro NON rifà la richiesta di persistenza e viceversa:
       due aria-label distinti, due pannelli indipendenti. */
    expect(chiamate.filter((c) => c === "/api/manutenzione")).toHaveLength(1);
  });

  test("il pannello dichiara che le credenziali restano nell'ambiente (nota di sicurezza)", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/credenziali restano nell/)).toBeDefined());
  });
});

describe("I124 componenti: storico locale (tab Dati)", () => {
  test("la card esiste e «Svuota storico locale» con conferma rimuove le chiavi e ricarica", async () => {
    localStorage.setItem(CHIAVE_STORICO, JSON.stringify([{ t: 1, interval: 50, weekly: 60 }]));
    localStorage.setItem(CHIAVE_STORICO_MODELLI, JSON.stringify([{ t: 1, model: "general", interval: 50, weekly: 60 }]));
    const conferme: string[] = [];
    const ricaricamenti: number[] = [];
    const confirmOriginale = window.confirm;
    const reloadOriginale = window.location.reload.bind(window.location);
    window.confirm = (msg?: string) => {
      conferme.push(String(msg));
      return true;
    };
    (window.location as unknown as { reload: () => void }).reload = () => ricaricamenti.push(1);
    try {
      mount();
      await apriTabDati();
      expect(screen.getByText("Storico locale (browser)")).toBeDefined();
      fireEvent.click(screen.getByRole("button", { name: "Svuota lo storico locale del browser" }));
      expect(conferme).toHaveLength(1);
      expect(conferme[0]).toContain("server NON vengono toccati");
      expect(localStorage.getItem(CHIAVE_STORICO)).toBeNull();
      expect(localStorage.getItem(CHIAVE_STORICO_MODELLI)).toBeNull();
      expect(ricaricamenti).toHaveLength(1);
    } finally {
      window.confirm = confirmOriginale;
      (window.location as unknown as { reload: () => void }).reload = reloadOriginale;
      localStorage.removeItem(CHIAVE_STORICO);
      localStorage.removeItem(CHIAVE_STORICO_MODELLI);
    }
  });

  test("conferma negata: nessuna chiave rimossa, nessun ricaricamento", async () => {
    localStorage.setItem(CHIAVE_STORICO, JSON.stringify([{ t: 1, interval: 50, weekly: 60 }]));
    const confirmOriginale = window.confirm;
    const reloadOriginale = window.location.reload.bind(window.location);
    let ricaricamenti = 0;
    window.confirm = () => false;
    (window.location as unknown as { reload: () => void }).reload = () => {
      ricaricamenti += 1;
    };
    try {
      mount();
      await apriTabDati();
      fireEvent.click(screen.getByRole("button", { name: "Svuota lo storico locale del browser" }));
      expect(localStorage.getItem(CHIAVE_STORICO)).not.toBeNull();
      expect(ricaricamenti).toBe(0);
    } finally {
      window.confirm = confirmOriginale;
      (window.location as unknown as { reload: () => void }).reload = reloadOriginale;
      localStorage.removeItem(CHIAVE_STORICO);
    }
  });
});
