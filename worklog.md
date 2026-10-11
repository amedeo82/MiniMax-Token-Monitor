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

---
Task ID: 10
Agent: Super Z (main)
Task: Fix CSS — stati hover e disabled «nero su nero» sui pulsanti (segnalazione utente)

Work Log:
- Segnalazione utente: «effetti hover dei pulsanti nero su nero, non leggibili; anche lo stato deactivated è nero su nero»
- Riproduzione con agent-browser: hover sul bottone «Esporta» → computed testo lab(2.75%) = NERO su bg white/4% (quasi nero), isHover:true confermato; screenshot scripts/bug_hover_esporta_before.png mostra la voce illeggibile accanto a «Media mobile»
- CAUSA RADICE: app dark-only ma senza classe `dark` su <html> → tema shadcn rimasto light (--accent-foreground ≈ nero); al hover la regola shadcn `hover:text-accent-foreground` (variante hover) batteva le classi testo custom → testo nero su fondo scuro. Tutte le superfici dell'app erano override manuali (bg-white/[0.04] ecc.) proprio perché i token erano light
- SCOPERTA SECONDARIA: anche le dark-variant Tailwind 4 (es. dark:bg-input/30) vengono emesse DOPO le hover a pari specificità e seppellivano gli hover custom (hover:bg-white/[0.08] impercettibile: bg 4%→4,5%; verificato con confronto pixel screenshot: 22,21,22 identico prima/durante hover)
- FIX SISTEMICO a 3 livelli:
  1. layout.tsx: className="dark" su <html> → token shadcn dark (accent grigio scuro 15%, popover scuro, input/border bianco traslucido, switch/select/disabled coerenti), dark: varianti finalmente attive; Toaster sonner theme="dark" esplicito
  2. globals.css: blocco di regole UNLAYERED (fuori @layer → vincono sulle utilities layered per CSS Cascade 5, niente giochi di specificità) per gli hover custom: bg-white/[0.08], bg-white/5, bg-white/[0.02], bg-rose-500/20, text-rose-300, tab inattivi ([data-slot=tabs-trigger][data-state=inactive]:hover → zinc-200 + white/5)
  3. Componenti: `!` sulle classi hover custom (page.tsx Aggiorna/impostazioni/Prova demo, event-log Esporta/Svuota, history-chart Media mobile/Esporta, analysis-panel Ricarica, settings-dialog Analizza JSON/Annulla, tech-panels Copia, model-table righe); history-chart tab grafico: rimosso data-[state=active]:text-zinc-900 (residuo light su fondo ora scuro = altro caso nero-su-nero) → text-zinc-100 + hover su inattivi
- VERIFICHE (computed style + pixel screenshot prima/durante hover):
  - Aggiorna: testo bianco, bg 22→31 rgb (white/8) — feedback percettibile
  - Esporta: testo bianco lab(98.26) (ERA NERO) — bug primario risolto
  - Svuota: testo rosa rgb(253,164,175) + bg white/8 (intent design preservato)
  - Voci dropdown: bg white/8 + bianco; menu già scuro
  - Tab Settimanale inattivo: bg white/5 + testo zinc-200 (prima nessun feedback)
  - Dialog impostazioni: tab Connessione/Avvisi/Dati ok, switch ON (track bianco/knob scuro) e OFF, sezione Avvisi disattivata (opacity-50) ora leggibile (grigi chiari, non più nero su nero), bottone «Analizza» disabled = testo bianco attenuato (opacity 0.5), gradiente «Salva» con hover rose-400→orange-400 funzionante
  - Badge: nessun bleeding di bg-primary (custom vincono); body ora scuro zinc-950
  - Mobile 390px ok, console senza errori; bun run lint EXIT=0, tsc --noEmit pulito su src/
- Documentazione: docs/04 §6 (riga bugfix hover/disabled con analisi completa) + §8 changelog

Stage Summary:
- Risolto il bug segnalato: tutti gli stati hover, disabled, switch, select e tab sono ora leggibili e coerenti col tema scuro; il feedback hover è tornato percettibile (bg +8% e testo più chiaro, rosa su Svuota)
- Lezione tecnica documentata: in un'app dark-only il tema shadcn DEVE essere attivato con .dark su <html>; gli hover custom vanno garantiti con regole unlayered in globals.css perché Tailwind 4 emette le dark-variant dopo le hover a pari specificità
- Prossimi ingressi naturali (invariati): I18 (fallback coding_plan/remains) e verifiche empiriche V1–V6 — richiedono una Subscription Key reale e osservazione del consumo; roadmap residua autonoma: soglie per finestra (punto 6), multi-regione (punto 3), PWA (punto 4)

---
Task ID: 11
Agent: Super Z (main)
Task: I28 — Soglie di avviso personalizzate per finestra (5h / 24h / settimanale)

