"use client";

/**
 * I78 — Toggle rapido del tema nel header.
 *
 * next-themes con strategia `class` e defaultTheme="dark": il bottone alterna
 * tra chiaro e scuro in modo ESPLICITO (se l'utente era su «sistema», il primo
 * click fissa il tema opposto a quello risolto). L'icona mostra il tema di
 * DESTINAZIONE: Sole quando si passa al chiaro, Luna quando si torna al scuro.
 * Il tema scelto persiste nel localStorage `theme` gestito da next-themes.
 *
 * Mounted-guard: prima dell'idratazione next-themes non conosce il tema
 * risolto — si renderizza un bottone neutro per evitare mismatch SSR.
 */

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const chiaroAttivo = resolvedTheme === "light";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={mounted ? (chiaroAttivo ? "Passa al tema scuro" : "Passa al tema chiaro") : "Cambia tema"}
      title={mounted ? (chiaroAttivo ? "Passa al tema scuro" : "Passa al tema chiaro") : "Cambia tema"}
      onClick={() => setTheme(chiaroAttivo ? "dark" : "light")}
      className="h-9 w-9 border-white/10 bg-white/[0.04] hover:bg-white/[0.08]!"
    >
      {mounted && chiaroAttivo ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </Button>
  );
}
