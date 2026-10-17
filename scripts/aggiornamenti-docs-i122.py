#!/usr/bin/env python3
"""Aggiornamenti documentali I122 (docs/04, docs/10, README) — inserimenti
in tabelle con righe lunghe via script (lezione I118: mai edit per prefisso)."""
from pathlib import Path

BASE = Path("/home/z/my-project")

RIGA_I122_S3 = (
    "| I122 | Azione di manutenzione «rimuovi-demo»: cancellazione selettiva dei punti demo "
    "dall'archivio (falsi reset nelle analisi) | Manutenzione | ✅ | Eseguita 17/10 a seguito della "
    "verifica sulla gestione dei reset (richiesta utente: «ogni deploy inserisce una marcatura di reset "
    "della quota — come viene determinato?»). **La scoperta** (dati di produzione via GET /api/history "
    "pubblica, 108 punti 16–17/10): 74 punti api + 34 punti demo MISTI nella stessa serie — i burst demo "
    "partono 1–2 minuti dopo OGNI deploy (I110/I113/I114/I117/I118/I119: contesti browser senza "
    "impostazioni salvate che aprono il sito post-deploy → demoMode di default → replica server BY DESIGN "
    "della source demo) e ogni transizione demo→api (≈38% → ≈94–100%) supera entrambe le soglie dei "
    "rilevatori (RESET_JUMP 15 / RESET_TARGET 85 del grafico; 25/90 degli eventi): **12 marker su 12 falsi "
    "reset**, con l'unico reset vero (16/10 22:00, blocco 20:00 UTC — coerente col verdetto V8) "
    "invicinato nello stesso marker. **Soluzione** (la «svuota» totale è troppo): nuova azione "
    "POST /api/manutenzione `{\"azione\":\"rimuovi-demo\"}` — DELETE selettivo `source=\"demo\"` con "
    "BACKUP delle righe nella risposta (cap 500: oltre, backup parziale ma DELETE totale, `troncato` lo "
    "dichiara), `dryRun:true` per conteggio+backup senza cancellare; guardia I95 invariata (ADMIN_TOKEN + "
    "rate limit). Nota operativa: da ADMIN_TOKEN attivo (I120/I121) i contesti demo anonimi ricevono 401 "
    "sulla replica — l'inquinamento è cessato alla fonte; l'azione serve per la pulizia dello storico "
    "esistente e per il futuro. **Test +7** (567/567, 1939 asserzioni): client finto dedicato LIMIT-aware "
    "(dryRun ZERO DELETE, backup PRIMA del DELETE con log unico, DELETE parametrizzato su source=demo, "
    "cap/troncato, client senza superficie SQL → errore), contratto route (dryRun 200 senza scritture, "
    "reale con DELETE+backup, dryRun non-booleano → 400), e2e motore reale in processo figlio (dryRun non "
    "cancella, reale con backup completo, restano SOLO i punti reali, idempotenza). **Fix di una bomba "
    "d'ordine PRE-ESISTENTE** (falliva già a HEAD I121, verificato con git stash): il mock parziale di "
    "`@/lib/modalita-persistenza` in api-persistenza.test.ts non esportava `livelloLogPrisma` (I119) — a "
    "seconda dell'ordine dei file rompeva il caricamento di db.test.ts e db-log-livello.test.ts (17 test "
    "persi, 2 errori di caricamento); mock ora SPREAD del modulo reale + override (mirror completo per "
    "costruzione, lezione I110). Audit +7 check I122 → **609/609** PASS 0 scoperte |"
)

