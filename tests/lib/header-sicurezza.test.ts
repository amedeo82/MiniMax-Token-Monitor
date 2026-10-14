/**
 * I95 — Header di sicurezza (next.config.ts `headers()`): presenti su tutte
 * le risposte. HSTS SOLO in produzione (Vercel https) — in dev http non viene
 * inviato; CSP in modalità Report-Only (prima passata senza rischi).
 */
import { describe, test, expect, afterEach } from "bun:test";
import nextConfig from "../../next.config";

const env = process.env as Record<string, string | undefined>;
const NODE_ENV_ORIGINE = env["NODE_ENV"];
/* I95 — ripristino robusto (undefined → "undefined" stringa su alcuni runtime). */
afterEach(() => {
  if (NODE_ENV_ORIGINE === undefined) delete env["NODE_ENV"];
  else env["NODE_ENV"] = NODE_ENV_ORIGINE;
});

async function headerDi(): Promise<Map<string, string>> {
  const regole = await nextConfig.headers!();
  const mappa = new Map<string, string>();
  for (const regola of regole) {
    for (const h of regola.headers) mappa.set(h.key, h.value);
  }
  return mappa;
}

describe("I95 — header di sicurezza in next.config", () => {
  test("header comuni presenti (XCTO, Referrer-Policy, Permissions-Policy, XFO, CSP report-only)", async () => {
    env["NODE_ENV"] = undefined;
    const h = await headerDi();
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(h.get("Permissions-Policy")).toContain("camera=()");
    const csp = h.get("Content-Security-Policy-Report-Only") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(h.has("Strict-Transport-Security")).toBeFalse(); // solo produzione
  });

  test("HSTS solo quando il deployment serve https (produzione)", async () => {
    env["NODE_ENV"] = "production";
    const h = await headerDi();
    expect(h.get("Strict-Transport-Security")).toContain("max-age=31536000");
  });
});
