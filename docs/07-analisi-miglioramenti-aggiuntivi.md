# 07 — Analisi miglioramenti aggiuntivi (proposte I68–I82)

> **Storia**: questo documento è stato creato il 09/10/2026 come analisi di 15 ulteriori
> miglioramenti (client-only e non) proposti dopo la chiusura dei batch abbellimenti
> (docs/06) e **perso col secondo rollback del workspace dell'11/10**. Ri-creato l'11/10
> nel recovery con gli stessi numeri e significati comunicati in chat (tracciamento in
> `docs/04` §3).
>
> Stato: **13 di 15 implementate** — il **batch 1 client-only** (I69, I77, I76 con fix
> del bug noto, I73) è stato implementato l'11/10 pomeriggio (vedi §5.2, §5.6, §5.9,
> §5.10 e `docs/04` §3); il **batch 2 analisi** (I70, I71, I72) è stato implementato
> l'11/10 sera (vedi §5.3, §5.4, §5.5 e `docs/04` §3); il **batch 3 infrastruttura**
> (I80, I81, I68) è stato implementato l'11/10 notte (vedi §5.13, §5.14, §5.1 e
> `docs/04` §3); il **batch 4 UX** (I74, I75, I78) è stato implementato l'11/10 sera
> (vedi §5.7, §5.8, §5.11 e `docs/04` §3); restano 2 proposte ⬜ (I79, I82).

Contesto della proposta originale: dopo la chiusura dei batch 1–3 (I57–I67) l'analisi
aveva individuato 15 ulteriori miglioramenti in tre gruppi — analisi avanzata
(I68–I72), UX/UI (I73–I78) e robustezza/integrazione (I76/I79/I80/I81/I82) — con la
raccomandazione di un eventuale «batch 1 client-only» composto da I69 (selettore
intervallo), I77 (filtri eventi), I76 (error boundary + bug fix noto) e I73 (modalità
compatta).

---

## 5.1 I68 — Archivio con downsampling orario ✅
Nuova tabella Prisma `DownsampledPoint` (min/max/media/ultimo per ora) per mantenere
grafici leggibili e leggeri quando lo storico server cresce oltre i 10.000 punti; la
grana fine resta disponibile per le analisi (I26+), il grafico principale userebbe la
grana oraria oltre una soglia di zoom.

> **Implementato 11/10** (schema Prisma + `lib/downsample.ts` + manutenzione nella
> POST di `/api/history` + `GET /api/history?granularity=hour[&source=]` + backfill
> `scripts/verifiche/backfill-downsample.mjs` + voci «Storico orario» nel menu
> Esporta; design in `docs/03` §5.13): bucket per ora UTC × source (min/max/somma/
> ultimo per ciascuna finestra + count), **dato derivato** ricostruibile al 100% —
> il dato grezzo resta intatto; merge incrementale pura (`mergeHourBucket`) con
> errore non bloccante per il punto grezzo; stesso pruning a 90 giorni; 11 test.
> Il passaggio AUTOMATICO del grafico principale alla grana oraria resta candidato:
> la UI client lavora sui 600 punti locali e le analisi usano il fine grain.

## 5.2 I69 — Selettore intervallo temporale ✅
Preset 6h/24h/3g/7g/30g/tutto con filtro client-side sullo storico, applicabile a
grafico, ritmo e analisi; riduce il rumore visivo quando i dati diventano densi.

> **Implementato 11/10** (`lib/interval.ts` + selettore a chips in `page.tsx`; design in
> `docs/03` §5.11): finestra `[now − ampiezza, +∞)` inclusiva, «tutto» = array originale;
> filtro applicato a grafico, StatsPanel/trend, ritmo e analisi di lungo periodo; la
> Diagnostica resta deliberatamente sullo storico COMPLETO. 7 test dedicati.

## 5.3 I70 — Anomalie del ritmo ✅
Z-score robusto (mediana + MAD) sulla serie `rateSeries` (I59) per evidenziare i
momenti in cui il consumo devia dal proprio regime normale; candidata estensione del
pannello Diagnostica.

> **Implementato 11/10** (`lib/rate-anomalies.ts` + sezione in `diagnostica-panel.tsx`;
> design in `docs/03` §5.12): z-score Iglewicz–Hoaglin `0.6745·(x−mediana)/MAD` con
> soglia 3.5 sui ritmi GREZZI (`sma: 1`: la SMA smorzerebbe i picchi da segnalare);
> meno di 8 campioni validi → nessuna statistica; fallback documentato con MAD = 0
> (scala = media degli scarti assoluti); sezione «Anomalie del ritmo» in Diagnostica
> su storico COMPLETO con regime atteso, max 8 anomalie dalla più recente e z con
> segno (scoppio vs pausa). 10 test.

