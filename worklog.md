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
