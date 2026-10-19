# 02 — Analisi completa della risposta JSON di quota

> **Scopo**: documento di riferimento per lo schema della risposta di
> `/v1/token_plan/remains`, le unità di misura (verificate matematicamente), la
> semantica dei campi (inclusa la trappola dei `*_usage_count`) e le conversioni
> orario **Europe/Rome**. Se devi toccare il parser (`src/lib/minimax.ts`) o la
> logica temporale (`src/lib/time.ts`), parti da qui.
>
> Ultimo aggiornamento: 2026-10-02.

---

## 1. La risposta reale analizzata

JSON fornito dall'utente (query dell'endpoint con Subscription Key, regione Europa).
`base_resp` ricostruito nella forma tipica (`status_msg: "success"`) — i campi
analizzati sono quelli originali, intatti.

```json
{
  "model_remains": [
    {
      "start_time": 1790935200000,
      "end_time": 1790953200000,
      "remains_time": 13321286,
      "current_interval_total_count": 0,
      "current_interval_usage_count": 0,
      "model_name": "general",
      "current_weekly_total_count": 0,
      "current_weekly_usage_count": 0,
      "weekly_start_time": 1790553600000,
      "weekly_end_time": 1791158400000,
      "weekly_remains_time": 218521286,
      "current_interval_status": 1,
      "current_interval_remaining_percent": 100,
      "current_weekly_status": 1,
      "current_weekly_remaining_percent": 64
    },
    {
      "start_time": 1790899200000,
      "end_time": 1790985600000,
      "remains_time": 45721286,
      "current_interval_total_count": 0,
      "current_interval_usage_count": 0,
      "model_name": "video",
      "current_weekly_total_count": 0,
      "current_weekly_usage_count": 0,
      "weekly_start_time": 1790553600000,
      "weekly_end_time": 1791158400000,
      "weekly_remains_time": 218521286,
      "current_interval_status": 3,
      "current_interval_remaining_percent": 100,
      "current_weekly_status": 3,
      "current_weekly_remaining_percent": 100
    }
  ],
  "base_resp": { "status_code": 0, "status_msg": "success" }
}
```

---

## 2. Schema dei campi (per ogni voce di `model_remains`)

