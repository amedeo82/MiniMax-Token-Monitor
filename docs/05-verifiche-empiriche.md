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
| 2026-10-09 | Campagna completa con chiave reale (V4 · V5 · V6 · V8 con campionatore I49) | reale | ⚠️ **Verdetti prodotti ma esiti PERSI col secondo rollback dell'11/10**: V4 = IDENTICI · V5 non applicabile (M Plan senza conteggi, esito valido) · V6 nessun rate limit (48/48 @10s) · V8 «blocchi fissi UTC» con offset 0 ms (115 campioni, transizione delle 12:00 Roma osservata, start pre-armata non riancorata dall'uso). Unica evidenza superstite: il transcript chat (non citabile come artefatto formale) → campagne fresche necessarie per esiti su file (`docs/04` §4); V4 ha comunque sbloccato I18 via accettazione documentale | nessuno (perso) |
| 2026-10-11 | Verifica proxy I18 (curl, chiave finta) | finta | ✓ fallback NON innescato su errore di autenticazione: risposta `ok:true` con passthrough `status_code 1004` sul primario `token_plan` (messaggio «login fail…», coerente con l'evidenza del 02/10), nessun campo `fallback`; trigger validati nei test (156/156) e audit 126/126 | — |
| 2026-10-12 | Campagna V8 completa con chiave reale (V4 · V5 · V6 · V1 `--once` · V8 con campionatore I49 ri-cablato) | reale (recuperata: `scripts/verifiche/.chiave-sessione` del 05/10 superstite su disco, validata con V1 `--once`) | ✓ **V4 = IDENTICI su esiti freschi** (`v4-2026-10-12T12-56-18.*`) — conferma formale del verdetto del 09/10 · **V5 non applicabile** (M Plan senza conteggi, `v5-2026-10-12T12-56-24.*`) · **V6 nessun rate limit** (54/54 @10s, latenza med 292 ms, `v6-2026-10-12T13-19-29.*`) · **V8 «blocchi fissi UTC» con offset 0 ms** (analizzatore ri-creato `analisi-reset-timezone.mjs`, esiti `v8-fuso-reset-latest.md`): era 09/10 RECUPERATA su disco (122 campioni con transizione in medias res 10:22:44 UTC → start 10:00:00.000Z esatto) + era fresca 12/10 (83 campioni 12:50–14:05 UTC, 4 serie tutte allineate, video/interval start 00:00:00.000Z con status 3 = pre-armata senza uso) · V1 `--once` non conclusiva (stato 2 mai osservato, resta aperta per consumo fino a esaurimento) | `esiti/v4/v5/v6-2026-10-12*`, `esiti/v8-analisi-reset-2026-10-12*`, `campione-live.jsonl` |

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

**Nota sul campionatore passivo (I49, V8)**: la procedura completa è in **§11 (ri-creata il
12/10 dopo il secondo rollback)**. Il contratto vive nell'header della lib
`src/lib/campione.ts`; la campagna del 12/10 ha ri-cablato il campionatore con un blocco
marcato nel proxy e lo ha smontato a campagna chiusa (I56), committando
`scripts/verifiche/campione-live.jsonl` come prova grezza — con la scoperta che il file del
09/10 (122 campioni, creduto perso col rollback) era sopravvissuto su disco.

---

## 11. Campionatore passivo I49 (ADR-13-R2) — procedura di montaggio e smontaggio

> Sezione ri-creata il 12/10/2026 in occasione della campagna V8 eseguita (l'originale è
> persa col rollback dell'11/10); contenuto ricalcato sul contratto superstite nell'header
> di `src/lib/campione.ts` e sull'esperienza diretta della campagna.

**Scopo**: rispondere a V8 («il fuso di reset delle finestre») con payload REALI grezzi,
senza mai scrivere la chiave su disco. Il dashboard polla già ogni ~60 s: il campionamento
è a costo zero (nessuna chiamata extra, nessun consumo quota aggiuntivo).

**Montaggio** (per una nuova campagna):
1. ri-cablare il campionatore nel proxy con un BLOCCO MARCATO `CAMPAGNA V8` in
   `src/app/api/minimax/usage/route.ts`: import di `campionaRisposta` da `@/lib/campione`
   + chiamata `void campionaRisposta(data, region, endpoint)` dopo OGNI risposta OK del
   primario e del fallback I18 (fire-and-forget, mai eccezioni verso il proxy);
2. (opzionale, per le V1–V6 con chiave reale) ri-armare la cattura ADR-13 nello stesso
   blocco marcato: la chiave ricevuta dal browser viene scritta su
   `scripts/verifiche/.chiave-sessione` (0600, SOLO se il file manca — minimizzazione)
   ed eliminata a fine campagna;
3. l'audit I55 tollera il wiring SOLO se il blocco marcato è presente (check condizionale
   I86/I49: fuori campagna il campionatore DEVE essere dormiente);
4. il dev server ricarica la route al primo poll del browser: entro ~1–2 minuti la prima
   riga appare su `scripts/verifiche/campione-live.jsonl`.

**Disciplina del file** (`src/lib/campione.ts`, cap 12 MB):
- una riga JSONL per risposta VALIDA (`base_resp.status_code = 0`, `model_remains` non
  vuoto) con `{ts, region, endpoint, payload}` — MAI la chiave (non entra nemmeno nella
  firma della funzione: garanzia strutturale, testata in `tests/lib/campione.test.ts`);
- risposte in errore (es. 1004) e payload malformati NON campionati;
- a campagna aperta il file è una prova grezza: NON modificarlo, NON filtrarlo.

**Analisi** (V8): `node scripts/verifiche/analisi-reset-timezone.mjs [--da YYYY-MM-DD] [--a
YYYY-MM-DD]` — estrae gli start distinti per modello/finestra, li verifica contro le griglie
teoriche (blocchi 5h ancorati alla mezzanotte UTC del giorno — NON multipli di 5h
 dall'epoca: 24h non è multiplo di 5h e i confini slitterebbero di giorno in giorno; 24h
per la finestra giornaliera del video, mezzanotte UTC; lunedì 00:00 UTC per la
settimanale), rileva le transizioni e confronta il nuovo start col confine di griglia e
con l'istante d'uso. Esiti JSON+MD con copia stabile `esiti/v8-fuso-reset-latest.md`.

**Smontaggio** (I56, a campagna chiusa):
1. rimuovere l'INTERO blocco marcato da `route.ts` (import incluso) e i punti di chiamata;
2. eliminare `scripts/verifiche/.chiave-sessione` (se la cattura era stata ri-armata);
3. committare `scripts/verifiche/campione-live.jsonl` (prova grezza della campagna) e gli
   esiti dell'analizzatore;
4. l'audit torna a verificare il DORMIENTO del campionatore (check condizionale I86/I49);
5. aggiornare `docs/04` §4 (V8) e `docs/02` §5 con il verdetto, `docs/05` §10 con l'esito.

**Lezioni della campagna 12/10**:
- i file «persi col rollback» possono essere sopravvissuti su DISCO (come `campione.ts`
  nel Task 32): prima di ri-proporre una campagna, cercare i vecchi artefatti nel tree;
- la cattura ADR-13 «solo se il file manca» rende la cattura idempotente e immune da
  sovrascritture con chiavi finte (verificato in opera: chiamata proxy con chiave finta
  durante la campagna NON ha toccato il file); il file del 05/10 (perms 0755) è stato
  riportato a 0600 e il pattern è difeso anche da `.gitignore`;
- i processi lunghi in background muoiono tra i comandi della shell persistente (V6
  lanciato con `setsid` è morto senza esiti a metà run): le verifiche lunghe vanno
  eseguite in FOREGROUND (V6: 9 min @10s = 54 richieste, entro il timeout di 10 min);
- la griglia 5h è ancorata alla mezzanotte UTC del giorno, non all'epoca: la prima
  versione dell'analizzatore (multipli di 5h dall'epoca) falsava l'allineamento del 12/10
  mantenendo quello del 09/10 — le due ere su giorni diversi hanno DISCRIMINATO la
  formula giusta.
