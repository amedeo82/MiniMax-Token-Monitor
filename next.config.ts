import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // I94: `typescript.ignoreBuildErrors` RIMOSSO — il build verifica i tipi.
  // Il tsc è verde su TUTTO il repo: tsconfig esclude gli scaffolding
  // non-progetto (examples/, skills/) che erano l'unico motivo dell'opzione.
  reactStrictMode: false,
};

export default nextConfig;