Work Log:
- Punto di partenza: worklog Task ID 10 (fix CSS hover/disabled) chiudeva con la roadmap residua; richiesta esplicita utente: «il prossimo step è soglie per finestra» (roadmap docs/03 §11 punto 6)
- lib/usage-events.ts: AlertConfig esteso con thresholds {h5, h24, weekly} (WindowThresholds {warn, crit} per ciascuna) al posto delle due soglie globali alertThresholdWarn/Crit; windowThresholdKey() risolve il tipo di finestra dalla DURATA REALE start→end (23–25h → h24, 4–6h → h5, fallback nome modello "video") — più robusto del nome se MiniMax aggiungesse tipi; WIN_THRESHOLD_LABELS per le etichette italiane; migrateLegacyThresholds() converte il vecchio formato globale applicando i valori a TUTTE le finestre (comportamento utente preservato)
- deriveBanner(): ora considera TUTTI i modelli (non solo general) e applica a ogni (modello, finestra) la PROPRIA soglia; le voci del banner portano winKey/winLabel (crit prevale su warn)
- evaluateTransitions(): ogni attraversamento usa le soglie del tipo di finestra risolto; ThresholdAlert/ResetAlert estesi con winKey/winLabel; i messaggi degli eventi ora riportano l'etichetta corretta («finestra giornaliera (24 ore)» per il video, prima era errata «finestra di 5 ore»); il campo win degli eventi resta in {interval, weekly} (vincolo validazione API I27)
- settings-dialog.tsx: DashboardSettings.thresholds (AlertThresholds) al posto dei due campi globali; tab «Avvisi» con matrice 3 righe (5 ore/Modelli testo · 24 ore/Video · 7 giorni/Tutti i modelli) × 2 colonne (Attenzione/Critica) con header, dentro il wrapper già disabilitato dal master switch; thresholdOptionsFor() aggiunge dinamicamente l'opzione corrente se non allineata alle scelte fisse (es. legacy 40% → «40% residuo», altrimenti la select Radix appariva vuota)
- page.tsx: loadSettings() migra le impostazioni salvate via migrateLegacyThresholds (rimuovendo i campi legacy); banner e toast usano winLabel (rimossa la winShortLabel locale)
- BUGFIX pre-esistente scoperto in verifica (docs/04 §6): overflow orizzontale su mobile 390px (docW 458): header grafico storico (controlli ~372px intrinseci) e card RawJson/TechInfo (grid item min-width:auto sotto il min-content del <pre>) → fix con flex-wrap/min-w-0/truncate; docW 458 → 390
- VERIFICHE agent-browser (demo): matrice renderizzata con default 25/10; h5 warn=50 → banner amber con SOLO la voce «finestra di 5 ore al 39,1% (soglia 50%)» (video 100% e weekly 77% correttamente esclusi); persistenza dopo reload (settings localStorage col nuovo formato); import JSON con doppio attraversamento crit: general 39→8% (h5 crit 10) + video 100→30% (h24 crit 50) → banner crit con 2 voci etichettate correttamente, 2 toast, 2 eventi replicati sul server (archivio 4) + reset video 30→100 dal refresh demo successivo con label «finestra giornaliera (24 ore)»; migrazione legacy 40/15 → matrice con 40/15 su tutte e tre le righe, opzione dinamica visibile, round-trip al salvataggio nel nuovo formato; mobile 390×844: dialog 358×717, matrice senza overflow; desktop: controlli grafico ancora su una riga; console senza errori; lint EXIT=0 e tsc pulito su src/
- Pulizia a fine verifica: punto storico del test (interval 8%) corretto via upsert server (38,9% demo) e in localStorage; archivio eventi server ripristinato (DELETE + re-POST dell'unico evento pre-esistente); mm-dash-events-v1 ripristinato; mm-dash-settings-v1 rimosso (pre-test assente); reload finale: nessun banner, registro con 1 evento, nessun dip artificiale nel grafico
- Documentazione: docs/03 (mappa codice §3, §5.5 con la meccanica I28, §7 layout, §11 punto 6 barrato), docs/04 (I28 ✅, ADR-12, §6 overflow mobile, §8 changelog)

Stage Summary:
- I28 completata: le soglie di attenzione e critica sono ora configurabili INDEPENDENTEMENTE per finestra di 5 ore, giornaliera 24 ore (video) e settimanale; banner, toast, notifiche ed eventi rispettano le soglie della propria finestra con etichette corrette
- Migrazione trasparente: chi aveva soglie globali le ritrova applicate a tutte le finestre senza riconfigurazione (ADR-12); i valori fuori lista restano visibili e selezionabili
- Bugfix mobile pre-esistente incluso: la dashboard 390px non ha più scroll orizzontale (grafico, RawJson, TechInfo)
- Prossimi ingressi naturali (invariati): I18 (fallback coding_plan/remains) e verifiche empiriche V1–V6 — richiedono una Subscription Key reale e osservazione del consumo; roadmap residua autonoma: multi-regione (punto 3), PWA (punto 4)

---
Task ID: 12
Agent: Super Z (main)
Task: I29 — Toolkit verifiche empiriche V1–V6 + runbook (richiesta utente: «Le verifiche v1-v6»)

Work Log:
- Punto di partenza: worklog Task ID 11 (I28) chiudeva con «verifiche V1–V6 bloccate sull'utente»; l'utente ha richiesto le verifiche V1–V6. Nessuna chiave reale disponibile nel progetto (.env contiene solo DATABASE_URL) → le V1–V5 richiedono chiave valida/consumo reale/osservazione di reset, quindi il risultato autonomo possibile è: toolkit riproducibile + evidenze parziali + runbook per l'utente
- scripts/verifiche/verifica.mjs (nuovo, Node ≥18, ZERO dipendenze): comandi v1 (stati finestra durante consumo, verdetto automatico su stato 2 vs residuo 0%), v2 (rolling: confronto nuovo start_time col primo calo % dopo reset, tolleranza intervallo+120s), v3 (reset SENZA uso: classifica «start INVARIATO» / «start = vecchio end» / inatteso), v4 (doppia chiamata token_plan vs coding_plan + diff strutturale per modelli/finestre/campi, verdetto IDENTICI/EQUIVALENTI/ASIMMETRICI), v5 (usage/total vs pct: classifica residuo/consumo/unclear con tolleranza 1pp), v6 (rate limit: polling start-to-start, istogrammi HTTP/status_code, latenze min/med/p95/max, verdetto su 429/1004) + prova-parser (autotest offline) + aiuto
- Meccanica: parser tollerante (wrapper `data`, epoch s→ms), normalizzazione {statusCode, statusMsg, piano, finestre{modello{interval,weekly}}}, transizioni (reset-finestra/calo/stato) su campioni consecutivi, SIGINT grazioso, esiti JSON+MD in scripts/verifiche/esiti/ (OUT_DIR accanto allo script → copia autonoma riusabile), chiave SOLO mascherata nei log (env MM_SUBSCRIPTION_KEY consigliata a --chiave)
- BUG corretti durante i test: (1) rigaStato stampava riga vuota su envelope errore (finestre {} truthy) → check Object.keys().length; (2) sleep di polling limitato a 5s accorciava l'intervallo start-to-start (critico per un test di rate limit) → attesa a scatti di 1s finché non è ora del prossimo campione; (3) campione sintetico prova-parser con timestamp 2025 e triangolazione end−remains non coincidente → riallineato al JSON reale del 02/10/2026 (12:00→17:00 Roma, video 24h mezzanotte UTC, weekly lun 28/09→lun 05/10, server dedotto 13:17:59 CEST COINCIDENTE)
- LIMITO AMBIENTALE: i processi detached (nohup/setsid) vengono uccisi tra le tool call → V6 eseguita in FOREGROUND ridotta a 9 min (54 richieste @10s) per stare nel timeout della sessione; specifica originale 10 min segnalata nel runbook per l'utente
- EVIDENZE PARZIALI RACCOLTE (chiave fittizia «VERIFICA-NON-VALIDA-TOOLKIT-V1V6», mai loggata in chiaro):
  · V4 → ENTRAMBI gli endpoint HTTP 200 + base_resp.status_code 1004 ma con MESSAGGI DIVERSI: token_plan «login fail: Please carry the API secret key…», coding_plan «cookie is missing, log in again» → auth gestita da servizi distinti; compatibilità dati ancora da confermare con chiave reale (esito esiti/v4-2026-10-02T17-57-24.json)
  · V6 → 54 richieste in 9 min @10s: tutte HTTP 200 + 1004, ZERO 429, zero errori di trasporto, latenza 503/588/1076/1202 ms (min/med/p95/max) → nessuna limitazione HTTP osservabile senza chiave valida (esiti/v6-2026-10-02T18-12-43.json)
  · V1 --once e V5 → percorsi errore validati (esiti v1-2026-10-02T17-58-16, v5-2026-10-02T17-57-31)
- docs/05-verifiche-empiriche.md (NUOVO runbook, 10 sezioni): prerequisiti e sicurezza sulla chiave, autotest, per ogni V domanda+comandi+procedura+verdetti+impatto sul progetto, piano di esecuzione in una giornata (ordine: V4/V5 subito → V6 10 min → V3 al reset senza uso → V2 al reset successivo con uso → V1 durante esaurimento; V1+V2 unibili in una sessione), registro delle esecuzioni (§10) con le evidenze parziali
- Documentazione incrociata: docs/01 §4 (evidenza parziale V4 + puntatori toolkit), docs/01 §8.2 (procedura V1 → toolkit), docs/03 §11 punto 2 (I18: toolkit pronto, esito V4 con chiave reale decide), docs/04 (I29 ✅ in §3, §4 stati V1–V6 da ❓ a 🔄 con evidenze, §8 changelog)
- package.json: script «verifiche» → bun run verifiche v4
- download/verifiche-v1-v6/ (NUOVO, consegnabile): verifica.mjs (copia autonoma) + README.md di avvio rapido
- Pulizia: rimossi esiti provvisori (v6 smoke test 12s, log del run background ucciso); lint `eslint .` OK; src/ non toccato (nessun cambiamento UI/behaviour della dashboard)

Stage Summary:
- I29 completata: ogni verifica V1–V6 è ora RIPRODUCIBILE con un comando dedicato, con verdetto automatico e esiti archiviati; il blocco «richiede chiave reale» resta solo per l'osservazione, non più per la procedura
- Evidenze parziali senza chiave già utili: V4 mostra auth distinte sui due endpoint (indizio, non prova di incompatibilità dati); V6 mostra zero 429 su 54 richieste @10s con chiave invalida
- RESTA SULL'UTENTE: eseguire le verifiche definitive con la Subscription Key reale seguendo docs/05 §9 (la chiave NON va incollata in chat); l'esito di V4 sblocca I18
- Prossimi ingressi naturali: I18 (dopo V4), multi-regione (punto 3), PWA (punto 4), valutare backoff nel proxy se V6 con chiave reale mostrasse throttle

---
Task ID: 7
Agent: Super Z (main)
Task: Verifiche empiriche V1–V6 con chiave reale (utente non può usare il terminale; delega completa all'agente)

Work Log:
- Riletti docs/04 §4 (definizioni V1–V6) e docs/05 (runbook + toolkit verifica.mjs, I29)
- Verificato ambiente: dev server attivo su :3000; .env senza chiave (solo DATABASE_URL); DB storico con SOLO punti source=demo fino a 08:31 UTC di oggi → il browser dell'anteprima è in MODALITÀ DEMO: zero chiamate a POST /api/minimax/usage nel dev.log → la chiave inserita dall'utente non è mai arrivata al server (vive solo nel localStorage del browser utente, inaccessibile dal workspace)
- Deciso meccanismo (dichiarato all'utente): cattura TEMPORANEA della chiave nel proxy — blocco marcato in src/app/api/minimax/usage/route.ts che scrive {apiKey, region, ts} su scripts/verifiche/.chiave-sessione (0600, fuori da public/); da rimuovere a fine verifiche
- Testato meccanismo con chiave finta via curl: cattura OK, risposta 1004 attesa, file di test eliminato
- Creato e avviato (setsid nohup, pid 1401) scripts/verifiche/watcher-quick.sh: attende il file chiave (timeout 6h) → esporta MM_SUBSCRIPTION_KEY/MM_REGION → esegue prova-parser, V4, V5, V1 --once, V6 (10 min @10s) → log in scripts/verifiche/sessione-quick.log, marker .quick-done; chiave mai stampata nei log
- Azione richiesta all'utente (l'unica): nell'anteprima → Impostazioni → Connessione → disattivare «Modalità demo» → Salva impostazioni (fetch immediato + polling automatico)

Stage Summary:
- Setup completato: catena proxy→cattura→watcher→toolkit pronta e collaudata con chiave finta
- In attesa che l'utente disattivi la demo nell'anteprima; poi V4/V5/V6 automatiche
- V3 (reset senza uso) e V1/V2 (esaurimento + rolling con uso reale) da programmare dopo gli esiti rapidi: richiedono vincoli comportamentali dell'utente (non usare / usare l'API)
- Al termine: rimuovere blocco cattura da route.ts, eliminare .chiave-sessione, aggiornare docs/04 §4 + docs/05 §10, decidere I18 dall'esito V4

---
Task ID: 13
Agent: Super Z (main)
Task: I30 — Chiusura campagna verifiche V1–V6 + aggiornamento documentazione (README, docs/03–05, stato avanzamento)

Work Log:
- Verificato lo stato della catena dopo il riavvio del workspace del 06/10 (04:53 UTC): watcher e processi di verifica terminati; `scripts/verifiche/.chiave-sessione`, `sessione-quick.log` e marker `.quick-done` inesistenti; `esiti/` contiene SOLO i run del 02/10 con chiave non valida → gli esiti della campagna con chiave reale (04–05/10: rapide V4/V5/V1/V6 + lunghe V1/V2 in corsa, controprova V2 sul confine delle 17:00) sono PERDUTI e i verdetti non recuperabili dagli artefatti
- Zero POST /api/minimax/usage in dev.log da riavvio → nessuna chiave attiva (browser dell'anteprima in demo)
- Falso allarme scartato: punti DB con "anno 58732" erano un artefatto della mia query diagnostica (coercizione Date*1000 su Prisma DateTime); DB integro: 351 punti (126 api reali del 02/10 + 225 demo fino a oggi), 1 evento
- CHIUSURA OPERATIVA (checklist Task 7): rimosso il blocco temporaneo di cattura chiave da src/app/api/minimax/usage/route.ts; proxy ritestato con curl (200, nessun file scritto); tsc --noEmit su src/ = 0 errori; bun run lint EXIT=0; toolkit e watcher-quick.sh conservati per future campagne
- Documentazione aggiornata:
  · docs/04: I30 ✅ in §3; nota ⚠️ campagna 04–06/10 interrotta in §4; ADR-13 (meccanismo temporaneo di cattura/delega) + ADR-13-R (ritiro) in §5; changelog §8 con righe 2026-10-04 (Task 7 catena) e 2026-10-06 (I30 chiusura + riallineamento doc)
  · docs/05: §10 registro esecuzioni con 3 nuove righe (04/10 setup+avvio, 04→05/10 perdita esiti, 06/10 chiusura amministrativa) + nota operativa su come ri-armare la catena e lezione appresa (esiti incrementali, --durata brevi)
  · docs/03: header aggiornato; §2 stack con Prisma/SQLite (F7/F8); §3 mappa settings-dialog allineata a I28 (thresholds {h5,h24,weekly}); §9 sicurezza con nota rimozione cattura; §11 punto 2 con V4 unico sblocco di I18
  · README.md: riscritto lo "Stato del progetto" (F0–F8 complete, campagne V1–V6 da rieseguire), aggiunte docs/05 all'indice, Prisma/SQLite allo stack, `bun run db:push` all'avvio, funzionalità complete (soglie per finestra I28, analisi di lungo periodo I26, media mobile, persistenza durevole F7/F8), struttura repo con i file mancanti (api/history, api/events, server-history, server-events, cycles, analysis-panel, schema.prisma, db/custom.db) e nuova sezione "Verifiche empiriche (toolkit)"
- Smoke test finali: GET / = 200; GET /api/history ok (total 351); prova-parser toolkit PASSA; comando `aiuto` verificato

Stage Summary:
- La campagna verifiche con chiave reale è ufficialmente CHIUSA come "interrotta senza esiti recuperabili": V1–V6 tornano da rieseguire (docs/05 §9), I18 resta bloccata solo su V4
- Il proxy è tornato allo stato pulito (nessuna scrittura su disco), coercendo la regola di sicurezza del Task 7; ADR-13 registrato e ritirato per tracciabilità completa
- Tutta la documentazione (README + docs/01–05) è ora allineata al progetto reale: persistenza SQLite, analisi di lungo periodo, soglie per finestra, toolkit verifiche con il suo runbook

---
Task ID: 14
Agent: Super Z (main)
Task: I31 — pace di consumo + quota sprecata (filone I23) · I32 — heatmap ore + overlay cicli (completano I26), con aggiornamento preventivo di documentazione e piani

Work Log:
- Letti worklog (ultimo Task ID 13), docs/03, docs/04, cycles.ts, time.ts, history-chart.tsx, analysis-panel.tsx, page.tsx: i calcoli I31 (computePace/PaceInfo in history-chart.tsx) e parte di I32 (heatmapConsumption in cycles.ts + overlay cicli nel grafico) erano già presenti in codice, MA non cablati in UI (computePace mai invocato, heatmapConsumption senza componente)
- Documentazione PRIMA (come richiesto): I31/I32 registrate in docs/04 §2 come 🔄 con nota su cosa mancava, e in docs/03 §11 come punti 8–9 con criteri di accettazione
- I31 implementata: PacePanel in StatsPanel (history-chart.tsx), reso sm:col-span-3 accanto al verdetto I23 — tre stati coerenti col verdetto: fermo tecnico (ambra, Coffee), quota sprecata (viola, PiggyBank, con equivalenza in ore di consumo), pareggio (verde, ShieldCheck); KPI affiancati ritmo attuale / ritmo di pareggio / terzo indicatore per stato; soglia pareggio PACE_EPSILON=2 punti; guard dato insufficiente (samples<2 o reset ignoto); fix TS: breakevenPace catturato in const per preservare il narrowing dentro la closure kpis
- I32 implementata: tab «Per ora» in analysis-panel.tsx con HeatmapSection — heatmap 7×24 (lun..dom × 0..23 Europe/Rome) con selettore finestra 5 ore/settimanale (aria-pressed, stato violet come il toggle Cicli), KPI (consumo attribuito, ora di picco, celle attive /168), scala viola rgba(167,139,250) con alpha √-normalizzata sul max, tooltip per cella (consumo + n° cali attribuiti), legenda 0→picco, nota metodologica (drawdown, punto medio, reset non consumati); min-w-[560px] con overflow-x-auto per il mobile; memo di heatInterval/heatWeekly su data; CardDescription aggiornata
- Verifiche: bunx tsc --noEmit → 0 errori su src/ (restano solo errori preesistenti in examples/skills fuori scope); bun run lint pulito; dev.log senza errori runtime
- Verifiche agent-browser (screenshot in scripts/verify_i31_*.png e verify_i32_*.png): home con overlay cicli già visibile (fasce alternate + marker «reset» + toggle Cicli); pannello pace coerente col verdetto (fermo tecnico ambra: esaurimento 21:40 vs reset 22:39:51, fermo 58m 58s, KPI +47,73 %/h vs pareggio +21,67 %/h — aggiornato live al polling demo successivo +47,95/+20,44, fermo 1h 01m 57s); tab «Per ora» selezionabile via role, heatmap con consumo 654,5% (picco ven 17:00 — 556,0%, 5/168 celle) e al cambio finestra weekly 33,4% (picco ven 15:00 — 19,7%, 4/168) con legenda rinormalizzata; mobile 390px: docW=innerW=390 (zero overflow pagina, 168 celle in scroll interno), KPI e note leggibili; console con soli log Fast Refresh, zero errori pagina
- Chiusura documentale: docs/03 (header 2026-10-07, §3 mappa history-chart/cycles/analysis-panel, §7 layout con righe I31/I32, §11 punti 8–9 segnati implementati), docs/04 (I31/I32 → ✅, riga changelog 2026-10-07), README (funzionalità + struttura), questo worklog

Stage Summary:
- La roadmap docs/03 §11 è esaurita per gli item autonomi: restano solo I18 (fallback coding_plan, bloccata su V4) e le estensioni richiedenti chiave reale o lavoro fuori scope (multi-regione, PWA)
- I31 dà all'utente la «coscienza del ritmo»: sa in anticipo se sprecherà quota (e quanto vale in ore di consumo) o se resterà a secco prima del reset
- I32 chiude il cerchio dell'analisi di lungo periodo: oltre al «quanto» (cicli, per giorno) ora anche il «quando» nella giornata (heatmap) e i confini di finestra direttamente sul grafico
- Verifiche V1–V6 invariate: da rieseguire secondo docs/05 §9 (I18 dipende solo da V4)

---
Task ID: 15
Agent: Super Z (main)
Task: Documentazione del secondo rollback del workspace + ri-registrazione onesta di I48–I82 + baseline (richiesta utente: «continua con il prossimo ste e relativo clarify se necessario»)

Work Log:
- Alla ripresa del lavoro, tentato di leggere docs/07-analisi-miglioramenti-aggiuntivi.md → FILE ASSENTE; indagine immediata: docs/06 e docs/07 assenti, tests/lib/ assente, tutti i moduli delle sessioni 09–11/10 assenti (backoff, rate, health, ring-color, tab-identity, diagnostica-panel, section-nav, rate-chart, pwa-register, sw.js, manifest), scripts/verifiche/audit-implementazioni.mjs e campione-live.jsonl assenti, package.json senza script `test`
- History git riscritta: SOLO commit UUID di piattaforma + «Initial commit» (d7a8559); reflog mostra commit/amend di piattaforma; gli oggetti dei commit originali (7f8d007 Task 30, 341e0b2, da66837, ae637d3 Task 29, b837876 I52, 0e707c1 batch 3, 80ccfe4 batch 2, 11da9bf batch 1, …) sono garbage-collected (git cat-file = PERSO per tutti)
- Punto di ripristino identificato: checkpoint del 07/10 post-Task-14 (stato I31/I32) — docs/04 a 182 righe con §3 fino a I32, §4 con V1–V6 in stato pre-campagna, I18 ⬜ «Dipende da V4», worklog con 15 sezioni (ultima Task 14), docs/05 senza §11, esiti/ solo 02/10 con chiave non valida
- Stesso scenario del PRIMO rollback (del 09/10, documentato nell'ormai persa voce del changelog): ripristino al checkpoint 07/10; la differenza è che ora è persa ANCHE la registrazione del primo rollback e tutto il lavoro fatto dopo (Tasks 15–30)
- Baseline verificata: tsc src/ 0 errori, lint OK, DB ripristinato (283 api + 241 demo, 5 eventi, primo punto 02/10 13:10 UTC) ma POLLER UTENTE ANCORA ATTIVO (ultimo punto 11/10 10:52 UTC — i punti api reali tornano ad accumularsi sul DB ripristinato); nuovo strumento `scripts/verifiche/conteggio-db.mjs` (ispezione DB in una riga, riusabile)
- Ri-registrazione CONDENSATA e ONESTA di I48–I82 in docs/04 §3 (35 righe, tutte ⬜, con note che distinguono: implementato-e-perso vs proposto-mai-implementato vs verifica-documentale-persa); numeri e significati IDENTICI a quelli comunicati in chat per continuità (lezione del primo rollback: «ri-registrare senza collidere con la chat» — I33–I47 bruciati, I48–I82 riservati, item nuovi da I83)
- Note aggiunte a docs/04: §3 (nota di rollback completa), §4 (verdetti del 09/10 privi di artefatti: V4=IDENTICI, V5 N/A, V6 no limit, V2/V3 via V8, V8 blocchi fissi UTC — le righe V tornano «da rieseguire», il transcript chat resta l'unica evidenza non-formale), riga I18 (storia: implementato dopo V4 e perso; serve V4 fresca o accettazione documentale del verdetto), §1 (F7/F8 re-aggiunte: il drift fix di Task 30 era perito col rollback), §8 changelog (riga completa del secondo rollback)
- Il bug I76 (`e.value != null` non copre undefined in event-log.tsx) è di nuovo NEL CODICE ripristinato: proposta ancora valida con evidenza da ri-produrre
- Nessun codice sorgente toccato in questa sezione: solo documentazione + 1 script di ispezione DB

Stage Summary:
- Perdita quantificata e documentata: TUTTO il lavoro delle sessioni 09–11/10 (Tasks 15–30) è perso da docs, codice, test e history; sopravvivono albero Task 14 verde, esiti 02/10, DB ripristinato con poller attivo
- docs/04 torna il riferimento onesto: I1–I32 ✅ reali, I48–I82 ⬜ ri-registrati con note di storia, verdetti V senza artefatti dichiarati tali
- Riuso numeri I48–I82 con stessi significati (continuità chat); I33–I47 bruciati; item nuovi da I83
- Prossimo passo: clarify utente sull'ordine di recovery — raccomandazione: fondamenta prima (I50 test suite + I51 backoff + I55 audit tool), poi verifiche (I49/V8, I18 con V4), poi abbellimenti (rigenerare cataloghi + re-implementare I57–I67), poi il nuovo catalogo I68+
- Commit: documentazione + conteggio-db.mjs in un commit, DB runtime separato (lezione I30, poller attivo)

---
Task ID: 16
Agent: Super Z (main)
Task: Risposta alla richiesta utente «come recuperare o ricreare il lavoro committato in locale il 09/10/2026?» — chiusura forense definitiva, conferma piano di ricreazione, messa in sicurezza (snapshot DB + audit pre-push + istruzioni remote)

Work Log:
- Forense git definitiva: `git fsck --lost-found` → 6 commit dangling TUTTI ≤ 06/10 (snapshot piattaforma pre-rollback: 2f007c7/46d9de8/c92be6c/e94c5ad/2cf75cd/cf07c4b, ispezionati uno per uno con data e contenuto) — NESSUNO contiene lo stato 09–10/10; `git log --all` su docs/06*/docs/07* → assenti da ogni oggetto accessibile; stash vuoto; unico ref = refs/heads/main; reflog con soli commit/amend UUID piattaforma
- Inventario sopravvissuti confermato: src/lib/ ferma ai moduli Task 14 (cycles, db, demo, export, minimax, server-events, server-history, time, usage-events, utils) — mancano backoff.ts, rate.ts, health.ts, ring-color.ts; public/ solo logo.svg+robots.txt (niente manifest, sw.js, icone); docs/ solo 01–05; scripts/verifiche/ senza audit-implementazioni.mjs né campione-live.jsonl; tests/lib/ vuota
- Security audit pre-push remoto: .env tracciato ma contiene SOLO DATABASE_URL (nessuna chiave MiniMax — nessun leak); grep anti-key → stringhe JWT-simili in scripts/issue88.html/json + issue99.html/json (pagine GitHub + risposte API salvate durante le verifiche sull'endpoint coding_plan/remains) → da rimuovere/untrackare PRIMA di ogni push; db/custom.db tracciato con dati d'uso reali → il remote DEVE essere privato
- Messa in sicurezza DB: snapshot runtime committata separatamente (lezione I30) — 315 punti api (poller utente ancora attivo, ultimo punto 11/10 13:27 UTC, +32 da quando il DB è stato ripristinato al checkpoint) + 241 demo + 5 eventi
- Piano di ricreazione confermato (predisposto in Task 15, docs/04 §3 con 35 righe I48–I82 ⬜ ri-registrate coi significati identici alla chat): fase 1 fondamenta (I50 test suite, I51 backoff, I55 audit tool) → fase 2 verifiche (I49 campionatore+V8, V2–V8 da rieseguire, I18 con V4 fresca) → fase 3 abbellimenti (rigenerare docs/06 + re-implementare I57–I67 batch 1–3) → fase 4 nuovo catalogo docs/07 (I68+ da clarify)
- Istruzioni push remote preparate e consegnate in chat: repo privato → sanificazione pre-push (untrack .env, rm scripts/issue88-99) → remote add + push -u origin main; la chat resta fonte non-formale, le istruzioni ora anche in questo worklog

Stage Summary:
- VERDETTO FINALE: il lavoro committato il 09/10 è IRRIPRIBILILE dai bit — forense esaurita (dangling tutti ≤ 06/10, commit originali garbage-collected, nessuno stash/ref secondario, nessuna copia fuori dal workspace); l'unica via è la RICREAZIONE secondo il piano in 4 fasi, usando la chat come fonte delle specifiche e docs/04 §3 come tracciamento
- Unica protezione reale contro un terzo rollback: REMOTE GIT fuori dal workspace — qualsiasi copia dentro /home/z/my-project (bundle, tar, download/) morirebbe col workspace stesso; fino al primo push ogni sessione riparte potenzialmente da zero
- In attesa dall'utente: URL repository privato + Personal Access Token per configurare origin ed eseguire il push (oppure esecuzione autonoma coi comandi consegnati); la sanificazione pre-push è pronta ma NON eseguita in attesa di conferma

---
Task ID: 17
Agent: Super Z (main)
Task: Configurazione remote GitHub + sanificazione pre-push + primo push del progetto (su consegna URL e PAT da parte dell'utente: repo amedeo82/MiniMax-Token-Monitor)

Work Log:
- Verifica pre-push via API GitHub col PAT fornito dall'utente: repo amedeo82/MiniMax-Token-Monitor — privato: True (requisito rispettato: contiene db/custom.db con dati d'uso reali), size 0 (vuoto), default branch main, permessi push/admin OK
- Riferimenti ai file issue88/99 trovati in docs/01 (tabelle fonti §fonti e appendice file): aggiornati PRIMA della rimozione con nota di sanificazione e fonte sostitutiva (le issue #88/#99 restano consultabili pubbliche su GitHub)
- Commit di sanificazione: untrack .env (resta su disco locale, conteneva solo DATABASE_URL — nessuna chiave), git rm scripts/issue88.html/json + issue99.html/json (token JWT dentro), docs/01 aggiornato; grep anti-key post-sanificazione su tutti i file tracciati = ZERO token (pattern eyJ*/sk-*/ghp_*)
- Remote configurato: origin = https://github.com/amedeo82/MiniMax-Token-Monitor.git (PAT solo nel .git/config locale — non tracciato, non pushato)
- Primo push: `git push -u origin main` EXIT=0 — branch main creato sul remote, tracking impostato; verifica con `git ls-remote origin main`: SHA remoto = SHA locale (push integrale)
- Push di chiusura task: commit worklog Task 17 + snapshot DB runtime (poller ancora attivo) + `git push origin main`; verifica finale SHA coincidenti e albero pulito

Stage Summary:
- Il progetto ha ora una copia integrale FUORI dal workspace: un eventuale terzo rollback non causerà più perdite — recovery = `git clone` + ripristino .env
- Ciclo operativo da oggi: a fine di ogni task → commit codice/documenti + commit DB separato (I30) + `git push origin main`
- Raccomandazione all'utente consegnata in chat: ruotare il PAT dopo la verifica (è transitato in chat in chiaro e resta nel .git/config locale); se ruotato, fornire il nuovo token alla sessione successiva
- Prossimo passo di progetto: avvio fase 1 del piano di ricreazione (fondamenta: I50 test suite, I51 backoff, I55 audit tool) su conferma utente

---
Task ID: 18
Agent: Super Z (main)
Task: Recovery fase 1 — fondamenta: I51 backoff, I50 test suite, I55 audit tool (richiesta utente: «procedi e ricrea tutto il lavoro fatto, ad ogni ripristino aggiorna la documentazione, poi commit e push»)

Work Log:
- Lettura stato autoritativo prima di lavorare: docs/04 §3 (righe condensate I48–I82), docs/03, package.json, moduli core sopravvissuti (time/cycles/usage-events/minimax), proxy api/minimax/usage, page.tsx completo, tsconfig/eslint
- **I51**: creato `src/lib/backoff.ts` puro con random iniettabile (backoffDelayMs ×2^n cap 10 min floor 1s, nextBackoffMs jitter ±25% con cap/floor post-jitter, parseRetryAfterMs forme secondi+HTTP-date, delayAfterFailure con Retry-After come floor del client); proxy con ciclo di retry transitori (429/500/502/503/504 + rete/timeout, 1+2 tentativi, pause 400/800ms, Retry-After upstream inoltrato o default prudente 30s/10s) e flag `transient`; `ApiError.retryAfterMs/transient`; scheduler client in page.tsx (setTimeout ricorsivo: successo → intervallo utente, fallimento → backoff crescente; badge «prossimo tra» sul ritardo reale programmato)
- **I51 — fix doppio fetch al salvataggio**: i due vecchi effetti (prima sincronizzazione + intervallo) dipendevano dall'OGGETTO settings → ogni salvataggio rifetchava; ora: ri-sync solo su cambio connessione (chiave/regione/demo via connKey + ref), handleSaveSettings azzera snapshot solo se la connessione è cambiata e non chiama più fetchData direttamente, scheduler riavviato solo sulle primitive rilevanti
- **I50**: creata suite `tests/lib/` — 5 file (minimax 24 test: forme risposta piatta/annidata, base_resp 1004, alias titolo/crediti, epoch s/ms, statusLabel, quotaLevel, findModel; time 17: toDate, formattazioni CEST/CET con epoch deterministici, countdown, durate, windowProgress; cycles 17: cicli RESET_JUMP/RESET_TARGET con falso reset sorgenti miste, weekday drawdown, heatmap celle+contatori, SMA; usage-events 27 con mock localStorage: registro/cap 200/voci malformate, windowThresholdKey I28 con bordi, migrazione legacy, banner, transizioni; backoff 17 deterministici) = **102 test / 273 asserzioni**, script `"test": "bun test"` in package.json, `tests/bun-env.d.ts` con reference bun-types per tsc
- Correzioni in itinere: 3 test falliti al primo giro (formatDateTimeRome: it-IT con virgola; romeZoneInfo: ICU di Bun dà GMT+2 non CEST → asserzione sugli offset; heatmap: fixture con punto medio in cella sbagliata) — fix e suite verde
- **I55**: creato `scripts/verifiche/audit-implementazioni.mjs` (Node ≥18 zero dipendenze): 73 verifiche dichiarative (file/simbolo/wiring/assenza) su I1–I32 ✅ + I50/I51, coverage check automatico (✅ senza check → SCOPERTA), assenze ricorsive per I15/I19/I20 🚫 (ADR-8), report MD+JSON in esiti/; fix EISDIR su assenza-dir e firme pushPointToServer/pushEventsToServer (function, non async); check I12 con 97 screenshot sopravvissuti in scripts/
- Protocollo di verifica: bunx tsc --noEmit → 0 errori fuori baseline (4 nota in examples/skills); bun run lint → EXIT=0; bun test → 102/102 (273 asserzioni); audit → PASS 73/73
- Documentazione aggiornata (docs-first): docs/04 §3 righe I50/I51/I55 → ✅ con note di recovery, §8 changelog +3 righe 2026-10-11; questo worklog
- Scoperto durante l'audit: i 97 screenshot PNG delle verifiche browser sono SOPRAVVISSUTI al rollback (artefatti piattaforma in scripts/) — evidenza I12/I31/I32 recuperata

Stage Summary:
- FASE 1 DEL RECOVERY COMPLETATA: fondamenta (test suite, backoff, audit) di nuovo nel repo, con protocollo verde e audit PASS 73/73
- La suite test ora protegge OGNI futura ricreazione: da qui in poi ogni modulo ri-creato entra con i suoi test prima del commit
- L'audit I55 è il verificatore del recovery stesso: a ogni item ri-creato si aggiungono i suoi check (coverage check impedisce che l'audit invecchi)
- Prossimo: fase 2 — I52 PWA/offline (sw.js + sw-shared + manifest + pwa-register + 14 test parità) e campagna campionatore I49/I56 se il traffico reale lo permette
