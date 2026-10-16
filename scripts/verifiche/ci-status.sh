#!/bin/bash
# ci-status.sh — verifica lo stato dei check-runs CI su GitHub per un commit (default: HEAD)
# Non stampa MAI il token estratto dal remote (lezione I109).
set -u
cd /home/z/my-project

SHA="${1:-$(git rev-parse HEAD)}"
URL="$(git remote get-url origin)"
REPO="$(echo "$URL" | sed -E 's#.*github.com/##; s#\.git$##')"

# estrazione token senza mai echo-arlo: forme supportate https://TOKEN@... e https://user:TOKEN@...
TOKEN="$(echo "$URL" | sed -n -E 's#https://([^@/:]+)@github\.com/.*#\1#p')"
if [ -z "$TOKEN" ]; then
  TOKEN="$(echo "$URL" | sed -n -E 's#https://[^@/:]+:([^@]+)@github\.com/.*#\1#p')"
fi

if [ -z "$TOKEN" ]; then
  echo "NESSUN TOKEN nel remote — probe senza auth (repo privato fallirà)"
  curl -s -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/commits/$SHA/check-runs" -o /tmp/ci-checks.json
else
  curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPO/commits/$SHA/check-runs" -o /tmp/ci-checks.json
fi

python3 - "$SHA" <<'PY'
import json, sys
sha = sys.argv[1]
with open('/tmp/ci-checks.json') as f:
    d = json.load(f)
if 'check_runs' not in d:
    print('RISPOSTA INATTESA:', json.dumps(d)[:300])
    sys.exit(1)
runs = d['check_runs']
print(f"commit {sha[:12]} — check_runs: {len(runs)}")
ok = True
for r in runs:
    print(f"  {r['name']:20s} status={r['status']:10s} conclusion={r['conclusion']}")
    if r['status'] != 'completed' or r['conclusion'] not in ('success', 'skipped', 'neutral'):
        ok = False
print('VERDETTO:', 'CI SUCCESS' if ok and runs else 'CI NON VERDE (o run assenti)')
sys.exit(0 if ok and runs else 1)
PY
