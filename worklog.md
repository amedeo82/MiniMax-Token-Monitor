# Worklog — MiniMax Token Plan Monitor (Europa / Europe-Rome)

---
Task ID: 1
Agent: Super Z (main)
Task: Analisi risposta JSON `model_remains` + ricerca online endpoint MiniMax aggiuntivi

Work Log:
- Convertiti tutti i timestamp del JSON utente in fuso Europe/Rome (CEST):
  - general: finestra 5h, 02/10/2026 12:00 → 17:00 Roma, remains 03:42:01
  - video: finestra 24h, 02/10 02:00 → 03/10 02:00 Roma, remains 12:42:01
  - weekly: lun 28/09 02:00 → lun 05/10 02:00 Roma (00:00 UTC), remains 60:42:01
  - Ora server dedotta (end_time − remains_time): 02/10/2026 13:17:58 CEST
- Ricerca web (web_search) + lettura docs ufficiali (Mintlify .md) + issue GitHub MiniMax-M2 #88/#99

Stage Summary — RISULTATI RICERCA:
1. Endpoint ufficiale usage (confermato dal team MiniMax, issue #99):
   `GET https://www.minimax.io/v1/token_plan/remains` — header `Authorization: Bearer <API Key>`
   → restituisce {base_resp, model_remains[]} (stesso JSON dell'utente)
2. Endpoint legacy/alternativo (issue #88):
   `https://api.minimax.io/v1/api/openplatform/coding_plan/remains` (internazionale, piani coder)
   `https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains` (Cina)
   Nota: status_code 1004 = "cookie is missing, log in again" (auth errata/cookie)
3. List Models (OpenAI-compat): `GET https://api.minimax.io/v1/models` + Bearer
   → {object:"list", data:[{id:"MiniMax-M3", object:"model", created, owned_by}]}
4. Chat Completions (OpenAI-compat): `POST https://api.minimax.io/v1/chat/completions` + Bearer
   → ogni risposta include `usage: {total_tokens, total_characters, prompt_tokens, completion_tokens, prompt_tokens_details.cached_tokens}` → fonte per il consumo token
5. Video generation: `POST /v1/video_generation` + `GET /v1/query/video_generation?task_id=` (guida video-generation.md)
6. Regole reset (docs m-plan/usage-rules + token-plan/faq):
   - finestra 5h rolling (modelli NON video: testo/immagine/audio), inizia col primo utilizzo
   - finestra settimanale 7 giorni (tutti i modelli inclusi video)
   - modelli non-video richiedono residuo in ENTRAMBE le finestre; video solo settimanale
   - reset indipendenti, nessun carry-over
   - console: https://platform.minimax.io/console/usage ; CLI: `mmx quota`
7. SEMANTICA CRITICA (issue #99): `current_interval_usage_count` e `current_weekly_usage_count`
   contengono la quota RESIDUA (non consumata!). Consumato = total_count − usage_count.
   Nel JSON utente i count sono 0 → il piano traccia via percentuali (percent affidabile).
8. Status osservati: base_resp.status_code 0=ok, 1004=cookie/auth mancante;
   current_interval_status: 1=attiva/in uso (general), 3=inattiva/mai usata (video) — 2 ipotizzabile=esaurita, da confermare.
9. Chiavi: Subscription Key (Token Plan) ≠ API key pay-as-you-go. Console key: user-center/basic-information/interface-key
10. Piani attuali: Plus / Max / Ultra (token plan); M Plan per coding. Modelli: MiniMax-M3, M3.1-Flash-Preview, H3/H3 Max (video).

Fonti: platform.minimax.io/docs/token-plan/faq.md, /docs/m-plan/usage-rules.md, /docs/api-reference/models/openai/list-models.md, /docs/api-reference/text-chat-openai.md, github.com/MiniMax-AI/MiniMax-M2/issues/88, /issues/99

---
Task ID: 2
Agent: Super Z (main)
Task: Costruzione e verifica dashboard interattiva Next.js con i risultati della ricerca

Work Log:
- Integrati i risultati della ricerca nel codice esistente:
  - lib/minimax.ts: stati numerici (1/2/3) normalizzati + statusLabel() con tone; inferServerTime() (end_time − remains_time); consumedPercent(); EXTRA_ENDPOINTS (models, chat/completions, video_generation, query/video_generation)
  - lib/demo.ts: demo fedele al JSON reale dell'utente (stati numerici, finestra giornaliera 24h del video allineata a mezzanotte UTC)
  - quota-cards.tsx: StatusBadge per finestra, CountsRow (residuo/totale/consumato + nota percentuali), windowKindLabel() dinamica (5h vs 24h)
  - settings-dialog.tsx: sezione "Incolla una risposta JSON" con textarea + validazione + import
  - page.tsx: handleImportJson() con parseUsageResponse, badge "JSON importato manualmente", sourceLabel per TechInfo, serverTime
  - tech-panels.tsx: riga "Ora del server dedotta", pannello "Altri endpoint utili", avviso semantica *_usage_count (issue #99)
- Bugfix: videoDayStart non definito in demo.ts (rilevato via agent-browser)
- Verifiche agent-browser: render desktop+mobile, import del JSON REALE dell'utente (ok: 100% 5h reset 17:00, 64% settimanale reset 05/10 02:00, video "Inattiva · mai usata"), ora server dedotta 13:17:58 (coincide con il calcolo manuale), endpoint panel, zero errori console, lint pulito

Stage Summary:
- Dashboard completa e verificata end-to-end: modalità demo, import JSON manuale, chiamata API reale via proxy /api/minimax/usage con Subscription Key
- Tutti i valori visualizzati coincidono con l'analisi manuale dei timestamp (Europe/Rome, it-IT)

---
Task ID: 3
Agent: Super Z (main)
Task: Creazione della documentazione di progetto persistente (scoperte, piano di implementazione, tracking avanzamento)

Work Log:
- Riletto il worklog precedente, tutti gli artefatti di ricerca in scripts/ (mplan_faq, usagerules, faq token-plan, chatapi, listmodels, issue #88/#99, CreditGauge, CodexBar, dsh-provider-usage) e il codice implementato (lib/minimax.ts, lib/time.ts, lib/demo.ts, api/minimax/usage/route.ts, page.tsx, componenti)
- Creato README.md: panoramica progetto, indice documentazione, stack, avvio rapido, sintesi regole piano, struttura repo
- Creato docs/01-api-minimax-ricerca.md: endpoint confermati con marca di affidabilità (✅/🔶/❓), chiavi Subscription vs pay-as-you-go, endpoint primario eu/cn, alternativo coding_plan/remains, endpoint complementari (models, chat/completions con usage, video_generation), strategie per il consumo token, regole piano, codici di stato, archivio artefatti scripts/, fonti online
- Creato docs/02-analisi-json-quota.md: JSON reale completo, schema dei 15 campi con unità e affidabilità, semantica critica percentuali vs conteggi (issue #99), verifiche matematiche (durate finestre 5h/24h/7g, triangolazione t_query = end − remains coincidente su 3 campi, countdown coerenti), tabella conversioni Europe/Rome, allineamenti finestre (weekly lunedì 00:00 UTC, video 24h mezzanotte UTC, general rolling 5h — coincide con l'esempio delle docs), formule derivate, cosa NON si può ricavare, casi limite
- Creato docs/03-piano-implementazione.md: architettura con diagramma proxy, stack, mappa del codice, modelli dati TS, flussi chiave (API/polling, import JSON, demo, countdown vivi), regole d'oro fuso Europe/Rome, layout UI, tabella gestione errori, sicurezza, fasi F0–F6 con criteri di accettazione (F0–F5 completate), roadmap estensioni F6
- Creato docs/04-stato-avanzamento.md: protocollo di aggiornamento per le prossime sessioni, riepilogo fasi, 11 attività di ricerca (R1–R11), 18 attività di implementazione (I1–I18), 6 verifiche empiriche aperte con procedure (V1–V6), 7 decisioni ADR, bugfix storici, changelog documentazione

Stage Summary:
- La documentazione persistente copre ricerche (docs/01–02: non andranno mai rifatte), implementazione (docs/03: guida operativa) e avanzamento (docs/04: tracking + protocollo per future sessioni)
- Prossimo ingresso naturale per il lavoro: fasi F6 (estensioni) e verifiche empiriche V1–V6 elencate in docs/04

---
Task ID: 4
Agent: Super Z (main)
Task: F6a — Contatore token reale (I15): route /api/minimax/chat, lib/token-log.ts, componente TokenTracker

Work Log:
- Caricata skill fullstack-dev (progetto già inizializzato, dev server automatico su :3000)
- Creato src/app/api/minimax/chat/route.ts: proxy POST verso https://api.minimax.io|api.minimaxi.com/v1/chat/completions (OpenAI-compatible), estrae content/reasoning_content/usage (prompt_tokens, completion_tokens, total_tokens, total_characters, prompt_tokens_details.cached_tokens), timeout 90s, errori mappati in italiano (401/403 → verifica chiave/regione)
- Creato src/lib/token-log.ts: registro localStorage "mm-dash-tokenlog-v1" (max 500 record), TokenCallRecord, load/append/clear, aggregateTokenLog (totali + per-modello ordinati per token decrescente)
- Creato src/components/token-tracker.tsx: pannello "Consumo token reale" — input modello (datalist con MiniMax-M3.1-Flash-Preview/M3/M2.7/M2.5), prompt, invio e misura (o simulazione demo), badge usage ultima chiamata, collapsible risposta, 4 box totali, tabella per-modello, storico (12 più recenti), svuota registro; avviso amber: con Subscription Key la chiamata consuma quota reale del piano
- Integrato in src/app/page.tsx (sezione tra "Altri modelli" e i pannelli JSON/TechInfo)
- Verifiche: bun run lint pulito; agent-browser — pannello renderizzato desktop (1280px) e mobile (390px), simulazione demo registrata (prompt 19 + risposta 407 = 426 token, badge demo, orario Roma), storico + svuotamento OK, localStorage confermato, collapsible risposta OK, zero errori console; curl su /api/minimax/chat: {} → 400 missing_key, chiave errata → 401 mappato verso api.minimax.io reale
- Aggiornati docs/01 §6 (avviso consumo reale), docs/03 (mappa codice, flusso §5.5, layout UI, fasi con F6a completata, roadmap), docs/04 (I15 ✅, nuove attività I19/I20, changelog)

Stage Summary:
- F6a completata: il dashboard ora misura il consumo token REALE via chat completions, chiudendo il gap "solo percentuali" dell'endpoint quota
- Nuove attività aperte in docs/04: I19 (persistenza registro token su server), I20 (correlazione token ↔ calo percentuale quota)

---
Task ID: 5
Agent: Super Z (main)
Task: Rimozione F6a (contatore token reale) + F6b: funzionalità di analisi e monitoraggio read-only

Work Log:
- Decisione (richiesta utente): la sezione "Consumo token reale" usa /v1/chat/completions che con la Subscription Key consuma la quota del piano; non esistono metodi gratuiti integrabili → rimossa interamente (ADR-8)
- RIMOZIONE F6a: eliminati src/components/token-tracker.tsx, src/app/api/minimax/chat/route.ts (dir rimossa), src/lib/token-log.ts; page.tsx ripulito dai riferimenti; verificato con rg che non restino riferimenti (token-tracker/token-log/mm-dash-tokenlog/api/minimax/chat)
- NUOVE FUNZIONALITÀ (tutte read-only: solo token_plan/remains + storico locale, zero consumo quota):
  - I17 lib/usage-events.ts: deriveBanner() (banner stateless da snapshot corrente), evaluateTransitions() (attraversamenti soglia warn/crit + reset = salto ≥+25 punti verso ≥90%), registro eventi localStorage "mm-dash-events-v1" (max 200), makeEvent/appendEvents/loadEvents/clearEvents, notifyBrowser (Notification API)
  - I21 components/event-log.tsx: EventLog — timeline raggruppata per giorno (Europe/Rome), badge per tipo (reset/warn/crit/error/info), export CSV, svuota
  - I22 lib/export.ts: historyToCsv/eventsToCsv (separatore «;» + BOM UTF-8 per Excel it-IT), exportHistoryCsv/Json/exportEventsCsv, downloadTextFile; pulsanti export sull'header del grafico
  - I23 history-chart.tsx: StatsPanel esteso con ProjectionVerdict — confronta esaurimento stimato (trend lineare) con end_time della finestra selezionata: amber "Rischio esaurimento prima del reset" / verde "Quota sufficiente fino al reset" / info
  - I24 components/model-table.tsx: PanoramicTable — tabella comparativa modello × finestra (residuo con mini-barra colorata, badge stato, countdown + orario reset); windowKindLabel ora esportata da quota-cards
  - settings-dialog.tsx: nuova sezione "Avvisi e notifiche" — master switch, soglia attenzione (0/5/10/25/50%), soglia critica, avviso reset, notifiche browser con requestPermission; DashboardSettings esteso (alertsEnabled, alertThresholdWarn=25, alertThresholdCrit=10, notifyReset, browserNotifications); retrocompatibilità via merge DEFAULT_SETTINGS
  - page.tsx: banner avvisi sotto l'header, effetto transizioni (toast sonner + notifiche browser + eventi), markOk/markError (evento "error" solo su transizione ok→errore), EventLog in fondo, PanoramicTable dopo StatsPanel, props resetAt/remaining al verdetto
- Verifiche agent-browser: banner attenzione con soglia 50% (37.2% < 50); import JSON al 60% → banner sparisce; click Aggiorna (demo 37.5%) → toast warning + evento "warn" registrato correttamente in mm-dash-events-v1; EventLog renderizza (giorno Roma, badge, valore %); verdetto "Quota sufficiente fino al reset" su dati demo (esaurimento 19:34 > reset 16:26); CSV/Svuota senza errori; soglie ripristinate a 25/10; mobile 390px OK; zero errori console; lint pulito
- Documentazione aggiornata: docs/01 §5.2/§6 (ADR-8, strategie solo manuali/esterne), docs/03 (architettura, mappa codice, modelli dati, §5.5 avvisi/eventi, §5.6 export, layout UI, fasi F6a 🚫 / F6b ✅, roadmap riscritta con 7 candidati + sezione "rimosse"), docs/04 (fasi, I15/I19/I20 🚫, I17/I21/I22/I23/I24 ✅, ADR-8/ADR-9, aperture aggiornate, changelog), README (stato read-only, sezione "Funzionalità", stack, struttura repo)

Stage Summary:
- Il dashboard ora è dichiaratamente read-only: non invoca mai modelli, non consuma mai la quota che misura (ADR-8)
- Nuove funzionalità F6b: avvisi soglia configurabili (banner/toast/notifiche), registro eventi, export CSV/JSON, verdetto esaurimento-vs-reset, panoramica modelli — tutte verificate in demo end-to-end
- Prossimi ingressi naturali: I16 (persistenza server-side Prisma/SQLite per storico lungo + confronto finestre consecutive), I18 (fallback coding_plan/remains, dipende da V4), verifiche empiriche V1–V6

---
Task ID: 6
Agent: Super Z (main)
Task: Riprogettazione UI della finestra di impostazioni (dialog fuori schermo)

Work Log:
- Segnalazione utente: dopo l'aggiunta della sezione avvisi, la dialog impostazioni superava l'altezza dello schermo rendendo irraggiungibile il pulsante «Salva» (layout grid senza vincolo d'altezza in DialogContent)
- Riscritto src/components/settings-dialog.tsx: layout a colonna con max-h-[85svh], DialogContent flex gap-0 overflow-hidden p-0; header compatto con bordo; tablist Radix Tabs sempre visibile (Connessione / Avvisi / Dati); area centrale scrollabile (overflow-y-auto overscroll-contain, min-h-0 flex-1); footer fisso con Annulla/Salva sempre raggiungibile
- Distribuzione contenuti: tab «Connessione» (Subscription Key + link console, regione, refresh, modalità demo), tab «Avvisi» (master switch, soglie warn/crit, reset, notifiche browser — sottosezioni disabilitate con opacity + pointer-events-none se master off), tab «Dati» (import JSON + nota privacy localStorage)
- Reset del tab attivo a «Connessione» all'apertura della dialog; interfaccia pubblica (DashboardSettings, props) invariata → page.tsx non modificato
- Fix tema: ripristinate classi dark su DialogContent (border-white/10 bg-zinc-950/95 text-zinc-100) e forzate con important le classi di TabsList/TabsTrigger per coerenza col tema scuro
- Verifiche agent-browser: tsc --noEmit pulito su src/; dialog 516px @1366×768 (fitsScreen true), tab Avvisi 499px senza scroll, @1280×500 scroll interno attivo e footer visibile, @390×844 dialog 358×616 fitsScreen true; screenshot di controllo in scripts/verify_settings_*.png; tema scuro confermato su tutti e tre i tab
- Documentazione: docs/04 aggiornato (attività I25 ✅, bugfix in §6, riga changelog)

Stage Summary:
- La finestra impostazioni non fuoriesce più dallo schermo su nessun viewport: header/tablist/footer fissi, contenuto scrollabile solo quando serve
- UI più snella e organizzata: 3 tab al posto di un unico form lungo; nessuna modifica a contratti/props o ad altri componenti

---
Task ID: 7
Agent: Super Z (main)
Task: I16 — Persistenza storica server-side (Prisma/SQLite)

Work Log:
- Schema Prisma riscritto: modello UsagePoint (t unique, interval, weekly, source, region, @@index t); rimossi i modelli demo User/Post (non usati); bun run db:push OK
- Nuova API src/app/api/history/route.ts: POST (validazione input, upsert per t unique, max 500 punti/richiesta, pruning dopo ogni write: cutoff 90 giorni + FIFO oltre 10.000), GET (?limit= def 2000 max 10000, ?since=, ordinato per t), DELETE (svuota); la Subscription Key non transita mai su questo endpoint (solo timestamp + percentuali)
- Nuovo src/lib/server-history.ts: pushPointToServer (fire-and-forget, keepalive, callback onTotal per il contatore), fetchServerHistory, mergeHistories (dedup per timestamp, vince il punto locale), serverPointsToHistory, clearServerHistory
- page.tsx: pushHistory riscritto con historyRef (mirror sincrono) → replica server di ogni punto (source api/demo/import); all'avvio GET server → merge con localStorage → trim 600; stato serverCount; il ramo demo ora registra i punti demo nello storico (prima il grafico demo restava statico) e il backfill demo si FONDE con i punti server anziché sovrascriverli (bugfix race)
- history-chart.tsx: dropdown "Esporta" (Storico locale CSV/JSON con conteggio punti in memoria + sezione "Storico server (fino a 10.000 punti)" con CSV/JSON completo); descrizione grafico con "N punti salvati sul server"; StatsPanel mostra il totale server; classi tema scuro forzate su dropdown (il tema shadcn è light: --popover bianco)
- Verifiche curl: DELETE reset; POST 3 punti (1 duplicato) → stored 3, total 2 (upsert aggiorna il duplicato); GET ordinato; GET since; POST punto invalido → stored 0 senza crash; punti con epoch di un anno fa correttamente eliminati dal pruning a 90 giorni
- Verifiche agent-browser: demo → Aggiorna → POST e badge "N punti salvati sul server" (grafico + statistiche); storage svuotato + reload → storico ripristinato dal server (merge: 41 punti = 38 backfill + 3 server); menu export completo con conteggi corretti; pixel PNG confermati (menu scuro #09090b); lint e tsc --noEmit puliti su src/
- Documentazione: docs/03 (mappa codice con i 3 nuovi file, §4 modello UsagePoint, §5.7 sync server-side, F7 ✅, roadmap aggiornata: punto 1 implementato), docs/04 (I16 ✅, ADR-10, apertura I23 aggiornata, changelog)

Stage Summary:
- I16 completata: lo storico quota ora è durevole sul server (SQLite fino a 10.000 punti / 90 giorni) e sopravvive a cache svuotate e cambio dispositivo (merge offline-first, ADR-10)
- Nuovi dati disponibili per analisi future: confronto finestre consecutive, medie mobili, statistiche di lungo periodo (roadmap aggiornata)
- Dashboard comunque perfettamente funzionante senza server (errori di replica silenziosi)

---
Task ID: 8
Agent: Super Z (main)
Task: I26 — Analisi di lungo periodo (cicli di finestra, medie mobili, consumo per giorno)

Work Log:
- Punto di partenza: il worklog rivelava che il Task ID 7 (I16 — persistenza server-side) era già stato completato nella porzione precedente della sessione; verificata la coerenza del codice (schema UsagePoint, api/history, lib/server-history.ts tutti presenti). Prossimo step dalla roadmap docs/03 §11 (punti 1 e 5, sbloccati da I16): analisi di lungo periodo
- Creato src/lib/cycles.ts (funzioni pure): detectCycles() segmenta lo storico nei cicli di finestra (reset = salto ≥ +15 punti — RESET_JUMP), summarizeCycles() (medie solo sui cicli completati + ciclo in corso), weekdayConsumption() (consumo per giorno della settimana Europe/Rome, attribuito al punto medio), movingAverage() (SMA)
- BUGFIX rilevato in verifica: con sorgenti miste (punti api reali weekly 57% alternati a punti demo ~77%) i salti +20 venivano interpretati come reset → cicli fittizi da 1 minuto e ritmo medio >5000 %/h. Fix: (1) reset valido solo se il post-salto ≥ 85% (nuova costante RESET_TARGET — un reset vero riporta la finestra quasi piena); (2) consumo rivalutato come DRAWDOWN (inizio − minimo del ciclo) e attribuzione giornaliera solo sul calo del minimo progressivo: i rimbalzi senza reset non sono consumo reale (la quota non risale mai senza reset)
- Creato src/components/analysis-panel.tsx: pannello «Analisi di lungo periodo» con 3 tab — Cicli 5 ore / Cicli settimanali (4 KPI: cicli rilevati/completati, durata media, consumo medio, ritmo medio %/h + minimo registrato; tabella ultimi 8 cicli: inizio, fine, durata, consumo con 93→27, residuo min, ritmo; ciclo in corso evidenziato in amber) e Per giorno (BarChart doppio: consumo medio/giorno per finestra 5h e settimanale, tooltip scuro); scarica automaticamente fino a 10.000 punti dal server al mount (fetchServerHistory) e li fonde con lo storico locale (mergeHistories), pulsante «Ricarica dal server», badge conteggio punti, placeholder se <2 punti
- history-chart.tsx: grafico migrato da AreaChart a ComposedChart (recharts 2.15) con toggle «Media mobile» (SMA-10, linea tratteggiata rosa #f472b6, tooltip esteso con la media, stato attivo del pulsante in rosa)
- page.tsx: LongTermAnalysis renderizzato tra PanoramicTable e «Altri modelli»
- Fix documentale: rimossa la riga I16 duplicata in docs/04 (⬜ e ✅ entrambe presenti)
- Verifiche agent-browser (dati sintetici iniettati in localStorage per NON toccare lo storico reale dell'utente sul server — 45 punti, 6 cicli 5h completati + weekly con reset): pannello corretto al centesimo (cicli puliti −66,0% 93→27, 4h30m, 14,67 %/h; medie su 7 cicli 6h47m/59,6%/13,18 %/h coincidenti al calcolo manuale; weekly 2 cicli: completato −12,0% 22h 0,55 %/h esatto); falsi reset eliminati dopo il fix; tab Per giorno con barre mer/gio/ven e 3 giorni osservati; toggle SMA attivo con sovrapposizione corretta; mobile 390px ok; console senza errori; dati sintetici rimossi a fine verifica (localStorage pulito, storico server intatto con i soli punti reali); lint + tsc puliti su src/
- Documentazione: docs/03 (mappa codice: lib/cycles.ts + analysis-panel.tsx + nota SMA su history-chart; roadmap §11: punti 1 e 5 barrati come implementati), docs/04 (I26 ✅, bugfix §6 sorgenti miste, apertura §7 I23 aggiornata con media mobile disponibile, changelog)

Stage Summary:
- I26 completata: il dashboard ora ANALIZZA lo storico persistito (fino a 10.000 punti server) invece di limitarsi a mostrarlo — cicli di finestra 5h/settimanali con durata/consumo/ritmo, confronto tra finestre consecutive, consumo medio per giorno della settimana, media mobile sul grafico
- Scoperta importante documentata: con dati da sorgenti miste (demo+api) servono le regole RESET_TARGET + drawdown, altrimenti l'analisi produce risultati assurdi — ora robusta e verificata
- Prossimi ingressi naturali: I18 (fallback coding_plan/remains, dipende da V4 — serve chiave reale), verifiche empiriche V1–V6 (richiedono osservazione su consumo reale), roadmap residua (multi-regione, PWA, soglie per finestra, storico eventi su DB)

---
Task ID: 9
Agent: Super Z (main)
Task: I27 — Persistenza del registro eventi su DB server-side (archivio oltre i 200 eventi)

Work Log:
- Punto di partenza: worklog Task ID 8 chiudeva con "prossimi ingressi naturali: I18 (dipende da V4 — serve chiave reale), verifiche V1–V6 (richiedono consumo reale), roadmap residua". Scelto il primo passo autonomo: roadmap docs/03 §11 punto 7 (storico eventi su DB, stesso schema di I16)
- Schema Prisma esteso con UsageEventRecord (id client String @id per dedup upsert, t, kind, model, win, message, value, indici t+kind); rimossi dal commento header i riferimenti a costanti non più citate; bun run db:push OK (db/custom.db)
- Nuova API src/app/api/events/route.ts: POST (max 500 eventi/richiesta, validazione: id+t+kind+message obbligatori, kind in enum, win in {interval,weekly}, message≤500 char, upsert per id, pruning dopo ogni write: cutoff 180 giorni + FIFO oltre 5.000), GET (?limit= def 2000 max 5000, ?since=, ?kind=, ordinato per t), DELETE (svuota). Nessuna chiave API transita qui
- Nuovo src/lib/server-events.ts: pushEventsToServer (fire-and-forget batch, keepalive, callback onTotal), fetchServerEvents(limit, kind), mergeEvents (dedup per ID — non per t — vince la copia locale), serverEventsToEvents (valida kind/win), clearServerEvents
- lib/usage-events.ts: aggiunta replaceEvents() (sostituisce il registro con la lista fusa, trim a 200, write localStorage) — usata dal merge all'avvio
- page.tsx: nuovo callback addEvents() (appendEvents locale + pushEventsToServer) usato sia da markError sia dall'effetto transizioni (rimossa la doppia via setEvents(prev=>...)); merge archivio server all'avvio (fetchServerEvents(5000) → mergeEvents(loadEvents(), remote) → replaceEvents); serverEventsCount state; handleClearEvents ora svuota SEMPRE locale+server (altrimenti il merge risusciterebbe gli eventi cancellati — decisione ADR-11)
- lib/export.ts: aggiunta exportEventsJson (parità con lo storico)
- event-log.tsx: il bottone "CSV" diventa menu Esporta (DropdownMenu con tema scuro forzato come in history-chart): Registro locale (CSV/JSON · N eventi in memoria) + Archivio server (fino a 5.000 eventi: CSV/JSON completo con fetchServerEvents(5000) + toast conferma); descrizione con "· N in archivio sul server"; Svuota abilitato anche se locale vuoto ma server pieno
- Verifiche curl: DELETE reset; POST 3 eventi (1 duplicato id e-2) → stored 3, total 2 con messaggio aggiornato (upsert); GET ordinato; GET ?kind=reset; GET ?since=30min; POST evento invalido (manca message) scartato senza crash; evento 200 giorni fa eliminato dal pruning 180g; POST array vuoto → 400
- Nota: il primo POST di test con timestamp 2025 (un anno fa) è risultato total 0 — comportamento CORRETTO del pruning, ripetuto con timestamp correnti
- Verifiche agent-browser (demo): import JSON con interval 18% mentre il demo era a ~38,9% → transizione soglia 25% → evento warn generato e REPLICATO sul server (POST 200, GET conferma campi completi); badge "1 in archivio sul server" nella descrizione; localStorage mm-dash-events-v1 rimosso + reload → evento RIPRISTINATO dal merge server; menu Esporta completo (6 voci, tema scuro #09090b confermato da screenshot); export "CSV completo" → toast "Esportati 1 eventi dall'archivio server"; Svuota → locale 0 + server total 0 + toast aggiornato; reload successivo → nessuna resurrezione (0 eventi); mobile 390px: card 358px, bottoni nel viewport, descrizione a capo corretta; zero errori console; lint e tsc --noEmit puliti su src/
- Riavvio dev server necessario dopo db:push (il processo teneva in memoria il Prisma Client senza usageEventRecord → "Cannot read properties of undefined (reading 'findMany')" su GET /api/events)
- Documentazione: docs/03 (mappa codice con server-events.ts + api/events + nota replaceEvents, §4 modello UsageEventRecord, §5.8 sync registro eventi, §10 fase F8 ✅, roadmap §11 punto 7 barrato), docs/04 (I27 ✅, ADR-11, changelog)

Stage Summary:
- I27 completata: gli eventi (reset, soglie, errori) ora sono durevoli sull'archivio server (SQLite, 5.000 eventi / 180 giorni) oltre il diario locale di 200 voci, con export CSV/JSON completo e sopravvivenza a cache svuotate/cambio dispositivo (stesso schema offline-first di I16)
- "Svuota" cancella locale+server per coerenza col merge (ADR-11)
- RESTANO BLOCCATI SULL'UTENTE: I18 (fallback coding_plan/remains) e verifiche V1–V6 richiedono una Subscription Key reale e osservazione del consumo; roadmap residua autonoma: soglie per finestra (punto 6), multi-regione (punto 3), PWA (punto 4), filtri UI sull'archivio eventi
