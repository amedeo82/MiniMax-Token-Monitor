# Verifica I106 — persistenza portabile (esito del 2026-10-15T03:30:18.110Z)

- Scenario: **A — ciclo completo su db file temporaneo tramite driver adapter libsql**
- Passi verificati: 6 — tutti PASS: SÌ
- PASS — scenario file — db temporaneo con schema nativo
- PASS — modalitaPersistenza() coerente con l'ambiente (modalità: turso (env presente → ramo adattato))
- PASS — tabelle dello schema presenti (via $queryRaw sull'adapter) (UsagePoint, DownsampledPoint, UsageEventRecord, ModelUsagePoint)
- PASS — punto scritto e riletto (accessor tipizzato sull'adapter) (interval=42.5 weekly=77.7)
- PASS — upsert deduplica (contratto I16) (righe=1, interval aggiornato=10)
- PASS — SQL raw parametrizzato ($queryRaw) sull'adapter (COUNT=1 — canale usato da server-model-history I42)

Il ciclo replica il contratto di produzione (stessa factory di src/lib/db.ts): schema creato con motore nativo, dati interamente via adapter libsql — upsert con dedup I16 incluso. L'equivalente su Turso remoto richiede solo le env TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (scenario B: solo lettura).
