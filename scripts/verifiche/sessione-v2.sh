#!/bin/bash
# sessione-v2.sh — Verifica V2 (rolling dal primo utilizzo?) a cavallo del reset 5h
# Programma l'avvio alle 16:25 Europe/Rome (35 min prima del confine 17:00 Roma),
# poi esegue v2 --intervallo 30 --durata 150 (copre reset + ~2h di uso post-reset).
# Chiave letta dal file one-shot ADR-13-R3; mai stampata nel log.
BASE=/home/z/my-project
KEYFILE=$BASE/scripts/verifiche/.chiave-sessione
LOG=$BASE/scripts/verifiche/sessione-v2.log

TARGET=$(TZ=Europe/Rome date -d 'today 16:25' +%s)
NOW=$(date +%s)
SLEEP=$((TARGET - NOW))
[ "$SLEEP" -lt 0 ] && SLEEP=0
echo "[$(date -Is)] programmata attesa ${SLEEP}s fino alle 16:25 Roma, poi V2 (150 min @30s)" >> "$LOG"

sleep "$SLEEP"

export MM_SUBSCRIPTION_KEY=$(node -e "const d=JSON.parse(require('fs').readFileSync('$KEYFILE','utf8'));process.stdout.write(d.apiKey)")
export MM_REGION=$(node -e "const d=JSON.parse(require('fs').readFileSync('$KEYFILE','utf8'));process.stdout.write(d.region||'eu')")
echo "[$(date -Is)] chiave caricata in sicurezza (regione: $MM_REGION, lunghezza: ${#MM_SUBSCRIPTION_KEY}), avvio V2" >> "$LOG"

cd "$BASE" || exit 1
node scripts/verifiche/verifica.mjs v2 --intervallo 30 --durata 150 >> "$LOG" 2>&1
echo "[$(date -Is)] V2 completata" >> "$LOG"
