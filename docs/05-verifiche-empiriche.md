# 05 — Runbook verifiche empiriche V1–V6

> **A cosa serve questo documento**: istruzioni operative complete per eseguire le
> verifiche empiriche definite in `docs/04` §4, con il toolkit dedicato
> `scripts/verifiche/verifica.mjs`. Ogni verifica è riproducibile, produce un esito
> archiviato su disco e aggiorna lo stato in `docs/04` §4.
>
> Creato: 2026-10-02 (Task 12) · Toolkit: Node ≥ 18, zero dipendenze.

---

## 1. Prerequisiti e sicurezza

**Prerequisiti**

- **Node ≥ 18** (fetch globale): verificato con `node --version`.
- **Subscription Key reale** del piano (Token Plan / M Plan): la stessa usata dalla
  dashboard (Console → Plan Details). Le verifiche V1–V3 e V6 **non consumano quota**
  (leggono solo `token_plan/remains`); V1 richiede però che tu stia *già* consumando
  quota con il tuo normale uso dell'API, mentre V2/V3 coprono lo scadere naturale di
  una finestra (fino a 5–6 ore di osservazione).
- Connettività verso `www.minimax.io` e `api.minimax.io` (verificata nel progetto).

**Sicurezza sulla chiave**

- Il toolkit **non scrive mai la chiave nei log**: negli esiti compare solo mascherata
  (primi/ultimi 4 caratteri + lunghezza).
- Preferisci la variabile d'ambiente al parametro `--chiave`: così la chiave non finisce
  nella history della shell né nell'elenco processi (`ps`):

  ```bash
  export MM_SUBSCRIPTION_KEY="la-tua-subscription-key"
  node scripts/verifiche/verifica.mjs v4
  ```

- Non incollare la chiave in chat o in ticket; se accade, rigenerala dalla console.

**Dove finiscono gli esiti**

Ogni comando salva in `scripts/verifiche/esiti/` due file con istante UTC nel nome:

- `<id>-<istante>.json` — esito completo (config, campioni, transizioni, verdetto);
- `<id>-<istante>.md` — versione leggibile con verdetto, note e tabelle.

Il **verdetto** è calcolato automaticamente; resta sempre la lettura umana finale
prima di aggiornare `docs/04` §4 (e, se la verifica cambia la semantica dei campi,
`docs/01`/`docs/02` come da protocollo).

**Per interrompere** una verifica lunga: `Ctrl+C` — il ciclo chiude in modo grazioso,
salva l'esito parziale e lo marca «interrotta dall'utente».

---

## 2. Autotest (nessuna chiave, nessuna rete)

```bash
node scripts/verifiche/verifica.mjs prova-parser
```

Normalizza un campione sintetico allineato al JSON reale del 02/10/2026 (finestre
12:00→17:00 Roma, video 24h su mezzanotte UTC, weekly lun→lun) e verifica che:

- percentuali, stati, start/end e remains vengano estratti correttamente;
- l'**ora server dedotta** (`end − remains`) coincida tra le finestre (13:17:59 CEST
  nel campione, triangolazione di `docs/02` §4);
- il diff strutturale di V4 rilevi le differenze tra due risposte.

Se questo autotest non passa, non procedere con le verifiche su campo.

---

## 3. V1 — il codice di stato `2` significa «esaurita»?

**Domanda** (`docs/01` §8.2): lo stato di finestra `2` non è mai stato osservato sul
JSON reale; l'ipotesi è «finestra esaurita», da confermare.

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v1 --intervallo 30 --durata 180
# snapshot singolo senza attese:
node scripts/verifiche/verifica.mjs v1 --once
```

**Procedura**

1. Avvia la verifica in un terminale (logga un riga per campione: percentuale e stato
   di ogni finestra di ogni modello).
2. **Consuma la finestra 5h con uso normale dell'API** (chat/coding via i tuoi tool)
   fino ad avvicinarti allo 0%: il momento utile è quando la UI della dashboard mostra
   residui sotto ~10%.
3. Lascia girare il polling anche dopo l'attraversamento dello 0% e oltre il reset.
4. Interrompi con `Ctrl+C` quando la finestra si è ripristinata (o lascia finire la
   durata).

**Cosa osserva il toolkit**: ogni occorrenza di stato `2` con il residuo percentuale
del momento. Verdetto automatico:

- `COERENTE` — stato `2` sempre osservato con residuo 0% → ipotesi rafforzata;
- `CONTRADDETTA` — stato `2` con residuo > 0% → rivedere la semantica;
- `NON CONCLUSIVA` — stato `2` mai apparso (serve esaurire la finestra).

**Dopo la verifica**: aggiorna `docs/04` §4 (V1) e, se confermata, la tabella stati di
`docs/01` §8.2 (da 🔶 a ✅) e il badge in `src/lib/minimax.ts` (`statusLabel`), che oggi
mostra «Esaurita (ipotesi)».

---

## 4. V2 — la finestra 5h è rolling dal primo utilizzo?

**Domanda**: le docs dicono che la finestra rolling parte col **primo utilizzo**;
verificarlo sul nostro piano confrontando `start_time` col primo consumo post-reset.

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v2 --intervallo 20 --durata 360
```

