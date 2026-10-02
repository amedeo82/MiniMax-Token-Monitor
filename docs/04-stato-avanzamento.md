# 04 — Stato di avanzamento del progetto

> **Questo è il file da leggere PRIMA di lavorare e da aggiornare DOPO aver lavorato.**
> Convenzioni stato: ⬜ da fare · 🔄 in corso · ✅ completato · ⏸ bloccato · ❓ incerto/da verificare.
>
> **Protocollo di aggiornamento** (per umani e agenti):
> 1. Leggi `README.md` + questo file + `worklog.md` (ultime 2 sezioni bastano).
> 2. Lavora su UNA attività alla volta; se crei una nuova attività, aggiungila qui.
> 3. Aggiorna le tabelle qui sotto (stato + note + data).
> 4. Aggiungi una sezione al `worklog.md` (append, mai sovrascrivere) seguendo il template già presente.
> 5. Se scopri qualcosa di nuovo sulle API → `docs/01`; sul JSON → `docs/02`; sull'architettura → `docs/03`.
> 6. Aggiorna il changelog in §8 di questo file.

Legenda fasi (definizione in `docs/03` §10): F0 setup · F1 dati · F2 UI quota ·
F3 tempo Roma · F4 storico · F5 robustezza · F6 estensioni.

---

## 1. Riepilogo fasi

| Fase | Descrizione | Stato | Completata il |
|------|-------------|-------|---------------|
| F0 | Setup progetto (Next 16, Tailwind 4, shadcn/ui, struttura lib) | ✅ | 2026-10-02 |
| F1 | Dati: tipi, parser tollerante, proxy API, errori | ✅ | 2026-10-02 |
| F2 | UI quota: card, barre, ring, badge, countdown | ✅ | 2026-10-02 |
| F3 | Tempo Europe/Rome + it-IT, ora server dedotta | ✅ | 2026-10-02 |
| F4 | Storico localStorage + grafico + trend | ✅ | 2026-10-02 |
| F5 | Robustezza: import JSON, demo, pannelli tecnici, verifiche browser | ✅ | 2026-10-02 |
| F6a | ~~Contatore token reale (chat completions + campo usage)~~ — **rimossa (ADR-8): consumava la quota del piano** | 🚫 | 2026-10-02 |
| F6b | Estensioni analisi/monitoraggio: avvisi soglia, registro eventi, export CSV/JSON, verdetto esaurimento vs reset, panoramica modelli | ✅ | 2026-10-02 |

---

## 2. Attività di ricerca (R)

