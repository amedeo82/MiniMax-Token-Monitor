#!/usr/bin/env python3
"""Payload per la verifica browser I43 — v2 (scenario senza falsi reset).

Una sessione, tre stadi (swap del mock tra i poll, refresh 30 s):

- P1 «sano»: interval 32% (arco 40→32,5 in 90 min ≈ +5 %/h < pareggio 9,8 → no
  fermo; residuo previsto 15,6 < 20 → no spreco), weekly 90,3% (arco 91,2→90,3
  ≈ +0,6 %/h < pareggio 0,76; residuo 19,3 < 35 → no spreco). Atteso: PRIMING
  silenzioso, zero eventi, zero banner.
- P2 «fermo»: interval 22% (−10, nessun salto da reset) → ritmo ≈ +11,6 %/h >
  pareggio 6,4 → esaurimento prima del reset, downtime ≈ 92 min ≥ 2×15 → CRIT.
  Atteso: evento kind «pace» crit + banner crit + toast.
- P3 «spreco»: stessa percentuale, ma finestra settimanale ACCORCIATA
  (end = T0+2g invece di T0+5g) → ore al reset 46 in vece di 118 → residuo
  previsto ≈ 62,5 ≥ 35 → WARN. Atteso: evento kind «waste» warn + banner con
  2 voci. Il restringimento è la leva sintetica che fa «apparire» lo spreco
  durante la sessione (il residuo sale quando le ore al reset scendono).

Isteresi: dopo P2 e P3 si attendono 2 poll ciascuno → conteggi invariati.
"""

import json
import time

T0 = int(time.time() * 1000)
MIN = 60_000
DAY = 24 * 60 * MIN

INTERVAL_START = T0 - 90 * MIN
INTERVAL_END = T0 + 210 * MIN          # reset interval: T0 + 3,5 h
WEEKLY_START = T0 - 2 * DAY
WEEKLY_END_LONG = T0 + 5 * DAY         # P1/P2
WEEKLY_END_SHORT = T0 + 2 * DAY        # P3 (leva sintetica dello spreco)

def model(interval_pct: float, weekly_pct: float, weekly_end: int, weekly_remains_ms: int) -> dict:
    return {
        "model_name": "general",
        "current_interval_remaining_percent": interval_pct,
        "current_interval_total_count": 0,
        "current_interval_usage_count": 0,
        "current_interval_status": 1,
        "start_time": INTERVAL_START,
        "end_time": INTERVAL_END,
        "remains_time": INTERVAL_END - T0,
        "current_weekly_remaining_percent": weekly_pct,
        "current_weekly_total_count": 0,
        "current_weekly_usage_count": 0,
        "current_weekly_status": 1,
        "weekly_start_time": WEEKLY_START,
        "weekly_end_time": weekly_end,
        "weekly_remains_time": weekly_remains_ms,
    }

def wrapper(m: dict, stage: str) -> dict:
    return {
        "ok": True,
        "data": {
            "base_resp": {"status_code": 0, "status_msg": "success"},
            "current_subscribe_title": "M Plan · Verifica I43",
            "credits_balance": 12.5,
            "model_remains": [m],
        },
        "endpoint": f"mock://i43-{stage}",
    }

p1 = wrapper(model(32, 90.3, WEEKLY_END_LONG, 5 * DAY), "P1-sano")
p2 = wrapper(model(22, 90.3, WEEKLY_END_LONG, 5 * DAY), "P2-fermo")
p3 = wrapper(model(22, 90.3, WEEKLY_END_SHORT, 2 * DAY), "P3-spreco")

for name, body in (("a", p1), ("b", p2), ("c", p3)):
    with open(f"/tmp/i43_body_{name}.json", "w") as f:
        json.dump(body, f)

# Storia locale seminata: 13 punti ogni 7,5 min sugli ultimi 90 min
history = []
for i in range(13):
    t = T0 - 90 * MIN + i * 7.5 * MIN
    history.append({
        "t": t,
        "interval": round(40 - i * (7.5 / 12), 1),   # 40 → 32,5  (≈ +5 %/h)
        "weekly": round(91.2 - i * (0.9 / 12), 1),   # 91,2 → 90,3 (≈ +0,6 %/h)
    })
with open("/tmp/i43_history.json", "w") as f:
    json.dump(history, f)

# Impostazioni: motore reale, refresh 30 s, I43 default (h5: fermo 15/spreco 20;
# weekly: fermo 60/spreco 35 per il test della leva)
settings = {
    "apiKey": "test-key-i43",
    "region": "eu",
    "refreshSeconds": 30,
    "demoMode": False,
    "alertsEnabled": True,
    "thresholds": {"h5": {"warn": 25, "crit": 10}, "h24": {"warn": 25, "crit": 10}, "weekly": {"warn": 25, "crit": 10}},
    "notifyReset": True,
    "browserNotifications": False,
    "paceThresholds": {
        "h5": {"enabled": True, "downtimeMin": 15, "wasteMode": "percent", "wasteThreshold": 20},
        "h24": {"enabled": True, "downtimeMin": 30, "wasteMode": "percent", "wasteThreshold": 20},
        "weekly": {"enabled": True, "downtimeMin": 60, "wasteMode": "percent", "wasteThreshold": 35},
    },
}
with open("/tmp/i43_settings.json", "w") as f:
    json.dump(settings, f)

# JSON da incollare per il test di import gating (payload P3 in forma «risposta API»)
with open("/tmp/i43_import.json", "w") as f:
    json.dump(p3["data"], f)

with open("/tmp/i43_t0.txt", "w") as f:
    f.write(str(T0))

print("T0 =", T0, "— payload P1/P2/P3 + history + settings scritti")
