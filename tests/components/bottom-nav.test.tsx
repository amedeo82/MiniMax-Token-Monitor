/**
 * I74 — Test di componente: BottomNav (barra di navigazione inferiore mobile).
 *
 * Stesse ancore della nav I66 (condividono SEZIONI e scrollspy), ma con
 * aria-label dedicato e classi di posizionamento fisso + md:hidden.
 */
import "./setup-dom";
import { installIntersectionObserverStub } from "./setup-dom";
import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BottomNav } from "@/components/bottom-nav";
import { SEZIONI } from "@/components/section-nav";

beforeEach(() => {
  cleanup();
  installIntersectionObserverStub();
});

describe("I74 componenti: BottomNav", () => {
  test("renderizza le 8 ancore della dashboard con le label attese", () => {
    render(<BottomNav />);
    expect(screen.getAllByRole("link")).toHaveLength(SEZIONI.length);
    for (const s of SEZIONI) {
      expect(screen.getByRole("link", { name: s.label }).getAttribute("href")).toBe(`#${s.id}`);
    }
  });

  test("aria-label dedicato e classi fixed + md:hidden (solo mobile)", () => {
    render(<BottomNav />);
    const nav = screen.getByRole("navigation", { name: "Navigazione sezioni (mobile)" });
    const cls = nav.getAttribute("class") ?? "";
    expect(cls).toContain("fixed");
    expect(cls).toContain("bottom-0");
    expect(cls).toContain("md:hidden");
    // safe-area iOS gestita
    expect(cls).toContain("safe-area-inset-bottom");
  });

  test("il click aggiorna aria-current come nella nav superiore", () => {
    render(<BottomNav />);
    const analisi = screen.getByRole("link", { name: "Analisi" });
    fireEvent.click(analisi);
    expect(analisi.getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("link", { name: "Quota" }).getAttribute("aria-current")).toBeNull();
  });
});
