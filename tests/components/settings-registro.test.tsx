/**
 * I118 — Test di componente: pannello «Registro manutenzione» nel tab Dati.
 *
 * Il pannello consuma GET /api/manutenzione (SOLO LETTURA, contratto già
 * coperto da tests/lib/api-manutenzione.test.ts) e rende: riepilogo del
 * rapporto corrente (storage, quota, integrità) + le righe del registro delle
 * esecuzioni (I117) — innesco (cron/manuale), esito colorato, durata, istante
 * it-IT e sintesi del dettaglio JSON. Qui si verifica la VISTA con fetch
 * globale mockato e instradato per URL (persistenza e manutenzione convivono
 * all'apertura del dialogo con stati INDIPENDENTI): dati, riga fallita con
 * l'errore del motore, registro vuoto, errore API che NON maschera l'altro
 * pannello, ricarica manuale con «Aggiorna registro».
 *
 * Gli helper puri (formattaBytesClient, formattaDurataRegistro,
 * formattaQuandoRegistro, sintesiDettaglio) sono verificati direttamente:
 * formattaBytesClient è lo specchio client di formattaBytes (manutenzione-db
 * è codice server, non importabile da un componente).
 */
import "./setup-dom";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import {
  SettingsDialog,
  DEFAULT_SETTINGS,
  formattaBytesClient,
  formattaDurataRegistro,
  formattaQuandoRegistro,
  sintesiDettaglio,
} from "@/components/settings-dialog";

/* ------------------------------------------------------------------ */
/* Fixture e mock del fetch globale (instradato per URL)                */
/* ------------------------------------------------------------------ */

const STATO_TURSO = {
  ok: true,
  modalita: "turso",
  host: "monitor-org.turso.io",
  test: { ok: true, latenzaMs: 12 },
  tabelle: [
    { tabella: "UsagePoint", etichetta: "Punti storici", righe: 1 },
    { tabella: "DownsampledPoint", etichetta: "Bucket orari", righe: 2 },
    { tabella: "UsageEventRecord", etichetta: "Eventi", righe: 3 },
    { tabella: "ModelUsagePoint", etichetta: "Punti per modello", righe: 4 },
  ],
  totale: 10,
  generatoIl: new Date().toISOString(),
};

const RIGA_CRON_OK = {
  id: 3,
  t: "2026-10-17T02:30:04.000Z",
  innesco: "cron",
  esito: "ok",
  durataMs: 2117,
  dettaglio: { bytes: 151552, quota: "ok", integrita: "ok", eliminati: 0, vacuum: "omesso" },
};
const RIGA_CRON_FALLITO = {
  id: 2,
  t: "2026-10-16T02:30:02.000Z",
  innesco: "cron",
  esito: "fallito",
  durataMs: 412,
  dettaglio: { errore: "quick_check ha trovato vincoli corrotti" },
};
const RIGA_POST_MANUALE = {
  id: 1,
  t: "2026-10-15T14:05:00.000Z",
  innesco: "post",
  esito: "ok",
  durataMs: null,
  dettaglio: { bytes: 98304, quota: "attenzione", integrita: "ok", eliminati: 12, vacuum: "eseguito" },
};

function rispostaManutenzione(ultimeEsecuzioni: unknown[]) {
  return {
    ok: true,
    modalita: "turso",
    manutenzione: {
      misura: { bytes: 151552 },
      quota: { livello: "ok" },
      integrita: { eseguito: true, ok: true },
    },
    ultimeEsecuzioni,
    generatoIl: new Date().toISOString(),
  };
}

let rispostaPersistenza: unknown = STATO_TURSO;
let rispostaRegistro: unknown = rispostaManutenzione([RIGA_CRON_OK, RIGA_CRON_FALLITO, RIGA_POST_MANUALE]);
let statoHttpPersistenza = 200;
let statoHttpRegistro = 200;
const chiamate: string[] = [];

