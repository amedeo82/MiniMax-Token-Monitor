/**
 * Verifica meccanismo bug localStorage (pre-fix I88):
 * dopo Object.defineProperty(window,"localStorage",...) + delete window.localStorage,
 * happy-dom ha PERSO la proprietà globale? (il commento kiosk assumeva che
 * «il descrittore originale torna visibile» — da falsificare)
 */
import "../../tests/components/setup-dom"; // registra happy-dom UNA volta (guarded)

const w = globalThis as unknown as Record<string, unknown>;

const prima = typeof localStorage !== "undefined";

Object.defineProperty(window, "localStorage", {
  configurable: true,
  writable: true,
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
});

const durante = typeof localStorage !== "undefined";

delete (window as unknown as Record<string, unknown>).localStorage;

const dopo = typeof localStorage !== "undefined";

console.log(JSON.stringify({ prima, durante, dopo, windowEqGlobal: window === globalThis }));
