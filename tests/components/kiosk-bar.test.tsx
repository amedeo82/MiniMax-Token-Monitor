/**
 * I87 — Test di componente: KioskBar (barra di controllo della modalità kiosk/TV).
 *
 * La barra è il sostituto del footer mentre il kiosk è attivo: sticky a fondo
 * pagina, cambio vista manuale, rotazione con intervallo, dimming notturno e
 * uscita sempre disponibile (bottone + Esc).
 */
import "./setup-dom";
import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { KioskBar } from "@/components/kiosk-bar";
import { KIOSK_DEFAULTS, KIOSK_VIEWS, type KioskState, type KioskView } from "@/lib/kiosk";

beforeEach(() => {
  cleanup();
});

const stato: KioskState = { ...KIOSK_DEFAULTS, enabled: true, rotation: true };

describe("I87 componenti: KioskBar", () => {
  test("renderizza le 3 viste con aria-pressed sulla vista attiva", () => {
    render(<KioskBar state={stato} view="grafico" nightDimActive={false} onView={() => {}} onPrefs={() => {}} onExit={() => {}} />);
    const gruppo = screen.getByRole("group", { name: "Vista kiosk" });
    expect(gruppo).toBeDefined();
    for (const v of KIOSK_VIEWS) {
      const btn = screen.getByRole("button", { name: v.label });
      expect(btn.getAttribute("aria-pressed")).toBe(v.key === "grafico" ? "true" : "false");
    }
  });

  test("il click su una vista chiama onView con la chiave giusta", () => {
    const viste: KioskView[] = [];
    render(<KioskBar state={stato} view="quote" nightDimActive={false} onView={(v) => viste.push(v)} onPrefs={() => {}} onExit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Analisi" }));
    expect(viste).toEqual(["analisi"]);
  });

  test("il bottone di uscita chiama onExit (sempre disponibile) e mostra il tasto Esc", () => {
    const uscite: number[] = [];
    render(<KioskBar state={stato} view="quote" nightDimActive={false} onView={() => {}} onPrefs={() => {}} onExit={() => uscite.push(1)} />);
    const esci = screen.getByRole("button", { name: /Esci dal kiosk/ });
    expect(esci.textContent).toContain("Esc");
    fireEvent.click(esci);
    expect(uscite).toHaveLength(1);
  });

  test("rotazione attiva: il selettore dell'intervallo è presente", () => {
    render(<KioskBar state={stato} view="quote" nightDimActive={false} onView={() => {}} onPrefs={() => {}} onExit={() => {}} />);
    expect(screen.getByLabelText("Intervallo di rotazione")).toBeDefined();
  });

  test("rotazione spenta: nessun selettore dell'intervallo", () => {
    render(
      <KioskBar
        state={{ ...stato, rotation: false }}
        view="quote"
        nightDimActive={false}
        onView={() => {}}
        onPrefs={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Intervallo di rotazione")).toBeNull();
  });

  test("i due switch chiamano onPrefs (rotazione e dimming) — Radix role=switch", () => {
    const patch: Array<Partial<KioskState>> = [];
    render(
      <KioskBar
        state={{ ...stato, rotation: false }}
        view="quote"
        nightDimActive={false}
        onView={() => {}}
        onPrefs={(p) => patch.push(p)}
        onExit={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Rotazione automatica delle viste" }));
    fireEvent.click(screen.getByRole("switch", { name: "Dimming notturno automatico (22:00–06:59)" }));
    expect(patch).toEqual([{ rotation: true }, { nightDim: true }]);
  });

  test("barra sticky a fondo pagina con indicatore di modalità e versione (I46)", () => {
    render(<KioskBar state={stato} view="quote" nightDimActive={false} onView={() => {}} onPrefs={() => {}} onExit={() => {}} />);
    const barra = screen.getByText("Kiosk").closest("div.sticky") ?? screen.getByText("Kiosk").parentElement?.parentElement;
    expect(barra?.getAttribute("class")).toContain("sticky bottom-0");
    // versione resa dalla fonte unica version.ts (formato AAAA-MM-GG)
    expect(screen.getByText(/v \d{4}-\d{2}-\d{2}/)).toBeDefined();
  });

  /* --------------------------- I132 — countdown rotazione --------------------------- */

  test("I132: rotazione attiva + scadenza armata → countdown «prossima vista tra»", () => {
    render(
      <KioskBar
        state={stato}
        view="quote"
        nightDimActive={false}
        prossimaRotazione={Date.now() + 15_000}
        onView={() => {}}
        onPrefs={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByLabelText("Prossima rotazione vista").textContent).toMatch(/^prossima vista tra \d+s$/);
  });

  test("I132: rotazione attiva ma scadenza non armata (null) → nessun countdown", () => {
    render(<KioskBar state={stato} view="quote" nightDimActive={false} prossimaRotazione={null} onView={() => {}} onPrefs={() => {}} onExit={() => {}} />);
    expect(screen.queryByLabelText("Prossima rotazione vista")).toBeNull();
  });

  test("I132: rotazione spenta → nessun countdown anche con scadenza passata via prop", () => {
    render(
      <KioskBar
        state={{ ...stato, rotation: false }}
        view="quote"
        nightDimActive={false}
        prossimaRotazione={Date.now() + 15_000}
        onView={() => {}}
        onPrefs={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.queryByLabelText("Prossima rotazione vista")).toBeNull();
  });
});