| Campo | Tipo | Unità | Significato | Affidabilità |
|-------|------|-------|-------------|--------------|
| `model_name` | string | — | Categoria d'uso del modello: `general` (testo/immagini/audio), `video` | ✅ |
| `start_time` | epoch | **ms** | Inizio della finestra breve (5h per general, 24h per video) | ✅ |
| `end_time` | epoch | **ms** | Fine della finestra breve = **momento del reset** | ✅ |
| `remains_time` | durata | **ms** | Countdown residuo della finestra breve (= `end_time − t_query`) | ✅ (verifica §4) |
| `current_interval_total_count` | int | conteggi | Quota totale della finestra breve. `0` = **non dichiarata** (piano tracciato a percentuali) | ⚠️ inaffidabile |
| `current_interval_usage_count` | int | conteggi | **TRAPPOLA**: quando popolato indica quota *RESIDUA*, non consumata (issue #99). Qui `0` = non popolato | ⚠️ inaffidabile |
| `current_interval_status` | int | — | Stato finestra breve: `1` attiva/in uso, `3` inattiva/mai usata, `2` esaurita (ipotesi) | 🔶 |
| `current_interval_remaining_percent` | 0–100 | % | **Percentuale rimanente finestra breve — fonte della verità** | ✅ |
| `current_weekly_total_count` | int | conteggi | Come `total_count`, per la finestra settimanale | ⚠️ inaffidabile |
| `current_weekly_usage_count` | int | conteggi | Come `usage_count`, per la finestra settimanale | ⚠️ inaffidabile |
| `current_weekly_status` | int | — | Stato finestra settimanale (stessa codifica) | 🔶 |
| `current_weekly_remaining_percent` | 0–100 | % | **Percentuale rimanente settimanale — fonte della verità** | ✅ |
| `weekly_start_time` | epoch | **ms** | Inizio finestra settimanale (condivisa tra i modelli) | ✅ |
| `weekly_end_time` | epoch | **ms** | Fine finestra settimanale = reset settimanale | ✅ |
| `weekly_remains_time` | durata | **ms** | Countdown residuo settimanale | ✅ (verifica §4) |

Alla radice della risposta possono comparire anche: `current_subscribe_title` /
`plan_name` (titolo piano) e `points_balance` / `credits_balance` (saldo crediti) —
alias gestiti dal parser.

---

## 3. Semantica critica: percentuali vs conteggi

**Il contraddittorio che ha richiesto la ricerca**: nel JSON reale il modello
`general` ha `current_weekly_remaining_percent: 64` (quindi **36% consumato**) ma
`current_weekly_usage_count: 0`. Se i conteggi fossero attendibili dovrebbero
riflettere il consumo: non lo fanno.

Confronto con l'issue **#99** (risposta ufficiale del team MiniMax): lì i conteggi
erano popolati e **`usage_count` rappresentava la quota RESIDUA**, tanto che il calcolo
corretto era `consumato = total_count − usage_count`.

Sintesi operativa (implementata nel dashboard):

1. **Le percentuali sono l'unica fonte affidabile** nei piani tracciati a percentuale
   (piani attuali). Consumato = `100 − remaining_percent`.
2. I conteggi valgono `0` → **non significativi**: il dashboard li mostra solo con la
   dicitura "non dichiarati" e la nota esplicativa (componente `CountsRow`).
3. Se in futuro l'endpoint dovesse restituire conteggi > 0 (piani a conteggi), la
   lettura corretta è `usage_count = residuo` → `consumato = total − usage`
   (l'implementazione mostra sempre entrambi i valori con l'etichetta giusta).

---

## 4. Verifiche matematiche (triangolazione completa)

Tutti i calcoli seguenti sono stati verificati a mano sui valori del JSON reale.

### 4.1 Durata delle finestre

```
general:  end − start = 1.790.953.200.000 − 1.790.935.200.000 =  18.000.000 ms =  5 ore ✅
video:    end − start = 1.790.985.600.000 − 1.790.899.200.000 =  86.400.000 ms = 24 ore ✅
weekly:   end − start = 1.791.158.400.000 − 1.790.553.600.000 = 604.800.000 ms =  7 giorni ✅
```

### 4.2 L'unità di `remains_time` è il millisecondo

Deriviamo il **momento della query** in tre modi indipendenti: `t_query = end − remains_time`.

```
da general:  1.790.953.200.000 −   13.321.286 = 1.790.939.878.714
da video:    1.790.985.600.000 −   45.721.286 = 1.790.939.878.714   ← identico ✅
da weekly:   1.791.158.400.000 −  218.521.286 = 1.790.939.878.714   ← identico ✅
```

Tre campi diversi, tre finestre diverse, **lo stesso istante**: `remains_time` e
`weekly_remains_time` sono durate in **millisecondi** e la query è avvenuta a
`1.790.939.878.714 ms`. Se fossero stati secondi, il valore derivato sarebbe
incoerente di ~1000× e le tre stime non coinciderebbero mai.

### 4.3 Countdown coerenti con le scadenze

```
general:  13.321.286 ms =  3h 42m 01s   → 17:00 − 13:17:58,7 =  3:42:01 ✅
video:    45.721.286 ms = 12h 42m 01s   → 02:00 (03/10) − 13:17:58,7 = 12:42:01 ✅
weekly:  218.521.286 ms =  2g 12h 42m 01s → 02:00 (05/10) − 13:17:58,7 = 60:42:01 ✅
```

### 4.4 Conclusione

- **Tutti i timestamp** della risposta sono epoch in **millisecondi**.
- **`remains_time` / `weekly_remains_time`** sono **durate in millisecondi**, calcolate
  dal server come `end_time − t_query`.
- Nel dashboard `remains_time` serve come **sincronizzazione** (deduzione dell'ora del
  server, `inferServerTime()`), mentre i countdown mostrati vengono **ricalcolati
  localmente** ogni secondo da `end_time` (così non derivano dallo skew dell'orologio
  locale rispetto a `fetchedAt`).

---

## 5. Conversioni Europe/Rome del JSON reale

Roma nel 2026: **CEST (UTC+2)** fino al 25/10, poi CET (UTC+1). Nelle date campione è
tutto CEST → UTC + 2 ore.

| Valore | Epoch (ms) | UTC | Europe/Rome | Nota |
|--------|-----------:|-----|-------------|------|
| weekly start | 1.790.553.600.000 | lun 28/09/2026 00:00 | **lun 28/09 02:00** | lunedì UTC |
| general start | 1.790.935.200.000 | ven 02/10/2026 10:00 | **ven 02/10 12:00** | rolling 5h |
| general end | 1.790.953.200.000 | ven 02/10/2026 15:00 | **ven 02/10 17:00** | reset 5h |
| video start | 1.790.899.200.000 | sab→ven 02/10/2026 00:00 | **ven 02/10 02:00** | mezzanotte UTC |
| video end | 1.790.985.600.000 | sab 03/10/2026 00:00 | **sab 03/10 02:00** | reset giornaliero |
| weekly end | 1.791.158.400.000 | lun 05/10/2026 00:00 | **lun 05/10 02:00** | reset settimanale |
| momento query | 1.790.939.878.714 | ven 02/10/2026 11:17:58,7 | **ven 02/10 13:17:58,7** | derivato (§4.2) |

Giorni della settimana verificati: 28/09/2026 = **lunedì**, 02/10/2026 = **venerdì**.

### Osservazioni di allineamento (importanti!)

1. **Weekly**: inizia **lunedì 00:00 UTC** (lunedì 02:00 a Roma in CEST, 01:00 in CET).
   ⚠️ L'ancoraggio è **UTC**: col cambio ora legale/solare l'orologio locale di Roma
   dell'reset cambia (02:00 ↔ 01:00). **Mai** usare offset fissi: solo
   `Intl.DateTimeFormat` con `timeZone: "Europe/Rome"` (già fatto in `src/lib/time.ts`).
2. **Video (interval 24h)**: allineato a **mezzanotte UTC** (02:00 a Roma in CEST).
   Coerente con l'ipotesi che tracci il tetto giornaliero di generazioni video
   (i piani recenti includono "N video al giorno") 🔶.
3. **General (5h)**: `start 10:00 UTC → end 15:00 UTC`. È una finestra **rolling**:
   secondo le docs ufficiali *"if your first use is at 10:00, that 5-hour window ends
   at 15:00"* — l'esempio della documentazione coincide esattamente col nostro campione.
   Lo start della finestra = momento del **primo utilizzo dopo la scadenza precedente**.

### Verdetto V8 (12/10, campagna campionatore I49/I56): il reset NON è «rolling» — sono BLOCCHI FISSI UTC

L'ipotesi «rolling ancorato al primo utilizzo» del punto 3 (naturale sulla scorta delle
docs e del campione del 02/10, dove start 10:00 UTC coincideva con l'esempio) è stata
**falsificata** dalla campagna V8 con chiave reale (campionatore passivo ADR-13-R2,
205 campioni su due ere — 122 del 09/10 recuperati su disco + 83 freschi del 12/10;
verdetto formale su artefatti commessi, `docs/04` §4):

1. **Gli start osservati giacciono SEMPRE sui confini di griglia con offset 0 ms**:
   blocchi 5h **ancorati alla mezzanotte UTC del giorno** (confini a 00:00, 05:00,
   10:00, 15:00, 20:00 UTC di ciascun giorno — NON multipli di 5h dall'epoca: 24h non è
   multiplo di 5h e i confini slitterebbero di giorno in giorno; le due ere su giorni
   diversi hanno discriminato la formula). Finestra video 24h: mezzanotte UTC esatta
   (`2026-10-12T00:00:00.000Z`, offset 0 ms). Settimanale: lunedì 00:00 UTC esatto
   (conferma del punto 1 sopra).
2. **Lo start è PRE-ARMATO, non riancorato all'uso**: il 09/10 il blocco delle 10:00 UTC
   si è attivato a 10:22:44 UTC (primo rilevamento col nuovo start, ~22 min dopo il
   confine — probabilmente al primo utilizzo reale dopo il confine) ma il suo
   `start_time` è `10:00:00.000Z` ESATTO, non 10:22:44: l'ancoraggio è il confine di
   griglia, mai l'istante d'uso. Nell'era fresca il video (mai usato, stato 3, 100%)
   mostra già `start_time = 2026-10-12T00:00:00.000Z`: la finestra è pre-armata al
   blocco corrente **senza alcun utilizzo**.
3. Conseguenze pratiche: il countdown al reset della finestra 5h converge sul confine
   di griglia (prevedibile a prescindere dall'uso); la finestra NON si «riparte» a ogni
   primo uso; il comportamento osservato resta coerente con l'esempio delle docs quando
   il primo uso coincide col confine (caso del 02/10) — da qui l'ambiguità risolta solo
   dall'osservazione a cavallo del confine.

Analizzatore riproducibile: `scripts/verifiche/analisi-reset-timezone.mjs` (esiti stabili
`esiti/v8-fuso-reset-latest.md`; procedura in `docs/05` §11). Risponde anche a V2 (rolling?
NO) e V3 (start dopo reset senza uso = start del nuovo blocco di griglia, pre-armata).

---

## 6. Lettura del campione reale (cosa stava succedendo)

- `general` era in una finestra 5h attiva (ven 12:00→17:00 Roma), aperta con il primo
  utilizzo; nel momento della query restava il 100% della finestra 5h (nessun consumo
  in quella finestra: i precedenti 36% settimanali erano stati consumati in finestre 5h
  precedenti), mentre il piano settimanale era al **64%**.
- `video` non era mai stato usato nel periodo: finestre con stato `3` ("inattiva · mai
  usata") e percentuali al 100%.
- Le finestre **settimanali** dei due modelli condividono esattamente `weekly_start_time`,
  `weekly_end_time`, `weekly_remains_time` → i **confini** della finestra settimanale
  sono condivisi; la **percentuale** è invece **per modello** (64 vs 100).

---

## 7. Formule derivate usate nel dashboard

| Metrica | Formula | Implementazione |
|---------|---------|-----------------|
| Consumo % di una finestra | `consumato = 100 − remaining_percent` (clamp 0–100) | `consumedPercent()` in `src/lib/minimax.ts` |
| Countdown al reset | `end_time − now` ricalcolato ogni secondo | `msUntil()` + tick 1s in `page.tsx`; fallback `remains_time` |
| Ora del server | `end_time − remains_time` (prima finestra valida) | `inferServerTime()` |
| Avanzamento finestra | `(now − start_time) / (end_time − start_time)` · 100 | `windowProgress()` |
| Prossimo reset breve | `end_time` corrente | mostrato con `formatDateTimeRome()` |
| Prossimo reset settimanale | `weekly_end_time` | idem |
| Apertura nuova finestra 5h | il nuovo start è **prevedibile**: blocco fisso pre-armato al confine di griglia UTC (verdetto V8 §5 — non rolling al primo utilizzo) | il dashboard mostra il countdown al reset; lo start del blocco successivo è il confine di griglia |

---

## 8. Cosa NON si può ricavare da questo endpoint

- **Token assoluti consumati**: l'endpoint non espone numeri di token né costi. Le
  strategie per ottenerli sono in `docs/01` §6 (`usage` delle chat completions,
  console, CLI `mmx quota`).
- **Quota totale del piano** in unità native (i `*_total_count` valgono 0).
- **Storico**: l'endpoint è un'istantanea → lo storico va costruito lato client
  (il progetto lo fa via `localStorage`, max 600 campioni).

## 9. Casi limite e comportamenti da tenere d'occhio

| Caso | Comportamento atteso | Stato |
|------|----------------------|-------|
| Finestra mai usata | `status: 3`, percent 100, finestra "virtuale" (video: 24h allineata UTC) | ✅ osservato |
| Finestra attiva | `status: 1`, percent < 100 se consumato | ✅ osservato |
| Quota esaurita | Presumibilmente `status: 2` e percent → 0 | ❓ da verificare (V1 in `docs/04`) |
| Subito dopo il reset senza nuovo uso | lo start della nuova finestra è il confine di griglia del NUOVO blocco, pre-armato anche senza alcun uso (video mai usato: start `00:00:00.000Z` esatto) | ✅ osservato (V3/V8, 12/10) |
| Risposta annidata sotto `data` / epoch in secondi / status testuali | Varianti di formato osservate nei progetti open-source | ✅ gestite dal parser |
| Chiave errata | `base_resp.status_code: 1004` | ✅ gestito (messaggio dedicato) |

## 10. I124 — Dall'endpoint all'analisi: cicli segmentati a finestre ufficiali

I campi di tempo documentati qui sopra non servono solo al countdown del
pannello: dal **I124** sono la base della segmentazione dei cicli
nell'«Analisi di lungo periodo» (`src/lib/cycles.ts`, `detectCyclesFinestre`).
Prima i cicli erano ricostruiti con un'euristica sullo storico (salto ≥ +15
punti verso ≥ 85 tra rilevamenti consecutivi): quando la quota NON viene
usata — progetto chiuso, piano senza traffico, campionamento fermo — la serie
non mostra mai salti verso l'alto e l'euristica non può vedere i reset
avvenuti. Il sintomo tipico (riportato dall'utente il 19/10/2026): un unico
«ciclo» di 2 giorni 1 ora che fondava 17/10 → 19/10, e righe finte generate
dai punti demo nel buffer locale del browser.

### 10.1 Le regole di segmentazione

| Finestra | Allineamento | Fonte della verità |
|----------|--------------|--------------------|
| `interval` del modello **general** | Blocchi fissi a ORARIO **UTC** {00,05,10,15,20} di OGNI giorno (semantica cron «ogni 5 ore»: l'ultimo blocco 20:00→mezzanotta dura 4h reali) | Verdetto V8 (205 campioni, `docs/05`, offset 0 ms) + conferme di produzione: confine 15:00 UTC del 19/10 (17% alle 16:59:28 Roma → 96% alle 17:04:29 Roma) e reset delle 20:00 UTC di VENERDÌ 16/10 (21:49→22:03 Roma) — la coppia refuta la griglia periodica `floor(t/5h)` ancorata all'epoca, che deriva di 4h al giorno e nei giorni non allineati (non ≡ 0 mod 5) sposta i confini (sul 16/10 avrebbe detto 21:00; sul 18/10 14:00 al posto di 15:00) |
| `weekly` (tutti i modelli) | Settimane da **lunedì 00:00 UTC** | Triangolazione `weekly_start_time`/`weekly_end_time` (§2) + conferma di produzione 18→19/10/2026: settimanale 46% domenica → 92% lunedì dopo il reset di lun 00:00 UTC (= 02:00 Roma in CEST) |
| `interval` degli **altri modelli** | Nessuno (euristica dei salti invariata) | La finestra breve varia per modello (5h general, 24h video allineata a mezzanotte UTC) senza una cadenza verificata per ciascuno: inventare un allineamento produrrebbe cicli sbagliati ma plausibili |

Conseguenze semantiche (tutte testate in `tests/lib/cycles-finestre.test.ts`
con i casi reali di produzione):

- **ogni finestra con almeno un rilevamento è un ciclo**: il confine è
  dedotto dalla cadenza, non osservato sui valori;
- **il ciclo si chiude al suo reset ufficiale anche senza campioni
  successivi**: le finestre proseguono il conteggio e i reset lato MiniMax a
  prescindere dal campionamento — la risposta alla domanda «se il progetto è
  chiuso e il database non riceve dati, le finestre di 5h proseguono
  ugualmente?» è SÌ, e ora la UI lo riflette (`Cycle.windowEndT`);
- **`ongoing` = finestra non ancora terminata**: con dati fermi oltre
  l'ultimo confine NESSUN ciclo risulta «in corso» (prima l'ultimo tratto
  restava «in corso» per giorni);
- **le finestre senza rilevamenti non producono cicli**: nessun consumo è
  osservabile e non vengono inventate righe vuote;
- **le metriche restano osservate** (primo → ultimo campione della finestra):
  con campionamento sparso durata e ritmo sono limiti inferiori onesti — la
  colonna «Reset finestra» della tabella mostra comunque il confine ufficiale.

### 10.2 Esclusione dei punti demo e pulizia dello storico locale

I tick demo replicati nello storico fuso locale+server generano falsi reset
(12/12 marker di produzione dimostrati falsi in task 69). Dal I124:

- ogni punto porta la marca `source` («api» | «demo» | «import») lungo tutta
  la catena: punto flat di page.tsx, campioni per-modello, backfill demo,
  punti server (`UsagePoint.source` esisteva già), righe LONG → wide;
- le analisi escludono i punti marcati demo (`senzaDemo`): pannello analisi,
  fasce/marker del grafico, report stampabile (fuori dalla modalità demo, dove
  la serie demo è volutamente conservata perché il report è lui stesso una
  dimostrazione);
- i punti **precedenti a I124 non hanno la marca** e non sono discriminabili
  a posteriori: la pulizia è delegata all'azione **«Svuota storico locale»**
  (Impostazioni → Dati), che rimuove le chiavi storage del browser da fonte
  unica (`src/lib/storage-chiavi.ts`) con conferma esplicita; i punti del
  server non sono toccati e vengono riscaricati e fusi al prossimo avvio.

### 10.3 Decisione: end_time NON persistito nello storico

L'`end_time` del JSON è già usato dal vivo (countdown, pace, verdetto di
proiezione), ma NON viene salvato su ogni punto storico (nessuna colonna
aggiuntiva su `UsagePoint`): la segmentazione usa l'allineamento statico ai
blocchi UTC, verificato empiricamente su 205 campioni (V8) e riconfermato sui
dati del 19/10. Il vantaggio: zero migrazioni di schema su Turso. Il limite
documentato: se MiniMax passasse alla semantica «rolling» descritta dalla FAQ
ufficiale (finestra ancorata al primo uso), l'allineamento andrebbe rivisto —
l'hedge robusto (persistire `end_time` per punto e usarlo come chiave di
finestra con fallback sul blocco statico) è rinviato a un item futuro, con
questa sezione come punto di partenza.
