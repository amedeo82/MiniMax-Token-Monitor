import * as React from "react"

const MOBILE_BREAKPOINT = 768

/* I90 — la viewport è un sistema esterno: useSyncExternalStore la espone al
   render senza setState sincrono in effect (react-hooks/set-state-in-effect v7).
   Lo snapshot server è false: nessun mismatch di idratazione (prima del
   refactoring: undefined → false al primo render, allineamento al mount). */
function sottoscriviViewport(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    sottoscriviViewport,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
