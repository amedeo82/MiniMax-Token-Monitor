# Contribuire a MiniMax Token Monitor

Grazie per l'interesse! Questo progetto nasce come tool personale e sta diventando
open source: le contribuzioni sono benvenute seguendo le regole qui sotto.

## Prerequisiti

- **Bun** ≥ 1.x (runtime + test runner) — https://bun.sh
- **Node.js** 22 (per Next.js)
- Un database per la persistenza: nessuno per iniziare (fallback automatico su
  SQLite locale) oppure [Turso](https://turso.tech) per il deployment serverless

## Avvio rapido

```bash
bun install
cp .env.example .env      # compila le variabili che servono a te (o nessuna)
bun run db:push           # crea lo schema (locale SQLite se non hai Turso)
bun dev                   # http://localhost:3000
```

La dashboard parte in **modalità demo** (dati simulati, nessuna chiamata API):
per i dati reali inserisci la tua Subscription Key MiniMax in Impostazioni.

## Protocollo di qualità (obbligatorio per ogni PR)

Ogni modifica passa dal protocollo completo — la CI lo riesegue sul PR:

```bash
npx tsc --noEmit        # 0 errori di tipo
bun run lint            # 0 scoperte eslint
bun test                # suite completa verde
bun run audit           # audit dichiarativo: PASS, 0 scoperte
bun audit               # dipendenze: produzione a ZERO vulnerabilità
```

L'audit dichiarativo (`scripts/verifiche/audit-implementazioni.mjs`) verifica che
documentazione e codice non divergano: **se documenti una funzionalità, il codice
deve stare dentro; se togli il codice, la documentazione va aggiornata**.

## Regole del repository

1. **Niente segreti**: mai commettere `.env`, chiavi, token (il `.gitignore` li
   copre; i check audit bloccano le ricadute). Le variabili vivono nell'ambiente
   di deploy — vedi `.env.example`.
2. **Niente dati personali**: i campioni d'uso reali non entrano nel repo (nel
   repo c'è solo `scripts/verifiche/campione-fixture.jsonl`, sintetica).
3. **Versione**: ogni incremento documentato aggiorna `APP_VERSION`
   (`src/lib/version.ts`) INSIEME a `docs/04` (§3 e §8) — l'audit verifica
   l'allineamento.
4. **Stile**: TypeScript stretto, componenti React 19, commenti in italiano,
   niente `dangerouslySetInnerHTML` senza discutere prima in una issue.
5. **Test**: ogni nuova funzionalità porta i suoi test (lib puri per la logica,
   testing-library per i componenti); ogni correzione porta il test che la
   dimostra.

## Segnalare bug e proporre funzionalità

- Bug: apri una **issue** con passi di riproduzione, comportamento atteso e
  versione del footer.
- Vulnerabilità: **mai** in issue pubblica — vedi `SECURITY.md`.
- Proposte: issue con contesto d'uso; il protocollo di sviluppo del progetto
  (suggerimento → autorizzazione → implementazione documentata) è descritto in
  `docs/04-stato-avanzamento.md`.