## 5.4 I71 — Qualità del campionamento ✅
Copertura attesa/osservata per giorno + elenco dei gap > 15 min: rende esplicita
quanto lo storico è «buono» prima di fidarsi delle analisi (complementare a V8).

> **Implementato 11/10** (`lib/sampling.ts` + sezione in `diagnostica-panel.tsx`;
> design in `docs/03` §5.12): mediana dell'intervallo campionario (robusta ai buchi),
> copertura per giorno Europe/Rome via chiave `YYYY-MM-DD` en-CA DST-safe (arco
> coperto = primo→ultimo punto del giorno, l'ultimo punto copre un intervallo suo;
> copertura limitata al 100%), gap > 15 min (`gapMin` configurabile, esattamente
> 15 min NON è un gap) dal più recente; sezione «Qualità del campionamento» in
> Diagnostica con badge di copertura media, barre degli ultimi 7 giorni e tabella
> dei gap. 14 test.

## 5.5 I72 — Proiezione con regressione esponenzialmente pesata ✅
Confronto A/B con il verdetto lineare di I23/I31: la media pesata esponenzialmente
reagirebbe più in fretta ai cambi di ritmo, al prezzo di più rumore; proposta con
esito affiancato (non sostitutivo) nel pannello pace.

> **Implementato 11/10** (`lib/ewma.ts` + card in `StatsPanel`; design in `docs/03`
> §5.12): ritmi istantanei con le STESSE regole di validità di `lib/rate.ts` (gap
> > 30 min e risalita scartati), peso `exp(−età/mezza vita)` misurata sul SECONDO
> rilevamento della coppia, mezza vita default 2h, esaurimento stimato solo con
> ritmo > 0.01 %/h; card «Proiezione EWMA (A/B)» nel StatsPanel AFFIANCATA al
> verdetto lineare (badge «sperimentale · non sostitutiva»): lineare vs EWMA,
> differenza e riga di lettura; segue l'intervallo selezionato (I69). 9 test.

## 5.6 I73 — Modalità compatta / widget ✅
`?compact=1`: solo anelli principali + countdown + ritmo, per uso come widget/schermo
secondario; compatibile con la PWA installata (I52).

> **Implementato 11/10** (`lib/compact.ts` + vista compatta in `page.tsx`; design in
> `docs/03` §5.11): header ridotto con pulsante di uscita «⤢ Torna alla vista completa»;
> sono visibili solo anelli+countdown (MainWindows), ritmo (RateChart) e selettore
> intervallo; errore API e schermata di setup restano visibili (servono alla funzione).
> Verificato in browser, zero overflow a 390px.

## 5.7 I74 — Navigazione inferiore su mobile ✅
Bottom bar fissa <md come alternativa alla section-nav sticky (I66) su telefono.

> **Implementato 11/10** (`components/bottom-nav.tsx` + wiring in `page.tsx`; design in
> `docs/03` §5.14): la logica di scrollspy di I66 è estratta in `useScrollSpySezioni()`
> (stesso file `section-nav.tsx`) e condivisa dalle due superfici; su <md la nav
> superiore è nascosta (`hidden md:block`) e la barra fissa al fondo mostra le stesse
> 8 ancore con target touch più grandi (`px-3 py-2`), safe-area iOS inclusa e
> spaziatore `h-16` dopo il footer per non coprirlo. Vista compatta I73: né nav né
> barra. Verificato in browser a 390px (barra fissa, top nav assente, click
> «Eventi» → aria-current + scroll, zero overflow). 3 test componente.
>
> **Nota I85 (12/10)**: l'hook condiviso guadagna il **retry dell'osservazione** (250 ms
> × 120) finché le 8 sezioni sono nel DOM — la barra mobile ereditava lo stesso
> scrollspy morto di I66 (observer nato sullo skeleton) e ora segue davvero lo scroll
> (verificato a 390px: «Eventi» attivo a fondo pagina). Dettagli: `docs/03` §5.17.

## 5.8 I75 — Vista stampa / report settimanale ✅
Blocco `print` dedicato + voce nel menu Esporta: sintesi settimanale stampabile
(verdetto, cicli, spreco, calendario).

