/**
 * I115 — Configurazione del CLI Prisma 7.
 *
 * Prisma 7 non legge più l'URL dal datasource dello schema (`url` è stato
 * rimosso — P1012 alla prima esecuzione): i comandi CLI che toccano il
 * database (db push, migrate, introspection) prendono la connessione DA QUI.
 * Il client RUNTIME NON la usa: passa dall'adapter libsql con la regola
 * ambiente di src/lib/db-factory.ts (stessa di I106/I107: TURSO_DATABASE_URL
 * per Turso, altrimenti l'URL `file:` locale).
 *
 * La regola dell'URL è IDENTICA a urlPersistenzaLocale() (modalita-persistenza.ts):
 * DATABASE_URL se presente, altrimenti il default documentato «db/custom.db»
 * come percorso ASSOLUTO dal CWD (un relativo `file:./db/custom.db` sarebbe
 * risolto contro la cartella dello schema → prisma/db/custom.db — probe
 * empirica I107-fix).
 */
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL?.trim() || `file:${process.cwd()}/db/custom.db`,
  },
});