RIGA_I122_S8 = (
    "| 2026-10-17 | `src/lib/manutenzione-db.ts` (NUOVA azione `eseguiRimozioneDemo`: DELETE selettivo "
    "`source=\"demo\"` con backup PRIMA del DELETE, `dryRun`, cap backup `RIMOZIONE_DEMO_BACKUP_MAX` 500 "
    "con flag `troncato`), `src/lib/api-schemi.ts` (schema azione esteso: `rimuovi-demo` + `dryRun` "
    "booleano opzionale), `src/app/api/manutenzione/route.ts` (dispatch POST «rimuovi-demo», docblock "
    "contratto e messaggio 400 aggiornati), `tests/lib/database-manutenzione.test.ts` (NUOVO describe "
    "I122, 4 test su client finto LIMIT-aware), `tests/lib/api-manutenzione.test.ts` (+3 test contratto "
    "route, mock `$queryRaw` esteso con branch demo COUNT/SELECT), "
    "`scripts/verifiche/verifica-i111-motore-reale.ts` (e2e rimozione demo: dryRun/reale/idempotenza), "
    "`tests/lib/api-persistenza.test.ts` (FIX bomba d'ordine PRE-ESISTENTE: mock `modalita-persistenza` "
    "SPREAD del modulo reale — senza `livelloLogPrisma` di I119 rompeva il caricamento di db.test.ts e "
    "db-log-livello.test.ts IN BASE ALL'ORDINE DEI FILE), `scripts/verifiche/audit-implementazioni.mjs` "
    "(+7 check I122, contatori suite 567/1939), `README.md` (badge audit 602→609, test 560→567, §API "
    "manutenzione +azione, §Qualità +I122), `docs/10` (§3 azione POST, §7 curl, §8 verifiche), `docs/04` "
    "(§3 I122, §8), `scripts/verifiche/esiti/audit-latest.md` (rigenerato), `src/lib/version.ts` "
    "(2026-10-17 · I122), `worklog.md` (Task 70) | **I122 — azione «rimuovi-demo»**: cancellazione "
    "selettiva dei soli punti `source=\"demo\"` dall'archivio (34 punti di produzione identificati il "
    "17/10; generavano FALSI RESET nelle analisi: 12 marker su 12 da transizioni demo→api oltre "
    "RESET_JUMP/RESET_TARGET — inquinamento ricorrente per replica demo BY DESIGN dalle sessioni "
    "post-deploy senza impostazioni). Con backup delle righe nella risposta e dryRun pre-volo; guardia "
    "I95 invariata. Suite **567/567** (1939 asserzioni), tsc 0, lint 0, audit **609/609** PASS 0 "
    "scoperte |"
)

DOCS04 = BASE / "docs/04-stato-avanzamento.md"
testo = DOCS04.read_text(encoding="utf-8")
righe = testo.split("\n")
assert righe[209].startswith("| I121 |"), "riga 210 non è I121"
righe.insert(210, RIGA_I122_S3)
testo = "\n".join(righe)
# §8: inserimento in cima al changelog (dopo la riga di intestazione |------|)
marcatore_8 = "|------|------|-------------|"
i8 = testo.index(marcatore_8) + len(marcatore_8)
testo = testo[:i8] + "\n" + RIGA_I122_S8 + testo[i8:]
DOCS04.write_text(testo, encoding="utf-8")
print("docs/04 ok")

# ---------------- docs/10 ----------------
DOCS10 = BASE / "docs/10-manutenzione-database.md"
t10 = DOCS10.read_text(encoding="utf-8")

vecchio_post = (
    "| `POST /api/manutenzione` | Azioni protette dalla guardia I95 (`ADMIN_TOKEN` + rate limit): "
    "`{\"azione\":\"pulizia\"}` (DELETE ritenuta+cap, quota rivalutata a fine), `{\"azione\":\"vacuum\"}` "
    "(prima/dopo misurati, byte recuperati), `{\"azione\":\"manutenzione\"}` (ciclo completo, VACUUM "
    "automatico solo se la pulizia ha eliminato — dal I117 si registra in P8 con innesco «post») |"
)
nuovo_post = (
    "| `POST /api/manutenzione` | Azioni protette dalla guardia I95 (`ADMIN_TOKEN` + rate limit): "
    "`{\"azione\":\"pulizia\"}` (DELETE ritenuta+cap, quota rivalutata a fine), `{\"azione\":\"vacuum\"}` "
    "(prima/dopo misurati, byte recuperati), `{\"azione\":\"manutenzione\"}` (ciclo completo, VACUUM "
    "automatico solo se la pulizia ha eliminato — dal I117 si registra in P8 con innesco «post»), "
    "`{\"azione\":\"rimuovi-demo\", \"dryRun\": true?}` (I122: DELETE selettivo dei SOLI punti "
    "`source=\"demo\"` con backup delle righe nella risposta — i rilevamenti demo replicati generano "
    "falsi reset nelle analisi; con `dryRun` conta e mostra le righe SENZA cancellare) |"
)
assert vecchio_post in t10, "riga POST /api/manutenzione non trovata in docs/10"
t10 = t10.replace(vecchio_post, nuovo_post)

curl_vecchio = """# Solo VACUUM (byte recuperati dichiarati):
curl -s -X POST https://<deployment>/api/manutenzione \\
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"azione":"vacuum"}'
```"""
curl_nuovo = """# Solo VACUUM (byte recuperati dichiarati):
curl -s -X POST https://<deployment>/api/manutenzione \\
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"azione":"vacuum"}'

# I122 — rimozione selettiva dei punti demo (falsi reset nelle analisi).
# SEMPRE prima il dryRun: conteggio + righe interessate, ZERO cancellazioni:
curl -s -X POST https://<deployment>/api/manutenzione \\
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"azione":"rimuovi-demo","dryRun":true}' | python3 -m json.tool

# Rimozione reale: la risposta contiene il BACKUP delle righe cancellate
# (cap 500, "troncato": true se parziale) — conservarla per il recupero:
curl -s -X POST https://<deployment>/api/manutenzione \\
  -H "Content-Type: application/json" -H "x-admin-token: $ADMIN_TOKEN" \\
  -d '{"azione":"rimuovi-demo"}' | python3 -m json.tool > backup-rimozione-demo.json
```"""
assert curl_vecchio in t10, "blocco curl vacuum non trovato in docs/10"
t10 = t10.replace(curl_vecchio, curl_nuovo)