> **Implementato 11/10** (`lib/print.ts` + `components/print-report.tsx` + regole
> `@media print` in globals.css + voce nel menu Esporta del grafico; design in
> `docs/03` §5.14): due livelli — (1) Ctrl+P sulla pagina: foglio bianco senza cromo
> (header/footer/nav/bottoni nascosti) e card non spezzabili; (2) «Stampa report
> settimanale» → `stampaReportSettimanale()` aggiunge `print-report` a `<body>`,
> stampa e ripristina su `afterprint` (anche con annullamento); le regole
> `body.print-report` riducono il foglio al SOLO blocco `.print-report-root`
> (verdetto lineare+EWMA, cicli+spreco per ENTRAMBE le finestre, consumo per giorno
> della settimana, calendario 12 settimane — calcolato sullo STORICO COMPLETO, non
> sull'intervallo I69). Lezione in itinere: l'header del report è un `<div>`, non un
> `<header>` — la regola print che nasconde il cromo della pagina lo avrebbe nascosto
> anch'esso (corretto e ri-verificato). Flusso verificato con un PDF reale (media
> print): solo report, intestazione inclusa. 4 test.

## 5.9 I76 — Error boundary per sezione + skeleton (+ bug fix noto) ✅
Error boundary React per ogni sezione con skeleton di fallback: un crash in un
pannello non deve buttare giù la pagina intera. **Evidenza empirica**: bug reale in
`event-log.tsx` (~203) dove `e.value != null` non copre `undefined` e un evento senza
`value` crasha il registro (e con esso tutta la pagina). ~~Il bug è ancora presente
nel codice ripristinato~~ → **corretto**.

> **Implementato 11/10** (`section-boundary.tsx` + fix in `event-log.tsx`; design in
> `docs/03` §5.11): il suffisso «· NN% residuo» è stampato solo con
> `typeof e.value === "number"`; **bug riprodotto e corretto in browser** (evento senza
> `value` iniettato in localStorage: renderizzato senza crash dopo il fix); ogni sezione
> principale della pagina è avvolta in un boundary indipendente con skeleton, messaggio
> tecnico e «Riprova».

## 5.10 I77 — Filtri del registro eventi ✅
Chips per `kind` (reset/warn/crit/error/info) + ricerca testuale + periodo, filtri
client-side sul registro già caricato.

> **Implementato 11/10** (`lib/event-filters.ts` + UI in `event-log.tsx`; design in
> `docs/03` §5.11): chips multi-selezione (nessuna = tutti), ricerca case-insensitive su
> messaggio e modello, periodo tutto/oggi (confini Roma DST-safe)/24h/7g; contatore
> «N di M eventi», empty state dedicato e «Azzera filtri»; l'export resta sull'archivio
> COMPLETO (i filtri sono una vista, non una cancellazione). 12 test dedicati.

## 5.11 I78 — Tema chiaro opzionale ✅
`next-themes` è già tra le dipendenze ma inutilizzato: tema chiaro completo
(palette chiara coerente con i ring continui I65).

> **Implementato 11/10** (`components/theme-toggle.tsx` + ThemeProvider in layout +
> strato di rimappatura in globals.css + tab «Aspetto» nelle impostazioni; design in
> `docs/03` §5.14): strategia `class` con `defaultTheme="dark"` (nessun cambiamento
> per gli utenti esistenti: il localStorage `theme` si popola solo con una scelta
> esplicita); toggle Sun/Moon nell'header + Select Sistema/Chiaro/Scuro nel nuovo
> tab «Aspetto» (le impostazioni passano da 3 a 4 tab); il Toaster usa il wrapper
> shadcn che già legge `useTheme`. La palette chiara NON tocca i componenti: regole
> unlayered `html:not(.dark)` (specificità maggiore delle utilities) ri-mappano le
> superfici hardcoded (`bg-[#09090b]`→bianco, scala zinc invertita, white-alpha →
> black-alpha, accent 200/300 → 600/700) e i tratti SVG white-alpha via selettori
> per attributo; il blocco JSON grezzo resta deliberatamente SCURO (come i code
> block dei siti chiari). Ring e favicon (I65/I67) invariati per costruzione.
> Verificato in browser: toggle → html.light con palette leggibile (screenshot),
> Select → dark, tema scuro INTATTO a confronto. 3 test componente.
>
> **Correzione leggibilità 12/10 (I83, `docs/03` §5.15)** — segnalazione utente:
> warning gialli, info azzurre EWMA, icone del registro eventi e tab attivo delle
> impostazioni illeggibili in chiaro. Tre famiglie di classi sfuggivano ai selettori
> per classe qui sopra: i nomi con PREFISSO VARIANTE (`data-[state=active]:…`) e
> SUFFISSO `!` (es. `bg-white/[0.08]!`) sono stringhe diverse nel DOM, e le varianti
> con OPACITÀ (`text-amber-200/70`) sono classi distinte da quelle senza. In più i
> toni 400/500 usati come testo/icona sono troppo chiari su bianco. Cure: selettori
> per STATO (tabs-trigger active, toggle-group-item on) e per classe escapata dentro
> un blocco `@layer utilities` con `!important` — lezione verificata al browser: le
> utilities `!important` layered battono SEMPRE le important unlayered (Cascade 5
> §6.4), quindi anche le regole `!` di I78 erano morte dalla nascita (senza effetti
> visibili solo perché in dark le utilities producono già i colori giusti); varianti
> opacità → 700/800/900; 400/500 testo/icone → 600; hover scuri; menu Esporta bianco.
> Tema scuro INTATTO (probe dopo reload), zero overflow 1280, console pulita.
>
> **Correzione I84 (12/10, `docs/03` §5.16)**: probe WCAG su ENTRAMBI i temi (fg fuso
> sullo sfondo effettivo, oklab/oklch/lab→sRGB) — la misura smentisce i toni 600 di
> I83 sulle tinte (2.5–3.6:1) e disegna DUE FAMIGLIE di colore esplicite: token
> `--mm-muted`/`--mm-muted-2` per tema (chiaro `rgb(95,95,104)`, scuro
> `rgb(150,150,160)`/`rgb(138,138,148)` — il testo secondario era L'UNICO FAIL scuro:
> zinc-500 3.85–4.12:1, zinc-600 2.26–2.58:1), accent chiaro →700 (rose/amber/sky/
> orange) e →800 (emerald, amber-200) con tinte forti sui toni 50 pieni; accent scuro
> INTATTO (già ≥5.5:1). Esiti: 0 FAIL su 74 campioni (era 21 chiaro + 6 scuro).
> Lezione toolchain: Turbopack serve CSS stale selettivo → pulizia `.next` + restart.

