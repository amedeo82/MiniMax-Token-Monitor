# 07 — Analisi miglioramenti aggiuntivi (proposte I68–I82)

> **Storia**: questo documento è stato creato il 09/10/2026 come analisi di 15 ulteriori
> miglioramenti (client-only e non) proposti dopo la chiusura dei batch abbellimenti
> (docs/06) e **perso col secondo rollback del workspace dell'11/10**. Ri-creato l'11/10
> nel recovery con gli stessi numeri e significati comunicati in chat (tracciamento in
> `docs/04` §3). Nessuna delle proposte era implementata al momento del rollback.
>
> Stato: **tutte ⬜** (proposte mai implementate, invariate dal rollback).

Contesto della proposta originale: dopo la chiusura dei batch 1–3 (I57–I67) l'analisi
aveva individuato 15 ulteriori miglioramenti in tre gruppi — analisi avanzata
(I68–I72), UX/UI (I73–I78) e robustezza/integrazione (I76/I79/I80/I81/I82) — con la
raccomandazione di un eventuale «batch 1 client-only» composto da I69 (selettore
intervallo), I77 (filtri eventi), I76 (error boundary + bug fix noto) e I73 (modalità
compatta).

---

## 5.1 I68 — Archivio con downsampling orario
Nuova tabella Prisma `DownsampledPoint` (min/max/media/ultimo per ora) per mantenere
grafici leggibili e leggeri quando lo storico server cresce oltre i 10.000 punti; la
grana fine resta disponibile per le analisi (I26+), il grafico principale userebbe la
grana oraria oltre una soglia di zoom.

## 5.2 I69 — Selettore intervallo temporale
Preset 6h/24h/3g/7g/30g/tutto con filtro client-side sullo storico, applicabile a
grafico, ritmo e analisi; riduce il rumore visivo quando i dati diventano densi.

## 5.3 I70 — Anomalie del ritmo
Z-score robusto (mediana + MAD) sulla serie `rateSeries` (I59) per evidenziare i
momenti in cui il consumo devia dal proprio regime normale; candidata estensione del
pannello Diagnostica.

## 5.4 I71 — Qualità del campionamento
Copertura attesa/osservata per giorno + elenco dei gap > 15 min: rende esplicita
quanto lo storico è «buono» prima di fidarsi delle analisi (complementare a V8).

## 5.5 I72 — Proiezione con regressione esponenzialmente pesata
Confronto A/B con il verdetto lineare di I23/I31: la media pesata esponenzialmente
reagirebbe più in fretta ai cambi di ritmo, al prezzo di più rumore; proposta con
esito affiancato (non sostitutivo) nel pannello pace.

## 5.6 I73 — Modalità compatta / widget
`?compact=1`: solo anelli principali + countdown + ritmo, per uso come widget/schermo
secondario; compatibile con la PWA installata (I52).

## 5.7 I74 — Navigazione inferiore su mobile
Bottom bar fissa <md come alternativa alla section-nav sticky (I66) su telefono.

## 5.8 I75 — Vista stampa / report settimanale
Blocco `print` dedicato + voce nel menu Esporta: sintesi settimanale stampabile
(verdetto, cicli, spreco, calendario).

## 5.9 I76 — Error boundary per sezione + skeleton (+ bug fix noto)
Error boundary React per ogni sezione con skeleton di fallback: un crash in un
pannello non deve buttare giù la pagina intera. **Evidenza empirica**: bug reale in
`event-log.tsx` (~203) dove `e.value != null` non copre `undefined` e un evento senza
`value` crasha il registro (e con esso tutta la pagina). **Il bug è ancora presente
nel codice ripristinato** — la proposta resta valida con evidenza da ri-produrre.

## 5.10 I77 — Filtri del registro eventi
Chips per `kind` (reset/warn/crit/error/info) + ricerca testuale + periodo, filtri
client-side sul registro già caricato.

## 5.11 I78 — Tema chiaro opzionale
`next-themes` è già tra le dipendenze ma inutilizzato: tema chiaro completo
(palette chiara coerente con i ring continui I65).

## 5.12 I79 — Audit di accessibilità sistematico
Contrasto misurato (WCAG AA), `aria-live` per aggiornamenti polling, focus visibili,
descrizioni `sr-only` per i grafici (heatmap, calendario, reset clock).

## 5.13 I80 — Endpoint read-only `/api/summary`
KPI aggregati dal DB per widget esterni (statusline, home assistant, ecc.):
`GET /api/summary` senza chiave, solo numeri aggregati — ADR-8 (read-only) intoccato.

## 5.14 I81 — Test di componente UI
`@testing-library/react` + jsdom, `tests/components/`: prima tornata su quota-ring,
event-log, section-nav (logica pura già coperta dalla suite lib).

## 5.15 I82 — Generalizzazione multi-modello
Parametrizzazione `model_name` in cicli/storico: oggi le analisi usano «general» come
pivot; la generalizzazione aprirebbe le analisi anche agli altri modelli del piano.

---

## Priorità suggerite (invariate dalla proposta originale)

1. **Batch 1 client-only** (basso rischio, alto valore percepito): I69 · I77 · I76 (con
   il fix del bug `e.value != null`) · I73.
2. **Batch 2 analisi**: I70 · I71 · I72.
3. **Batch 3 infrastruttura/integrazione**: I80 · I81 · I68.
4. **Backlog/qualità**: I74 · I75 · I78 · I79 · I82.