**Procedura**

1. Lancia la verifica in prossimità dello scadere della finestra 5h (il comando stampa
   i campioni; guarda `end` in TechInfo della dashboard per l'orario di reset).
2. **Dopo il reset, riprendi a lavorare normalmente** con l'API: il primo utilizzo è
   il dato chiave della verifica.
3. Il toolkit rileva il reset (cambio di `end_time`) e il primo calo di percentuale
   successivo, poi confronta il nuovo `start_time` con quel momento.

**Verdetto automatico**

- `COERENTE` — `start_time` coincide (entro intervallo di polling + 2 min) col primo
  calo osservato → rolling dal primo utilizzo confermato;
- `DA APPROFONDIRE` — `start_time` anticipa di molto il primo calo (uso avvenuto tra
  due campioni o semantica diversa): riesegui con `--intervallo` più fine (es. 10s);
- `PARZIALE` — reset senza uso successivo: equivale a V3, rilancia usando l'API.

**Nota**: il primo calo è un limite superiore del primo utilizzo (tra due campioni
potrebbero passare fino a `--intervallo` secondi). Con `--intervallo 10` la stima è
puntiforme a meno di 10 secondi.

---

## 5. V3 — `start_time` dopo un reset SENZA nuovo utilizzo

**Domanda**: dopo lo scadere della finestra, se non si usa l'API, `start_time` resta
il vecchio valore (finestra «non ancora armata») o diventa il vecchio `end_time`
(finestra «pre-armata»)? È la domanda aperta R11.

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v3 --intervallo 60 --durata 420
```

**Procedura**

1. Calcola quando scade la finestra 5h corrente (dashboard, TechInfo: «reset
   disponibile da HH:MM»).
2. Avvia la verifica **prima** dello scadere, con `--durata` sufficiente a coprire il
   reset più almeno 30 minuti successivi.
3. **Non usare l'API MiniMax per tutto il periodo** (nessun modello invocato da nessun
   tool); il dashboard può restare aperto: è in sola lettura.
4. Il toolkit segnala il reset e classifica automaticamente il comportamento:
   - `RISPOSTA A` — `start_time` INVARIATO → coerente col rolling «al primo utilizzo»;
   - `RISPOSTA B` — `start_time` = vecchio `end_time` → finestra pre-armata al reset;
   - `COMPORTAMENTO INATTESO` — altro: riporta i valori grezzi dall'esito `.json`.
5. Se per errore consumi quota durante la finestra, il toolkit lo rileva (calo %) e
   lo segnala nelle note: in quel caso rilanciala.

**Impatto sul dashboard**: la risposta determina come interpretare «reset disponibile
da HH:MM» (apertura di progettazione in `docs/04` §7) e se il countdown post-reset è
«finestra armata ma non usata» o «vuota in attesa».

---

## 6. V4 — `coding_plan/remains` è equivalente a `token_plan/remains`?

**Domanda**: l'endpoint alternativo (issue #88, usato da CodexBar e dsh) restituisce
la stessa struttura e gli stessi dati? **L'esito decide I18** (fallback automatico in
`docs/03` §11 punto 2).

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v4            # regione eu
node scripts/verifiche/verifica.mjs v4 --regione cn   # se hai una chiave CN
```

**Procedura**: nessuna preparazione; il comando fa due chiamate sequenziali con la
stessa chiave, normalizza entrambe le risposte e confronta modelli, finestre e campi
(`pct`, `status`, `start`, `end`, `usage`, `total`). Entrambe le risposte grezze sono
salvate nell'esito `.json` per ispezione.

**Verdetto automatico**

- `IDENTICI` — stessa struttura e stessi valori → I18 fattibile in modo trasparente;
- `EQUIVALENTI CON DIFFERENZE` — entrambi OK ma campi diversi: valuta se le differenze
  sono solo temporali (consumo tra le due chiamate) o strutturali;
- `ASIMMETRICI` — la chiave è accettata da un solo endpoint;
- `NON VERIFICABILE` — errori di autenticazione/JSON (chiave sbagliata o endpoint cambiato).

**Evidenza parziale già raccolta (2026-10-02, chiave NON valida — esito
`scripts/verifiche/esiti/v4-*.json`)**: entrambi gli endpoint sono raggiungibili e
rispondono `HTTP 200` con `base_resp.status_code = 1004`, ma con **messaggi diversi**:
`token_plan` → «login fail: Please carry the API secret key…», `coding_plan` → «cookie
is missing, log in again». I due servizi gestiscono l'autenticazione in modo distinto:
la compatibilità dei **dati** resta da confermare con chiave reale.

**Se V4 esce `IDENTICI`** → implementare I18 (fallback su `coding_plan/remains` quando
`token_plan/remains` fallisse); se `ASIMMETRICI` o strutturalmente diversi → documentare
in `docs/01` §4 e ridefinire I18.

> **Stato (11/10/2026)**: il verdetto del 09/10 con chiave reale fu **IDENTICI**, ma gli
> esiti sono **persi col secondo rollback dell'11/10** (unica evidenza superstite: transcript
> chat). Su autorizzazione utente («procedi con I18») vale l'**accettazione documentale** di
> quel verdetto: I18 è stato implementato e validato sui percorsi testabili senza chiave
> (`docs/04` riga I18, test 156/156, audit 126/126). Una **V4 fresca con chiave reale resta
> raccomandata** per riportare l'esito su artefatti formali: un esito diverso da IDENTICI
> porterebbe a ridefinire I18.

