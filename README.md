# MiniMax Usage Monitor — Dashboard (Europa / Europe-Rome)

Dashboard interattiva per monitorare in tempo reale il consumo del piano a token MiniMax
(**Token Plan / M Plan**), con tutti gli orari calcolati nel fuso **Europe/Rome** e
formattati in **italiano (it-IT)**.

Il progetto interroga l'API ufficiale MiniMax, interpreta la risposta JSON, mostra
la quota rimanente e i **countdown di reset** delle finestre di utilizzo, storicizza
i dati (browser **e** server SQLite) e li **analizza**: cicli di finestra, consumo per
giorno della settimana, media mobile e proiezione di esaurimento.

---

## Stato del progetto

> **Fase attuale: core + estensioni di analisi/monitoraggio/persistenza completate e verificate
> (F0–F8).** La dashboard è funzionante in 3 modalità: **chiamata API reale** (via proxy server),
> **import manuale di una risposta JSON** e **modalità demo**. È **read-only**: non
> invoca mai modelli, quindi non consuma mai la quota che misura (ADR-8).
>
> **Verifiche empiriche V1–V6**: il toolkit è pronto e validato (`scripts/verifiche/` + runbook
> `docs/05`). La campagna con chiave reale del 04–05/10 è stata **interrotta dal riavvio del
> workspace del 06/10** e i verdetti non sono recuperabili dagli artefatti; il meccanismo di
> delega è stato chiuso (ADR-13/ADR-13-R). Le verifiche tornano **da rieseguire** secondo il
> piano `docs/05` §9; l'esito di V4 sblocca il fallback I18.
>
> Dettagli e checklist aggiornata: [`docs/04-stato-avanzamento.md`](docs/04-stato-avanzamento.md)

---

## Funzionalità