verifiche_vecchio = "- `tests/lib/database-manutenzione.test.ts` (21 test):"
verifiche_nuovo = (
    "- `tests/lib/database-manutenzione.test.ts` (dal I122: 21+4 test — il describe I122 copre "
    "`eseguiRimozioneDemo` su client finto LIMIT-aware: dryRun ZERO DELETE, backup PRIMA del DELETE, "
    "DELETE parametrizzato su `source=\"demo\"`, cap/troncato, client senza superficie SQL; il motore "
    "reale in processo figlio verifica dryRun senza cancellazioni, reale con backup completo e "
    "idempotenza). Base I111 (21 test):"
)
assert verifiche_vecchio in t10, "riga verifiche database-manutenzione non trovata"
t10 = t10.replace(verifiche_vecchio, verifiche_nuovo)
DOCS10.write_text(t10, encoding="utf-8")
print("docs/10 ok")

# ---------------- README ----------------
README = BASE / "README.md"
tr = README.read_text(encoding="utf-8")
tr = tr.replace(
    "[![Audit 602 PASS](https://img.shields.io/badge/audit-602_PASS-31C48D)]",
    "[![Audit 609 PASS](https://img.shields.io/badge/audit-609_PASS-31C48D)]",
)
tr = tr.replace(
    "`POST` protetto I95 con azioni `pulizia`/`vacuum`/`manutenzione` (ritenuta + cap FIFO, byte recuperati dichiarati)",
    "`POST` protetto I95 con azioni `pulizia`/`vacuum`/`manutenzione`/`rimuovi-demo` (ritenuta + cap FIFO, byte recuperati dichiarati; I122: DELETE selettivo dei punti demo — falsi reset — con backup e dryRun)",
)
tr = tr.replace(
    "**560 test / 1896 asserzioni** (`bun test`)",
    "**567 test / 1939 asserzioni** (`bun test`)",
)
tr = tr.replace(
    "manutenzione database con e2e su entrambe le codifiche DateTime (I111) e registro delle esecuzioni con e2e motore reale (I117)",
    "manutenzione database con e2e su entrambe le codifiche DateTime (I111), registro delle esecuzioni con e2e motore reale (I117) e rimozione selettiva dei punti demo con backup/dryRun (I122)",
)
tr = tr.replace(
    "dal I121 presidia il perimetro COMPLETO del token: la POST del proxy usage allega l'header — verifica statica sul sorgente)",
    "dal I121 presidia il perimetro COMPLETO del token: la POST del proxy usage allega l'header — verifica statica sul sorgente; dal I122 presidia l'azione di manutenzione «rimuovi-demo» (lib, schema, route, test, e2e motore reale))",
)
tr = tr.replace(
    "**Audit di riconciliazione** (`scripts/verifiche/audit-implementazioni.mjs`): 602 verifiche dichiarative",
    "**Audit di riconciliazione** (`scripts/verifiche/audit-implementazioni.mjs`): 609 verifiche dichiarative",
)
tr = tr.replace(
    "tests/                               # Suite bun: lib/ (47 file) + components/ (10 componenti) = 560 test / 1896 asserzioni",
    "tests/                               # Suite bun: lib/ (47 file) + components/ (10 componenti) = 567 test / 1939 asserzioni",
)
tr = tr.replace(
    "azioni manuali via `POST` protetto I95 (`pulizia` / `vacuum` / `manutenzione`); disattivare",
    "azioni manuali via `POST` protetto I95 (`pulizia` / `vacuum` / `manutenzione` / `rimuovi-demo` I122); disattivare",
)
README.write_text(tr, encoding="utf-8")
print("README ok")

# ---------------- audit I105 contatori ----------------
AUDIT = BASE / "scripts/verifiche/audit-implementazioni.mjs"
ta = AUDIT.read_text(encoding="utf-8")
vecchio = 'check.simbolo("I105", "README.md", "560 test / 1896 asserzioni", "contatori suite §Struttura/§Qualità allineati (aggiornare a ogni aggiunta test)")'
nuovo = 'check.simbolo("I105", "README.md", "567 test / 1939 asserzioni", "contatori suite §Struttura/§Qualità allineati (aggiornare a ogni aggiunta test)")'
assert vecchio in ta, "check I105 contatori non trovato"
ta = ta.replace(vecchio, nuovo)
AUDIT.write_text(ta, encoding="utf-8")
print("audit I105 ok")
