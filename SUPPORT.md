# Supporto

> **English**: this is a personal open-source project maintained in Italian.
> For bugs and proposals, open an issue with the provided templates; for
> security vulnerabilities use **Security → Report a vulnerability** (see
> `SECURITY.md`). Quick start and deployment are documented in the README.

## Dove ottenere aiuto

| Bisogno | Canale |
|---------|--------|
| Prova live dell'app | https://minimax-token-monitor.vercel.app/ |
| Avvio rapido, persistenza, deployment | [README](README.md) — «Avvio rapido» e «Persistenza server» |
| Analisi, audit e decisioni del progetto | [docs/](docs/) — indice nel README (§ Indice della documentazione) |
| Bug nell'app o nelle API | [Issue con template «Segnalazione bug»](https://github.com/amedeo82/MiniMax-Token-Monitor/issues/new?template=bug_report.yml) |
| Idee e miglioramenti | [Issue con template «Proposta di funzionalità»](https://github.com/amedeo82/MiniMax-Token-Monitor/issues/new?template=feature_request.yml) |
| Vulnerabilità di sicurezza | **Security → Report a vulnerability** (canale privato, vedi [SECURITY.md](SECURITY.md)) — **mai** una issue pubblica |
| Comportamento della community | [Codice di condotta](CODE_OF_CONDUCT.md) |

## Prima di aprire una issue

1. **Versione**: copia il marcatore dal footer dell'app (formato
   «AAAA-MM-GG · Ixxx») — indica esattamente quale build stai usando;
2. **Modalità**: specifica se il problema si presenta in modalità demo (dati
   simulati, nessuna chiave) o con la tua chiave MiniMax;
3. **Log**: se aggiungi log della console o screenshot, occlude SEMPRE chiavi
   e token — la chiave MiniMax vive nel `localStorage` del browser e non deve
   mai finire in una issue;
4. **Duplicati**: controlla le [issue aperte](https://github.com/amedeo82/MiniMax-Token-Monitor/issues)
   e la documentazione (`docs/06`, `docs/07` per le proposte già valutate).

## Tempi di risposta

Il progetto è mantenuto da una sola persona nel tempo libero: non ci sono SLA.
Le vulnerabilità segnalate via canale privato ricevono tipicamente una risposta
entro 7 giorni (vedi `SECURITY.md`).
