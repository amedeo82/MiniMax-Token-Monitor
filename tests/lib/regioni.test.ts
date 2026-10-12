/**
 * I53 — Test delle helper multi-regione (`regioneAlt`, `chiaviPerRegione`).
 *
 * La campagna di polling parallela eu+cn dipende da queste decisioni pure:
 * coppie di interrogazione, dedup della chiave duplicata, normalizzazione
 * degli spazi. Il proxy e la pagina consumano l'elenco così com'è.
 */
import { describe, test, expect } from "bun:test";
import { chiaviPerRegione, regioneAlt } from "@/lib/minimax";

const base = { apiKey: "chiave-eu", apiKeyAlt: "", region: "eu" as const };

describe("I53 lib: regioneAlt", () => {
  test("eu → cn", () => {
    expect(regioneAlt("eu")).toBe("cn");
  });

  test("cn → eu", () => {
    expect(regioneAlt("cn")).toBe("eu");
  });

  test("è un involution: doppia applicazione torna alla regione di partenza", () => {
    expect(regioneAlt(regioneAlt("eu"))).toBe("eu");
    expect(regioneAlt(regioneAlt("cn"))).toBe("cn");
  });
});

describe("I53 lib: chiaviPerRegione", () => {
  test("senza chiave secondaria: SOLO la primaria (comportamento storico)", () => {
    const coppie = chiaviPerRegione({ ...base, apiKeyAlt: "" });
    expect(coppie).toHaveLength(1);
    expect(coppie[0]).toEqual({ region: "eu", key: "chiave-eu" });
  });

  test("con chiave secondaria diversa: primaria + secondaria nella regione opposta", () => {
    const coppie = chiaviPerRegione({ ...base, apiKeyAlt: "chiave-cn" });
    expect(coppie).toHaveLength(2);
    expect(coppie[0]).toEqual({ region: "eu", key: "chiave-eu" });
    expect(coppie[1]).toEqual({ region: "cn", key: "chiave-cn" });
  });

  test("simmetrico: primaria cn + secondaria eu", () => {
    const coppie = chiaviPerRegione({ apiKey: "chiave-cn", apiKeyAlt: "chiave-eu", region: "cn" });
    expect(coppie).toHaveLength(2);
    expect(coppie[0]).toEqual({ region: "cn", key: "chiave-cn" });
    expect(coppie[1]).toEqual({ region: "eu", key: "chiave-eu" });
  });

  test("dedup: la stessa chiave incollata due volte → una sola query (niente 1004 garantito)", () => {
    const coppie = chiaviPerRegione({ ...base, apiKeyAlt: "chiave-eu" });
    expect(coppie).toHaveLength(1);
    expect(coppie[0].region).toBe("eu");
  });

  test("normalizza gli spazi di entrambe le chiavi", () => {
    const coppie = chiaviPerRegione({ apiKey: "  chiave-eu  ", apiKeyAlt: "  chiave-cn  ", region: "eu" });
    expect(coppie).toHaveLength(2);
    expect(coppie[0].key).toBe("chiave-eu");
    expect(coppie[1].key).toBe("chiave-cn");
  });

  test("spazi intorno alla chiave: il dedup resta efficace (trim prima del confronto)", () => {
    const coppie = chiaviPerRegione({ ...base, apiKeyAlt: " chiave-eu " });
    expect(coppie).toHaveLength(1);
  });

  test("secondaria non vuota con primaria vuota (caso demo): due coppie", () => {
    const coppie = chiaviPerRegione({ apiKey: "", apiKeyAlt: "chiave-cn", region: "eu" });
    expect(coppie).toHaveLength(2);
    expect(coppie[1].region).toBe("cn");
  });

  test("non muta l'input (funzione pura)", () => {
    const s = { ...base, apiKeyAlt: "chiave-cn" };
    const copia = { ...s };
    chiaviPerRegione(s);
    expect(s).toEqual(copia);
  });
});
