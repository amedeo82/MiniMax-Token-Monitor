#!/bin/bash
# Quarantena dei file debris pre-rollback (fenomeno workspace instabile).
#
# La piattaforma materializza/dematerializza file NON tracciati delle versioni
# precedenti al rollback (mtime 7-8/10: kiosk-view, backup, restore, vecchi
# standalone, test vecchi, script i4x). Rompono tsc (API rimosse) e bun test
# (discovery instabile). I file compaiono/scompaiono A ONDATE tra i comandi:
# lo script RITENTA per ~15s per coglierne una fase presente.
#
# Azione: SPOSTA (non cancella) i debris toolchain-breaking in
# .debris-pre-rollback/ preservando il percorso relativo — reversibile.
# I debris inerti (json/png/log) non vengono toccati.
set -u
cd "$(dirname "$0")/.."
DEST=".debris-pre-rollback"
mkdir -p "$DEST"

DEBRIS=(
  "src/components/kiosk-view.tsx"
  "src/components/rate-chart.tsx"
  "src/components/tab-identity.tsx"
  "src/lib/backup.ts"
  "src/lib/restore.ts"
  "tests/lib/tab-identity.test.ts"
  "tests/lib/ring-color.test.ts"
  "tests/lib/sw-shared.test.ts"
  "scripts/i43_engine_test.ts"
  "scripts/i45_kiosk_test.ts"
)

spostati_totale=0
# fino a 30 tentativi x 500ms: i debris sfarfallano a ondate brevi
for tentativo in $(seq 1 30); do
  rimasti=0
  for f in "${DEBRIS[@]}"; do
    if [ -f "$f" ]; then
      mkdir -p "$DEST/$(dirname "$f")"
      if mv "$f" "$DEST/$f" 2>/dev/null; then
        echo "spostato: $f"
        spostati_totale=$((spostati_totale + 1))
      else
        rimasti=$((rimasti + 1))
      fi
    fi
  done
  # tutti spariti o spostati: fine
  presenti=0
  for f in "${DEBRIS[@]}"; do [ -f "$f" ] && presenti=$((presenti + 1)); done
  [ "$presenti" -eq 0 ] && break
  sleep 0.5
done
echo "---"
echo "spostati in quarantena (totale): $spostati_totale"
[ "$spostati_totale" -gt 0 ] && echo "ATTENZIONE: ri-eseguire lo script prima di ogni protocollo finché il fenomeno persiste"
exit 0
