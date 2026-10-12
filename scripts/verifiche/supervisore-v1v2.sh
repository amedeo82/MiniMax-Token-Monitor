#!/bin/bash
# supervisore-v1v2.sh — Task 7 (verifiche V1–V6)
# Attende la fine di V3 (pid passato come $1), poi avvia le sessioni lunghe:
#   V1 (osservazione stato 2 durante consumo): 30s × 480 min
#   V2 (rolling dal primo utilizzo):           20s × 480 min
# Entrambe vengono avviate tramite la route temporanea /api/verifiche, così
# nascono come figli del dev server e sopravvivono all'ambiente terminale.
V3_PID="${1:?pid V3 mancante}"
BASE=/home/z/my-project
LOG=$BASE/scripts/verifiche/supervisore.log

echo "[$(date -Is)] supervisore attivo: attendo la fine di V3 (pid $V3_PID)" >> "$LOG"
while kill -0 "$V3_PID" 2>/dev/null; do
  sleep 20
done
echo "[$(date -Is)] V3 terminato → avvio V1 (30s × 480 min)" >> "$LOG"
curl -s -X POST http://localhost:3000/api/verifiche \
  -H 'Content-Type: application/json' \
  -d '{"id":"v1","args":["--intervallo","30","--durata","480"]}' >> "$LOG" 2>&1
echo >> "$LOG"
echo "[$(date -Is)] avvio V2 (20s × 480 min)" >> "$LOG"
curl -s -X POST http://localhost:3000/api/verifiche \
  -H 'Content-Type: application/json' \
  -d '{"id":"v2","args":["--intervallo","20","--durata","480"]}' >> "$LOG" 2>&1
echo >> "$LOG"
echo "[$(date -Is)] V1 e V2 avviate automaticamente" >> "$LOG"
touch "$BASE/scripts/verifiche/.v1v2-avviate"
