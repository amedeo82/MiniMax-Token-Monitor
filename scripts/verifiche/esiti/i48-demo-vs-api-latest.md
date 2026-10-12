# I48 — Verifica «demo ↔ API ufficiale» (matrice campo per campo)

> Eseguita: 2026-10-12T12:28:27.427Z (Europe/Rome: 12/10/2026, 14:28:27)
> Metodo: confronto programmatico tra la risposta REALE dell'endpoint (riportata verbatim in `docs/02` §1, catturata il 02/10/2026 con Subscription Key) e lo snapshot demo di `src/lib/demo.ts` (`makeDemoSnapshot`), allo stato grezzo e normalizzato. Zero rete, zero chiavi.
> Definizione di fedeltà: STESSO schema + STESSE invarianti + semantica coerente con la storia simulata. I valori sono per costruzione simulati.

## Verdetto

**Demo fedele al 100% sullo schema e sulle invarianti osservate (29 campi: 23 fedeli, 6 differenze dichiarate, 0 falliti). Differenze SOLO nei valori simulati e nelle semplificazioni dichiarate (allineamento settimanale non simulato, marcatore «(demo)», campi radice opzionali sempre presenti); 1 incoerenza della simulazione trovata e corretta in itinere (stato settimanale del video, riga V8).**

## Matrice

