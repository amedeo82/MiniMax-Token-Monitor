/**
 * Inserisce la riga changelog del batch 3 (I65/I66/I67) in testa alla tabella §8
 * di docs/04 (le righe 2026-10-09 sono ordinate dalla più recente).
 */
import { readFileSync, writeFileSync } from "node:fs";

const P = "docs/04-stato-avanzamento.md";
const content = readFileSync(P, "utf8");

const riga =
  "| 2026-10-09 | `src/lib/ring-color.ts` (nuovo), `src/lib/tab-identity.ts` (nuovo), `src/components/quota-ring.tsx` (continuous + AnimatedPercent + glow), `src/components/quota-cards.tsx` (continuous sui 2 anelli), `src/components/section-nav.tsx` (nuovo), `src/components/tab-identity.tsx` (nuovo), `src/components/diagnostica-panel.tsx` (scroll-mt), `src/app/page.tsx` (SectionNav + TabIdentity + sezioni con id/scroll-mt), `src/app/globals.css` (scroll-behavior smooth), `tests/lib/ring-color.test.ts` (nuovo, 12 test), `tests/lib/tab-identity.test.ts` (nuovo, 9 test), `scripts/verifiche/audit-implementazioni.mjs` (+13 controlli → 111), `scripts/verifiche/replay-db-b3.mjs` (nuovo) + `mock-proxy-b3.mjs` (payload proxy mockato per la parità live), screenshot `scripts/verifiche/verify_b3_*.png` (5), questo file (I65/I66/I67 ✅, riga qui), `docs/03` (§3 righe ring-color/tab-identity/section-nav/tab-identity-componente/page), `docs/06` (nota header batch 3), `worklog.md` (Task 27) | **Batch 3 abbellimenti dashboard — I65 + I66 + I67 implementati** (richiesta utente: «procedi con il prossimo step, poi documenta e commit»; senza nuova clarify: applicate le raccomandazioni §10 di docs/06 come default). **I65**: `coloreContinuo()` HSL lerp a tratti con punti di controllo alle soglie reali di quotaLevel (0/10 crit → 30 warn → 60 good → 75/100 ok; plateau fuori dalle transizioni così il continuo coincide col discreto a ogni confine; hue 0→160 monotona) + prop `continuous` su QuotaRing (solo anelli principali, §10) con gradiente interpolato, glow drop-shadow 7px ~35% sul solo arco e count-up AnimatedPercent (framer-motion, 700 ms, solo al cambio valore, `useReducedMotion`, `motion-reduce:transition-none`); zero layout shift provato (17 campioni durante l'animazione, larghezza costante 51,75 px). **I66**: `SectionNav` fixed sotto header misurato (ResizeObserver, wrap mobile 208 px), fade-in oltre 160 px e scomparsa in cima pagina (zero reflow), 8 ancore con id + `scroll-mt` dinamico via `--nav-offset` (click «Eventi» → sezione a 162 px con header 106 px = zero sovrapposizione), scrollspy IntersectionObserver con banda header+56…-50% e memoria nei gap, `aria-current`, tastiera verificata, mobile 390 px zero overflow con scroll-x; `scroll-behavior: smooth` solo senza `prefers-reduced-motion`. **I67**: `formatTabTitle` («37 % · 77 % · MiniMax Monitor») + `drawFaviconDataUrl` (canvas 64 px, due archi concentrici 5h/settimanale tinti con `coloreContinuo`) + `<TabIdentity>`; **lezione di sessione**: Next/React 19 ri-asserisce il title dei metadata di layout dopo il flush di idratazione (scrittura diretta del textContent, bypass del setter — diagnosticato con trappola sul setter e leggendo i nodi title) → fix con scrittura immediata + re-set post-flush (macrotask) + guardia auto-riparante 500 ms, stabile a 1,2/3,7 s e attraverso i refresh; parità demo/live verificate ENTRAMBE (demo «37 % · 77 %», live con proxy mockato pattern I51 e chiave finta «50 % · 70 %», zero chiamate reali). Verifica: tsc 0 errori in src/+tests/, lint EXIT=0, bun test **136/136** (986 asserzioni, +21 test), audit esteso **111/111 PASS**, browser console pulita con 5 screenshot; DB intatto: **0 punti demo scritti** in tutta la sessione (route-mock /api/history + /api/events dal primo step, replay `replay-db-b3.mjs`), solo punti api reali del poller utente (lezione I30: commit DB separato) |";

const anchor = "| 2026-10-09 | `src/lib/cycles.ts` (sprecoPerCiclo";
const idx = content.indexOf(anchor);
if (idx < 0) {
  console.error("anchor non trovato");
  process.exit(1);
}
const updated = content.slice(0, idx) + riga + "\n" + content.slice(idx);
writeFileSync(P, updated);
console.log("changelog batch 3 inserito in testa alla tabella §8");