| ID | Attività | Stato | Esito / riferimento |
|----|----------|-------|---------------------|
| R1 | Identificare l'endpoint che genera il JSON `model_remains` | ✅ | `GET https://www.minimax.io/v1/token_plan/remains` — confermato da docs ufficiali M Plan FAQ + issue #99 → `docs/01` §3 |
| R2 | Verificare schema autenticazione | ✅ | `Authorization: Bearer <Subscription Key>`; distinta da API key pay-as-you-go → `docs/01` §2 |
| R3 | Verificare unità dei timestamp e durate | ✅ | Tutto in **millisecondi**; triangolazione `end − remains` coincidente su 3 campi → `docs/02` §4 |
| R4 | Interpretare i conteggi (`*_total_count` / `*_usage_count`) | ✅ | Inaffidabili quando 0; quando popolati `usage_count` = **residuo** (issue #99); percent = verità → `docs/02` §3 |
| R5 | Codici di stato finestra 1/3 | ✅ (empirico) | 1 = attiva/in uso; 3 = inattiva/mai usata → `docs/01` §8.2 |
| R6 | Endpoint complementari (modelli, chat, video) | ✅ | `/v1/models`, `/v1/chat/completions` (con `usage`), `/v1/video_generation`, `/v1/query/video_generation` → `docs/01` §5 |
| R7 | Strategie per il consumo token reale | ✅ | `usage` nelle risposte chat, console usage, CLI `mmx quota` → `docs/01` §6 |
| R8 | Regole reset finestre (5h rolling + 7g) | ✅ | Docs ufficiali: inizio col primo utilizzo, reset indipendenti, no carry-over → `docs/01` §7 |
| R9 | Endpoint alternativo `coding_plan/remains` + via cookie | ✅ | Issue #88, CodexBar, dsh-provider-usage → `docs/01` §4 |
| R10 | Confermare empiricamente stato `2` (= esaurita?) | ❓ | Aperto → verifica V1 |
| R11 | Comportamento `start_time` subito dopo il reset senza uso | ❓ | Aperto → verifica V3 |

---

## 3. Attività di implementazione (I)

| ID | Attività | Fase | Stato | Note |
|----|----------|------|-------|------|
| I1 | Progetto base + componenti shadcn/ui | F0 | ✅ | Next 16 + React 19 + Tailwind 4 |
| I2 | `src/lib/minimax.ts`: tipi + parser + normalizzazioni | F1 | ✅ | Gestisce risposta piatta/`data`, epoch s/ms, status numerici e testuali |
| I3 | Proxy `/api/minimax/usage` (timeout 12s, errori italiani) | F1 | ✅ | POST body `{apiKey, region}` |
| I4 | `src/lib/time.ts`: formattazioni Europe/Rome it-IT | F3 | ✅ | 7 formattatori + countdown + windowProgress |
| I5 | `ModelCard` + `MainWindows` + `QuotaRing` + badge stato | F2 | ✅ | `windowKindLabel()` dinamica (5h vs 24h) |
| I6 | Countdown vivi (tick 1s) + ora server dedotta | F3 | ✅ | `inferServerTime()` in TechInfo |
| I7 | Storico localStorage (dedup <20s, cap 600) + HistoryChart + StatsPanel + TrendBadge | F4 | ✅ | Chiavi `mm-dash-history-v1` / `mm-dash-settings-v1` |
| I8 | Settings dialog (chiave, regione, refresh, demo) | F5 | ✅ | Persistita in localStorage |
| I9 | Import manuale JSON con validazione | F5 | ✅ | Testato con il JSON reale dell'utente |
| I10 | Modalità demo realistica | F5 | ✅ | `makeDemoSnapshot()` + storia demo |
| I11 | Pannelli tecnici: RawJsonPanel, TechInfo, avviso semantica `usage_count` | F5 | ✅ | Includono "altri endpoint utili" |
| I12 | Verifica end-to-end agent-browser (desktop+mobile, import, console) | F5 | ✅ | Screenshot in `scripts/verify_*.png` |
| I13 | Bugfix `videoDayStart` non definito in demo.ts | F5 | ✅ | Rilevato via agent-browser |
| I14 | Documentazione di progetto (questi 4 file + README) | — | ✅ | 2026-10-02 |
| I15 | ~~Contatore token reale via `/v1/chat/completions`~~ | F6a | 🚫 | **Rimossa 2026-10-02 (ADR-8)**: con la Subscription Key ogni chiamata consumava la quota del piano; rimossi `api/minimax/chat`, `lib/token-log.ts`, `TokenTracker` |
| I16 | Persistenza storica server-side (Prisma/SQLite) | F7 | ✅ | Modello `UsagePoint`, `api/history` (POST upsert/pruning, GET, DELETE), `lib/server-history.ts` (sync offline-first), merge all'avvio, export completo dal server — 2026-10-02 |
| I17 | Notifiche soglie (<10/25% o reset) | F6b | ✅ | `lib/usage-events.ts` (banner + toast + Notification API, soglie configurabili) — 2026-10-02 |
| I18 | Fallback automatico su `coding_plan/remains` | F6b | ⬜ | Dipende da V4 |
| I19 | ~~Persistenza del registro token su server~~ | F6b | 🚫 | **Rimossa**: dipendeva da I15 (ADR-8) |
| I20 | ~~Correlazione token ↔ calo percentuale quota~~ | F6b | 🚫 | **Rimossa**: dipendeva da I15 (ADR-8) |
| I21 | Registro eventi persistente + timeline UI | F6b | ✅ | `mm-dash-events-v1` (max 200) + `EventLog` (per giorno Roma, badge, svuota) — 2026-10-02 |
| I22 | Export storico ed eventi in CSV/JSON | F6b | ✅ | `lib/export.ts` (CSV «;» + BOM per Excel it-IT); pulsanti su grafico e registro — 2026-10-02 |
| I23 | Verdetto «esaurimento stimato vs orario di reset» | F6b | ✅ | `ProjectionVerdict` in `StatsPanel` (amber se si esaurisce prima del reset, verde altrimenti) — 2026-10-02 |
| I24 | Vista panoramica modelli (tutte le finestre a confronto) | F6b | ✅ | `PanoramicTable` (modello × finestra: residuo, stato, countdown reset) — 2026-10-02 |
| I25 | Riprogettazione UI finestra impostazioni | UX | ✅ | `settings-dialog.tsx` su 3 tab (Connessione/Avvisi/Dati), `max-h-[85svh]` con contenuto scrollabile, header/footer fissi — 2026-10-02 |
| I26 | Analisi di lungo periodo (cicli, medie, giorni della settimana) | F7 | ✅ | `lib/cycles.ts` (rilevamento cicli con `RESET_JUMP`=15 e `RESET_TARGET`=85, consumo=drawdown, `weekdayConsumption`, SMA) + `analysis-panel.tsx` (3 tab, KPI, tabella cicli, barre per giorno) + toggle «Media mobile» (SMA-10) sul grafico; scarica fino a 10.000 punti dal server — 2026-10-02 |
| I27 | Persistenza registro eventi su DB server-side (archivio oltre 200) | F8 | ✅ | Modello `UsageEventRecord`, `api/events` (POST upsert per id/pruning 5.000×180g, GET filtri `since`/`kind`, DELETE), `lib/server-events.ts` (replica fire-and-forget + merge per id), `addEvents()` in `page.tsx`, menu Esporta con archivio completo, «Svuota» locale+server — 2026-10-02 |

---

## 4. Dashboard delle verifiche empiriche (V)

> Come leggere: V = cosa osservare, con procedura riproducibile. Dopo ogni verifica,
> aggiornare `docs/01`/`docs/02` e spostare l'esito nelle tabelle §2/§3.

| ID | Domanda | Procedura | Stato |
|----|---------|-----------|-------|
| V1 | Il codice di stato `2` significa "esaurita"? | Consumare fino a esaurimento la finestra 5h (o simulare con un piano piccolo), poi chiamare `token_plan/remains` e osservare `current_interval_status` | ❓ aperta |
| V2 | La finestra 5h è rolling dal primo utilizzo anche nel nostro piano? | A fine finestra, annotare l'ora del primo utilizzo successivo e confrontarla col nuovo `start_time` (attenzione: docs dicono che start = primo utilizzo) | ❓ aperta |
| V3 | Dopo il reset senza nuovo utilizzo, `start_time` resta il vecchio o diventa `end_time`? | Polling ogni 60s attraverso un reset senza fare usage; registrare i valori | ❓ aperta |
| V4 | `coding_plan/remains` risponde con la stessa struttura e gli stessi dati di `token_plan/remains`? | Stessa chiave, entrambe le chiamate, diff delle risposte | ❓ aperta |
| V5 | I conteggi si popolano su alcuni piani (legacy a conteggi)? | Se disponibile una chiave di un piano legacy, confrontare `usage_count`/`total_count` con la percentuale | ❓ aperta |
| V6 | Rate limit sul polling della quota? | Polling a 10s per 10 minuti; osservare eventuali 429/1004 fittizi | ❓ aperta |

---

## 5. Registro delle decisioni (ADR sintetici)

| # | Data | Decisione | Motivazione | Alternative scartate |
|---|------|-----------|-------------|----------------------|
| ADR-1 | 2026-10-02 | Le **percentuali** sono la metrica primaria; i conteggi mostrati sempre con nota "non dichiarati" | Contraddizione reale (weekly 64% vs usage_count 0) + semantica "residuo" issue #99 → i conteggi non sono computabili in modo stabile | Usare `total − usage` come metrica primaria (fallisce quando total=0) |
| ADR-2 | 2026-10-02 | Countdown **ricalcolati localmente** da `end_time`, con `remains_time` usato solo per dedurre l'ora del server | `remains_time` è congelato alla query; ricalcolare rende i countdown vivi e tolleranti allo skew | Animare direttamente `remains_time` |
| ADR-3 | 2026-10-02 | Proxy server-side unico (`/api/minimax/usage`) invece di fetch diretto dal browser | Nessun CORS sull'endpoint MiniMax; chiave non esposta a referer/log terzi; timeout centralizzato | CORS proxy pubblici (insicuri), chiamate browser dirette (bloccate) |
| ADR-4 | 2026-10-02 | Solo `Intl.DateTimeFormat` per i fusi (no librerie date) | Zero dipendenze, correttezza CET/CEST garantita, locale it-IT nativo | date-fns-tz / dayjs (doppione inutile) |
| ADR-5 | 2026-10-02 | Storico in **localStorage** (max 600 punti, dedup 20s) | Zero backend, sufficiente per trend di sessione/giornata | DB server-side → rimandato a I16 (F6) |
| ADR-6 | 2026-10-02 | Parser tollerante (risposta sotto `data`, epoch s/ms, status numerici/testuali) | Le versioni/endpoint MiniMax variano (prove da CreditGauge/CodexBar/dsh) | Parser rigido (si rompe al primo cambiamento) |
| ADR-7 | 2026-10-02 | Modalità demo + import JSON come prima-class citizens | Permettono sviluppo/verifica senza esporre la chiave e senza API | Solo API reale (blocca lo sviluppo senza chiave) |
| ADR-8 | 2026-10-02 | **Rimozione del contatore token reale** (F6a): il dashboard NON invoca modelli e resta read-only su `token_plan/remains` | L'unico metodo programmatico per misurare i token (`usage` di `/v1/chat/completions`) richiede di consumare la quota stessa del piano; un monitor che consuma ciò che misura non è accettabile | Mantenere F6a dietro avviso esplicito (rischio di consumare quota senza accorgersene) |
| ADR-9 | 2026-10-02 | Avvisi **client-side e senza stato server**: banner stateless + transizioni tra snapshot consecutivi + registro eventi in localStorage (max 200) | Zero chiamate extra (il polling esiste già), nessun backend, niente spam di notifiche a ogni poll | Service worker (rimandato a F6 future), controllo soglie lato server |
| ADR-10 | 2026-10-02 | Storico server **offline-first**: replica fire-and-forget su SQLite + merge all'avvio (dedup per timestamp, vince il locale); il localStorage resta la fonte primaria per la UI | La dashboard funziona identica anche senza server; lo storico sopravvive a cache svuotate; il server conserva granularità piena (10.000 punti, 90 giorni) mentre la UI resta snella (600) | Solo localStorage (perso a cambio device), sync bidirezionale bloccante (latenza + complessità) |
| ADR-11 | 2026-10-02 | Registro eventi replicato su DB (I27) con lo **stesso schema offline-first di ADR-10**; il diario locale resta capito a 200 voci; «Svuota» cancella SEMPRE locale + server | Gli eventi (reset, soglie, errori) sono rari e preziosi: l'archivio server (5.000 / 180 giorni) li preserva oltre il diario di sessione e ne permette l'export completo; svuotare solo il locale farebbe risuscitare gli eventi al merge successivo | Storico eventi solo localStorage (perso a cambio device), filtro UI sull'archivio completo (rimandato: l'export copre il bisogno) |

