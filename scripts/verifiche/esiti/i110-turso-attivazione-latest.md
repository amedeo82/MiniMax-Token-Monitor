# I110 — Attivazione Turso verificata empiricamente (probe di produzione)

- Data: 2026-10-16T15:41:08.791Z
- Host: minimax-monitor-amedeo82.aws-eu-west-1.turso.io (sanificato — token MAI stampato, stesso livello del pannello I107)
- Via: factory REALE src/lib/db-factory.ts (creaPrismaClient + preparaSchema), env TURSO_* dal .env locale (gitignored)

| Passo | Esito | Dettaglio |
|-------|-------|-----------|
| import factory reale | PASS | @/lib/db-factory + @/lib/schema-persistenza (67 ms) |
| modalità selezionata | PASS | modalitaPersistenza() = "turso" (atteso "turso" con TURSO_DATABASE_URL presente) |
| client di produzione | PASS | creaPrismaClient() con adapter libsql verso minimax-monitor-amedeo82.aws-eu-west-1.turso.io (token mai stampato) |
| preparaSchema (DDL incorporato) | PASS | gate completato in 3336 ms — 4 tabelle + 9 indici idempotenti su Turso (D1 zero migrazione nel cloud) |
| SELECT 1 | PASS | connessione ok, latenza 204 ms (RTT verso Turso) |
| conteggi 4 tabelle | PASS | UsagePoint=13 · DownsampledPoint=2 · UsageEventRecord=0 · ModelUsagePoint=52 |
| round-trip scrivi→leggi (POST+GET come le route) | PASS | upsert + findUnique ok in 229 ms (scrittura) — riga i110-probe-1792165267930 |
| cancella→verifica | PASS | delete ok in 427 ms — riga di prova rimossa (database lasciato com'era) |
| seconda preparaSchema (idempotenza) | PASS | no-op in 0 ms (cache WeakMap per client) |

Verdetto: **PASS** (9/9 passi)

Significato: con TURSO_DATABASE_URL+TURSO_AUTH_TOKEN nell'ambiente l'app si connette al database cloud, il DDL incorporato (I107-fix3) rende lo schema disponibile senza db-push-turso.mjs, e scrivere/leggere/cancellare via Prisma funziona — l'archivio server diventa DURATURO (sopravvive a istanze serverless e ridistribuzioni). Per Vercel: impostare le stesse due env nel dashboard (Project → Settings → Environment Variables) e ridistribuire.