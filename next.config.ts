import type { NextConfig } from "next";

/* I95 — Header di sicurezza su TUTTE le risposte (accettazione docs/08 I95:
   «header presenti su tutte le risposte»). CSP in modalità REPORT-ONLY: una
   prima passata senza rischi (il framework usa inline styles/script). HSTS
   solo in produzione (Vercel serve https): in dev su http il browser lo
   ignorerebbe per localhost, ma meglio non inviare affatto il header. */
const headerSicurezza = (): { key: string; value: string }[] => {
  const comuni: { key: string; value: string }[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    {
      key: "Content-Security-Policy-Report-Only",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];
  if (process.env.NODE_ENV === "production") {
    comuni.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
  }
  return comuni;
};

const nextConfig: NextConfig = {
  output: "standalone",
  // I94: `typescript.ignoreBuildErrors` RIMOSSO — il build verifica i tipi.
  // Il tsc è verde su TUTTO il repo: tsconfig esclude gli scaffolding
  // non-progetto (examples/, skills/) che erano l'unico motivo dell'opzione.
  reactStrictMode: false,
  /* I119 — audit sicurezza: il header «X-Powered-By: Next.js» è ATTIVO di
     default e rivela la tecnologia del server (fingerprinting gratuito per
     chi mappa le superfici d'attacco). Nessun consumer legittimo ne ha
     bisogno: disattivato. */
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: headerSicurezza() }];
  },
};

export default nextConfig;
