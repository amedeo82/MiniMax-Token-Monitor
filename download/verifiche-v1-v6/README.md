# Toolkit verifiche V1–V6 — MiniMax Token Plan

Toolkit standalone (Node ≥ 18, zero dipendenze) per eseguire le verifiche empiriche
V1–V6 sul piano MiniMax. Documentazione completa: **`docs/05-verifiche-empiriche.md`**
nel progetto (runbook con procedura, verdetto e piano di esecuzione).

## Avvio rapido

```bash
export MM_SUBSCRIPTION_KEY="la-tua-subscription-key"   # mai come parametro nei log condivisi
node verifica.mjs prova-parser        # autotest offline (nessuna chiave, nessuna rete)
node verifica.mjs v4                  # diff token_plan vs coding_plan (~5 s)
node verifica.mjs v5                  # conteggi vs percentuali (~2 s)
node verifica.mjs v6                  # rate limit: polling 10s × 10 min
node verifica.mjs v3 --durata 420     # reset SENZA uso dell'API (lanciare prima dello scadere)
node verifica.mjs v2 --durata 360     # rolling dal primo utilizzo (usare l'API dopo il reset)
node verifica.mjs v1 --intervallo 30  # stati finestra mentre consumi fino a esaurimento
node verifica.mjs aiuto               # aiuto completo
```

## Note

- Gli esiti vengono scritti in `esiti/` accanto allo script (JSON completo + MD leggibile).
- La chiave non viene mai scritta nei log (solo mascherata: primi/ultimi 4 caratteri).
- Le verifiche **non consumano quota** (solo lettura di `token_plan/remains`);
  V1/V2 richiedono però che tu stia usando/consumando la finestra 5h normalmente.
- Ordine consigliato e vincoli temporali: vedi `docs/05` §9 (piano in una giornata).
- Aggiorna `docs/04` §4 e `docs/05` §10 con l'esito di ogni verifica reale.