| # | Campo | API reale (02/10/2026) | Demo | Esito | Nota |
|---|-------|------------------------|------|-------|------|
| R1 | base_resp.status_code | 0 (success) | 0 (success) | ✅ fedele | envelope identico; il raw mostrato in pagina in demo aggiunge SOLO il marcatore «success (demo)» (dichiarato) |
| R2 | base_resp.status_msg | «success» | «success» (in pagina «success (demo)») | ✅ fedele | marcatore di fonte voluto, documentato |
| R3 | model_remains[] (categorie) | general, video | general, video | ✅ fedele | stesse categorie d'uso nello stesso ordine |
| R4 | campi radice opzionali (current_subscribe_title, credits_balance) | assenti nel campione 02/10 (documentati in docs/02 §2, alias gestiti dal parser) | «M Plan · Explore (Demo)», 42.75 | 🔶 differenza dichiarata | la demo esercita SEMPRE anche i campi opzionali che il reale può omettere |
| G1 | general: model_name | general | general | ✅ fedele | identificatore identico |
| G2 | general: current_interval_remaining_percent | 100 (nessun consumo nella finestra osservata) | 38.8 (calo simulato: finestra in corso da 3,2h su 5h) | 🔶 differenza dichiarata | valori diversi per costruzione; semantica identica (0–100, fonte della verità) |
| G3 | general: durata finestra breve (end − start) | 18000000 ms = 5h | 18000000 ms = 5h | ✅ fedele | 18.000.000 ms su ENTRAMBE le sorgenti (docs/02 §4.1) |
| G4 | general: finestra breve: invariante remains | end − remains = 1790939878714 (dentro la finestra) | remains = end − now (esatto al ms) | ✅ fedele | remains_time ≡ fine finestra − istante di lettura, su ENTRAMBE le sorgenti (docs/02 §4.2) |
| G5 | general: current_interval_status | 1 → «Attiva · in uso» | 1 → «Attiva · in uso» | ✅ fedele | stesso codice, stessa normalizzazione (1 = attiva) |
| G6 | general: conteggi finestra breve | 0 / 0 (non dichiarati) | 0 / 0 (non dichiarati) | ✅ fedele | piano tracciato a percentuali: la UI mostra «non dichiarati» su entrambe |
| G7 | general: current_weekly_remaining_percent | 64 (36% consumato) | 77.3 (calo simulato su 2,7 giorni) | 🔶 differenza dichiarata | semantica identica: consumato = 100 − residuo |
| G8 | general: durata finestra settimanale | 604800000 ms = 7 giorni | 604800000 ms = 7 giorni | ✅ fedele | 604.800.000 ms su ENTRAMBE le sorgenti |
| G9 | general: allineamento settimanale | lunedì 00:00 UTC esatto (2026-09-28T00:00:00.000Z) | rolling (start = now − 2,7 giorni): ancoraggio NON simulato | 🔶 differenza dichiarata | semplificazione dichiarata: l'ancoraggio è una proprietà del SERVER (docs/02 §5); parser e UI non ne dipendono (la durata 7g determina la finestra) |
| G10 | general: finestra settimanale: invariante remains | end − remains = 1790939878714 (dentro la finestra) | remains = end − now (esatto al ms) | ✅ fedele | remains_time ≡ fine finestra − istante di lettura, su ENTRAMBE le sorgenti (docs/02 §4.2) |
| G11 | general: current_weekly_status | 1 → «Attiva · in uso» | 1 → «Attiva · in uso» | ✅ fedele | stesso codice (1 = attiva) |
| G12 | general: conteggi settimanali | 0 / 0 (non dichiarati) | 0 / 0 (non dichiarati) | ✅ fedele | come G6 |
| V1 | video: model_name | video | video | ✅ fedele | identificatore identico |
| V2 | video: finestra giornaliera, remaining_percent | 100 (mai usata nel periodo osservato) | 100 (mai usata OGGI nella simulazione) | ✅ fedele | 100% piatto + stato 3 su ENTRAMBE le sorgenti |
| V3 | video: durata finestra giornaliera | 86400000 ms = 24h | 86400000 ms = 24h | ✅ fedele | 86.400.000 ms su ENTRAMBE le sorgenti (il video non ha la 5h) |
| V4 | video: allineamento a mezzanotte UTC | start ≡ mezzanotte UTC (02:00 Roma CEST) | start ≡ mezzanotte UTC (per costruzione) | ✅ fedele | docs/02 §5 osservazione 2: tetto giornaliero video ancorato a UTC |
| V5 | video: finestra giornaliera: invariante remains | end − remains = 1790939878714 (dentro la finestra) | remains = end − now (esatto al ms) | ✅ fedele | remains_time ≡ fine finestra − istante di lettura, su ENTRAMBE le sorgenti (docs/02 §4.2) |
| V6 | video: current_interval_status | 3 → «Inattiva · mai usata» | 3 → «Inattiva · mai usata» | ✅ fedele | stesso codice (3 = inattiva/mai usata) |
| V7 | video: current_weekly_remaining_percent | 100 (mai usato nel periodo osservato) | 73.3 (uso settimanale simulato, consumo più elevato del general) | 🔶 differenza dichiarata | la demo racconta un video USATO nella settimana (per popolare le analisi per-modello I82) |
| V8 | video: current_weekly_status | 3 → «Inattiva · mai usata» (mai usato nel periodo reale) | 1 → «Attiva · in uso» (usato nel periodo simulato) | 🔶 differenza dichiarata | CORREZIONE DELLA VERIFICA (12/10): la demo aveva stato «3» CON consumo simulato — incoerente; ora «1», coerente col consumo. I due valori riflettono storie diverse, entrambe interne alla semantica dei codici |
| V9 | video: conteggi settimanali | 0 / 0 (non dichiarati) | 0 / 0 (non dichiarati) | ✅ fedele | come G6 |
| S1 | finestra settimanale condivisa tra i modelli | start/end/remains IDENTICI tra general e video | start/end/remains IDENTICI tra general e video | ✅ fedele | docs/02 §6: confini condivisi, percentuale per modello (64 vs 100 nel reale) |
| N1 | parser sulla risposta REALE | parseUsageResponse(JSON_REALE) → 2 modelli, stati «1», «3» | nessun errore di parsing | ✅ fedele | il parser legge il JSON reale senza eccezioni (stesso percorso del vivo) |
| N2 | parser sulla risposta DEMO | — | makeDemoSnapshot() → 2 modelli, source «demo», planTitle «M Plan · Explore (Demo)» | ✅ fedele | stessa struttura normalizzata di UsageSnapshot |
| N3 | consumato = 100 − residuo (consumedPercent) | reale: 36% | demo: 22.7% | ✅ fedele | stessa formula su entrambe le sorgenti (docs/02 §7) |

## Note

- Le righe «differenza dichiarata» sono differenze di VALORE attese e volute (la demo simula curve di consumo con jitter): non sono infedeltà di schema o semantica.
- Riga V8 registra una CORREZIONE applicata alla demo durante la verifica: `src/lib/demo.ts` dava al video lo stato settimanale «3» (mai usata) con percentuale < 100 — incoerente; ora «1» (in uso), coerente col consumo simulato.
- L'allineamento della finestra settimanale (lunedì 00:00 UTC, reale) NON è simulato dalla demo (rolling): semplificazione dichiarata, senza impatto su parser e UI (la durata 7g determina la finestra — docs/02 §5).
- Le invarianti verificate programmaticamente: durate finestre (5h/24h/7g), condivisione della finestra settimanale tra modelli, allineamento mezzanotte UTC della finestra video, `remains ≡ end − t` su entrambe le sorgenti, conteggi a 0 («non dichiarati»), codici di stato 1/3.
