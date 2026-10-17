/**
 * I120 — Test di componente: sezione «Sicurezza scritture» nel tab Dati.
 *
 * La sezione gestisce il token admin che il browser allega alle scritture
 * protette dalla guardia I95 (contratto di rete coperto da
 * tests/lib/admin-token-scritture.test.ts). Qui si verifica la VISTA e il
 * cablaggio: campo password con mostra/nascondi, salvataggio IMMEDIATO nel
 * localStorage (indipendente dal «Salva impostazioni» del dialogo), rimozione,
 * e la SONDA di identità — POST /api/manutenzione con azione inesistente che
 * NON tocca il database: 400 → messaggio verde (identità accettata), 401 →
 * messaggio rosso (token rifiutato), con l'header allegato dal valore digitato.
 *
 * Il fetch globale è mockato e instradato per METODO+URL: le GET all'apertura
 * (persistenza + registro) convivono con la POST della sonda, il cui stato
 * HTTP è configurabile per gli scenari.
 */
import "./setup-dom";
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { SettingsDialog, DEFAULT_SETTINGS } from "@/components/settings-dialog";
import { ADMIN_TOKEN_STORAGE_KEY, leggiTokenAdmin } from "@/lib/admin-token";

/* ------------------------------------------------------------------ */
/* Mock del fetch globale instradato per metodo                        */
/* ------------------------------------------------------------------ */

const STATO_PERSISTENZA = {
  ok: true,
  modalita: "turso",
  host: "monitor-org.turso.io",
  test: { ok: true, latenzaMs: 9 },
  tabelle: [
    { tabella: "UsagePoint", etichetta: "Punti storici", righe: 1 },
    { tabella: "DownsampledPoint", etichetta: "Bucket orari", righe: 2 },
    { tabella: "UsageEventRecord", etichetta: "Eventi", righe: 3 },
    { tabella: "ModelUsagePoint", etichetta: "Punti per modello", righe: 4 },
  ],
  totale: 10,
  generatoIl: new Date().toISOString(),
};

const REGISTRO_VUOTO = {
  ok: true,
  modalita: "turso",
  manutenzione: {
    misura: { bytes: 151552 },
    quota: { livello: "ok" },
    integrita: { eseguito: true, ok: true },
  },
  ultimeEsecuzioni: [],
  generatoIl: new Date().toISOString(),
};

let statoSonda = 400;
const sonde: { init?: RequestInit }[] = [];

function mockFetch(): void {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.includes("/api/manutenzione")) {
      sonde.push({ init });
      return new Response(
        JSON.stringify({ ok: false, error: { code: "bad_request", message: "Azione non valida." } }),
        { status: statoSonda, headers: { "content-type": "application/json" } },
      );
    }
    const corpo = url.includes("/api/manutenzione") ? REGISTRO_VUOTO : STATO_PERSISTENZA;
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
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

async function apriTabDati() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Dati" }));
  await waitFor(() => expect(screen.getByText("Sicurezza scritture")).toBeDefined());
}

function campoToken(): HTMLInputElement {
  return screen.getByLabelText("Sicurezza scritture") as HTMLInputElement;
}

beforeEach(() => {
  cleanup();
  statoSonda = 400;
  sonde.length = 0;
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  mockFetch();
});

describe("I120 componenti: sezione Sicurezza scritture (tab Dati)", () => {
  test("renderizza campo password, pulsanti e nota onesta sulla sonda; il campo nasce dal localStorage", async () => {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, "tok-gia-salvato");
    mount();
    await apriTabDati();
    expect(campoToken().value).toBe("tok-gia-salvato");
    expect(campoToken().type).toBe("password");
    expect(screen.getByRole("button", { name: "Salva token" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Verifica col server" })).toBeDefined();
    expect(screen.getByText(/azione di manutenzione inesistente/)).toBeDefined();
    expect(screen.getByText(/indipendente dal pulsante «Salva/)).toBeDefined();
  });

  test("salvataggio IMMEDIATO: il token finisce nel localStorage senza toccare «Salva impostazioni»", async () => {
    mount();
    await apriTabDati();
    fireEvent.change(campoToken(), { target: { value: "  tok-mio  " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva token" }));
    await waitFor(() => expect(leggiTokenAdmin()).toBe("tok-mio"));
    expect(campoToken().value).toBe("tok-mio"); // taglio dei bordi riflesso nel campo
    expect(screen.getByText(/Token salvato nel browser/)).toBeDefined();
  });

  test("mostra/nascondi il token nel campo", async () => {
    mount();
    await apriTabDati();
    fireEvent.click(screen.getByRole("button", { name: "Mostra token" }));
    expect(campoToken().type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Nascondi token" }));
    expect(campoToken().type).toBe("password");
  });

  test("sonda con 400: identità accettata, header allegato col valore digitato, body con azione inesistente", async () => {
    statoSonda = 400;
    mount();
    await apriTabDati();
    fireEvent.change(campoToken(), { target: { value: "tok-verifica" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica col server" }));
    await waitFor(() => expect(screen.getByText(/Identità accettata dal server/)).toBeDefined());
    expect(sonde).toHaveLength(1);
    const headers = (sonde[0].init?.headers ?? {}) as Record<string, string>;
    expect(headers["x-admin-token"]).toBe("tok-verifica");
    const corpo = JSON.parse(String(sonde[0].init?.body)) as { azione: string };
    expect(corpo.azione).not.toBe("pulizia");
    expect(corpo.azione).not.toBe("vacuum");
    expect(corpo.azione).not.toBe("manutenzione");
  });

  test("sonda con 401: token RIFIUTATO in rosso — il segnale visibile che manca al fire-and-forget", async () => {
    statoSonda = 401;
    mount();
    await apriTabDati();
    fireEvent.change(campoToken(), { target: { value: "tok-sbagliato" } });
    fireEvent.click(screen.getByRole("button", { name: "Verifica col server" }));
    await waitFor(() => expect(screen.getByText(/RIFIUTATO/)).toBeDefined());
  });

  test("rimozione: localStorage ripulito e messaggio onesto", async () => {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, "tok-da-via");
    mount();
    await apriTabDati();
    await waitFor(() => expect(campoToken().value).toBe("tok-da-via"));
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    await waitFor(() => expect(leggiTokenAdmin()).toBeNull());
    expect(campoToken().value).toBe("");
    expect(screen.getByText("Token rimosso dal browser.")).toBeDefined();
  });
});
