# MiniMax Usage Monitor — Dashboard (Europa / Europe-Rome)

Dashboard interattiva per monitorare in tempo reale il consumo del piano a token MiniMax
(**Token Plan / M Plan**), con tutti gli orari calcolati nel fuso **Europe/Rome** e
formattati in **italiano (it-IT)**.

Il progetto interroga l'API ufficiale MiniMax, interpreta la risposta JSON, mostra
la quota rimanente e i **countdown di reset** delle finestre di utilizzo, e storicizza
i dati per visualizzarne l'andamento.

---

## Stato del progetto

> **Fase attuale: core + estensioni di analisi/monitoraggio completate e verificate.**
> La dashboard è funzionante in 3 modalità: **chiamata API reale** (via proxy server),
> **import manuale di una risposta JSON** e **modalità demo**. È **read-only**: non
> invoca mai modelli, quindi non consuma mai la quota che misura (ADR-8).
>
> Dettagli e checklist aggiornata: [`docs/04-stato-avanzamento.md`](docs/04-stato-avanzamento.md)

---

## Funzionalità

**Monitoraggio delle quote**
- Anelli e barre per ogni finestra del piano (5h / settimanale / 24h video) con badge di stato e countdown vivi (Europe/Rome)
- **Avvisi di soglia** configurabili: banner fisso, toast e notifiche del browser quando la quota scende sotto le soglie (default 25% attenzione, 10% critica) e al reset delle finestre
- **Registro eventi**: timeline locale (reset rilevati, soglie superate, errori di rilevamento) raggruppata per giorno, con export e svuotamento
- Polling automatico configurabile, import manuale di una risposta JSON, modalità demo

**Analisi di utilizzo**
- Grafico storico della quota (finestra 5h o settimanale) con consumo medio in %/h
- **Verdetto di proiezione**: confronto tra esaurimento stimato (al ritmo attuale) e orario di reset — capisci subito se la quota durerà fino al reset o si esaurirà prima
- **Panoramica modelli**: tabella comparativa di tutte le finestre del piano (residuo, stato, countdown reset)
- **Export CSV/JSON** dello storico e del registro eventi (formato compatibile Excel it-IT)

---

## Indice della documentazione

| File | Contenuto | Quando consultarlo |
|------|-----------|--------------------|
| [`docs/01-api-minimax-ricerca.md`](docs/01-api-minimax-ricerca.md) | Tutte le scoperte sulle API MiniMax: endpoint confermati, autenticazione, chiavi, regioni, regole del piano, semantica dei campi, strategie (esterne) per il consumo token | Prima di toccare qualsiasi cosa riguardi le chiamate API |
| [`docs/02-analisi-json-quota.md`](docs/02-analisi-json-quota.md) | Analisi completa della risposta JSON di quota: schema dei campi, verifiche matematiche sulle unità di misura, conversioni timestamp Europe/Rome, formule derivate | Prima di modificare parser, tipi o logica temporale |
| [`docs/03-piano-implementazione.md`](docs/03-piano-implementazione.md) | Architettura, mappa del codice, modelli dati, flussi, gestione errori, sicurezza, fasi di lavoro con criteri di accettazione | Prima di implementare nuove funzionalità |
| [`docs/04-stato-avanzamento.md`](docs/04-stato-avanzamento.md) | Tracking dello stato di avanzamento: checklist attività, registro decisioni (ADR), verifiche empiriche da completare, changelog | **All'inizio e alla fine di ogni sessione di lavoro** |

> **Protocollo per le prossime sessioni**: leggere prima `docs/04-stato-avanzamento.md`
> (e questo README), lavorare, poi aggiornare lo stato e il changelog. In più
> appendere una riga di registro in `worklog.md`. Così non si ripete mai la ricerca.

---

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI) + **lucide-react**
- **Recharts** per il grafico storico
- **sonner** per i toast di avviso
- **localStorage** per impostazioni, storico ed eventi (nessun database richiesto)
- Proxy server-side (`/api/minimax/usage`) per evitare CORS e proteggere la chiave

## Avvio rapido

```bash
bun install          # o npm install
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
│   ├── page.tsx                     # Pagina dashboard (stato, polling, import JSON, demo, avvisi)
│   └── api/minimax/usage/route.ts   # Proxy server-side verso token_plan/remains
├── components/
│   ├── quota-cards.tsx              # ModelCard, MainWindows, badge di stato, windowKindLabel
│   ├── quota-ring.tsx               # Anello percentuale (QuotaRing)
│   ├── history-chart.tsx            # HistoryChart (+ export CSV/JSON), StatsPanel, verdetto proiezione
│   ├── model-table.tsx              # PanoramicTable: tutte le finestre a confronto
│   ├── event-log.tsx                # Registro eventi (timeline, export CSV, svuota)
│   ├── tech-panels.tsx              # RawJsonPanel, TechInfo (diagnostica, endpoint, ora server)
│   ├── settings-dialog.tsx          # Impostazioni + soglie avvisi + import JSON
│   └── ui/                          # Componenti shadcn/ui
└── lib/
    ├── minimax.ts                   # Tipi, parser, normalizzazione, stati, endpoint
    ├── time.ts                      # Europe/Rome + it-IT: formattazioni, countdown
    ├── usage-events.ts              # Avvisi soglia, rilevamento reset, registro eventi
    ├── export.ts                    # Esportazione CSV/JSON di storico ed eventi
    └── demo.ts                      # Generatore dati demo
docs/          # Questa documentazione
scripts/       # Artefatti delle ricerche (docs ufficiali salvate, note, prove)
worklog.md     # Registro cronologico delle sessioni di lavoro
```