**Monitoraggio delle quote**
- Anelli e barre per ogni finestra del piano (5h / settimanale / 24h video) con badge di stato e countdown vivi (Europe/Rome); anelli principali con **colore continuo HSL + glow dinamico + count-up** (I65)
- **Avvisi di soglia per finestra** (I28): banner fisso, toast e notifiche del browser quando la quota scende sotto le soglie — attenzione e critiche configurabili **indipendentemente** per finestra 5 ore / 24 ore (video) / settimanale (default 25% / 10%) e al reset delle finestre; con **notifiche a tab chiuso via Service Worker** (I52/ADR-14)
- **Registro eventi**: timeline locale (reset rilevati, soglie superate, errori di rilevamento) raggruppata per giorno, con **filtri per tipo, ricerca testuale e periodo** (I77), export e svuotamento (locale + archivio server)
- Polling automatico configurabile con **backoff esponenziale con jitter** (I51: su errore il ritardo cresce fino a 10 min e rispetta il Retry-After dell'API; il proxy ritenta gli errori transitori), **fallback automatico sull'endpoint alternativo `coding_plan/remains`** (I18: se il primario sparisce — 404/405/410/501 o risposta non-JSON — il rilevamento continua senza intervento, con evento nel registro), import manuale di una risposta JSON, modalità demo
- **PWA installabile con cache offline** (I52): manifest, icone, shell e ultimo snapshot validi in cache; il Service Worker conserva la chiave SOLO in IndexedDB (mai in cache/log)
- **Titolo e favicon dinamici** (I67): residuo 5h nel titolo del tab e mini-ring colorato come favicon
- **Navigazione interna sticky con scrollspy** (I66): 8 sezioni ancorate con evidenza della sezione visibile; **su telefono diventa barra fissa in basso** (I74) con gli stessi target e la stessa sezione attiva
- **Selettore intervallo temporale** (I69): preset 6h/24h/3g/7g/30g/tutto che restringono grafico, statistiche, ritmo e analisi (la diagnostica resta sull'intero storico)
- **Error boundary per sezione** (I76): un crash in un pannello non porta più giù la pagina — skeleton di fallback con «Riprova» per ogni sezione
- **Modalità compatta / widget** (I73): apri `/?compact=1` per solo anelli + countdown + ritmo (schermi secondari, compatibile con la PWA)
- **Tema chiaro opzionale** (I78): toggle sole/luna nell'header o tab «Aspetto» delle impostazioni (Sistema/Chiaro/Scuro, default scuro invariato); il tema scuro resta quello di progetto, il JSON grezzo resta scuro anche in chiaro
- **Report settimanale stampabile** (I75): voce «Stampa report settimanale» nel menu Esporta → il foglio contiene SOLO il report (verdetto lineare+EWMA, cicli e spreco, consumo per giorno, calendario); Ctrl+P diretto produce comunque una pagina leggibile senza cromo

**Analisi di utilizzo**
- Grafico storico della quota (finestra 5h o settimanale) con consumo medio in %/h, **media mobile** attivabile (SMA-10) e **overlay dei cicli** (fasce alternate per finestra + marker dei reset rilevati)
- **Verdetto di proiezione**: confronto tra esaurimento stimato (al ritmo attuale) e orario di reset — capisci subito se la quota durerà fino al reset o si esaurirà prima
- **Pace e quota sprecata** (I31): ritmo attuale vs ritmo di pareggio (%/h che azzererebbe la quota al reset), residuo previsto alla ricarica (= quota che andrà sprecata) e fermo tecnico stimato quando l'esaurimento anticipa il reset
- **Analisi di lungo periodo** (I26): cicli di finestra 5h e settimanali con durata/consumo/ritmo medi, tabella degli ultimi cicli e consumo medio per giorno della settimana (calcolati su fino a 10.000 punti dal server)
- **Heatmap ore × giorno** (I32): quando si consuma davvero — griglia 7×24 (Europe/Rome) con selettore finestra, ora di picco e intensità proporzionale al consumo
- **Spreco per ciclo e prevedibilità** (I57/I63): quanto quota ogni reset butta via (media/mediana/peggiore/% cicli puliti) e quanto sono regolari le durate dei cicli (indice 0–100)
- **Calendario del consumo** (I58): griglia stile GitHub delle ultime settimane (Europe/Rome, DST-safe), settimana corrente = ultima colonna
- **Ritmo di consumo %/h** (I59): serie istantanea smorzata sotto il grafico, con buchi onesti su gap e reset
- **Istogramma del residuo** (I61): quante volte la quota è stata osservata in ciascuna fascia 0–100
- **Oggi vs media** (I64): consumo di oggi contro la media degli stessi giorni delle ultime 5 settimane (oggi escluso)
- **Diagnostica del monitor** (I60/I62): orologio dei reset (dot plot asse UTC con blocchi teorici 00/05/10/15/20) e salute del rilevamento (episodi di errore, guasto più frequente, stato del backoff)
- **Anomalie del ritmo** (I70): z-score robusto (mediana + MAD) sui ritmi grezzi — scoppi di consumo e pause anomale fuori regime, con regime atteso e soglia |z| > 3.5
- **Qualità del campionamento** (I71): copertura attesa/osservata per giorno (Europe/Rome, DST-safe) e buchi > 15 min — quanto lo storico è «buono» prima di fidarsi delle analisi
- **Proiezione EWMA (A/B)** (I72): secondo parere esponenzialmente pesato (mezza vita 2h) affiancato al verdetto lineare — mostra quanto il ritmo recente si discosta dalla media della finestra
- **Panoramica modelli**: tabella comparativa di tutte le finestre del piano (residuo, stato, countdown reset)
- **Export CSV/JSON** dello storico e del registro eventi (locale e archivio completo dal server; formato compatibile Excel it-IT)
- **Export orario** (I68): storico aggregato per ora (ultimo valore per ora, grana derivata) dal server
- **API di sintesi** (I80): `GET /api/summary` read-only senza chiave — KPI aggregati (punti, ultimo rilevamento, eventi, bucket orari) per statusline, home assistant e widget esterni

**Persistenza durevole** (F7/F8, offline-first)
- Storico replicato su **SQLite server-side** (fino a 10.000 punti / 90 giorni): sopravvive a cache svuotate e cambio dispositivo, con merge automatico all'avvio
- **Archivio eventi** oltre il diario locale di 200 voci (fino a 5.000 eventi / 180 giorni), stesso schema di sincronizzazione
- **Downsampling orario** (I68): tabella derivata `DownsampledPoint` (min/max/media/ultimo per ora UTC × sorgente) mantenuta al volo e ricostruibile con backfill — la grana fine resta intatta

**Qualità** (I50/I55)
- **Suite test automatica**: 249 test / 761 asserzioni (`bun test`) su parser, tempo, cicli, eventi, backoff, **downsampling (I68)**, filtri intervallo/eventi, modalità compatta, anomalie/campionamento/EWMA, fallback endpoint, **flusso di stampa (I75)**, parità TS↔Service Worker **e componenti UI (I81: QuotaRing, SectionNav, SectionBoundary, EventLog + I74 BottomNav + I78 ThemeToggle con testing-library + happy-dom)**
- **Audit di riconciliazione** (`scripts/verifiche/audit-implementazioni.mjs`): 203 verifiche dichiarative su file/simboli/wiring/assenze con coverage check degli item ✅ — ogni distanza tra documentazione e codice rompe l'audit

---

## Indice della documentazione

| File | Contenuto | Quando consultarlo |
|------|-----------|--------------------|
| [`docs/01-api-minimax-ricerca.md`](docs/01-api-minimax-ricerca.md) | Tutte le scoperte sulle API MiniMax: endpoint confermati, autenticazione, chiavi, regioni, regole del piano, semantica dei campi, strategie (esterne) per il consumo token | Prima di toccare qualsiasi cosa riguardi le chiamate API |
| [`docs/02-analisi-json-quota.md`](docs/02-analisi-json-quota.md) | Analisi completa della risposta JSON di quota: schema dei campi, verifiche matematiche sulle unità di misura, conversioni timestamp Europe/Rome, formule derivate | Prima di modificare parser, tipi o logica temporale |
| [`docs/03-piano-implementazione.md`](docs/03-piano-implementazione.md) | Architettura, mappa del codice, modelli dati, flussi, gestione errori, sicurezza, fasi di lavoro con criteri di accettazione | Prima di implementare nuove funzionalità |
| [`docs/04-stato-avanzamento.md`](docs/04-stato-avanzamento.md) | Tracking dello stato di avanzamento: checklist attività, registro decisioni (ADR), verifiche empiriche da completare, changelog | **All'inizio e alla fine di ogni sessione di lavoro** |
| [`docs/05-verifiche-empiriche.md`](docs/05-verifiche-empiriche.md) | Runbook delle verifiche empiriche V1–V6 con il toolkit `scripts/verifiche/`: prerequisiti, comandi, verdetti automatici, piano di esecuzione in una giornata, registro delle esecuzioni | Prima di eseguire o interpretare le verifiche V1–V6 |

> **Protocollo per le prossime sessioni**: leggere prima `docs/04-stato-avanzamento.md`
> (e questo README), lavorare, poi aggiornare lo stato e il changelog. In più
> appendere una riga di registro in `worklog.md`. Così non si ripete mai la ricerca.

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI) + **lucide-react**
- **Recharts** per il grafico storico
- **Prisma + SQLite** (`db/custom.db`) per la persistenza server-side (storico + archivio eventi)
- **sonner** per i toast di avviso
- **localStorage** per impostazioni e mirror client (fonte primaria per la UI, sync offline-first con il server)
- Proxy server-side (`/api/minimax/usage`) per evitare CORS e proteggere la chiave

## Avvio rapido

```bash
bun install          # o npm install
bun run db:push      # crea/aggiorna il DB SQLite (persistenza storico + eventi)
bun run dev          # http://localhost:3000
bun run lint         # ESLint
bun run build        # build di produzione
```

Alla prima apertura la dashboard parte in **modalità demo**. Per usare i dati reali:
1. Apri **Impostazioni** (icona ingranaggio).
2. Incolla la **Subscription Key** del Token Plan (Console → *Plan Details*, vedi `docs/01` §2).
3. Scegli la regione (**Europa** = minimax.io, **Cina** = minimaxi.com).
4. Disattiva la demo e salva.

In alternativa, senza chiave: **Impostazioni → "Incolla una risposta JSON"** per
analizzare una risposta reale catturata altrove (curl, browser, CLI `mmx quota`).

## Regole del piano — sintesi operativa

| Finestra | Vale per | Durata | Inizio |
|----------|----------|--------|--------|
| **Intervallo** | Modelli non video (testo, immagini, audio) | 5 ore | Al primo utilizzo (rolling) |
| **Settimanale** | Tutti i modelli, video incluso | 7 giorni | Al primo utilizzo (rolling) |

- I modelli non video richiedono quota residua in **entrambe** le finestre; il video **solo** in quella settimanale.
- Le due finestre si resettano **indipendentemente**; nessun carry-over.
- **Fonte della verità**: le percentuali (`*_remaining_percent`), non i conteggi (`*_usage_count` che spesso valgono 0 o indicano il **residuo**, non il consumato — vedi `docs/02` §3).
- Il dettaglio in **token assoluti** non è integrato: l'unico metodo programmatico consuma quota (ADR-8); usa la console ufficiale <https://platform.minimax.io/console/usage> (vedi `docs/01` §6).

## Struttura del repository (parti rilevanti)

```
src/
├── app/
│   ├── page.tsx                     # Pagina dashboard (stato, polling, import JSON, demo, avvisi, sync server)
│   ├── api/minimax/usage/route.ts   # Proxy server-side verso token_plan/remains
│   ├── api/history/route.ts         # I16: persistenza storico (POST upsert+pruning, GET, DELETE)
│   └── api/events/route.ts          # I27: persistenza registro eventi (upsert per id, filtri, DELETE)
├── components/
│   ├── quota-cards.tsx              # ModelCard, MainWindows, badge di stato, windowKindLabel
│   ├── quota-ring.tsx               # Anello percentuale (QuotaRing)
│   ├── history-chart.tsx            # HistoryChart (+ media mobile SMA-10, fasce cicli/reset, export locale+server), StatsPanel, verdetto proiezione, pace + quota sprecata
│   ├── analysis-panel.tsx           # I26: Analisi di lungo periodo (cicli, per giorno, heatmap per ora I32, KPI)
│   ├── model-table.tsx              # PanoramicTable: tutte le finestre a confronto
│   ├── event-log.tsx                # Registro eventi (timeline, export locale+archivio, svuota)
│   ├── tech-panels.tsx              # RawJsonPanel, TechInfo (diagnostica, endpoint, ora server)
│   ├── settings-dialog.tsx          # Impostazioni (3 tab) + soglie per finestra (I28) + import JSON
│   └── ui/                          # Componenti shadcn/ui
└── lib/
    ├── minimax.ts                   # Tipi, parser, normalizzazione, stati, endpoint
    ├── time.ts                      # Europe/Rome + it-IT: formattazioni, countdown
    ├── usage-events.ts              # Avvisi soglia per finestra, rilevamento reset, registro eventi
    ├── server-history.ts            # I16: sync storico browser↔server (replica + merge offline-first)
    ├── server-events.ts             # I27: sync registro eventi browser↔server
    ├── cycles.ts                    # I26/I32: rilevamento cicli, drawdown, per giorno, heatmap 7×24, SMA
    ├── export.ts                    # Esportazione CSV/JSON di storico ed eventi
    └── demo.ts                      # Generatore dati demo
prisma/schema.prisma                 # Modelli UsagePoint + UsageEventRecord (SQLite)
db/custom.db                         # Database SQLite (bun run db:push)
docs/          # Questa documentazione (01–05)
scripts/       # Artefatti delle ricerche + toolkit verifiche (scripts/verifiche/)
worklog.md     # Registro cronologico delle sessioni di lavoro
```

## Verifiche empiriche (toolkit)

```bash
node scripts/verifiche/verifica.mjs aiuto          # elenco comandi
node scripts/verifiche/verifica.mjs prova-parser   # autotest offline (senza chiave)
```

Le verifiche V1–V6 (semantica stato `2`, rolling 5h, reset senza uso, equivalenza
`coding_plan`, conteggi, rate limit) sono riproducibili con verdetto automatico:
procedura completa, piano di esecuzione e registro delle esecuzioni nel runbook
[`docs/05`](docs/05-verifiche-empiriche.md). La chiave si passa con la variabile
d'ambiente `MM_SUBSCRIPTION_KEY` (mai nei log né in chat).
