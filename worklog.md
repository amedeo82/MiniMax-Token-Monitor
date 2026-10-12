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

---
Task ID: 19
Agent: Super Z (main)
Task: Recovery fase 2 — I52 PWA/offline + notifiche a tab chiuso (ADR-14), con verifica browser reale

Work Log:
- **I52**: ricreati tutti gli artefatti — `public/sw-shared.js` (fonte unica in JS puro per il SW: parseUsagePayload specchio di parseUsageResponse, quotaKeyFor specchio di windowThresholdKey, evaluate specchio di evaluateTransitions, con gestione base_resp radice O dentro data); `public/sw.js` (install shell + skipWaiting, activate con pulizia cache, fetch: POST /api/minimax/usage pass-through con cache MANUALE solo su ok:true — fix «1004 cachato» — e GET rete-prima con fallback cache per navigazioni/_next/static/api/history + ultimo snapshot; messaggi SECRETS/CHECK_NOW/SKIP_WAITING; checkNow() che legge i segreti da IndexedDB, chiama il PROXY, valuta con la logica condivisa e notifica warn/crit/reset; periodicsync tag mm-check); `src/app/manifest.ts`; icone 192/512/apple-180 generate da `scripts/genera-icone-pwa.mjs` (sharp, gradiente rosa→arancio con fulmine identità dashboard); `src/components/pwa-register.tsx` (registrazione SW, postMessage segreti dal localStorage, re-invio su evento custom mm-dash-settings-updated e al focus/visibilità, SKIP_WAITING al nuovo SW)
- **ADR-14**: la chiave NON tocca mai Cache Storage/codice/log: solo IndexedDB (db mm-dash-sw, store secrets+state); demo mode o chiave rimossa → SECRETS con apiKey null → SW cancella segreto e stato
- Wiring: layout.tsx monta <PwaRegister/> e icona locale sostituisce il CDN; page.tsx handleSaveSettings dispatcha `mm-dash-settings-updated`
- **14 test di parità** (tests/lib/sw-parity.test.ts): stesse fixture su TS (minimax/usage-events) e JS (sw-shared): risposta piatta/annidata, base_resp annidato (BUG coperto), 1004 (ok:false su entrambi — il SW non cachera mai un errore), epoch s→ms, remains s→ms, status numerico→stringa, alias titolo/crediti, quotaKeyFor durate reali + fallback video, evaluate reset/crit/warn con esiti identici — suite totale ora **116/116 (354 asserzioni)**
- Correzioni in itinere: import path del JS nei test (../../public/), windowThresholdKey importato da usage-events (non minimax), rimozione @ts-expect-error non necessario (allowJs), fixture senza chiavi duplicate nell'oggetto (tsc TS1117)
- **Verifica browser reale (agent-browser, con network route body {} su /api/history e /api/events dal primo step — nessuna scrittura demo sul DB)**: SW registrato e ATTIVO (scope /, active:true); link manifest → /manifest.webmanifest servito; favicon locale icon-192.png; cache mm-dash-v1 con shell esatta (/, manifest, 3 icone, /api/history); flusso messaggi: CHECK_NOW → CHECK_DONE ok=false (corretto senza segreti, nessun crash), SECRETS apiKey null senza errori; zero errori pagina; screenshot `scripts/verify_i52_home.png` e `verify_i52_sw_flusso.png`
- Protocollo: tsc 0 errori fuori baseline; lint EXIT=0; bun test 116/116; audit I55 aggiornato con 11 check I52 → **PASS 86/86**
- Documentazione: docs/03 §5.10 ri-creata (design completo PWA/ADR-14); docs/04 §3 I52 → ✅ con nota recovery; §8 changelog +1 riga; questo worklog

Stage Summary:
- FASE 2 COMPLETATA: la dashboard è di nuovo PWA installabile con cache offline e notifiche a tab chiuso, con la stessa architettura ADR-14 (segreti solo in IndexedDB) e i 14 test di parità che impediscono divergenze TS↔SW
- Il SW consulta il PROXY (mai MiniMax direttamente): la chiave resta nel perimetro della pagina; il proxy non registra nulla (I30 rispettato)
- Prossimo: fase 3 — rigenerare docs/06 e re-implementare I57–I67 (batch 1–3 abbellimenti); a campagna: I49/I56 campionatore passivo + V8 se il traffico reale prosegue

---
Task ID: 20
Agent: Super Z (main)
Task: Recovery fase 3 — abbellimenti I57–I67 ri-creati (batch 1–3), docs/06 rigenerato, verifica browser reale

