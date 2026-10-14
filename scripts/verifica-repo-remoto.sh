#!/usr/bin/env bash
# Task 44 — verifica repo remoto: metadati + run CI sull'ultimo commit pushato.
# Il PAT viene estratto dal remote URL e MAI stampato (lezione sessioni precedenti).
set -euo pipefail

REPO="amedeo82/MiniMax-Token-Monitor"
PAT=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@github.com.*|\1|p')
SHA=$(git rev-parse HEAD)
echo "Commit locale/pushato: $SHA"

api() {
  curl -sS -H "Authorization: Bearer $PAT" -H "Accept: application/vnd.github+json" "$@"
}

echo "=== METADATI REPO ==="
api "https://api.github.com/repos/$REPO" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("full_name:   ", d.get("full_name"))
print("visibility:  ", d.get("visibility"))
print("default_branch:", d.get("default_branch"))
print("description: ", (d.get("description") or "")[:120])
print("pushed_at:   ", d.get("pushed_at"))
print("open_issues: ", d.get("open_issues_count"))
'

echo "=== TOPICS ==="
api "https://api.github.com/repos/$REPO/topics" | python3 -c '
import json,sys
d=json.load(sys.stdin)
t=d.get("names",[])
print(f"count: {len(t)}")
print(", ".join(t))
'

echo "=== RUN CI SU $SHA ==="
for i in $(seq 1 30); do
  OUT=$(api "https://api.github.com/repos/$REPO/actions/runs?head_sha=$SHA&per_page=3")
  READOUT=$(echo "$OUT" | python3 -c '
import json,sys
d=json.load(sys.stdin)
runs=d.get("workflow_runs",[])
if not runs:
    print("NONE")
else:
    r=runs[0]
    print("|".join([r["status"], r["conclusion"] or "", r["html_url"], r["name"]]))
')
  STATUS=$(echo "$READOUT" | cut -d'|' -f1)
  CONCL=$(echo "$READOUT" | cut -d'|' -f2)
  URL=$(echo "$READOUT" | cut -d'|' -f3)
  NAME=$(echo "$READOUT" | cut -d'|' -f4)
  if [ "$STATUS" = "NONE" ]; then
    echo "[poll $i] run non ancora registrato, attendo 15 s..."
    sleep 15
    continue
  fi
  echo "workflow: $NAME"
  echo "status:   $STATUS"
  echo "conclusion: $CONCL"
  if [ "$STATUS" = "completed" ]; then
    echo "url: $URL"
    if [ "$CONCL" = "success" ]; then
      echo "ESITO: CI VERDE"
    else
      echo "ESITO: CI $CONCL"
      exit 2
    fi
    exit 0
  fi
  echo "[poll $i] in corso ($STATUS), attendo 15 s..."
  sleep 15
done
echo "TIMEOUT: run non completato entro il polling"
exit 3
