/**
 * I53 — Test di componente: RegionAltPanel (pannello della seconda regione).
 *
 * Il pannello è SOLO visualizzazione: stato di connessione, piano, crediti,
 * ultimo rilevamento, errore con messaggio e panoramica dei modelli della
 * regione alternativa. È presente solo quando la seconda chiave è configurata
 * (la condizione di configurazione vive in page.tsx, non qui).
 */
import "./setup-dom";
import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, cleanup } from "@testing-library/react";
import { RegionAltPanel } from "@/components/region-alt-panel";
import { makeDemoSnapshot } from "@/lib/demo";

beforeEach(() => {
  cleanup();
});

const ORA = 1_760_000_000_000;

describe("I53 componenti: RegionAltPanel", () => {
  test("con snapshot: titolo con la regione, badge «connessa», piano e crediti", () => {
    const snap = makeDemoSnapshot("cn", ORA);
    render(<RegionAltPanel region="cn" snapshot={snap} errore={null} fetchedAt={ORA} now={ORA} />);
    expect(screen.getByText(/Seconda regione — Cina/)).toBeDefined();
    expect(screen.getByText("connessa")).toBeDefined();
    expect(screen.getByText(snap.planTitle ?? "")).toBeDefined();
    // crediti formattati it-IT (separatore migliaia punto, decimali virgola)
    if (snap.credits !== null) {
      expect(screen.getByText(snap.credits.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))).toBeDefined();
    }
  });

  test("con snapshot: mostra la tabella panoramica dei modelli della seconda regione", () => {
    const snap = makeDemoSnapshot("cn", ORA);
    render(<RegionAltPanel region="cn" snapshot={snap} errore={null} fetchedAt={ORA} now={ORA} />);
    // i modelli del piano demo compaiono nella tabella (header + righe)
    for (const m of snap.models) {
      expect(screen.getAllByText(new RegExp(m.modelName, "i")).length).toBeGreaterThan(0);
    }
  });

  test("in demo mostra anche il badge «dati simulati»", () => {
    const snap = makeDemoSnapshot("cn", ORA);
    render(<RegionAltPanel region="cn" snapshot={snap} errore={null} fetchedAt={ORA} now={ORA} />);
    expect(screen.getByText("dati simulati")).toBeDefined();
  });

  test("con errore: alert distruttivo con il messaggio, nessuna tabella", () => {
    render(
      <RegionAltPanel
        region="cn"
        snapshot={null}
        errore="Chiave API non valida o non autenticata (status_code 1004)."
        fetchedAt={ORA}
        now={ORA}
      />,
    );
    expect(screen.getByText("errore")).toBeDefined();
    expect(screen.getByText("Rilevamento della seconda regione fallito")).toBeDefined();
    expect(screen.getByText(/status_code 1004/)).toBeDefined();
    expect(screen.queryByText("connessa")).toBeNull();
  });

  test("senza dati né errore: badge «in attesa» e invito al primo rilevamento", () => {
    render(<RegionAltPanel region="cn" snapshot={null} errore={null} fetchedAt={null} now={ORA} />);
    expect(screen.getByText("in attesa")).toBeDefined();
    expect(screen.getByText(/Nessun dato ancora/)).toBeDefined();
  });

  test("ultimo rilevamento assente → «Mai»", () => {
    render(<RegionAltPanel region="cn" snapshot={null} errore={null} fetchedAt={null} now={ORA} />);
    expect(screen.getByText("Mai")).toBeDefined();
  });

  test("regione eu: il titolo mostra l'etichetta Europa", () => {
    render(<RegionAltPanel region="eu" snapshot={null} errore={null} fetchedAt={null} now={ORA} />);
    expect(screen.getByText(/Seconda regione — Europa/)).toBeDefined();
  });
});
