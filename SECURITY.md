# Politica di sicurezza

## Segnalare una vulnerabilità

**Non aprire una issue pubblica per i problemi di sicurezza.**

Usa il canale di segnalazione privato integrato di GitHub:

> **Repository → Security → Report a vulnerability**
> (GitHub Private Vulnerability Reporting)

Il canale è cifrato, visibile solo al maintainers e ti permette di coordinare
la divulgazione insieme a chi mantiene il progetto. Rispondiamo tipicamente
entro 7 giorni; l'eventuale advisory pubblico segue la risoluzione.

## Versioni supportate

| Versione | Supporto |
|----------|----------|
| ultima versione su `main` (footer dell'app, es. «I136») | ✅ security fixes |
| commit/tag precedenti | ❌ aggiorna prima di segnalare |

L'app mostra la versione corrente nel footer (marcatore `APP_VERSION`).

## Modello di sicurezza del progetto (cosa aspettarsi)

- **Chiave MiniMax nel browser**: il tool è un client che usa la chiave
  **dell'utente** verso l'API MiniMax; la chiave vive nel `localStorage` del
  browser (per design, uso personale — non è mai inviata al server del
  progetto che fa solo da proxy). Un XSS riuscito potrebbe leggerla: è il
  rischio accettato del modello single-user, ridotto con header di sicurezza
  e CSP in modalità `Report-Only`.
- **Scritture protette**: le scritture server (storico, eventi, manutenzione)
  sono protette da `ADMIN_TOKEN` (confronto timing-safe) + rate limit
  (120 scritture/min/IP); il cron di manutenzione richiede `CRON_SECRET`.
  Senza `ADMIN_TOKEN` impostato le scritture restano aperte (configurazione
  volontaria per l'uso locale) — **impostalo se esponi l'app pubblicamente**.
- **Letture pubbliche**: `/api/summary`, `/api/persistenza`, `/api/manutenzione`
  (GET) sono read-only per design e non espongono segreti (host DB sanificato).
- **Segreti server** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ADMIN_TOKEN`,
  `CRON_SECRET`): solo nell'ambiente di deploy, mai nel repo — vedi
  `.env.example` e il README (§ Persistenza).

## Audit e presidi

L'ultima revisione di sicurezza completa è in `docs/11-audit-sicurezza.md`
(sintesi pubblica): SQL injection, XSS, injection, SSRF, segreti, storia git,
service worker, dipendenze. I presidi permanenti sono verificati ad ogni
consegna dall'audit dichiarativo (`bun run audit`) e dalla suite di test.
