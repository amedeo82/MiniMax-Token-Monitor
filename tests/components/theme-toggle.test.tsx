/**
 * I78 — Test di componente: ThemeToggle (toggle rapido del tema).
 *
 * next-themes con strategia class: il click sul toggle imposta il tema
 * esplicito (persistito nel localStorage `theme` di next-themes) e l'aria-label
 * riflette il tema di DESTINAZIONE. Il provider è abilitato con
 * enableSystem per coprire anche l'opzione «Sistema» delle impostazioni.
 */
import "./setup-dom";
import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/theme-toggle";

beforeEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.className = "";
});

function mount() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("I78 componenti: ThemeToggle", () => {
  test("parte scuro (default) e propone il passaggio al chiaro", async () => {
    mount();
    const btn = await waitFor(() => screen.getByRole("button", { name: "Passa al tema chiaro" }));
    expect(btn).toBeDefined();
    // next-themes NON scrive il default nel localStorage: solo le scelte esplicite
    expect(localStorage.getItem("theme")).toBeNull();
  });

  test("click → tema chiaro persistito e label invertita", async () => {
    mount();
    const btn = await waitFor(() => screen.getByRole("button", { name: "Passa al tema chiaro" }));
    fireEvent.click(btn);
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("light"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Passa al tema scuro" })).toBeDefined());
  });

  test("dal chiaro il click ritorna al scuro", async () => {
    localStorage.setItem("theme", "light");
    mount();
    const btn = await waitFor(() => screen.getByRole("button", { name: "Passa al tema scuro" }));
    fireEvent.click(btn);
    await waitFor(() => expect(localStorage.getItem("theme")).toBe("dark"));
  });
});
