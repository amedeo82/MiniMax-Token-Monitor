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
- **Navigazione interna sempre visibile** (I66/I85): 8 sezioni ancorate con evidenza della sezione visibile (scrollspy), barra **fissata in alto sotto l'header durante tutto lo scrolling**; **su telefono diventa barra fissa in basso** (I74) con gli stessi target e la stessa sezione attiva
- **Selettore intervallo temporale** (I69): preset 6h/24h/3g/7g/30g/tutto che restringono grafico, statistiche, ritmo e analisi (la diagnostica resta sull'intero storico)
- **Error boundary per sezione** (I76): un crash in un pannello non porta più giù la pagina — skeleton di fallback con «Riprova» per ogni sezione
- **Modalità compatta / widget** (I73): apri `/?compact=1` per solo anelli + countdown + ritmo (schermi secondari, compatibile con la PWA)
- **Modalità kiosk/TV** (I87): apri `/?kiosk=1` (o il toggle Monitor nell'header) per la vista da monitor dedicato — viste Quote/Grafico/Analisi con **rotazione automatica** configurabile (15 s–5 min) e **dimming notturno** (22:00–06:59, Europe/Rome); barra di controllo sticky a fondo pagina con uscita sempre disponibile (bottone o Esc), stato conservato tra le visite
- **Tema chiaro opzionale** (I78): toggle sole/luna nell'header o tab «Aspetto» delle impostazioni (Sistema/Chiaro/Scuro, default scuro invariato); il tema scuro resta quello di progetto, il JSON grezzo resta scuro anche in chiaro
- **Accessibilità sistematica** (I79): contrasto WCAG AA misurato con probe automatico su entrambi i temi (0 fallimenti), annunci `aria-live` degli aggiornamenti del polling, focus visibile da tastiera sulla navigazione, descrizioni testuali `sr-only`/`aria-label` per heatmap, calendario e orologio dei reset
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
- **Multi-regione simultanea** (I53): con una seconda chiave opzionale (regione opposta) ogni aggiornamento interroga eu+cn IN PARALLELO e la seconda regione appare con il suo pannello dentro «Panoramica» (piano, crediti, stato, modelli); storico, avvisi e analisi restano della regione primaria
- **Analisi multi-modello** (I82): selettore del modello pivot (general/video…) per grafico, ritmo e analisi di lungo periodo — storico per-modello persistito (locale + server) con etichette finestra adattive («24 ore» per il video); la Diagnostica resta sul monitor «general»
- **Export CSV/JSON** dello storico e del registro eventi (locale e archivio completo dal server; formato compatibile Excel it-IT)
- **Export orario** (I68): storico aggregato per ora (ultimo valore per ora, grana derivata) dal server
- **API di sintesi** (I80): `GET /api/summary` read-only senza chiave — KPI aggregati (punti, ultimo rilevamento, eventi, bucket orari) per statusline, home assistant e widget esterni

**Persistenza durevole** (F7/F8, offline-first)
- Storico replicato su **SQLite server-side** (fino a 10.000 punti / 90 giorni): sopravvive a cache svuotate e cambio dispositivo, con merge automatico all'avvio
- **Archivio eventi** oltre il diario locale di 200 voci (fino a 5.000 eventi / 180 giorni), stesso schema di sincronizzazione
- **Downsampling orario** (I68): tabella derivata `DownsampledPoint` (min/max/media/ultimo per ora UTC × sorgente) mantenuta al volo e ricostruibile con backfill — la grana fine resta intatta

**Qualità** (I50/I55)
- **Suite test automatica**: 311 test / 897 asserzioni (`bun test`) su parser, tempo, cicli, eventi, backoff, **downsampling (I68)**, filtri intervallo/eventi, modalità compatta, **kiosk (I87)**, **multi-regione (I53)**, anomalie/campionamento/EWMA, fallback endpoint, **flusso di stampa (I75)**, **storico per-modello (I82)**, parità TS↔Service Worker **e componenti UI (I81: QuotaRing, SectionNav, SectionBoundary, EventLog + I74 BottomNav + I78 ThemeToggle + I87 KioskBar + I53 RegionAltPanel con testing-library + happy-dom)**
- **Audit di riconciliazione** (`scripts/verifiche/audit-implementazioni.mjs`): 265 verifiche dichiarative su file/simboli/wiring/assenze con coverage check degli item ✅ — ogni distanza tra documentazione e codice rompe l'audit

---

## Indice della documentazione

| File | Contenuto | Quando consultarlo |
|------|-----------|--------------------|
| [`docs/01-api-minimax-ricerca.md`](docs/01-api-minimax-ricerca.md) | Tutte le scoperte sulle API MiniMax: endpoint confermati, autenticazione, chiavi, regioni, regole del piano, semantica dei campi, strategie (esterne) per il consumo token | Prima di toccare qualsiasi cosa riguardi le chiamate API |
| [`docs/02-analisi-json-quota.md`](docs/02-analisi-json-quota.md) | Analisi completa della risposta JSON di quota: schema dei campi, verifiche matematiche sulle unità di misura, conversioni timestamp Europe/Rome, formule derivate | Prima di modificare parser, tipi o logica temporale |
| [`docs/03-piano-implementazione.md`](docs/03-piano-implementazione.md) | Architettura, mappa del codice, modelli dati, flussi, gestione errori, sicurezza, fasi di lavoro con criteri di accettazione | Prima di implementare nuove funzionalità |
| [`docs/04-stato-avanzamento.md`](docs/04-stato-avanzamento.md) | Tracking dello stato di avanzamento: checklist attività, registro decisioni (ADR), verifiche empiriche da completare, changelog | **All'inizio e alla fine di ogni sessione di lavoro** |
| [`docs/05-verifiche-empiriche.md`](docs/05-verifiche-empiriche.md) | Runbook delle verifiche empiriche V1–V6 con il toolkit `scripts/verifiche/`: prerequisiti, comandi, verdetti automatici, piano di esecuzione in una giornata, registro delle esecuzioni | Prima di eseguire o interpretare le verifiche V1–V6 |
| [`docs/06-abbellimenti-dashboard.md`](docs/06-abbellimenti-dashboard.md) | Catalogo degli abbellimenti UI I57–I67 (spreco per ciclo, calendario, ritmo %/h, orologio dei reset, istogramma, salute del monitor, prevedibilità, anelli continui, nav sticky con scrollspy, identità del tab) | Prima di toccare anelli, analisi di lungo periodo o navigazione |
| [`docs/07-analisi-miglioramenti-aggiuntivi.md`](docs/07-analisi-miglioramenti-aggiuntivi.md) | Catalogo dei miglioramenti I68–I82 (downsampling, selettore intervallo, anomalie, campionamento, EWMA, modalità compatta, nav mobile, vista stampa, error boundary, filtri eventi, tema chiaro, audit a11y, `/api/summary`, test di componente, multi-modello) — **15 di 15 implementate** | Prima di estendere analisi o UX; le note di implementazione rimandano a `docs/03` §5.x |

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
3. Scegli la regione (**Europa** = minimax.io, **Cina** = minimaxi.com). Se possiedi un
   piano anche nell'altra regione, incolla la sua chiave in **Seconda regione** per il
   monitoraggio parallelo (I53) — lasciala vuota per la sola regione primaria.
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
│   ├── page.tsx                     # Dashboard: stato, polling con backoff (I51), import JSON, demo,
│   │                                #   avvisi, sync server, pivot modelli (I82), aria-live (I79),
│   │                                #   kiosk/TV (I87), versione nel footer (I46/I86)
│   ├── layout.tsx                   # ThemeProvider (I78) + Service Worker (I52) + classe dark
│   ├── manifest.ts                  # PWA manifest (I52)
│   ├── globals.css                  # Tema scuro di progetto + famiglie chiaro/scuro (I78/I83/I84)
│   │                                #   + regole print (I75) + focus nav (I79)
│   ├── api/minimax/usage/route.ts   # Proxy token_plan/remains con retry transitori (I51) + fallback (I18)
│   ├── api/history/route.ts         # I16: storico (upsert+pruning, GET, DELETE) + downsample (I68)
│   ├── api/history/models/route.ts  # I82: storico per-modello (ModelUsagePoint)
│   ├── api/events/route.ts          # I27: archivio eventi (upsert, filtri, DELETE)
│   └── api/summary/route.ts         # I80: KPI aggregati read-only per widget esterni
├── components/
│   ├── quota-cards.tsx              # ModelCard, MainWindows, badge, windowKindLabel/windowShortLabel (I82)
│   ├── quota-ring.tsx               # Anello percentuale (+ colore continuo/glow/count-up I65)
│   ├── history-chart.tsx            # HistoryChart (media mobile, cicli I32, EWMA I72, verdetto I23,
│   │                                #   pace I31, export, stampa I75), StatsPanel, RateChart (I59)
│   ├── analysis-panel.tsx           # I26/I32/I57/I58/I61/I63/I64: cicli, per giorno, heatmap,
│   │                                #   calendario, distribuzione — fonte per-modello (I82, I79 sr-only)
│   ├── diagnostica-panel.tsx        # I60/I62/I70/I71: reset clock, salute, anomalie, campionamento
│   ├── section-nav.tsx              # I66/I85: nav sezioni sticky con scrollspy condiviso (retry)
│   ├── bottom-nav.tsx               # I74: barra navigazione fissa su mobile
│   ├── kiosk-bar.tsx                # I87: barra di controllo kiosk/TV sticky (viste, rotazione, dimming, uscita)
│   ├── region-alt-panel.tsx         # I53: panoramica della SECONDA regione (solo con 2ª chiave)
│   ├── section-boundary.tsx         # I76: error boundary per sezione
│   ├── event-log.tsx                # Registro eventi (timeline, filtri I77, export, svuota)
│   ├── settings-dialog.tsx          # Impostazioni su 4 tab (connessione/avvisi/dati/aspetto I78)
│   ├── theme-toggle.tsx             # I78: toggle tema chiaro/scuro
│   ├── print-report.tsx             # I75: report settimanale stampabile
│   ├── pwa-register.tsx             # I52: registrazione Service Worker
│   ├── model-table.tsx              # PanoramicTable: tutte le finestre a confronto
│   ├── tech-panels.tsx              # RawJsonPanel, TechInfo
│   └── ui/                          # Componenti shadcn/ui
└── lib/
    ├── minimax.ts                   # Tipi, parser, stati, endpoint primario+fallback (I18), regioneAlt/chiaviPerRegione (I53)
    ├── time.ts                      # Europe/Rome + it-IT: formattazioni, countdown
    ├── backoff.ts                   # I51: backoff esponenziale con jitter
    ├── usage-events.ts              # Avvisi soglia per finestra (I28), reset, registro eventi
    ├── model-history.ts             # I82: storico per-modello (localStorage + sync)
    ├── server-history.ts / server-events.ts / server-model-history.ts  # Sync offline-first I16/I27/I82
    ├── cycles.ts                    # I26/I32/I57/I58/I61/I63/I64: cicli, heatmap, calendario, distribuzione
    ├── rate.ts / rate-anomalies.ts / ewma.ts / sampling.ts / health.ts  # I59/I70/I72/I71/I62
    ├── interval.ts / event-filters.ts / compact.ts / kiosk.ts / version.ts / print.ts  # I69/I77/I73/I87/I46/I75
    ├── downsample.ts / a11y.ts      # I68 bucket orari · I79 descrizioni sr-only
    ├── ring-color.ts / tab-identity.ts                                  # I65/I67
    └── export.ts / demo.ts / db.ts / utils.ts                           # Export CSV/JSON, demo, Prisma
prisma/schema.prisma                 # UsagePoint + UsageEventRecord + DownsampledPoint (I68) + ModelUsagePoint (I82)
db/custom.db                         # Database SQLite (bun run db:push)
public/                              # sw.js + sw-shared.js + icone PWA (I52)
tests/                               # Suite bun: lib/ (23 file) + components/ (8 file) = 311 test / 897 asserzioni
docs/          # Questa documentazione (01–07)
scripts/       # Artefatti delle ricerche + toolkit verifiche (verifica.mjs, audit-implementazioni.mjs,
               #   backfill-downsample.mjs, quarantena-debris.sh)
worklog.md     # Registro cronologico delle sessioni di lavoro
```

> **Residuo tracciato ma volutamente non cablato** (decisione I86 del 12/10; dettagli in
> `docs/03` §5.20 e `docs/04` §3): `src/lib/campione.ts` (campionatore passivo I49) resta
> nell'albero DORMIENTE, pronto al re-cablaggio nel proxy per la campagna V8 (verdetto sul
> fuso dei reset); l'audit verifica che non sia importato da alcun file. Gli altri residui
> dell'era 08/10 sono stati riconciliati: route Task 7 `api/verifiche` e scaffold
> `api/route.ts` RIMOSSI, versione I46 riattivata nel footer (`APP_VERSION`), kiosk I45
> riattivato come item proprio **I87** (modalità `?kiosk=1`).

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