---

## 7. V5 — i conteggi si popolano su alcuni piani?

**Domanda**: sui piani «legacy a conteggi» (Token Plan originari) i campi
`*_usage_count` / `*_total_count` sono popolati: che semantica hanno? (Issue #99:
`usage_count` = **residuo**; ADR-1: le percentuali sono la metrica primaria.)

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v5
```

**Procedura**: snapshot singolo; per ogni finestra confronta `usage/total` con la
percentuale dichiarata. Con tolleranza 1 punto percentuale:

- `usage/total ≈ pct` → `usage_count` = **residuo** (coerente con issue #99);
- `100 − usage/total ≈ pct` → `usage_count` = **consumo** (contraddice #99);
- altrimenti → semantica non chiara (riporta i valori in `docs/02` §3).

**Nota importante**: con i piani M Plan attuali i conteggi valgono 0 e la verifica
esce `NON APPLICABILE A QUESTA CHIAVE` — è un esito valido, non un errore: serve una
chiave di un piano legacy a conteggi per la prova piena. Se ne hai una, esegui anche
un confronto in due momenti diversi (prima e dopo consumo) e allega entrambi gli esiti.

---

## 8. V6 — c'è rate limit sul polling della quota?

**Domanda**: il polling aggressivo della quota (dashboard con refresh 10–60s) rischia
throttling (429 o degrado a 1004)?

```bash
export MM_SUBSCRIPTION_KEY="…"
node scripts/verifiche/verifica.mjs v6 --intervallo 10 --durata 10
# profilo più aggressivo (solo se la prima non evidenzia problemi):
node scripts/verifiche/verifica.mjs v6 --intervallo 5 --durata 10
```

**Procedura**: lascia girare i 10 minuti (60 richieste a 10s); il dashboard può restare
aperto ma evita di cambiare il refresh durante la prova. Il toolkit registra per ogni
campione HTTP status, `base_resp.status_code` e latenza, e calcola:

- distribuzione degli stati HTTP e dei `status_code` applicativi;
- latenze min/media/p95/max;
- verdetto: `NESSUN RATE LIMIT OSSERVATO` / `RATE LIMIT HTTP RILEVATO` (presenza di
  429) / `SOSPETTO THROTTLE APPLICATO` (OK iniziali poi 1004) / `EVIDENZA PARZIALE`
  (chiave non valida: nessun 429, ma comportamento da confermare con chiave reale).

**Evidenza parziale già raccolta (2026-10-02, chiave NON valida)**: esito in
`scripts/verifiche/esiti/v6-*.json` — vedi §10.

**Impatto sul dashboard**: se emerge throttle, aggiungere backoff esponenziale al
polling e nel proxy (`/api/minimax/usage`); in caso contrario il refresh minimo attuale
resta sicuro.

---

## 9. Piano consigliato di esecuzione (una giornata)

| Ordine | Verifica | Quando | Durata effettiva | Vincoli |
|--------|----------|--------|------------------|---------|
| 1 | V4 | subito | ~5 s | nessuno |
| 2 | V5 | subito | ~2 s | utile solo con chiave legacy a conteggi |
| 3 | V6 | subito | 10 min | nessuno |
| 4 | V3 | alla scadenza della finestra 5h | 1–7 h | **non usare l'API** durante |
| 5 | V2 | alla scadenza successiva | 1–6 h | usare l'API subito dopo il reset |
| 6 | V1 | quando la finestra è quasi a 0% | 1–3 h | consumare fino a esaurimento |

V1 e V2 possono essere unite in una sola sessione: consuma fino a esaurimento (V1),
attraversa il reset e riprendi l'uso (V2) con due terminali in parallelo. Gli esiti
vanno poi riportati in `docs/04` §4 (stato della verifica), `docs/01` (semantica API) e
`docs/02` (interpretazione campi) secondo il protocollo in `docs/04`.

## 10. Registro delle esecuzioni

| Data | Verifica | Chiave | Esito | File |
|------|----------|--------|-------|------|
| 2026-10-02 | prova-parser | — (offline) | ✓ normalizzazione, triangolazione e diff corretti | — |
| 2026-10-02 | V4 | non valida | Parziale: entrambi gli endpoint HTTP 200 + 1004 con messaggi diversi («login fail…» vs «cookie is missing…») | `esiti/v4-2026-10-02T17-57-24.json` |
| 2026-10-02 | V1 `--once` | non valida | Parziale: percorso errore OK (`HTTP 200`, `status_code 1004`) | `esiti/v1-2026-10-02T17-58-16.json` |
| 2026-10-02 | V5 | non valida | Parziale: percorso errore OK | `esiti/v5-2026-10-02T17-57-31.json` |
| 2026-10-02 | V6 | non valida | Parziale: **54 richieste in 9 min @10s** (ridotta da 10 min per vincolo di sessione), tutte `HTTP 200` + `1004`, **zero 429**, zero errori di trasporto, latenza 503/588/1076/1202 ms (min/med/p95/max) → nessuna limitazione HTTP osservabile senza chiave; da confermare con chiave reale | `esiti/v6-2026-10-02T18-12-43.json` |
| 2026-10-04 | Catena automatica (Task 7) | reale (via ADR-13) | ⚠️ **Setup + avvio**: cattura temporanea della chiave nel proxy (`ADR-13`, `docs/04` §5) + watcher `watcher-quick.sh` collaudato con chiave finta; il browser dell'anteprima ha fornito la chiave reale e la campagna è partita (rapide V4/V5/V1 `--once`/V6 + lunghe V1/V2) | nessuno (log di sessione perduto, vedi sotto) |
| 2026-10-04→05 | V1/V2 lunghe + controprova V2 sul confine delle 17:00 | reale | ⚠️ **IN CORSO AL MOMENTO DELLA PERDITA**: il riavvio del workspace del 06/10 (04:53 UTC) ha terminato i processi e cancellato log, file chiave ed esiti prima della scrittura su `esiti/`; nessun verdetto recuperabile dagli artefatti → le verifiche tornano «da rieseguire» (§9) | nessuno (perduto col riavvio) |
| 2026-10-06 | Chiusura amministrativa (I30) | — | Meccanismo di cattura RIMOSSO dal proxy (ritiro ADR-13, proxy ritestato 200 e senza scritture); DB controllato (351 punti: 126 api 02/10 + 225 demo, integro); toolkit e watcher restano pronti per una nuova campagna | — |
| 2026-10-11 | Verifica proxy I18 (curl, chiave finta) | finta | ✓ fallback NON innescato su errore di autenticazione: risposta `ok:true` con passthrough `status_code 1004` sul primario `token_plan` (messaggio «login fail…», coerente con l'evidenza del 02/10), nessun campo `fallback`; trigger validati nei test (156/156) e audit 126/126 | — |

> Le righe «non valida» servono a validare il toolkit e a raccogliere indizi; il
> **verdetto definitivo** di ogni verifica richiede la Subscription Key reale (§9).
> Aggiorna questa tabella a ogni esecuzione reale.

**Nota sulla campagna del 04–05/10 (ADR-13, ora ritirato)**: poiché l'utente non può
usare il terminale, la campagna è stata eseguita con una catena di delega — cattura
temporanea della chiave nel proxy (`scripts/verifiche/.chiave-sessione`, 0600) +
watcher `watcher-quick.sh` che eseguiva il toolkit appena la chiave arrivava dal
browser dell'anteprima. Il meccanismo è stato **rimosso** a campagna conclusa
(ritiro ADR-13, `docs/04` §5). Per una nuova campagna delegata: (1) ri-inserire il
blocco di cattura marcato in `api/minimax/usage/route.ts` (descritto in `worklog.md`,
Task 7); (2) riavviare `scripts/verifiche/watcher-quick.sh` con `setsid nohup`;
(3) chiedere all'utente di disattivare la demo nell'anteprima; (4) a fine campagna,
rimuovere di nuovo il blocco ed eliminare il file chiave. La lezione appresa del
06/10: far scrivere gli esiti **incrementalmente** (il toolkit li scrive a fine run:
un riavvio a metà campagna li perde) e lanciare le verifiche lunghe in più spezzoni
con `--durata` breve.
