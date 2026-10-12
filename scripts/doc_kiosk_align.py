#!/usr/bin/env python3
"""Allinea le righe dei box ASCII in docs/03 dopo l'aggiunta del kiosk (I45).

Interventi:
1. §1 diagramma architettura: aggiunge `· kiosk-view` alla lista componenti,
   mantenendo la larghezza del box (rimuove il padding equivalente).
2. §7 layout dashboard: inserisce una riga `├ KioskView (I45): ...` prima della
   riga di chiusura `└ EventLog: ...`, paddata alla stessa larghezza del box.

Verifica finale: tutte le righe dei due box devono avere la stessa lunghezza.
"""

from pathlib import Path

DOCS = Path("/home/z/my-project/docs/03-piano-implementazione.md")
text = DOCS.read_text(encoding="utf-8")
lines = text.split("\n")

# ---------------------------------------------------------------- 1. box §1
for i, line in enumerate(lines):
    if "quota-ring · tech-panels" in line and line.lstrip().startswith("│"):
        add = " · kiosk-view"
        # il padding a destra viene ridotto della stessa quantità aggiunta
        head, sep, tail = line.partition("tech-panels")
        if sep and tail.rstrip().endswith("│"):
            pad = tail[: tail.index("│")]
            if len(pad) >= len(add):
                new_tail = " " * (len(pad) - len(add)) + "│"
                lines[i] = head + "tech-panels" + add + new_tail
                print(f"§1 riga {i + 1}: aggiunto '{add.strip()}' (padding -{len(add)})")
            else:
                raise SystemExit(f"§1: padding insufficiente ({len(pad)} spazi)")
        break
else:
    raise SystemExit("§1: riga 'quota-ring · tech-panels' non trovata")

# ---------------------------------------------------------------- 2. box §7
close_idx = None
for i, line in enumerate(lines):
    if line.startswith("└ EventLog:"):
        close_idx = i
        break
if close_idx is None:
    raise SystemExit("§7: riga di chiusura '└ EventLog:' non trovata")

box_width = len(lines[close_idx].rstrip())
new_row = (
    "├ KioskView (I45): overlay a tutto schermo che sostituisce la pagina"
    " (pulsante header o ?kiosk=1)"
)
if len(new_row) > box_width - 1:
    raise SystemExit(f"§7: riga nuova troppo lunga ({len(new_row)} > {box_width - 1})")
new_row = new_row.ljust(box_width - 1) + "│"
lines.insert(close_idx, new_row)
print(f"§7: inserita riga KioskView prima della riga {close_idx + 1} (larghezza {box_width})")

# ------------------------------------------------------------- scrittura
DOCS.write_text("\n".join(lines), encoding="utf-8")

# ------------------------------------------------------------- verifica box
blocks = {"§1": [], "§7": []}
current = None
for line in lines:
    s = line.rstrip()
    if s.startswith("┌"):
        current = "§1"
        blocks[current] = [s]
        continue
    if current and s:
        blocks[current].append(s)
        if s.startswith("└"):
            current = None
        continue
    # separatore di sezione (---) chiude il box aperto
    if current and set(s) == {"-"} and len(s) >= 3:
        current = None

for name, block in blocks.items():
    widths = {len(l) for l in block if l.startswith(("┌", "│", "├", "└"))}
    status = "OK" if len(widths) == 1 else f"LARGHEZZE DIVERSE: {sorted(widths)}"
    print(f"box {name}: {len(block)} righe, larghezze {'uniformi' if len(widths) == 1 else sorted(widths)} → {status}")

print("Fatto.")
