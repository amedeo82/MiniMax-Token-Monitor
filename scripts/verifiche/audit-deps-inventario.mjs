#!/usr/bin/env node
// Task 60 — Inventario dipendenze: dichiarato (package.json) vs installato (bun.lock)
// Uso: node scripts/verifiche/audit-deps-inventario.mjs [--json]
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url).pathname;

// bun.lock è JSONC (trailing commas): strip conservativo
function parseJsonc(text) {
  // rimuove trailing commas prima di } o ]
  return JSON.parse(text.replace(/,\s*([}\]])/g, "$1"));
}

const pkg = JSON.parse(readFileSync(root + "package.json", "utf8"));
const lock = parseJsonc(readFileSync(root + "bun.lock", "utf8"));

const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const tipoDip = {};
for (const [k, v] of Object.entries(pkg.dependencies ?? {})) tipoDip[k] = "dep";
for (const [k, v] of Object.entries(pkg.devDependencies ?? {})) tipoDip[k] = "dev";

const resolved = {};
for (const [name, entry] of Object.entries(lock.packages ?? {})) {
  // formato bun: ["nome@versione", "registry", {...metadati}, "integrità"]
  if (Array.isArray(entry) && typeof entry[0] === "string") {
    const at = entry[0].lastIndexOf("@");
    if (at > 0) resolved[name] = entry[0].slice(at + 1);
  }
}

const righe = [];
for (const name of Object.keys(deps).sort()) {
  const inst = resolved[name] ?? "NON-NEL-LOCK";
  righe.push({ pacchetto: name, tipo: tipoDip[name], dichiarato: deps[name], installato: inst });
}

const argvJson = process.argv.includes("--json");
if (argvJson) {
  console.log(JSON.stringify(righe, null, 2));
} else {
  console.log("%-38s %-5s %-14s %s");
  const fmt = (t, w) => String(t ?? "").padEnd(w);
  console.log(fmt("PACCHETTO", 38) + fmt("TIPO", 5) + fmt("DICHIARATO", 14) + "INSTALLATO");
  console.log("-".repeat        (70));
  for (const r of righe) {
    console.log(fmt(r.pacchetto, 38) + fmt(r.tipo, 5) + fmt(r.dichiarato, 14) + r.installato);
  }
  console.log();
  console.log("Totale pacchetti diretti:", righe.length);
  const mancanti = righe.filter((r) => r.installato === "NON-NEL-LOCK");
  if (mancanti.length) {
    console.log("ATTENZIONE — non presenti nel lock:", mancanti.map((m) => m.pacchetto).join(", "));
  }
}