function mockFetch() {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    chiamate.push(url);
    /* I118 — i DUE endpoint hanno fixture e stati HTTP indipendenti: un
       endpoint guasto NON deve mascherare l'altro nel rendering. */
    const manutenzione = url.includes("/api/manutenzione");
    const corpo = manutenzione ? rispostaRegistro : rispostaPersistenza;
    const status = manutenzione ? statoHttpRegistro : statoHttpPersistenza;
    return new Response(JSON.stringify(corpo), {
      status,
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

/** Apre il tab Dati (il dialog parte su «Connessione»). Radix Tabs attiva su
 * mousedown, non su click — pattern già verificato in settings-persistenza. */
async function apriTabDati() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Dati" }));
  await waitFor(() => expect(screen.getByText("Registro manutenzione")).toBeDefined());
}

/** L'istante formattato con la STESSA espressione del componente: l'asserzione
 * verifica il collegamento, non i dati ICU della macchina (pattern I107). */
function quandoAtteso(t: string): string {
  return new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

beforeEach(() => {
  cleanup();
  rispostaPersistenza = STATO_TURSO;
  rispostaRegistro = rispostaManutenzione([RIGA_CRON_OK, RIGA_CRON_FALLITO, RIGA_POST_MANUALE]);
  statoHttpPersistenza = 200;
  statoHttpRegistro = 200;
  chiamate.length = 0;
  mockFetch();
});

describe("I118 componenti: pannello Registro manutenzione (tab Dati)", () => {
  test("renderizza le righe del registro: innesco, esito, durata, istante it-IT e sintesi del dettaglio", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("2,1 s")).toBeDefined());
    /* Nessun falso vuoto: con 3 righe lo stato vuoto non compare. */
    expect(screen.queryByText("Nessuna esecuzione registrata")).toBeNull();
    /* Riga cron ok: badge innesco (due righe cron) + esito colorato (due "ok"). */
    expect(screen.getAllByText("cron").length).toBe(2);
    expect(screen.getByText("manuale")).toBeDefined(); // innesco "post" tradotto
    expect(screen.getAllByText("ok").length).toBe(2);
    expect(screen.getByText("fallito")).toBeDefined();
    expect(screen.getByText("412 ms")).toBeDefined();
    expect(screen.getByText(quandoAtteso("2026-10-17T02:30:04.000Z"))).toBeDefined();
    expect(screen.getByText(quandoAtteso("2026-10-15T14:05:00.000Z"))).toBeDefined();
    /* Sintesi del dettaglio: solo i campi presenti, nell'ordine del rapporto. */
    expect(screen.getByText("148 KB · quota ok · integrità ok · eliminati 0 · vacuum omesso")).toBeDefined();
    expect(
      screen.getByText("96,0 KB · quota attenzione · integrità ok · eliminati 12 · vacuum eseguito"),
    ).toBeDefined();
  });

  test("riga fallita: l'errore del motore è visibile accanto all'esito", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("fallito")).toBeDefined());
    expect(screen.getByText("quick_check ha trovato vincoli corrotti")).toBeDefined();
  });

  test("durata non misurata (null) → «—», mai uno 0 che non c'è", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("manuale")).toBeDefined());
    expect(screen.getByText("—")).toBeDefined();
  });

  test("riepilogo del rapporto corrente: storage formattato e quota/integrità", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText("Storage attuale")).toBeDefined());
    expect(screen.getByText("148 KB")).toBeDefined(); // 151552 byte → formattaBytesClient
    expect(screen.getByText("ok · ok")).toBeDefined(); // quota.livello · integrità
  });

  test("registro vuoto: stato vuoto ONESTO con la spiegazione di chi lo popola", async () => {
    rispostaRegistro = rispostaManutenzione([]);
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/Nessuna esecuzione registrata/)).toBeDefined());
    expect(screen.getByText(/cron popola il registro a ogni run notturno/)).toBeDefined();
    /* Nessuna riga finta: i badge innesco non compaiono. */
    expect(screen.queryByText("manuale")).toBeNull();
  });

  test("API manutenzione in errore: «Registro non disponibile» SENZA mascherare il pannello Persistenza", async () => {
    rispostaPersistenza = STATO_TURSO; // resta sano
    rispostaRegistro = { ok: false, error: { code: "db_read", message: "database bloccato" } };
    statoHttpRegistro = 500;
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/Registro non disponibile: database bloccato/)).toBeDefined());
    /* Indipendenza dei due pannelli: la persistenza continua a mostrare i dati. */
    expect(screen.getByText("Turso (libsql)")).toBeDefined();
    expect(screen.getByText("Punti storici")).toBeDefined();
  });

  test("il fetch parte all'apertura e «Aggiorna registro» rifà SOLO la richiesta di manutenzione", async () => {
    mount();
    await waitFor(() => expect(chiamate.filter((c) => c === "/api/manutenzione")).toHaveLength(1));
    await apriTabDati();
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna registro" }));
    await waitFor(() => expect(chiamate.filter((c) => c === "/api/manutenzione")).toHaveLength(2));
    expect(chiamate.filter((c) => c === "/api/persistenza")).toHaveLength(1);
  });

  test("la nota onesta dichiara cap FIFO, best-effort e azioni parziali fuori dal registro", async () => {
    mount();
    await apriTabDati();
    await waitFor(() => expect(screen.getByText(/ultime 100 esecuzioni/)).toBeDefined());
    expect(screen.getByText(/best-effort/)).toBeDefined();
    expect(screen.getByText(/azioni parziali pulizia\/vacuum non si registrano/)).toBeDefined();
    expect(screen.getByText(/\[manutenzione-cron\]/)).toBeDefined();
  });
});

