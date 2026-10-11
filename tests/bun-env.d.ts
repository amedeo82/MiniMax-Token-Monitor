/**
 * I50 — Rende disponibili i tipi di `bun:test` (e i globali Bun) a tsc per
 * l'intera cartella tests/. bun-types è già in devDependencies; senza questo
 * reference tsc segnala TS2307 su `import ... from "bun:test"`.
 */
/// <reference types="bun-types" />
