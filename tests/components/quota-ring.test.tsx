/**
 * I81 — Test di componente: QuotaRing e MiniBar (prima tornata).
 *
 * Rendering puro SVG: valore mostrato, N/D con null, arco allineato alla
 * percentuale (stroke-dashoffset), gradiente con l'id richiesto.
 */
import "./setup-dom";
import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { QuotaRing, MiniBar } from "@/components/quota-ring";

describe("I81 componenti: QuotaRing", () => {
  test("mostra la percentuale arrotondata e la label", () => {
    render(<QuotaRing value={37.4} color="warn" label="Finestra 5h" gradientId="g1" />);
    expect(screen.getByText("37%")).toBeDefined();
    expect(screen.getByText("Finestra 5h")).toBeDefined();
  });

  test("value null → trattino (N/D)", () => {
    render(<QuotaRing value={null} color="ok" gradientId="g2" />);
    expect(screen.getByText("—")).toBeDefined();
  });

  test("bigValue personalizzato sostituisce la percentuale", () => {
    render(<QuotaRing value={90.12} color="ok" bigValue="90,1%" gradientId="g3" />);
    expect(screen.getByText("90,1%")).toBeDefined();
    expect(screen.queryByText("90%")).toBeNull();
  });

  test("l'arco segue la percentuale (dashoffset) e il gradiente ha l'id richiesto", () => {
    const { container } = render(<QuotaRing value={50} color="ok" size={100} strokeWidth={10} gradientId="grad-test" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();
    // aria-label costruito con label/bigValue
    expect(svg!.getAttribute("aria-label")).toContain("Quota");
    const grad = container.querySelector("#grad-test");
    expect(grad).not.toBeNull();
    // circumference = 2π·45 ≈ 282,74; 50% → offset ≈ 141,37
    const arc = container.querySelectorAll("circle")[1]!;
    const offset = Number(arc.getAttribute("stroke-dashoffset"));
    expect(Math.abs(offset - 141.37)).toBeLessThan(0.1);
  });

  test("valori fuori range (negativi e > 100) sono saturi a 0/100", () => {
    const { container: cSotto } = render(<QuotaRing value={-5} color="crit" gradientId="g4" />);
    const arcSotto = cSotto.querySelectorAll("circle")[1]!;
    // 0% → offset = circumference piena
    expect(Number(arcSotto.getAttribute("stroke-dashoffset"))).toBeGreaterThan(0);
    const { container: cSopra } = render(<QuotaRing value={150} color="ok" gradientId="g5" />);
    const arcSopra = cSopra.querySelectorAll("circle")[1]!;
    expect(Number(arcSopra.getAttribute("stroke-dashoffset"))).toBe(0);
  });

  test("MiniBar: larghezza satura ai percento", () => {
    const { container } = render(<MiniBar value={25} color="warn" />);
    const inner = container.firstElementChild!.firstElementChild as HTMLElement;
    expect(inner.style.width).toBe("25%");
  });
});
