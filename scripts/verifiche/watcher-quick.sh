#!/bin/bash
# watcher-quick.sh — Task 7 (verifiche empiriche V1–V6)
# Attende che il proxy /api/minimax/usage registri la chiave reale
# (.chiave-sessione), poi esegue in sequenza: prova-parser, V4, V5, V6.
# Tutti gli output vanno in sessione-quick.log; gli esiti strutturati
# in esiti/. La chiave NON viene mai stampata nei log.
BASE=/home/z/my-project
DIR=$BASE/scripts/verifiche
KEYFILE=$DIR/.chiave-sessione
LOG=$DIR/sessione-quick.log
MARKER=$DIR/.quick-done
TIMEOUT_SEC=21600   # 6 ore di attesa max

rm -f "$MARKER"
echo "[$(date -Is)] watcher avviato (pid $$); attendo $KEYFILE (timeout ${TIMEOUT_SEC}s)" >> "$LOG"

trovato=0
for i in $(seq 1 $((TIMEOUT_SEC / 5))); do
  if [ -s "$KEYFILE" ]; then
    trovato=1
    echo "[$(date -Is)] chiave rilevata dal proxy" >> "$LOG"
    break
  fi
  sleep 5
done

if [ "$trovato" != "1" ]; then
  echo "[$(date -Is)] TIMEOUT: la chiave non è mai arrivata (demo ancora attiva?)" >> "$LOG"
  exit 1
fi

chmod 600 "$KEYFILE" 2>/dev/null
export MM_SUBSCRIPTION_KEY=$(node -e "const d=JSON.parse(require('fs').readFileSync('$KEYFILE','utf8'));process.stdout.write(d.apiKey)")
export MM_REGION=$(node -e "const d=JSON.parse(require('fs').readFileSync('$KEYFILE','utf8'));process.stdout.write(d.region||'eu')")
echo "[$(date -Is)] chiave caricata in sicurezza (regione: $MM_REGION, lunghezza: ${#MM_SUBSCRIPTION_KEY})" >> "$LOG"

cd "$BASE" || exit 1

echo "[$(date -Is)] === AUTOTEST prova-parser ===" >> "$LOG"
node scripts/verifiche/verifica.mjs prova-parser >> "$LOG" 2>&1

echo "[$(date -Is)] === V4: token_plan vs coding_plan ===" >> "$LOG"
node scripts/verifiche/verifica.mjs v4 --regione "$MM_REGION" >> "$LOG" 2>&1

echo "[$(date -Is)] === V5: semantica conteggi ===" >> "$LOG"
node scripts/verifiche/verifica.mjs v5 >> "$LOG" 2>&1

echo "[$(date -Is)] === V1 snapshot singolo (--once): stati correnti ===" >> "$LOG"
node scripts/verifiche/verifica.mjs v1 --once >> "$LOG" 2>&1

echo "[$(date -Is)] === V6: rate limit, 10 min @10s ===" >> "$LOG"
node scripts/verifiche/verifica.mjs v6 --intervallo 10 --durata 10 >> "$LOG" 2>&1

echo "[$(date -Is)] === VERIFICHE RAPIDE COMPLETATE ===" >> "$LOG"
touch "$MARKER"