---

## 6. Problemi noti e historico bugfix

| Data | Problema | Risoluzione |
|------|----------|-------------|
| 2026-10-02 | `videoDayStart` non definito in `demo.ts` (crash runtime demo) | Corretto: finestra giornaliera video calcolata su mezzanotte UTC (`Math.floor(now / DAY_MS) * DAY_MS`) |
| 2026-10-02 | Finestra impostazioni fuori schermo: dopo l'aggiunta della sezione avvisi la dialog (layout grid, senza vincolo d'altezza) superava il viewport e il pulsante «Salva» diventava irraggiungibile | Riprogettata (I25): layout a colonna con `max-h-[85svh]`, contenuti distribuiti su 3 tab, area centrale scrollabile, header/tablist/footer fissi; verificata a 1366×768, 1280×500 (scroll interno attivo, footer visibile) e 390×844 |
| 2026-10-02 | Rischio interpretazione errata dei `*_usage_count` | Badge/nota esplicativa nella UI (`CountsRow`) + pannello TechInfo con l'avviso semantico |
| 2026-10-02 | Falsi reset nell'analisi dei cicli (I26) con sorgenti miste: punti «api» reali (es. weekly 57%) alternati a punti «demo» (~77%) generavano salti +20 interpretati come reset, con cicli fittizi da 1 minuto e ritimi assurdi (>5000 %/h) | Regola reset bicondizione: salto ≥ +15 punti **e** valore post-salto ≥ 85% (`RESET_TARGET`, un reset vero riporta la finestra quasi piena); consumo rivalutato come **drawdown** (inizio − minimo del ciclo) e attribuzione per giorno solo sul calo del minimo progressivo: i rimbalzi senza reset non sono consumo. Verificato: dati misti ora producono esattamente i cicli attesi (2 settimanali, medie coincidenti con i valori teorici) |
| 2026-10-02 | **Stati hover e disabilitati «nero su nero»** (segnalazione utente): l'app è dark-only ma il tema shadcn restava light (nessuna classe `dark` su `<html>`), quindi `--accent-foreground` ≈ nero; al hover dei bottoni `outline` la regola shadcn `hover:text-accent-foreground` vinceva sulle classi custom → testo nero su fondo quasi nero (verificato: testo `lab(2.75%)` su `white/4%`); stesso meccanismo per lo stato disattivato e per i tab inattivi; inoltre le dark-variant Tailwind 4 (es. `dark:bg-input/30`) vengono emesse dopo le hover a pari specificità e seppellivano anche gli hover custom (`hover:bg-white/[0.08]` impercettibile 4%→4,5%) | Fix sistemico a 3 livelli: (1) classe `dark` su `<html>` in `layout.tsx` → tutti i token shadcn dark (accent grigio scuro, popover scuro, switch/select/disabled coerenti) e le `dark:` varianti finalmente attive; (2) regole **unlayered** in `globals.css` (fuori `@layer`: vincono sulle utilities layered per CSS Cascade 5) per gli hover custom `bg-white/[0.08]`, `bg-white/5`, `bg-white/[0.02]`, `bg-rose-500/20`, `text-rose-300` e per i tab inattivi; (3) `!` sulle classi hover custom nei componenti; Toaster sonner esplicito `theme="dark"`; tab grafico: rimosso `data-[state=active]:text-zinc-900` (residuo light) → `text-zinc-100`, aggiunto hover su inattivi. Verificato con pixel e computed style: hover Aggiorna 22→31 rgb (white/8), Esporta testo bianco (era nero), Svuota rosa `rgb(253,164,175)`, voci menu `white/8`, tab inattivi `white/5`+zinc-200, dialog 3 tab con switch on/off e sezione avvisi disattivata leggibile, bottone disabled testo bianco attenuato, gradiente Salva al hover, desktop+390px, console pulita, lint+tsc OK |

