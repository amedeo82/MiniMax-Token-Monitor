"""
Genera uno storico sintetico per la verifica E2E del pannello «Analisi di lungo periodo» (I26).

Struttura attesa:
- INTERVALLO (finestra 5h): 6 cicli completati (ognuno: 5 punti in 4,5h, residuo 93→27,
  consumo 66 punti, ritmo 66/4,5 = 14,67 %/h) + 1 ciclo in corso (93→33 in 4h).
- SETTIMANALE: 1 ciclo completato (now-60h → now-38h, residuo 45→33, consumo 12,
  durata 22h, ritmo 12/22 ≈ 0,545 %/h) + reset a now-36h + ciclo in corso (100→80).

Output: JSON da iniettare in localStorage (chiave mm-dash-history-v1).
"""

import json
import time

now = int(time.time() * 1000)
H = 3600_000
D = 24 * H

points: list[dict] = []


def add(t: int, interval: float, weekly: float) -> None:
    points.append(
        {
            "t": t,
            "interval": round(max(0, min(100, interval)), 1),
            "weekly": round(max(0, min(100, weekly)), 1),
        }
    )


# ---- Ciclo settimanale completato: now-60h → now-38h (45 → 33) ----
w_start = now - 60 * H
w_end = now - 38 * H
steps = 11  # 11 punti → 10 intervalli da 2,2h
for i in range(steps):
    frac = i / (steps - 1)
    t = w_start + frac * (w_end - w_start)
    weekly = 45 - 12 * frac
    # in quel periodo la finestra 5h scendeva con regolarità (niente falsi reset)
    interval = 70 - 35 * frac
    add(int(t), interval, weekly)

# ---- Reset settimanale a now-36h e ciclo in corso (100 → 80) ----
# ---- + 6 cicli di 5h completati + 1 in corso, stessa timeline ----
cycle_values = [93, 76, 58, 41, 27]  # consumo 66 punti su 4,5h
cycle_offsets = [0, 1, 2, 3, 4.5]  # ore dall'inizio ciclo

# 6 cicli completati, uno ogni 5,5h, che terminano a now-6h
for c in range(6):
    base = now - 36 * H + c * 5.5 * H
    for off, val in zip(cycle_offsets, cycle_values):
        t = base + off * H
        if t >= now:
            break
        # settimanale: discesa lineare 100 → 80 su 36h
        weekly = 100 - 20 * ((t - (now - 36 * H)) / (36 * H))
        add(int(t), val, weekly)

# ciclo 5h in corso: iniziato 4h fa
base = now - 4 * H
for off, val in zip([0, 1, 2, 3, 4], [93, 76, 58, 41, 33]):
    t = base + off * H
    weekly = 100 - 20 * ((t - (now - 36 * H)) / (36 * H))
    add(int(t), val, min(weekly, 80 + (4 - off)))  # aggancia ~80 alla fine

# primo punto del ciclo settimanale post-reset (a now-36h, interval=93)
# già coperto dal ciclo 0 sopra (base = now-36h, off 0 → 93/100). OK.

# Ordina e deduplica per t (vince l'ultimo)
points.sort(key=lambda p: p["t"])
dedup: dict[int, dict] = {}
for p in points:
    dedup[p["t"]] = p
final = list(dedup.values())

out = "/home/z/my-project/scripts/synthetic_history.json"
with open(out, "w") as f:
    json.dump(final, f, separators=(",", ":"))

span_h = (final[-1]["t"] - final[0]["t"]) / H
print(f"punti: {len(final)}  arco: {span_h:.1f}h  file: {out}")
# Attese teoriche da stampare per il confronto in verifica
print("ATTESO interval: 7 cicli (6 completati + 1 in corso)")
print("  durata media completati = 4h30m, consumo medio = 66,0%, ritmo medio = 14,67 %/h")
print("ATTESO weekly: 2 cicli (1 completato: 45→33, durata 22h, consumo 12,0, ritmo 0,55 %/h)")