## 5.12 I79 — Audit di accessibilità sistematico
Contrasto misurato (WCAG AA), `aria-live` per aggiornamenti polling, focus visibili,
descrizioni `sr-only` per i grafici (heatmap, calendario, reset clock).

## 5.13 I80 — Endpoint read-only `/api/summary` ✅
KPI aggregati dal DB per widget esterni (statusline, home assistant, ecc.):
`GET /api/summary` senza chiave, solo numeri aggregati — ADR-8 (read-only) intoccato.

> **Implementato 11/10** (`src/app/api/summary/route.ts`; design in `docs/03` §5.13):
> punti (totale/api/demo/altro), arco, ultimoRilevamento, eventi (totale/perKind/
> ultimo) e downsample (ore/prima/ultima); SOLO query di lettura (count/groupBy/
> findFirst) — l'audit porta un check di ASSENZA delle scritture sulla route;
> verificato con curl sui dati reali.

## 5.14 I81 — Test di componente UI ✅
`@testing-library/react` + jsdom, `tests/components/`: prima tornata su quota-ring,
event-log, section-nav (logica pura già coperta dalla suite lib).

> **Implementato 11/10** (`tests/components/` + `bunfig.toml` preload; design in
> `docs/03` §5.13): **jsdom scartato in favore di happy-dom** — sotto Bun il pattern
> ufficiale è `@happy-dom/global-registrator`, e jsdom con `act`/React 19 è meno
> affidabile; il preload registra il DOM PRIMA che testing-library (`screen` si lega
> a document.body al load). Prima tornata: QuotaRing/MiniBar (6), SectionNav (3),
> SectionBoundary (2, con figlio che lancia), EventLog (5). 16 test componente.

## 5.15 I82 — Generalizzazione multi-modello
Parametrizzazione `model_name` in cicli/storico: oggi le analisi usano «general» come
pivot; la generalizzazione aprirebbe le analisi anche agli altri modelli del piano.

---

## Priorità suggerite (invariate dalla proposta originale)

1. ~~**Batch 1 client-only** (basso rischio, alto valore percepito): I69 · I77 · I76 (con
   il fix del bug `e.value != null`) · I73.~~ → **IMPLEMENTATO 11/10** (vedi §5.2/§5.6/
   §5.9/§5.10 e `docs/04` §3).
2. ~~**Batch 2 analisi**: I70 · I71 · I72.~~ → **IMPLEMENTATO 11/10** (vedi §5.3/§5.4/
   §5.5 e `docs/04` §3).
3. ~~**Batch 3 infrastruttura/integrazione**: I80 · I81 · I68.~~ → **IMPLEMENTATO
   11/10** (vedi §5.13/§5.14/§5.1 e `docs/04` §3).
4. ~~**Backlog/qualità**: I74 · I75 · I78 · I79 · I82.~~ → **I74 · I75 · I78
   IMPLEMENTATI 11/10** (batch 4 UX, vedi §5.7/§5.8/§5.11 e `docs/04` §3); restano
   in backlog **I79** (audit di accessibilità) e **I82** (generalizzazione multi-modello).