## 7. Aperture di progettazione

- ❓ Come mostrare il "primo utilizzo" previsto (finestra rolling) senza confondere l'utente: oggi il dashboard mostra "reset disponibile da HH:MM".
- ❓ Se arrivano più di due `model_name` (es. `image`, `audio`, `search`): la UI genera card dinamicamente (e la `PanoramicTable` le include tutte), ma `MainWindows`/storico sono ancorati a `general` — da generalizzare se il piano cambia.
- ✅ Notifica soglie: risolto in F6b con banner + toast + Notification API (ADR-9); il Service Worker per notifiche a tab chiuso resta opzione futura (roadmap `docs/03` §11.4).
- ❓ Il verdetto di proiezione (I23) usa un modello lineare sui primi 60 rilevamenti: valutare una media mobile o una regressione pesata quando lo storico cresce (dipende da I16 → **risolto il prerequisito: I16 ora fornisce fino a 10.000 punti persistenti**; la **media mobile è disponibile** sul grafico con I26, la regressione pesata resta opzione futura).

---

## 8. Changelog della documentazione

| Data | File | Cambiamento |
|------|------|-------------|
| 2026-10-02 | `README.md` | Creato: panoramica, indice docs, stack, avvio rapido, sintesi regole |
| 2026-10-02 | `docs/01-api-minimax-ricerca.md` | Creato: endpoint confermati, chiavi, regole piano, stati, fonti, archivio `scripts/` |
| 2026-10-02 | `docs/02-analisi-json-quota.md` | Creato: schema campi, semantica percentuali/conteggi, verifiche matematiche, conversioni Roma, formule, casi limite |
| 2026-10-02 | `docs/03-piano-implementazione.md` | Creato: architettura, mappa codice, modelli dati, flussi, errori, sicurezza, fasi F0–F6 |
| 2026-10-02 | `docs/04-stato-avanzamento.md` | Creato: questo file (fasi, attività R/I, verifiche V, ADR, changelog) |
| 2026-10-02 | `docs/01` §6, `docs/03` §3/§5.5/§7/§10/§11, questo file | Aggiornati per **I15 — contatore token reale**: nuova route `/api/minimax/chat`, `lib/token-log.ts`, componente `TokenTracker`, fase F6a completata, avviso consumo reale con Subscription Key |
| 2026-10-02 | Verifica F6a | agent-browser: pannello renderizzato (desktop+mobile), simulazione demo registrata (prompt 19 + risposta 407 = 426 token), storico e svuotamento OK, `localStorage` confermato, route testata con curl (400 missing_key, 401 chiave errata mappata), zero errori console, lint pulito |
| 2026-10-02 | `docs/01` §5.2/§6, `docs/03` (mappa, §5.5→§5.5/5.6, layout, fasi, roadmap), questo file | **Rimozione F6a (ADR-8)**: eliminati `api/minimax/chat/route.ts`, `lib/token-log.ts`, `token-tracker.tsx`; il dashboard è read-only; I15/I19/I20 archiviate come 🚫 |
| 2026-10-02 | `docs/03` §3/§4/§5.5/§5.6/§7/§10/§11, questo file | **F6b implementata**: I17 avvisi soglia (banner + toast + notifiche browser, soglie configurabili), I21 registro eventi + `EventLog`, I22 export CSV/JSON (`lib/export.ts`), I23 verdetto esaurimento vs reset (`ProjectionVerdict`), I24 `PanoramicTable`; nuove chiavi localStorage `mm-dash-events-v1` e campi settings (ADR-9) |
| 2026-10-02 | Verifica F6b | agent-browser: banner attenzione con soglia 50% (37,2% < 50), transizione import→demo genera toast + evento in registro, `mm-dash-events-v1` corretto, verdetto «Quota sufficiente fino al reset» su dati demo, export CSV/JSON senza errori, svuotamento registro, desktop+mobile OK, zero errori console, lint pulito |
| 2026-10-02 | `settings-dialog.tsx`, questo file (I25, §6) | **I25 — finestra impostazioni fuori schermo**: riprogettata su 3 tab con `max-h-[85svh]`, area scrollabile e footer fisso (bugfix §6); verificata con agent-browser a 1366×768, 1280×500 e 390×844 |
| 2026-10-02 | `prisma/schema.prisma`, `api/history/route.ts`, `lib/server-history.ts`, `page.tsx`, `history-chart.tsx`, `docs/03`, questo file (I16, ADR-10, F7) | **I16 — persistenza storico server-side**: modello `UsagePoint`, API POST/GET/DELETE con pruning (10.000 punti / 90 giorni), sync offline-first con merge all'avvio, badge «punti salvati sul server», menu Esporta con voci «storico completo dal server»; anche i rilevamenti demo entrano nello storico; verifiche curl (dedup upsert 3→2, since, DELETE, validazione) e agent-browser (replica, merge sopravvive a storage svuotato e al backfill demo, tema scuro menu) |
| 2026-10-02 | `lib/cycles.ts`, `analysis-panel.tsx`, `history-chart.tsx`, `page.tsx`, `docs/03` (mappa, roadmap), questo file (I26, §6 bugfix, §7) | **I26 — analisi di lungo periodo**: rilevamento cicli di finestra (reset = salto ≥+15 → ≥85), statistiche per ciclo (durata, consumo=drawdown, ritmo %/h), consumo medio per giorno della settimana (Europe/Rome), media mobile SMA-10 attivabile sul grafico; pannello con 3 tab che fonde lo storico locale con fino a 10.000 punti server (scarico automatico al mount); fix falsi reset con sorgenti miste (bugfix §6); verifiche agent-browser con storico sintetico (45 punti, 6 cicli 5h + weekly): medie coincidenti ai valori teorici al centesimo (66,0% · 14,67 %/h · 0,55 %/h), desktop+mobile, console pulita, lint+tsc OK |
| 2026-10-02 | `prisma/schema.prisma`, `api/events/route.ts`, `lib/server-events.ts`, `lib/usage-events.ts` (replaceEvents), `lib/export.ts` (exportEventsJson), `page.tsx`, `event-log.tsx`, `docs/03` (§3/§4/§5.8/§10/§11), questo file (I27, ADR-11, F8) | **I27 — persistenza registro eventi su DB**: modello `UsageEventRecord` (id client univoco, upsert), API POST/GET/DELETE con pruning (5.000 eventi / 180 giorni) e filtri `since`/`kind`, replica fire-and-forget di ogni evento con contatore «N in archivio sul server», merge all'avvio (dedup per id, diario locale capito a 200), menu Esporta con CSV/JSON dell'archivio completo, «Svuota» locale+server (ADR-11); verifiche curl (dedup 3→2 con aggiornamento messaggio, filtri, evento invalido scartato, pruning) e agent-browser (transizione import→evento warn replicato, merge dopo svuotamento storage, export archivio, Svuota locale+server, anti-resurrezione dopo reload, mobile 390px, zero errori console) |
| 2026-10-02 | `layout.tsx` (classe `dark` + Toaster `theme="dark"`), `globals.css` (regole unlayered hover), `page.tsx`, `event-log.tsx`, `history-chart.tsx`, `analysis-panel.tsx`, `settings-dialog.tsx`, `tech-panels.tsx`, `model-table.tsx`, questo file (§6 bugfix) | **Fix UI stati hover/disabled «nero su nero»**: attivato il tema dark shadcn su `<html>`, hover custom resi effettivi con regole unlayered in `globals.css` (CSS Cascade 5) e `!` sui componenti, tab grafico corretti (attivo zinc-100, hover su inattivi); verifiche con computed style + confronto pixel prima/durante hover (Aggiorna 22→31 rgb, Esporta bianco, Svuota rosa, menu white/8, tab white/5), dialog impostazioni completa (3 tab, switch on/off, sezione disattivata, bottone disabled), mobile 390px, console pulita, lint+tsc OK |
