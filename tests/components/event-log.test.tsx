/**
 * I81 — Test di componente: EventLog (I27 + filtri I77).
 *
 * Contatore «N di M eventi», filtro per kind via chip (radix ToggleGroup),
 * ricerca testuale e empty state dedicato. L'export resta collegato
 * all'archivio COMPLETO (già coperto da tests/lib), qui si verifica la vista.
 */
import "./setup-dom";
import { describe, test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventLog } from "@/components/event-log";
import type { UsageEvent } from "@/lib/usage-events";

const ev = (id: string, t: number, kind: UsageEvent["kind"], message: string, value: number | null = null): UsageEvent => ({
  id,
  t,
  kind,
  model: "general",
  win: kind === "reset" ? "interval" : null,
  message,
  value,
});

const EVENTI: UsageEvent[] = [
  ev("a", Date.parse("2026-10-11T10:00:00Z"), "reset", "Finestra di 5 ore resettata", 100),
  ev("b", Date.parse("2026-10-11T11:00:00Z"), "warn", "Soglia di attenzione superata", 48),
  ev("c", Date.parse("2026-10-11T12:00:00Z"), "error", "Rilevamento fallito (rete)", null),
];

describe("I81 componenti: EventLog", () => {
  test("senza filtri: descrizione di default e tutti gli eventi visibili", () => {
    render(<EventLog events={EVENTI} onClear={() => {}} />);
    // il contatore «N di M» appare solo con filtri attivi (design I77)
    expect(screen.getByText(/Reset rilevati, soglie superate ed errori/)).toBeDefined();
    expect(screen.getByText(/Finestra di 5 ore resettata/)).toBeDefined();
    expect(screen.getByText(/Soglia di attenzione superata/)).toBeDefined();
    expect(screen.getByText(/Rilevamento fallito/)).toBeDefined();
  });

  test("chip «Reset» → contatore 1 di 3 e solo l'evento di reset", () => {
    render(<EventLog events={EVENTI} onClear={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra solo eventi: Reset" }));
    expect(screen.getByText(/1 di 3 eventi/)).toBeDefined();
    expect(screen.getByText(/Finestra di 5 ore resettata/)).toBeDefined();
    expect(screen.queryByText(/Soglia di attenzione superata/)).toBeNull();
    expect(screen.queryByText(/Rilevamento fallito/)).toBeNull();
  });

  test("ricerca testuale (case-insensitive) e «Azzera filtri»", () => {
    render(<EventLog events={EVENTI} onClear={() => {}} />);
    fireEvent.input(screen.getByPlaceholderText(/Cerca/i), { target: { value: "SOGLIA" } });
    expect(screen.getByText(/1 di 3 eventi/)).toBeDefined();
    expect(screen.getByText(/Soglia di attenzione superata/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /Azzera tutti i filtri/ }));
    // i filtri azzerati tornano alla descrizione senza contatore
    expect(screen.getByText(/Reset rilevati, soglie superate ed errori/)).toBeDefined();
    expect(screen.getByText(/Rilevamento fallito/)).toBeDefined();
  });

  test("nessuna corrispondenza → empty state dedicato ai filtri", () => {
    render(<EventLog events={EVENTI} onClear={() => {}} />);
    fireEvent.input(screen.getByPlaceholderText(/Cerca/i), { target: { value: "inesistente-xyz" } });
    expect(screen.getByText(/Nessun evento corrisponde ai filtri/)).toBeDefined();
  });

  test("registro vuoto → empty state del registro (non dei filtri)", () => {
    render(<EventLog events={[]} onClear={() => {}} />);
    expect(screen.getByText(/Nessun evento registrato/)).toBeDefined();
  });
});
