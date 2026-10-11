/**
 * I81 — Setup del DOM per i test di componente (pattern ufficiale di Bun:
 * GlobalRegistrator di happy-dom).
 *
 * bun test esegue i file in un unico processo: il registro globale è guarded
 * (il primo import attiva document/window, i successivi sono no-op). Qui si
 * aggiungono anche i polyfill che i componenti Radix usano al mount ma che
 * happy-dom non fornisce (ResizeObserver) e un IntersectionObserver stub per
 * i componenti che lo creano in useEffect (section-nav): i test di render non
 * hanno bisogno dell'osservazione reale.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

// Radix UI misura elementi al mount → serve un costruttore, anche minimo.
if (typeof (globalThis as Record<string, unknown>).ResizeObserver === "undefined") {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/** Stub deterministico di IntersectionObserver: registra ciò che osserva, non emette. */
export function installIntersectionObserverStub(): void {
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    callback: () => void;
    osservati: Element[] = [];
    constructor(cb: () => void) {
      this.callback = cb;
    }
    observe(el: Element): void {
      this.osservati.push(el);
    }
    unobserve(el: Element): void {
      this.osservati = this.osservati.filter((x) => x !== el);
    }
    disconnect(): void {
      this.osservati = [];
    }
  };
}
