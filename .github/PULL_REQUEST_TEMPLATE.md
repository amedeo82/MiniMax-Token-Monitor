<!-- Grazie per la PR! La CI riesegue automaticamente il protocollo completo:
     questa checklist allinea la consegna a quanto richiesto da CONTRIBUTING.md
     e dalla documentazione del progetto (docs/04). -->

## Cosa cambia

<!-- Descrizione sintetica del cambiamento + link alla issue se esiste («Closes #n»). -->

## Tipo di cambiamento

- [ ] Correzione bug
- [ ] Nuova funzionalità
- [ ] Documentazione
- [ ] Refactoring / manutenzione
- [ ] Dipendenze

## Checklist del protocollo di qualità (obbligatoria)

- [ ] `npx tsc --noEmit` — 0 errori di tipo
- [ ] `bun run lint` — 0 scoperte
- [ ] `bun test` — suite completa verde
- [ ] `bun run audit` — PASS, 0 scoperte (codice ↔ documentazione riconciliati)
- [ ] `bun audit` — dipendenze di produzione a zero vulnerabilità
- [ ] `docs/04` aggiornato (§3 riga item + §8 changelog) e `APP_VERSION`
      (`src/lib/version.ts`) allineata al changelog
- [ ] Nessun segreto/credenziale/dato personale nei file toccati (`.env` resta
      fuori dall'indice; vedi `SECURITY.md` per la segnalazione privata)

## Note per il reviewer

<!-- Comportamento nuovo, rischi, punti che meritano un'occhiata particolare. -->
