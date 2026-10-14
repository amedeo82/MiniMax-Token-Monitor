/**
 * I101 — Test di componente: banner «Nuova versione disponibile» (PwaRegister).
 *
 * navigator.serviceWorker è MOCKATO (defineProperty, pattern I88): la
 * registrazione risolve con una registration finta che permette di simulare
 * il ciclo updatefound → installing → installed CON controller attivo
 * (aggiornamento in attesa). Copre:
 * - nessun banner nello stato normale;
 * - banner persistente quando un nuovo SW è installato in attesa;
 * - niente SKIP_WAITING AUTOMATICO (decisione I101: attivazione esplicita);
 * - click «Ricarica» → postMessage SKIP_WAITING al SW in attesa.
 */
import "./setup-dom";
import { describe, test, expect, afterAll } from "bun:test";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { PwaRegister } from "@/components/pwa-register";

/* ------------------------------------------------------------------ */
/* Mock navigator.serviceWorker                                        */
/* ------------------------------------------------------------------ */

type Handler = (e?: unknown) => void;

interface WorkerFinto {
  state: string;
  addEventListener: (tipo: string, h: Handler) => void;
  postMessage: (msg: unknown) => void;
  statechange?: Handler;
}

interface RegistrationFinta {
  installing: WorkerFinto | null;
  waiting: WorkerFinto | null;
  active: { postMessage: (msg: unknown) => void } | null;
  addEventListener: (tipo: string, h: Handler) => void;
  updatefound?: Handler;
}

const registro: RegistrationFinta = {
  installing: null,
  waiting: null,
  active: null,
  addEventListener: (_tipo, h) => {
    // il componente usa addEventListener SOLO per "updatefound"
    registro.updatefound = h as Handler;
  },
};

const descrittoreSWPreFile: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
  navigator,
  "serviceWorker",
);

Object.defineProperty(navigator, "serviceWorker", {
  configurable: true,
  value: {
    controller: null as unknown,
    addEventListener: (_tipo: string, _h: Handler) => {},
    removeEventListener: (_tipo: string, _h: Handler) => {},
    register: (_url: string) => Promise.resolve(registro),
  },
});

afterAll(() => {
  if (descrittoreSWPreFile) {
    Object.defineProperty(navigator, "serviceWorker", descrittoreSWPreFile);
  }
});

/* ------------------------------------------------------------------ */
/* Helper: simula il ciclo di aggiornamento del SW                     */
/* ------------------------------------------------------------------ */

function nuovoWorkerFinto(): WorkerFinto {
  const w: WorkerFinto = {
    state: "installing",
    addEventListener: (tipo, h) => {
      if (tipo === "statechange") w.statechange = h;
    },
    postMessage: () => {},
  };
  return w;
}

function simulaAggiornamentoInAttesa(): WorkerFinto {
  const w = nuovoWorkerFinto();
  act(() => {
    registro.installing = w;
    registro.updatefound?.();
    // il nuovo SW finisce di installarsi CON un controller già attivo;
    // lo statechange (che scrive stato React) gira DENTRO act
    (navigator.serviceWorker as unknown as { controller: unknown }).controller = {};
    w.state = "installed";
    // a state "installed" con controller attivo il worker È quello in attesa
    registro.waiting = w;
    w.statechange?.();
  });
  return w;
}

/* ------------------------------------------------------------------ */
/* Test                                                                */
/* ------------------------------------------------------------------ */

describe("I101 PwaRegister: banner «Nuova versione disponibile»", () => {
  test("stato normale: nessun banner e nessun SKIP_WAITING automatico", async () => {
    let postati: unknown[] = [];
    const workerAttivo = {
      postMessage: (m: unknown) => postati.push(m),
    };
    registro.active = workerAttivo;
    registro.installing = null;
    registro.waiting = null;
    (navigator.serviceWorker as unknown as { controller: unknown }).controller = workerAttivo;
    render(<PwaRegister />);
    // attende la registrazione asincrona
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("pwa-update-banner")).toBeNull();
    // SECRETS va al controller attivo, ma NESSUN messaggio SKIP_WAITING
    expect(postati.every((m) => (m as { type?: string }).type !== "SKIP_WAITING")).toBe(true);
    cleanup();
  });

  test("nuovo SW installato in attesa: banner persistente con «Ricarica»", async () => {
    registro.active = { postMessage: () => {} };
    render(<PwaRegister />);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("pwa-update-banner")).toBeNull();
    simulaAggiornamentoInAttesa();
    expect(screen.getByTestId("pwa-update-banner")).toBeDefined();
    expect(screen.getByText("Nuova versione disponibile")).toBeDefined();
    expect(screen.getByTestId("pwa-update-reload")).toBeDefined();
    cleanup();
  });

  test("click «Ricarica» → SKIP_WAITING al SW IN ATTESA (non all'attivo)", async () => {
    registro.active = { postMessage: () => {} };
    render(<PwaRegister />);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const inAttesa = simulaAggiornamentoInAttesa();
    let ricevuti: unknown[] = [];
    inAttesa.postMessage = (m: unknown) => ricevuti.push(m);
    fireEvent.click(screen.getByTestId("pwa-update-reload"));
    expect(ricevuti).toEqual([{ type: "SKIP_WAITING" }]);
    // il banner RESTA finché la nuova versione non prende il controllo (reload)
    expect(screen.getByTestId("pwa-update-banner")).toBeDefined();
    cleanup();
  });

  test("il banner è annunciato: role=status + aria-live polite", async () => {
    registro.active = { postMessage: () => {} };
    render(<PwaRegister />);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    simulaAggiornamentoInAttesa();
    const banner = screen.getByTestId("pwa-update-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    cleanup();
  });
});
