/**
 * I81 — Test di componente: SectionNav (I66) e SectionBoundary (I76).
 *
 * - SectionNav: le 8 ancore con label, aria-current sull'attiva, click che
 *   aggiorna l'attiva (IntersectionObserver stub: non serve l'osservazione
 *   reale per il render e per il click).
 * - SectionBoundary: un figlio che lancia → fallback con titolo, messaggio
 *   tecnico e «Riprova» (console.error silenziata: è la diagnostica voluta
 *   del boundary).
 */
import "./setup-dom";
import { installIntersectionObserverStub } from "./setup-dom";
import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SectionNav } from "@/components/section-nav";
import { SectionBoundary } from "@/components/section-boundary";

beforeEach(() => {
  cleanup();
  installIntersectionObserverStub();
});

describe("I81 componenti: SectionNav", () => {
  test("renderizza le 8 ancore con le label attese", () => {
    render(<SectionNav />);
    for (const label of ["Quota", "Grafico", "Ritmo", "Panoramica", "Analisi", "Diagnostica", "Tecnici", "Eventi"]) {
      expect(screen.getByRole("link", { name: label })).toBeDefined();
    }
  });

  test("href = #id della sezione e prima sezione attiva di default", () => {
    render(<SectionNav />);
    const quota = screen.getByRole("link", { name: "Quota" });
    expect(quota.getAttribute("href")).toBe("#quota");
    expect(quota.getAttribute("aria-current")).toBe("true");
    const analisi = screen.getByRole("link", { name: "Analisi" });
    expect(analisi.getAttribute("aria-current")).toBeNull();
  });

  test("il click aggiorna aria-current sulla sezione cliccata", () => {
    render(<SectionNav />);
    const diagnostica = screen.getByRole("link", { name: "Diagnostica" });
    fireEvent.click(diagnostica);
    expect(diagnostica.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Quota" }).getAttribute("aria-current")).toBeNull();
  });

  test("I85: la nav è sticky e nascosta su <md (hidden md:block) — figlia diretta di main, sempre visibile nello scroll desktop", () => {
    render(<SectionNav />);
    const nav = screen.getByRole("navigation", { name: "Sezioni della dashboard" });
    // sticky: resta fissa in alto durante lo scrolling (contenitore = <main>)
    expect(nav.className).toContain("sticky");
    // hidden md:block: su <md scompare (subentra la barra fissa I74)
    expect(nav.className).toContain("hidden");
    expect(nav.className).toContain("md:block");
  });
});

function Bomba(): React.JSX.Element {
  throw new Error("boom di prova");
}

describe("I81 componenti: SectionBoundary", () => {
  test("senza errori mostra i children", () => {
    render(
      <SectionBoundary title="Analisi di lungo periodo">
        <p>contenuto sano</p>
      </SectionBoundary>,
    );
    expect(screen.getByText("contenuto sano")).toBeDefined();
  });

  test("un figlio che lancia → fallback con titolo, alert e «Riprova»", () => {
    const errSpy = spyOn(console, "error").mockImplementation(() => {});
    render(
      <SectionBoundary title="Analisi di lungo periodo">
        <Bomba />
      </SectionBoundary>,
    );
    const alert = screen.getByRole("alert");
    expect(alert.getAttribute("data-section-boundary")).toBe("Analisi di lungo periodo");
    expect(screen.getByText(/temporaneamente non disponibile/)).toBeDefined();
    expect(screen.getByText(/boom di prova/)).toBeDefined();
    expect(screen.getByRole("button", { name: /Riprova/ })).toBeDefined();
    // la diagnostica del boundary è arrivata in console (e il log è silenziato)
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