describe("I118 helper puri del pannello registro", () => {
  test("formattaDurataRegistro: ms sotto il secondo, secondi con virgola, non misurata → «—»", () => {
    expect(formattaDurataRegistro(null)).toBe("—");
    expect(formattaDurataRegistro(Number.NaN)).toBe("—");
    expect(formattaDurataRegistro(0)).toBe("0 ms");
    expect(formattaDurataRegistro(999)).toBe("999 ms");
    expect(formattaDurataRegistro(2117)).toBe("2,1 s");
    expect(formattaDurataRegistro(60_000)).toBe("60,0 s");
  });

  test("formattaBytesClient: specchio esatto di formattaBytes (aritmetica 1024, virgola it-IT)", () => {
    expect(formattaBytesClient(0)).toBe("0 B");
    expect(formattaBytesClient(999)).toBe("999 B");
    expect(formattaBytesClient(1024)).toBe("1,00 KB");
    expect(formattaBytesClient(151552)).toBe("148 KB");
    expect(formattaBytesClient(1024 ** 3)).toBe("1,00 GB");
  });

  test("formattaQuandoRegistro: data invalida o vuota → testo grezzo, mai una data inventata", () => {
    expect(formattaQuandoRegistro("")).toBe("—");
    expect(formattaQuandoRegistro("non-una-data")).toBe("non-una-data");
    expect(formattaQuandoRegistro("2026-10-17T02:30:04.000Z")).toBe(quandoAtteso("2026-10-17T02:30:04.000Z"));
  });

  test("sintesiDettaglio: solo i campi presenti; dettaglio vuoto o { grezzo } → stringa vuota", () => {
    expect(sintesiDettaglio({})).toBe("");
    expect(sintesiDettaglio({ grezzo: "contenuto non JSON" })).toBe("");
    expect(sintesiDettaglio({ bytes: 151552, quota: "ok" })).toBe("148 KB · quota ok");
    expect(sintesiDettaglio({ errore: "boom" })).toBe(""); // l'errore è reso a parte, in rosso
    expect(sintesiDettaglio({ eliminati: 7, vacuum: "eseguito" })).toBe("eliminati 7 · vacuum eseguito");
    /* Valori non numerici nel dettaglio (contenuto imprevisto): mai un crash,
       il campo semplicemente non compare. */
    expect(sintesiDettaglio({ bytes: "un-stringa" })).toBe("");
    expect(sintesiDettaglio({ eliminati: null })).toBe("");
  });
});