Work Log:
- **docs/06 ri-creato** (docs-first): catalogo con le specifiche delle 11 voci §5.1–§5.11 (stessi numeri e significati comunicati in chat, storia del rollback dichiarata in header)
- **Funzioni pure nuove in `lib/cycles.ts`**: `sprecoPerCiclo` (I57: WasteStats media/mediana/max/clean<5 sui cicli completati), `prevedibilitaCicli` (I63: σ popolazione, CV, indice 0–100, null <3 cicli), `consumoGiornaliero` (I58: per giorno di calendario DST-safe via date stringhe en-CA, griglia lun→dom con settimana corrente = ultima riga COMPLETATA con celle null, deterministica fino all'ultimo giorno osservato), `oggiVsMedia` (I64: oggi vs media stessi weekday ultime 5 settimane, oggi escluso), `distribuzioneResiduo` (I61: 10 fasce con ceil, BAND_COLORS)
- **Moduli lib nuovi**: `lib/rate.ts` (I59: rateSeries con gap>30min→null, reset/rise→null, SMA-3 con buffer azzerato sui null, opzioni iniettabili), `lib/health.ts` (I62: saluteMonitor con episodi <15min = stesso guasto, ultimo errore, più frequente), `lib/ring-color.ts` (I65: coloreContinuo con fermi 0/10/30/60/100 = soglie quotaLevel, glowStyle, AnimatedPercent count-up rAF con prefers-reduced-motion), `lib/tab-identity.ts` (I67: formatTabTitle, drawFaviconDataUrl canvas 64×64, TabIdentity con MutationObserver anti re-asserzione)
- **UI**: `analysis-panel.tsx` — 2 tab nuovi (Calendario, Distribuzione), CycleWaste + PrevedibilitaStrip nei tab Cicli, TodayComparison nel tab Per giorno, TabsList wrappabile (fix overflow mobile a 6 tab); `diagnostica-panel.tsx` NUOVO (I60 ResetClock: dot plot SVG 3 corsie asse UTC con blocchi teorici 00/05/10/15/20 e tooltip Roma/UTC; I62 MonitorHealth: episodi + badge backoff I51); `history-chart.tsx` + RateChart esportato; `quota-ring.tsx` prop `continuous` (colore HSL + glow + count-up) SOLO sui 2 anelli principali; `section-nav.tsx` NUOVO (I66: sticky, 8 ancore, IntersectionObserver scrollspy, --nav-offset = header+56 misurata, .mm-anchor in globals.css); `page.tsx` wiring (nav, sezioni id, RateChart, DiagnosticaPanel, TabIdentity)
- **Lezione operativa appresa**: scrivere file via bash heredoc/cat ha CORROTTO il contenuto 2 volte (rate.test.ts, append history-chart) — da ora SOLO strumenti Write/Edit; anche gli output grep di bash hanno mostrato testo mangled mentre il file reale era corretto (verificato con od): fidarsi solo di Read
- Correzioni in itinere: alias dayKeyFmt in TDZ, fixture con gap 1h > default 30min (rate), bordo ceil 10→0–10, media I63 (2+7+6)/3, settimana corrente da completare, max calendario 20 (2 discese di lunedì), TabsList overflow
- **Protocollo**: tsc 0 fuori baseline · lint EXIT=0 · bun test **146/146 (463 asserzioni)** · audit **PASS 116/116** (30 check nuovi I57–I67)
- **Verifica browser reale** (write-pipes /api/history+/api/events bloccati con body {} dall'inizio; il POST 200 visto in dev.log è del poller REALE dell'utente, non della sessione): nav con 8 ancore ✓, scrollspy, title «demo · MiniMax Token Monitor» ✓, 8 sezioni ancorate ✓, tab Calendario 14 celle ✓, Distribuzione 10 fasce ✓, RateChart SVG ✓, Diagnostica ResetClock+«Scheduler regolare» ✓, anelli con glow (drop-shadow) ✓, favicon dinamica assente in demo (by design) ✓, console senza errori correnti ✓, **mobile 390px zero overflow dopo fix TabsList** ✓; screenshot `verify_i57-67_home.png`, `verify_i60-62_diagnostica.png`, `verify_i57-67_mobile390.png`
- Documentazione: docs/04 §3 I57–I67 → ✅ (11 righe), §8 changelog +1 riga fase 3; docs/06 ri-creato; audit aggiornato; questo worklog

Stage Summary:
- FASE 3 COMPLETATA: il catalogo abbellimenti I57–I67 è di nuovo interamente implementato, testato e verificato in browser — docs/04 ora mostra I1–I32 ✅ (originali) + I50/I51/I52/I55/I57–I67 ✅ (recovery)
- **Ricostruito il 100% del lavoro perito ri-implementabile** (I18 resta ⬜ per la condizione V4; I48/I49/I54/I56 sono verifiche da ri-eseguire, non codice; I53 e I68–I82 erano proposte mai implementate)
- Restano da fare: I18 (fallback, attende V4 fresca o accettazione documentale del verdetto V4=IDENTICI nel transcript), eventuale nuova campagna campionatore I49+V8+I56 (richiede chiave reale nel polling), rigenerazione docs/07 (proposte I68–I82), README aggiornato
- Scoperta operativa: esiste una copia piattaforma STALE in /tmp/my-project (da ignorare: il progetto vero è /home/z/my-project, ora con remote GitHub come unica copia sicura)

---
Task ID: 21
Agent: Super Z (main)
Task: Chiusura del recovery — docs/07 rigenerato, README aggiornato, protocollo finale e push conclusivo

Work Log:
- **docs/07 ri-creato**: le 15 proposte I68–I82 in §5.1–§5.15 con gli stessi numeri/significati comunicati in chat (tutte ⬜, onesto: mai implementate), contesto della proposta originale (batch 1 client-only consigliato: I69/I77/I76/I73) e priorità suggerite; il bug noto di I76 (`e.value != null` non copre undefined in event-log.tsx) è dichiarato ANCORA presente nel codice ripristinato
- **README aggiornato**: funzionalità ri-crete documentate (ring continui+glow, notifiche a tab chiuso, backoff, PWA, tab identity, nav scrollspy, spreco/prevedibilità/calendario/ritmo/istogramma/oggi-vs-media/diagnostica) + sezione Qualità (146 test/463 asserzioni, audit 116 verifiche)
- docs/04: nota §1 aggiornata (cataloghi docs/06+07 rigenerati l'11/10), changelog +1 riga chiusura
- Protocollo finale: tsc 0 errori fuori baseline · lint EXIT=0 · bun test 146/146 (463 asserzioni) · audit PASS 116/116 · verifica browser delle fasi 2–3 già eseguita (SW attivo, tab, zero overflow mobile, zero errori console)
- Commit e push a ogni milestone (fase 1, fase 2, fase 3, chiusura) come richiesto dall'utente; snapshot DB runtime separate a ogni chiusura (lezione I30)

Stage Summary:
- RECOVERY COMPLETATO: tutto il lavoro perito ri-implementabile è di nuovo nel repo e su GitHub — I50/I51/I52/I55 (fondamenta+PWA) e I57–I67 (abbellimenti), con test, audit, documentazione e worklog sincronizzati
- Mapping finale degli item persi: I18 ⬜ (attende V4 fresca o accettazione documentale del verdetto V4=IDENTICI), I48/I49/I54/I56 ⬜ (verifiche da ri-eseguire, non codice; I49/I56 richiedono una nuova campagna con chiave reale nel polling), I53 + I68–I82 ⬜ (proposte mai implementate, catalogo docs/07 rigenerato)
- Lo stato dichiarato in docs/04 è di nuovo allineato alla realtà del codice (audit come garanzia continua)
- Suggerimenti per la prossima sessione: (1) docs/07 batch 1 client-only (I69/I77/I76+fix bug/I73) con clarify §10; (2) nuova campagna campionatore I49+V8+I56 quando l'utente conferma il polling con chiave reale; (3) I18 se l'utente accetta documentalmente il verdetto V4=IDENTICI registrato nel transcript chat

---
Task ID: 22
Agent: Super Z (main)
Task: I18 — fallback automatico su coding_plan/remains (documento, commit e push su richiesta utente: «procedi con I18, poi documenta e commit con push»)

Work Log:
- Via di sblocco: accettazione documentale del verdetto V4 = IDENTICI del 09/10 (chiave reale, campagna Task 23; esiti persi col secondo rollback, transcript chat unica evidenza) — percorso già previsto nella riga I18 di docs/04 e autorizzato dall'utente con «procedi con I18»
- src/lib/minimax.ts: CODING_PLAN_ENDPOINTS (eu: api.minimax.io, cn: api.minimaxi.com — docs/01 §4), FALLBACK_TRIGGER_HTTP {404,405,410,501}, tipo PrimaryFailureKind, shouldTryFallback() pura (SI anche su bad_json; NO su auth 401/403/1004, network, timeout — lì interviene il retry I51)
- api/minimax/usage/route.ts: rifattorizzato in tryEndpoint() riusabile (1 tentativo + 2 ritenti transitori I51, timeout 12s, invariato per primario e fallback); sul fallimento definitivo del primario con trigger valido tenta CODING_PLAN_ENDPOINTS[region]; successo → ok:true con endpoint alternativo e fallback {used, primaryEndpoint, reason}; fallback fallito → errore del PRIMARIO con fallbackTried: true
- src/app/page.tsx: fallbackActiveRef + evento tecnico «info» SOLO sulla transizione primario↔fallback (attivazione con motivo, ritorno al primario al primo successo senza fallback; ritorno con errore silenzioso — coperto da markError); tipo risposta esteso con fallback/fallbackTried
- tests/lib/minimax-fallback.test.ts (nuovo): 10 test su endpoint per regione, trigger set, decisione (SI/NO per ogni kind) e parità del parser su risposta coding_plan (V4 = IDENTICI)
- scripts/verifiche/audit-implementazioni.mjs: +10 check I18 (simboli, wiring proxy e client, file test)
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 156/156 (496 asserzioni, era 146/463) · audit 126/126 PASS 0 scoperte (era 116)
- Verifica reale proxy: curl con chiave finta → ok:true con passthrough status_code 1004 sul primario token_plan (messaggio «login fail…», coerente con l'evidenza del 02/10), NESSUN campo fallback (auth non innescà il fallback) — registrata in docs/05 §10
- Verifica agent-browser (con route di protezione su /api/history e /api/events dalla prima apertura): desktop 1280 zero overflow (docW 1280), mobile 390 zero overflow (docW 390), zero errori pagina, console pulita; screenshot scripts/verify-i18-desktop.png e verify-i18-mobile.png
- Documentazione: docs/04 (riga I18 ✅ con nota via, §4 riga V4 ✅ accettazione documentale + nota I18, §8 changelog), docs/01 §4 (verdetto + meccanismo fallback), docs/03 (§3 mappa minimax.ts e route.ts, nuova §5.9), docs/05 (§6 stato accettazione, §10 riga curl), README (riga polling+fallback, Qualità 156 test/126 verifiche)

Stage Summary:
- I18 ✅: primo item del filone estensioni ri-creato dopo il rollback; il monitor sopravvive al ritiro dell'endpoint primario (404/405/410/501 o non-JSON) continuando su coding_plan/remains con parser condiviso
- Nei percorsi senza chiave la validazione è completa (test, audit, curl, browser); l'unico residuo è la conferma empirica dei DATI con chiave reale (V4 fresca raccomandata in docs/05 §6 — se desse esito diverso, I18 si ridefinisce)
- Suite di qualità aggiornata: 156 test / 496 asserzioni, audit 126/126; README allineato
- Commit: codice+docs in un commit, snapshot DB runtime separato (lezione I30), push origin main (ciclo operativo Task 17)

---
Task ID: 23
Agent: Super Z (main)
Task: Batch 1 client-only docs/07 — I69/I77/I76/I73 implementati («procedi con il prossimo step»)

Work Log:
- Prima del batch: push di sicurezza del commit pendente 843298d (snapshot piattaforma, ahead 1) e .gitignore aggiornato (tool-results/ ignorato)
- Docs-first: docs/03 §5.11 «Batch 1 client-only» con il design completo delle 4 proposte (semantica finestra semiaperta, filtri come vista non cancellazione, boundary per sezione, widget compatta)
- I69 — lib/interval.ts NUOVO: RANGE_PRESETS (6h/24h/3g/7g/30g/all) + filterHistoryByPreset pura (finestra [now−ampiezza, +∞) inclusiva, «tutto» = stesso array, ordine preservato); page.tsx: stato rangePreset + filteredHistory (si restringe anche col solo scorrere del tempo via tick now) applicato a HistoryChart, StatsPanel/trend, RateChart, LongTermAnalysis; Diagnostica resta su storico COMPLETO (scelta documentata); selettore a chips (ToggleGroup) sopra il grafico, condiviso con la vista compatta
- I77 — lib/event-filters.ts NUOVO: filterEvents pura (kind multi-selezione, ricerca case-insensitive su messaggio+modello, periodo tutto/oggi-Roma/24h/7g) + startOfTodayRome DST-safe (mezzanotte Roma via parte en-CA + offset con raffinamento); event-log.tsx: chips ToggleGroup per kind, ricerca con icona, Select periodo, contatore «N di M eventi», empty state dedicato, «Azzera filtri»; export resta sull'archivio COMPLETO (i filtri sono una vista)
- I76 — fix bug noto: event-log.tsx `typeof e.value === "number"` al posto di `e.value !== null` (undefined passava e crashava .toFixed portando giù l'intera pagina); section-boundary.tsx NUOVO (class component, getDerivedStateFromError + componentDidCatch, fallback skeleton animato + messaggio tecnico + «Riprova»); le 10 sezioni della pagina (anelli, grafico, stats, ritmo, panoramica, analisi, diagnostica, altri modelli, tecnici, eventi) avvolte indipendentemente
- I73 — lib/compact.ts NUOVO: readCompactMode pura (?compact, =1, =true; tutto il resto NO); page.tsx: vista compatta = header ridotto (con pulsante «Torna alla vista completa» Maximize2), solo MainWindows + RateChart + selettore intervallo; senza nav, badge row, banner, grafico, panoramica, analisi, diagnostica, tecnici, registro, footer; errore API e setup restano visibili; skeleton ridotto per il primo mount
- Correzioni in itinere: bug startOfTodayRome (doppia sottrazione dell'offset nel raffinamento — stima poi naive−offset(stima)); 2 assert di test errati (ordine non cronologico conservato, model default di ev())
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 179/179 (546 asserzioni, era 156/496) · audit 146/146 PASS 0 scoperte (era 126, +20 check)
- Verifica browser reale (route /api/history + /api/events bloccate con body {} dal primo step — nessuna scrittura demo sul DB): selettore I69 presente e click 6h → grafico+ritmo renderizzati; filtri I77: chips Reset → «1 di 8 eventi», ricerca case-insensitive («reset» → 1 match), empty state su query inesistente, «Azzera filtri» funziona; I76: evento SENZA value iniettato in localStorage → ricarica → pagina renderizzata e evento visibile (prima crashava), evento di prova poi rimosso; I73: ?compact=1 = solo #quota+#ritmo+selettore (nav/grafico/panoramica/analisi/diagnostica/eventi/footer/badge assenti), uscita → «/» ripristina la vista completa; mobile 390px zero overflow (390 vs 390) in entrambe le viste; console senza errori; screenshot scripts/verify-batch1-i69-6h.png, verify-batch1-i77-filtri.png, verify-batch1-i73-compact.png, verify-batch1-mobile390.png
- Documentazione: docs/03 §5.11; docs/04 §3 (I69/I77/I76/I73 → ✅) + §8 changelog; docs/07 (header «4 di 15», §5.2/§5.6/§5.9/§5.10 con nota implementazione, priorità 1 barrata-IMPLEMENTATO); README (3 righe funzionalità + qualità 179/146); questo worklog

Stage Summary:
- BATCH 1 CLIENT-ONLY COMPLETATO: prime 4 proposte di docs/07 passano da ⬜ a ✅ (I69 selettore intervallo, I77 filtri registro, I76 error boundary + fix bug empirico, I73 widget compatta) — tutte client-side, proxy/DB/protocollo di polling intoccati
- La correzione empirica più importante: il bug del registro eventi (evento senza value = crash di tutta la pagina) è RIPRODOTTO e CORRETTO, con la pagina ora protetta da 10 error boundary indipendenti
- Suite di qualità: 179 test / 546 asserzioni, audit 146/146; README e docs allineati
- Restano da fare in docs/07: batch 2 analisi (I70/I71/I72), batch 3 infrastruttura (I80/I81/I68), backlog (I74/I75/I78/I79/I82); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56

---
Task ID: 24
Agent: Super Z (main)
Task: Batch 2 analisi docs/07 — I70/I71/I72 implementati («procedi con il prossimo step. poi aggiorna la documentazione, fai il commit ed il push»)

Work Log:
- Docs-first: docs/03 §5.12 «Batch 2 analisi» con il design completo delle 3 proposte (z-score robusto Iglewicz–Hoaglin, qualità del campionamento con giorno Roma DST-safe, proiezione EWMA con mezza vita 2h)
- I70 — lib/rate-anomalies.ts NUOVO: detectRateAnomalies pura (mediana + MAD su ritmi GREZZI di rateSeries con sma:1 — la SMA di default smorzerebbe i picchi; z = 0.6745·(x−mediana)/MAD, soglia 3.5, minValidi 8; fallback documentato MAD=0 → media degli scarti assoluti, 0 → nessuna anomalia); diagnostica-panel.tsx: sezione «Anomalie del ritmo» su storico COMPLETO (coerente con I60/I62) con badge verde/ambra, regime atteso, max 8 anomalie dalla più recente, z con segno (scoppio rosso / pausa azzurra), empty state dedicato
- I71 — lib/sampling.ts NUOVO: samplingQuality pura (mediana intervallo robusta ai buchi; copertura per giorno Europe/Rome via romeDayKey en-CA DST-safe, arco coperto = primo→ultimo punto + un intervallo per l'ultimo, cap 100%; gap > gapMin=15 min — esattamente 15 NON è un gap — dal più recente); diagnostica-panel.tsx: sezione «Qualità del campionamento» con badge copertura media (verde ≥90/ambra ≥60/rosa), barre ultimi 7 giorni Roma, tabella gap con durata, empty state < 2 punti
- I72 — lib/ewma.ts NUOVO: ewmaProjection pura (ritmi istantanei con le STESSE regole di lib/rate.ts: gap > 30 min e risalita scartati; peso exp(−età/halfLife) misurata sul SECONDO rilevamento della coppia; mezza vita default 2h; esaurimento solo se ritmo > 0.01); history-chart.tsx: EwmaCard nel StatsPanel AFFIANCATA al verdetto (badge «sperimentale · non sostitutiva»), KPI Lineare vs EWMA vs Differenza + riga di lettura (anticipa/allontana/concorda con soglia ±30 min); page.tsx: ewma = ewmaProjection(filteredHistory, chartWindow) passato come prop (segue l'intervallo I69)
- Correzioni in itinere: attese di test ricalcolate (MAD della serie con jitter = 2, non 1 — z(60) ≈ 13.5; threshold 2 su serie con 14 %/h → 2 anomalie non 3); ewmaProjection restituisce ritmo null (non 0) quando il ritmo è trascurabile — doc interfaccia allineata
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 212/212 (654 asserzioni, era 179/546) · audit 163/163 PASS 0 scoperte (era 146, +17 check; fix pattern regex con parentesi escapate per il check del peso exp)
- Verifica browser reale (route /api/history e /api/events bloccate con body {} dal primo step — nessuna scrittura demo sul DB: demo 241→241, eventi 8→8; il +1 punto «api» è del poller utente ancora attivo): le 3 sezioni nuove presenti (Anomalie 2 rilevate con regime/soglia, Copertura 45% con intervallo tipico, card EWMA piena: Lineare 18:51 vs EWMA 19:08, differenza +16m 55s, lettura «concorda» corretta sotto i ±30 min); desktop 1280 zero overflow (docW 1280), mobile 390 zero overflow (390 vs 390), zero errori pagina e console; screenshot scripts/verify-batch2-diagnostica.png, verify-batch2-ewma.png, verify-batch2-mobile390.png
- Documentazione: docs/03 (header + §5.12); docs/04 §3 (I70/I71/I72 → ✅) + §8 changelog; docs/07 (header «7 di 15», §5.3/§5.4/§5.5 con nota implementazione, priorità 2 barrata-IMPLEMENTATO); README (3 righe funzionalità + qualità 212/163); questo worklog

Stage Summary:
- BATCH 2 ANALISI COMPLETATO: I70/I71/I72 passano da ⬜ a ✅ (anomalie del ritmo, qualità del campionamento, proiezione EWMA) — tutte client-side, proxy/DB/protocollo di polling intoccati
- Scelta di design più importante: I70 opera sui ritmi GREZZI (sma:1) perché la SMA-3 smorza proprio i picchi da segnalare; I71 rende visibile la qualità dello storico PRIMA di fidarsi delle analisi; I72 resta un secondo parere NON sostitutivo del verdetto lineare
- Suite di qualità: 212 test / 654 asserzioni, audit 163/163; README e docs allineati
- Restano da fare in docs/07: batch 3 infrastruttura (I80/I81/I68), backlog (I74/I75/I78/I79/I82); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56

---
Task ID: 25
Agent: Super Z (main)
Task: Batch 3 infrastruttura docs/07 — I80/I81/I68 implementati («procedi con il prossimo step. poi aggiorna la documentazione, fai il commit ed il push»)

Work Log:
- Docs-first: docs/03 §5.13 «Batch 3 infrastruttura» con il design completo delle 3 proposte (endpoint summary read-only, test componente, downsampling orario come DATO DERIVATO)
- I80 — src/app/api/summary/route.ts NUOVO: GET senza chiave né parametri (punti totale/api/demo/altro, arco, ultimoRilevamento, eventi totale/perKind/ultimo, downsample ore/prima/ultima); SOLO query di lettura (count/groupBy/findFirst); l'audit porta un check di ASSENZA delle scritture sulla route (\.(create|upsert|update|deleteMany|delete)\() — ADR-8 intoccato
- I81 — @testing-library/react 16 + happy-dom (GlobalRegistrator: pattern ufficiale Bun; jsdom scartato — sotto Bun con React 19/act è meno affidabile; nota in docs/07 §5.14); bunfig.toml con [test] preload del setup: senza preload screen di testing-library si lega a document.body PRIMA della registrazione (bun valuta i node_modules prima dei file locali) e i test falliscono con «global document has to be available»; polyfill ResizeObserver + IntersectionObserver stub in setup-dom; tests/components/: quota-ring.test.tsx (6: valore, N/D, bigValue, arco dashoffset, saturazione 0/100, MiniBar), nav-boundary.test.tsx (SectionNav: 8 ancore, aria-current, click; SectionBoundary: figlio che lancia → fallback «Riprova» con console.error silenziata), event-log.test.tsx (5: descrizione default — il contatore «N di M» appare SOLO con filtri attivi come da design I77, chip Reset, ricerca case-insensitive, «Azzera filtri», empty state); fix collaterale: usage-events.test.ts ora sostituisce localStorage con Object.defineProperty (readonly con happy-dom attivo)
- I68 — prisma/schema.prisma: model DownsampledPoint (bucket per (hourStart UTC, source): min/max/somma/ultimo per interval e weekly + count + lastT, @@unique([hourStart, source]) — DATO DERIVATO ricostruibile al 100%); bunx prisma db push (non distruttivo) + client rigenerato; lib/downsample.ts NUOVO (hourStartOf, emptyHourBucket, mergeHourBucket incremento puro con «ultimo» via confronto lastT — nessuno stato extra, serverHourlyToHistory con ultimo valore per continuità); api/history/route.ts: updateHourBucket incrementale nella POST (errore NON bloccante per il punto grezzo), stesso pruning 90 giorni sui bucket, GET ?granularity=hour[&source=] con min/max/media/ultimo; scripts/verifiche/backfill-downsample.mjs NUOVO (ricostruzione completa idempotente) eseguito: 716 punti → 24 ore; server-history.ts +fetchServerHourly; history-chart.tsx: voci «Storico orario (I68, grana derivata)» CSV/JSON nel menu Esporta
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 239/239 (731 asserzioni, era 212/654) · audit 183/183 PASS 0 scoperte (era 163, +20 check; fix pattern @@unique escapato)
- Verifiche live: dev server RIAVVIATO (il client Prisma rigenerato non viene colto a caldo: «Cannot read properties of undefined (reading 'count')» prima del restart); curl /api/summary completo (724 punti: 483 api + 241 demo, 8 eventi, 24 ore), curl ?granularity=hour con bucket min/max/media/ultimo e filtro source=demo funzionante, POST di un punto di prova demo (t −2h) → bucket orario creato correttamente (count 1, ultimo 12.5/88.5); browser con route /api/history+/api/events bloccate: menu Esporta con le 3 voci orarie visibili, click «JSON orario» con route bloccata → toast errore atteso; route sbloccate: click → toast «Esportate 26 ore dallo storico orario del server» (percorso client completo); demo 241→243 (1 punto di prova POST + 1 tick demo della pagina durante la finestra di verifica, entrambi etichettati demo — comportamento documentato); api crescono solo per il poller utente (486); desktop 1280 zero overflow, mobile 390 zero overflow, console senza errori; screenshot scripts/verify-batch3-menu-orario.png, verify-batch3-mobile390.png
- Documentazione: docs/03 (header + §5.13); docs/04 §3 (I68/I80/I81 → ✅) + §8 changelog; docs/07 (header «10 di 15», §5.1/§5.13/§5.14 con nota implementazione, priorità 3 barrata-IMPLEMENTATO); README (API summary + export orario + downsampling + qualità 239/183); questo worklog

Stage Summary:
- BATCH 3 INFRASTRUTTURA COMPLETATO: I80 (endpoint sintesi read-only per widget esterni), I81 (test componente con testing-library+happy-dom e preload bunfig), I68 (downsampling orario come dato derivato con backfill) passano da ⬜ a ✅ — docs/07 ora 10 di 15
- Scelte di design più importanti: (1) il downsample è DATO DERIVATO — il punto grezzo resta intatto e il bucket si ricostruisce con backfill; (2) happy-dom al posto di jsdom per i test componente sotto Bun; (3) l'audit verifica l'ASSENZA di scritture in /api/summary, non solo la presenza di codice
- Suite di qualità: 239 test / 731 asserzioni, audit 183/183; README e docs allineati
- Restano da fare in docs/07 (backlog): I74 · I75 · I78 · I79 · I82; fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56

---
Task ID: 26
Agent: Super Z (main)
Task: Batch 4 UX docs/07 — I74/I75/I78 implementati («procedi con il prossimo step. poi aggiorna la documentazione, fai il commit ed il push»)

Work Log:
- Docs-first: docs/03 §5.14 «Batch 4 UX» con il design completo delle 3 proposte (barra mobile come alternativa alla nav I66, stampa a due livelli, tema chiaro come strato di rimappatura)
- I74 — components/bottom-nav.tsx NUOVO: barra fissa `fixed bottom-0 md:hidden` con safe-area iOS e le stesse 8 ancore; lo scrollspy di I66 è estratto in `useScrollSpySezioni()` (section-nav.tsx, ora restituisce [attiva, setAttiva, offset]) e condiviso dalle due superfici; page.tsx: nav superiore in wrapper `hidden md:block` (alternativa su telefono), BottomNav + spaziatore `h-16 md:hidden` dopo il footer (non coperto), né nav né barra nella vista compatta I73
- I75 — lib/print.ts NUOVO (`stampaReportSettimanale` con target iniettabile: classe `print-report` su body, window.print, rimozione su afterprint anche con annullamento) + components/print-report.tsx NUOVO (`hidden` a schermo, `.print-report-root`): verdetto lineare+EWMA, cicli+spreco per ENTRAMBE le finestre, consumo per weekday, calendario 12 settimane — calcolato sullo STORICO COMPLETO (non sull'intervallo I69); history-chart.tsx: prop `onStampaReport` opzionale + voce «Stampa report settimanale» in cima al menu Esporta (assente senza handler, es. compact); globals.css: `@media print` generico (bianco, cromo nascosto, card non spezzabili, bottoni via) + `body.print-report main > *:not(.print-report-root)` nascosti
- I78 — next-themes (dipendenza già presente) attivato in layout.tsx: ThemeProvider attribute="class" defaultTheme="dark" enableSystem (zero cambiamento senza scelta esplicita: il localStorage `theme` si popola solo su scelta), Toaster passa al wrapper shadcn che già legge useTheme; components/theme-toggle.tsx NUOVO (Sun/Moon nell'header, alterna chiaro/scuro in modo esplicito); settings-dialog.tsx: 4º tab «Aspetto» con Select Sistema/Chiaro/Scuro; globals.css: strato `html:not(.dark)` unlayered che ri-mappa le superfici hardcoded (bg-[#09090b]→bianco, zinc 100-600 invertiti, white-alpha→black-alpha, accent 200/300→600/700, bg-zinc-950→bianco, hover e stati attivi, SVG white-alpha via selettori per attributo) — tema scuro INTATTO; blocco JSON grezzo resta scuro di proposito (regola pre specifica)
- Correzioni in itinere: (1) l'header del PrintReport era un `<header>` e la regola print `header{display:none}` lo nascondeva — il PDF di prova iniziava dal verdetto: convertito in `<div>` con nota; (2) TrendStats non esportata da history-chart.tsx (serviva a print-report) → esportata; (3) default parameter `window as unknown as StampaTarget`; (4) test fintoTarget riscritto con oggetto unico (Object.assign copiava i primitivi per valore: i contatori restavano a 0); (5) attesa test tema corretta: next-themes NON scrive il default nel localStorage, solo le scelte esplicite
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 249/249 (761 asserzioni, era 239/731: +3 bottom-nav, +4 print, +3 theme-toggle) · audit 203/203 PASS 0 scoperte (era 183, +20 check)
- Verifica browser reale (route /api/history e /api/events bloccate con body {} dal reload — nessuna scrittura demo intenzionale sul DB; +3 punti demo etichettati demo nella finestra di verifica, comportamento noto; api crescono solo per il poller utente): tema chiaro via toggle → html.light con palette leggibile (screenshot verify-batch4-tema-chiaro.png), tab «Aspetto» presente con Select e valore corrente, Select Scuro → localStorage theme=dark e html.dark; menu Esporta con la voce stampa in cima, click → classe print-report aggiunta e rimossa da afterprint (headless); PDF REALE con media print (agent-browser pdf) con body.print-report → foglio con SOLO il report, intestazione inclusa (verify-batch4-report.pdf, dopo fix header); mobile 390: barra fissa visibile (bottom=844/vh=844), top nav effettivamente nascosta (offsetParent null), click «Eventi» → aria-current=true e sezione visibile, zero overflow (390/390); compact ?compact=1: nessuna delle due nav; desktop 1280 dark: INTATTO (verify-batch4-desktop-dark.png), zero overflow (1280/1280), console senza errori
- Documentazione: docs/03 (§5.14 con nota implementazione e 2 lezioni); docs/04 §3 (I74/I75/I78 → ✅) + §8 changelog; docs/07 (header «13 di 15», §5.7/§5.8/§5.11 con nota implementazione, priorità 4: restano I79/I82); README (2 righe funzionalità + qualità 249/203); questo worklog

Stage Summary:
- BATCH 4 UX COMPLETATO: I74 (barra navigazione mobile), I75 (report settimanale stampabile + stampa generica), I78 (tema chiaro opzionale) passano da ⬜ a ✅ — tutte client-side, proxy/DB/protocollo di polling intoccati; docs/07 ora 13 di 15
- Scelte di design più importanti: (1) il tema chiaro NON tocca i componenti — strato di override css con specificità maggiore, scuro intatto per costruzione; (2) il report stampa SOLO il blocco dedicato via body.print-report ed è calcolato sullo storico completo; (3) scrollspy I66 estratto in hook condiviso invece di duplicarlo
- Suite di qualità: 249 test / 761 asserzioni, audit 203/203; README e docs allineati
- Restano da fare in docs/07: I79 (audit accessibilità), I82 (generalizzazione multi-modello); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56
- Chiusura: commit codice+docs e commit DB separato (lezione I30), push origin main

---
Task ID: 27
Agent: Super Z (main)
Task: I83 — Correzione leggibilità del tema chiaro (segnalazione utente: warning gialli, info azzurre EWMA, icone registro eventi, tab attivo impostazioni bianco su bianco; verifica al browser richiesta)

Work Log:
- Analisi del strato `html:not(.dark)` di I78 in globals.css e censimento completo delle classi accent in src/ con rg: individuate TRE famiglie di classi che sfuggivano ai selettori per classe — (1) nomi con PREFISSO VARIANTE e/o SUFFISSO `!` (data-[state=active]:bg-white/[0.08]!, text-zinc-400!, data-[state=on]:text-zinc-100! dei chips I69, focus:bg-white/[0.08]! del menu Esporta, …): nel DOM sono stringhe distinte da quelle senza; (2) varianti con MODIFICATORE DI OPACITÀ (text-amber-200/70…/50, text-rose-200/90…/60, text-sky-200/70, text-sky-300/80, text-emerald-200/70, text-violet-200/70, text-rose-100); (3) toni 400/500 usati come TESTO/ICONA (rose/amber/emerald/sky/orange-400, emerald-500) troppo chiari su bianco
- Docs-first: docs/03 §5.15 con cause, cure e criteri di accettazione
- Implementazione in globals.css: varianti opacità → 700/800/900; 400/500 testo/icone → 600 (verificato prima che le variabili --color-* esistano nel CSS compilato: solo rose-900 assente e non referenziata); hover scuri (text-zinc-200/300, text-rose-300, con e senza !); bg-amber-950/20 → tinta chiara; menu Esporta bianco (bg-zinc-950! rimappato); cure per STATO dei tab/chips attivi
- LEZIONE DI CASCADE verificata al browser: la prima versione con !important UNLAYERED NON ha battuto le utilities ! di Tailwind v4 (emesse con !important DENTRO @layer utilities — per le important un layer batte sempre le unlayered, Cascade 5 §6.4): le regole `!` di I78 erano MORTE dalla nascita (invisibile in dark perché le utilities producono già i colori giusti). Cura definitiva: blocco @layer utilities dedicato in coda alla sezione chiara (stesso layer, posizione successiva, specificità 0,3,1+ → vince) per stati attivi, classi !, focus e hover !
- Nota tecnica probe: querySelectorAll('.text-sky-200\\/70') non è un selettore valido (la / non si escapa in CSS) → i probe vanno scritti scandendo className.includes(...)
- Verifica browser reale (route /api/history + /api/events bloccate con body {} — nessuna scrittura demo sul DB; tema via localStorage theme): probe di colore calcolato → tab attivo impostazioni e tab finestra grafico rgb(24,24,27) su rgba(0,0,0,0.07) con bordo rgba(0,0,0,0.12) (era bianco su bianco); chips I69 attive idem; card EWMA sky-200[/70] e badge sky-300/80 in sky-700; badge registro eventi (icona+testo) emerald/amber/rose/orange-600; nota tecnica amber-200/50 in amber-900; menu Esporta bianco con voci scure; TabsList bg grigina; TEMA SCURO INTATTO al probe dopo reload in dark (chip/tab/badge/body = valori originali); zero overflow 1280 in entrambi i temi, console senza errori; screenshot scripts/verify-i83-impostazioni-light.png, verify-i83-grafico-light.png, verify-i83-ewma-light.png, verify-i83-eventi-light.png, verify-i83-menu-light.png
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 249/249 (761 asserzioni, invariato — fix solo CSS) · audit 203/203 PASS 0 scoperte
- Documentazione: docs/03 (header + §5.15 con lezione cascade); docs/04 §3 (I83 → ✅) + §8 changelog; docs/07 §5.11 (nota correzione); questo worklog

Stage Summary:
- I83 COMPLETATA: il tema chiaro ora è leggibile su tutte le superfici segnalate (tab attivi impostazioni e grafico, chips intervallo/filtri, banner e card di avviso, card EWMA, badge con icona del registro eventi, menu Esporta) senza toccare alcun componente e con il tema scuro verificato intatto al probe
- Scoperta più importante: in Tailwind v4 le utilities con ! (important) DENTRO @layer utilities battono qualsiasi !important unlayered — le regole light di I78 per le classi ! non hanno MAI funzionato; la cura è un blocco @layer utilities dedicato con specificità maggiore
- Suite invariata: 249 test / 761 asserzioni, audit 203/203; docs allineati (03 §5.15, 04 §3+§8, 07 §5.11)
- Restano da fare in docs/07: I79 (audit accessibilità), I82 (generalizzazione multi-modello); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56
- Chiusura: commit codice+docs e commit DB separato (lezione I30), push origin main

---
Task ID: 28
Agent: Super Z (main)
Task: I84 — Due famiglie di colore (tema chiaro confermato al probe WCAG + tema scuro revisionato perché poco leggibile; verifiche browser su ENTRAMBI i temi; «esegui le verifiche nel browser per il tema chiaro e per il tema scuro»)

Work Log:
- Probe WCAG reale nel browser (scripts/probe-contrast.js, agent-browser su :3000, rotte /api/history+/api/events bloccate con body {} — nessuna scrittura demo sul DB): risoluzione dei colori calcolati di Chrome in QUALUNQUE formato (oklab/oklch/lab/rgb/color(srgb) → sRGB, con Bradford D50→D65 per lab) + alpha compositing (il fg con opacità viene FUSO sullo sfondo effettivo prima del rapporto — bug del primo probe corretto: confrontare fg alpha non fuso sovrastimava il contrasto, es. sky-200/70 «14.8» reale ≈7.4); sfondo effettivo = risalita degli antenati con blending; soglie WCAG 2.1 AA (4.5:1 piccolo, 3:1 grande)
- Misura baseline: SCURO — tutti gli accent passano (5.5–15:1), UNICI FAIL il testo secondario: zinc-500 3.85–4.12:1 e zinc-600 2.26–2.58:1 (note tecniche/timestamp 10–11px); CHIARO (definito «corretto» dall'utente) — 21 FAIL: toni 600 di I83 su tinte 2.5–3.6:1 (badge registro eventi, valori anelli, badge diagnostica, chip kind), zinc-500/600 4.24–4.33:1 su tinte grigie, etichette menu text-zinc-500! 4.33:1 (mai cure in I83)
- Design docs (docs/03 §5.16): DUE FAMIGLIE esplicite con token semantici :root/.dark — --mm-muted/--mm-muted-2 (chiaro rgb(95,95,104) ≥5.5:1; scuro rgb(150,150,160) ≥6.3:1 e rgb(138,138,148) ≥5.4:1 con gerarchia preservata); regole che consumano i token: chiaro html:not(.dark) .text-zinc-500/600, scuro NUOVE .dark .text-zinc-500, .dark .text-zinc-600, .dark .placeholder\:text-zinc-600::placeholder (unlayered 0,2,0 → battono le utilities layered, tecnica I78/I83) + .dark .text-zinc-500\! in un SECONDO blocco @layer utilities dedicato (lezione cascade I83)
- Cure famiglia CHIARO: accent testo/icone 600→700 (rose/amber/sky/orange su 300/400/500) e →800 (emerald 300/400/500, amber-200); tinte forti bg-*-400/10, bg-*-500/15, bg-*-500/20 → toni 50 PIENI solidi (#ecfdf5, #fffbeb, #fff1f2, #fff7ed, #f0f9ff, #f5f3ff — il 700 sul 50 misura 4.8–5.7:1, sul translucido scendeva a 2.5–4.5); violet-300→600 resta (unico 600 che passa, 5.2–5.5:1); bordi decorativi /25–/30 e barre /70 intatti; text-zinc-500! aggiunto al blocco layered chiaro
- Cure famiglia SCURO: SOLO il muted (+placeholder+menu) — accent scuri INTATTI perché la misura li dà tutti ≥5.5:1; nessun componente toccato (architettura a strati I78 invariata)
- LEZIONE TOOLCHAIN (2 cicli di debug): Turbopack (Next 16) ha servito ~1h un CSS STALE e INCOERENTE (token sì, blocco tinte no — sia nel chunk linkato sia nell'HMR inline) NONostante il sorgente corretto; esclusa la pipeline: @tailwindcss/postcss e LightningCSS puri PRESERVANO il blocco (test node scripts/test-tailwind-pipe.cjs, test-lightningcss.cjs); cura: pkill dev server + rm -rf .next + restart → tutte le regole compaiono (stesso precedente noto del progetto col client Prisma rigenerato); regola operativa registrata in docs/03 §5.16
- Verifica finale browser ENTRAMBI i temi (dopo pulizia cache): CHIARO 36 campioni / 0 FAIL, SCURO 38 campioni / 0 FAIL (era 21 e 6); tab impostazioni verificati in entrambi i temi (attivo rgb(24,24,27) su rgba(0,0,0,0.07) in chiaro; quasi-bianco su white-alpha in scuro — entrambi ≥11:1); console senza errori; screenshot scripts/verify-i84-impostazioni-light.png, verify-i84-impostazioni-dark.png, verify-i84-full-light.png, verify-i84-full-dark.png
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 249/249 (761 asserzioni, invariato — fix solo CSS) · audit 211/211 PASS 0 scoperte (era 203, +8 check I83/I84 — colmata la scoperta pre-esistente «I83 ✅ senza verifiche»)
- Documentazione: docs/03 (header + §5.16 completa con misura, design, lezione toolchain, esiti); docs/04 §3 (I84 → ✅, riga riparata dopo edit corrotto) + §8 changelog; docs/07 §5.11 (nota correzione I84); README (audit 203→211); questo worklog

Stage Summary:
- I84 COMPLETATA: due famiglie di colore esplicite e MISURATE — tema chiaro confermato e rafforzato (tutte le combinazioni ≥4.5:1), tema scuro revisionato SOLO dove il probe falliva (testo secondario zinc-500/600 → token dedicati ≥5.4:1) con accent scuri intatti
- Scoperta più importante (misura): il «tema chiaro corretto» di I83 aveva 21 fallimenti AA sotto soglia (600 su tinte) e il tema scuro «poco leggibile» falliva SOLO sul muted — la percezione dell'utente sul scuro era guidata proprio dal testo secondario (70+ usi di zinc-500)
- Lezione toolchain registrata: CSS stale selettivo di Turbopack → pulizia .next + restart PRIMA di indagare il CSS
- Suite: 249 test / 761 asserzioni, audit 211/211 (+8 check I83/I84); docs allineati (03 §5.16, 04 §3+§8, 07 §5.11, README)
- Restano da fare in docs/07: I79 (audit accessibilità), I82 (generalizzazione multi-modello); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56
- Chiusura: commit codice+docs e commit DB separato se serve (lezione I30), push origin main

---
Task ID: 29
Agent: Super Z (main)
Task: I85 — Nav sezioni sempre visibile durante lo scrolling («il menù di navigazione delle sezioni ... fosse sempre visibile anche durante lo scrolling della pagina, come fissato in alto; modifica ed aggiorna la documentazione, poi commit e push su remoto»)

Work Log:
- Diagnosi al browser: la nav di I66 era GIÀ `position: sticky` con `top` corretto (= altezza header, 106px) MA in page.tsx era avvolta da `<div className="hidden md:block">` contenente SOLO la barra — un elemento sticky scorre solo DENTRO il proprio contenitore (parent nel box tree): wrapper alto quanto la barra = zero corsa, la nav «sfila» col wrapper. Nessun antenato con overflow bloccante → cura puramente strutturale
- I85 — page.tsx: nav figlia DIRETTA di `<main>` (niente wrapper; il suo contenitore sticky diventa tutta la pagina); section-nav.tsx: classe `hidden md:block` spostata sulla nav stessa (su <md subentra la barra I74, comportamento identico); commenti componente e pagina aggiornati
- SCOPERTA COLLATERALE (bug pre-esistente I66, mai esploso): durante la verifica il scrollspy risultava MORTO — aria-current inchiodato su «Quota» per qualunque scroll. Diagnosi: le 8 sezioni ancorate montano SOLO col primo snapshot (prima skeleton), l'effect dell'IntersectionObserver gira all'attivazione → getElementById = null × 8 → observer nasce VUOTO e non osserva mai più (nessun re-observe quando le sezioni compaiono); le verifiche passate testavano solo il CLICK (setAttiva manuale), mai la prosecuzione dello scroll — per questo non era mai emerso. Probe IO standalone con gli stessi parametri FUNZIONAVA (batch `visibile:ritmo`) → problema esclusivamente di ordine di montaggio, non dell'API. Cure: nell'hook condiviso `useScrollSpySezioni` l'osservazione RIPROVA finché le 8 sezioni sono nel DOM (250 ms × 120 = 30 s max, oltre: pagina senza sezioni es. setup, rinuncia silenziosa) — cura anche la barra mobile I74
- Correzioni in itinere: check audit I74 aggiornato al nuovo domicilio della classe `hidden md:block` (ora su section-nav.tsx, prima page.tsx — stesso comportamento, verifica riallineata); refuso nel commento page.tsx
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 250/250 (764 asserzioni, era 249/761: +1 test I85 sticky/hidden/md:block sul componente) · audit 214/214 PASS 0 scoperte (era 211, +3 check I85: figlia diretta di main, assenza wrapper, sticky+hidden md:block sul componente)
- Verifica browser reale (route /api/history + /api/events bloccate con body {} — nessuna scrittura demo intenzionale; la pagina è comunque finita in demo mode durante le finestre di verifica: +25 tick demo etichettati demo e +5 eventi, comportamento noto; api crescono solo per il poller utente 486→580): DESKTOP 1280 SCURO — a riposo nav a 130px; a fondo pagina (scrollY 6071) nav INCHIODATA a 106px = bordo inferiore header, 8 ancore visibili; scrollspy segue tutte le 7 transizioni (grafico→Grafico … eventi→Eventi); click «Diagnostica» → aria-current immediato e sezione a 162px MAI sotto il chrome sticky; TEMA CHIARO — nav rgba(250,250,250,0.9) (rimappa I78 attiva anche sticky), link attivo rgb(24,24,27), stesso sticky/spy; MOBILE 390 — nav superiore display:none, barra fissa I74 visibile a fondo pagina con scrollspy vivo («Eventi»); COMPACT — nessuna delle due nav; zero overflow orizzontale (1280 e 390); console senza errori; screenshot scripts/verify-i85-desktop-light.png, verify-i85-desktop-dark.png, verify-i85-desktop-dark-scroll.png
- Documentazione: docs/03 (header + §5.17 con causa, cure, scoperta scrollspy, verifiche, lezione di verifica); docs/04 §3 (I85 → ✅) + §8 changelog; docs/06 §5.10 (nota implementazione I85); docs/07 §5.7 (nota I85 sull'hook condiviso); README (bullet navigazione aggiornato a «sempre visibile, fissata in alto durante tutto lo scrolling», I66/I85); questo worklog
- Chiusura: commit codice+docs e commit DB separato (lezione I30; demo +25/+5 durante le verifiche, api del poller utente), push origin main

Stage Summary:
- I85 COMPLETATA: la barra delle 8 sezioni resta FISSA sotto l'header per tutto lo scroll della pagina (desktop ≥md), invariata su mobile (barra fissa I74) e in compact (nessuna nav)
- Scoperta più importante: lo scrollspy di I66 era MORTO dalla nascita (observer vuoto: nasceva sullo skeleton prima che le sezioni esistessero) — rivelato solo dalla verifica con scorrimento reale; nuovo criterio: lo scrollspy va provato scrollando, il click maschera un observer vuoto
- Suite: 250 test / 764 asserzioni, audit 214/214 (+3 check I85); docs allineati (03 §5.17, 04 §3+§8, 06 §5.10, 07 §5.7, README)
- Restano da fare in docs/07: I79 (audit accessibilità), I82 (generalizzazione multi-modello); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56

---
Task ID: 30
Agent: Super Z (main)
Task: I79 — Audit di accessibilità sistematico («procedi con il prossimo step previsto dal piano, poi commit e push») + gestione workspace instabile (debris pre-rollback)

Work Log:
- Prossimo step dal piano: I79 (restano I79 e I82 in docs/07; I79 è la più prossima e client-side). Docs-first: docs/03 §5.18 con i 4 pilastri (contrasto misurato, aria-live polling, focus visibili, sr-only grafici)
- Implementazione: (1) src/lib/a11y.ts NUOVO puro — descrizioneHeatmap (totale, picco giorno+ora, celle su 168), descrizioneCalendario (totale, giorni, giorno più intenso con data), descrizioneResetClock (conteggio per finestra, ultimo in ora Roma, blocchi teorici UTC); (2) analysis-panel.tsx — <p sr-only> in HeatmapSection e CalendarSection, griglie decorative aria-hidden; (3) diagnostica-panel.tsx — ResetClock: aria-label DINAMICO dai dati (era statico); (4) page.tsx — regione aria-live="polite" per il polling («Dati aggiornati alle HH:MM:SS (Roma)») e orologio Roma degradato ad aria-hidden (annunciava OGNI SECONDO — spam da screen reader); (5) globals.css — nav a:focus-visible outline 2px offset 2px (bianco-alpha scuro / nero-alpha chiaro, strato html:not(.dark)) per i link nav privi di ring shadcn
- Test: tests/lib/a11y.test.ts 7 test (griglie fake deterministiche + casi vuoti + filtro finestra); FIX collaterale event-log.test.tsx senza cleanup() (render accumulati nel document condiviso happy-dom → getByRole «multiple elements» da un certo ordine di discovery: pattern nav-boundary applicato)
- Probe contrasto esteso con 4 campioni nav (attiva/inattiva desktop + mobile, sfondo /85 con fusione effettiva)
- FENOMENO WORKSPACE (2h di debug): debris pre-rollback NON tracciati (mtime 7-8/10: kiosk-view, backup, restore, rate-chart/tab-identity standalone, test vecchi, scripts i4x, chat proxy e token-tracker/token-log rimossi da I15/I19) MATERIALIZZATI a intermittenza — compaiono/scompaiono a ondate di minuti tra un comando e l'altro: tsc passava da 4 a 36+ errori, bun test saltava con «Unhandled error between tests», audit ADR I15/I19 fallivano. Diagnosi: visibility a ondate confermata con prove incrociate outer-shell/subshell/tsc (le subshell nocreate vedono fasi diverse); cure: scripts/verifiche/quarantena-debris.sh (mv reversibile in .debris-pre-rollback/ con percorsi preservati, 10 file toolchain-breaking + mv diretto per chat/token-tracker/token-log) + riga .gitignore + watch di fondo poi fermato (le subshell del watch vedevano fasi diverse: mv diretto dalla shell persistente è l'unico affidabile). Baseline ripristinata: solo i 4 errori esterni examples/skills
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ · bun run lint EXIT=0 · bun test 257/257 (783 asserzioni, era 250/761: +7 a11y) · audit 223/223 PASS 0 scoperte (era 214, +9 check I79)
- Verifica browser reale (rotte /api/history+/api/events bloccate; agent-browser su :3000): probe contrasto DARK 38 campioni / 0 FAIL (nav.active 14.52:1, nav.inactive 6.79:1), LIGHT 36 / 0 FAIL (14.2 e 6.05), MOBILE 390 38 / 0 FAIL (nav.mobile.active 14.52, inactive 6.79); aria-live «Dati aggiornati alle 10:36:04 (Roma)» presente; sr-only heatmap («Heatmap del consumo… Consumo totale attribuito») e calendario («Calendario del consumo… 1029.4% su 4 giorni») presenti dopo click REALE sui tab (il click sintetico non commuta i tab radix — nota tecnica); ResetClock aria-label dinamico «Orologio dei reset: 8 reset osservati… 7 della finestra di 5 ore e 1 settimanali. Ultimo reset: 11/10/2026, 21:59»; focus da tastiera con 5 press Tab reali → link «Ritmo» con outline 2px solid offset 2px in ENTRAMBI i temi (screenshot verify-i79-focus-dark.png tema scuro, verify-i79-focus-light.png chiaro — il primo scatto era in light: tema non ancora cambiato, rinominato); zero overflow 390, console senza errori
- Documentazione: docs/03 (header + §5.18); docs/04 §3 (I79 → ✅) + §8 changelog; docs/07 (header «14 di 15», §5.12 → ✅ con nota, priorità 4 aggiornata); README (riga accessibilità I79); questo worklog
- Chiusura: commit codice+docs e commit DB separato se il poller ha scritto (lezione I30), push origin main

Stage Summary:
- I79 COMPLETATA: 4 pilastri a11y consegnati e MISURATI — contrasto nav 0 FAIL nei due temi, aria-live del polling, focus visibile da tastiera, descrizioni dei grafici per screen reader; docs/07 ora 14 di 15 (resta solo I82)
- Scoperta più importante (workspace): i debris pre-rollback NON tracciati materializzano a ONDATE (fasi di minuti) e rompono toolchain/audit — la quarantena reversibile con mv dalla shell persistente è l'unica cura affidabile; lo script va ri-eseguito se il fenomeno ricompare
- Lezione tecnica: i tab radix non commutano con click sintetico .click() ma solo con click reali Playwright (find text ... click)
- Suite: 257 test / 783 asserzioni, audit 223/223 (+9 check I79); docs allineati (03 §5.18, 04 §3+§8, 07 §5.12, README)
- Restano da fare in docs/07: I82 (generalizzazione multi-modello); fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56

---
Task ID: 31
Agent: Super Z (main)
Task: I82 — Generalizzazione multi-modello («procedi con il prossimo step previsto dal piano, poi commit e push») + ripristino schema Prisma

Work Log:
- Prossimo step dal piano: I82, ULTIMA voce ⬜ di docs/07 (I79 chiusa da Task 30). Docs-first: docs/03 §5.19 con la decisione di progetto chiave — CONTRATTO DELLE ANALISI INVARIATO (`HistoryPoint[]`), pivot parametrico a monte: chi costruisce lo storico decide il modello, zero righe toccate nelle funzioni di analisi (detectCycles, heatmap, trend, EWMA…) e nei loro test
- SCOPERTA ALL'APERTURA (pre-requisito): prisma/schema.prisma commesso con attributi corrotti in DownsampledPoint (`@@unique(ourStart, source])`, campo inesistente) E modello ModelUsagePoint (I42) assente sia da schema sia dal DB (perito col rollback: la lib raw SQL sopravviveva orfana). Diagnosi a strati per il fenomeno workspace noto: la vista bash mostrava corruzione, Read/prisma validate il file valido — regola operativa Task 30 applicata (fidarsi della toolchain autorevole); l'unica lacuna reale confermata da ENTRAMBI i livelli: ModelUsagePoint mancante. Cure: modello ri-aggiunto allo schema (colonne identiche alla lib, @@unique model+win+t) + db push (tabella creata, client rigenerato) + dev server riavviato (lezione client Prisma stantio)
- Implementazione: (1) src/lib/model-history.ts NUOVO puro — ModelHistoryPoint {t, model, interval, weekly} nullable, localStorage mm-dash-modelhistory-v1 FIFO 2.000, appendModelPoints (dedup 20s PER-MODELLO, semantica pushHistory: delta <20s sostituisce), historyForModel (forward-fill ?? prev ?? 100), modelNamesOsservati (general primo), mergeModelHistories (locale vince su model|t), modelRowsToPoints (long→wide), fetch/push/clear client fire-and-forget; (2) route /api/history/models GET/POST/DELETE sulla lib I42 server-model-history.ts — formato LONG (una riga per finestra non null), upsert+pruning 90g/10k, nessun contatto MiniMax (check audit di ASSENZA endpoint); (3) page.tsx — stato selectedModel (default general) + modelHistoryRef, init con fetch/merge server, ingestione per-modello DENTRO pushHistory (unico punto per demo/api/import), backfill demo makeDemoModelHistory (rigenera 40 snapshot passati con makeDemoSnapshot(t) — curve coerenti coi tick dal vivo), pivotHistory/pivotModel/modelli osservati (storico ∪ snapshot), selectedWindow dal PIVOT (verdetto coerente col grafico mostrato), selettore chips accanto a Intervallo (nascosto con un solo modello), Diagnostica DELIBERATAMENTE su general completo (salute del monitor), identità tab/banner/eventi su general; (4) etichette parametriche — windowShortLabel in quota-cards (durata osservata: «5 ore»/«24 ore»/durata formattata) → prop intervalLabel (default «5 ore», comportamento pre-I82 invariato) su HistoryChart (tab), StatsPanel→ProjectionVerdict/PacePanel, RateChart, LongTermAnalysis→TodayComparison/CalendarSection/DistributionSection/HeatmapSection; (5) LongTermAnalysis con pivot non-general scarica lo storico PER-MODELLO dal server (lo storico flat /api/history è di general: fonderlo falserebbe le analisi) e DROPPA i punti remoti al cambio pivot (merge per timestamp non distingue i modelli)
- Test: tests/lib/model-history.test.ts 15 test (append multi-modello, salto modelli senza finestre, dedup 20s incl. bordo esatto, FIFO, forward-fill, primo punto→100, modelli osservati, merge locale-vince, long→wide con righe orfane); fix in itinere: bug di bordo nella finestra di dedup (>= invece di <, la semantica pushHistory è delta <20s) + refuso nel test (19*S=380s invece di 19s)
- Protocollo di validazione fisso: bunx tsc --noEmit = 0 errori su src/+tests/ (4 baseline esterne examples/skills) · bun run lint EXIT=0 · bun test 272/272 (811 asserzioni, era 257/783: +15 model-history) · audit 237/237 PASS 0 scoperte (era 223, +14 check I82 inclusa assenza MiniMax nella route)
- Verifica curl della route: POST 2 modelli → stored 2; POST ripetuto stesso (model,t) → total INVARIATO (dedup upsert); GET filtri ?model=/?win= corretti; DELETE ?model=video → ok; POST array vuoto → 400 bad_request; BONUS: pruning 90g visto IN OPERA (le righe di test a t=2025 eliminate immediatamente dal prune) e un poller demo live già alimenta la nuova route end-to-end
- Verifica browser reale (rotte /api/history+/api/events+/api/history/models bloccate): selettore Modello con chips general+video, default general; click video (radio radix, NON button — lezione tab) → tab grafico «24 ore», RateChart «finestra 24 ore», Analisi «Cicli 24 ore», analisi su 48 rilevamenti video (backfill demo), ritorno general → «5 ore»; mobile 390 senza overflow con selettore visibile; compact senza selettore; tema chiaro chip attivo rgb(24,24,27) e label rgb(95,95,104) (--mm-muted I84); console senza errori; screenshot scripts/verify-i82-video-pivot.png, verify-i82-light-selector.png
- Documentazione: docs/03 (header + §5.19 completa con decisione, componenti, schema fix, limiti onesti); docs/04 §3 (I82 → ✅) + §8 changelog; docs/07 (§5.15 ✅ con nota, stato «15 di 15: analisi chiusa», priorità 4 chiusa); README (bullet analisi multi-modello, suite 272, audit 237); questo worklog
- Chiusura: commit codice+docs (schema incluso) e commit DB separato (lezione I30; tabella ModelUsagePoint creata + punti demo del poller), push origin main

Stage Summary:
- I82 COMPLETATA — docs/07 ora 15 DI 15: l'analisi dei miglioramenti è CHIUSA; le analisi di cicli/storico funzionano per OGNI modello del piano con il contratto HistoryPoint[] invariato (pivot parametrico a monte)
- Scoperta più importante (schema): ModelUsagePoint (I42) era perito col rollback lasciando la lib orfana, e DownsampledPoint portava una corruzione latente `@@unique(ourStart,…)` che avrebbe rotto QUALUNQUE db push futuro — entrambe riparate; lezione: dopo un rollback verificare schema e tabelle del DB contro le librerie sopravvissute
- Lezione tecnica: i ToggleGroupItem radix single espongono role="radio" (non button) — i click sintetici vanno mirati per role radio; le righe di test più vecchie di 90 giorni spariscano per pruning: usare timestamp recenti nei test delle route con pruning
- Suite: 272 test / 811 asserzioni, audit 237/237 (+14 check I82); docs allineati (03 §5.19, 04 §3+§8, 07 §5.15, README)
- Restano fuori docs/07: V4 fresca con chiave reale, campagna campionatore I49+V8+I56 (richiedono la chiave API dell'utente)
