/**
 * I72 — Proiezione dell'esaurimento con media esponenzialmente pesata (EWMA).
 *
 * Il verdetto di I23/I31 (`computeTrend` in `history-chart.tsx`) stima il
 * ritmo con una CORDA: (primo − ultimo) / Δt sugli ultimi 60 punti. È
 * stabile ma lento a reagire: un cambio di ritmo avvenuto nell'ultima ora
 * viene diluito su tutta la finestra.
 *
 * L'EWMA è il confronto A/B: i ritmi istantanei tra rilevamenti consecutivi
 * (STESSE regole di validità di `lib/rate.ts`: gap > 30 min scartato,
 * risalita/reset scartato) vengono pesati con
 *
 *     w_i = exp( −(t_ultimo − t_i) / halfLife )
 *
 * dove t_i è il tempo del SECONDO rilevamento della coppia (quando il ritmo
 * è stato misurato). Una mezza vita corta reagisce prima ai cambi di ritmo,
 * al prezzo di più rumore: è esattamente il trade-off che la card A/B
 * rende visibile affiancando i due esaurimenti stimati.
 *
 * Default halfLife = 2h: sulla finestra 5h il tratto più recente pesa circa
 * 1,6× il precedente a 2 ore prima — reattivo ma non nervoso.
 *
 * L'esaurimento è stimato SOLO con ritmo > 0.01 %/h (stessa soglia di
 * `computeTrend`), per non produrre orari assurdi con consumi nulli.
 *
 * ESPERIMENTALE e NON sostitutivo: il verdetto mostrato resta quello
 * lineare; l'EWMA è un secondo parere affiancato (docs/07 §5.5).
 *
 * Funzione pura, opzioni iniettabili per test deterministici.
 */

import type { WindowKey } from "./cycles";

export interface EwmaProjection {
  /** Ritmo stimato EWMA (%/h); null con meno di un ritmo valido o ritmo ≤ 0.01. */
  ritmo: number | null;
  /** Epoch ms dell'esaurimento stimato; null se ritmo nullo o ≤ 0.01. */
  esaurimentoAt: number | null;
  /** Tempo residuo stimato all'esaurimento (ms); null come sopra. */
  esaurimentoMs: number | null;
  /** Numero di ritmi istantanei validi usati. */
  campioni: number;
  /** Mezza vita applicata (ms). */
  halfLifeMs: number;
}

const GAP_MAX_MS = 30 * 60_000;
const HALF_LIFE_DEFAULT_MS = 2 * 3_600_000;
/** Sotto questo ritmo (%/h) l'esaurimento non è stimabile in modo sensato. */
const RITMO_MINIMO = 0.01;

export function ewmaProjection(
  history: { t: number; interval: number; weekly: number }[],
  win: WindowKey,
  opts: { halfLifeMs?: number } = {},
): EwmaProjection {
  const halfLifeMs = opts.halfLifeMs ?? HALF_LIFE_DEFAULT_MS;
  const empty: EwmaProjection = {
    ritmo: null,
    esaurimentoAt: null,
    esaurimentoMs: null,
    campioni: 0,
    halfLifeMs,
  };

  if (history.length < 2) return empty;

  const key = win === "interval" ? "interval" : "weekly";
  const tUltimo = history[history.length - 1].t;
  const vUltimo = history[history.length - 1][key];

  let num = 0;
  let den = 0;
  let campioni = 0;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const dt = curr.t - prev.t;

    // Stesse regole di lib/rate.ts: gap lungo → non è un ritmo misurabile
    if (dt <= 0 || dt > GAP_MAX_MS) continue;
    // Risalita (reset o rumore) → non è consumo. Nota I91: qualunque risalita
    // è già coperta da curr > prev — la vecchia disgiuntiva sul salto ≥
    // RESET_JUMP era irraggiungibile e rimossa.
    if (curr[key] > prev[key]) {
      continue;
    }

    const ore = dt / 3_600_000;
    const ritmoIstantaneo = (prev[key] - curr[key]) / ore;

    // Peso esponenziale: età del ritmo rispetto all'ultimo rilevamento
    const eta = Math.max(0, tUltimo - curr.t);
    const w = Math.exp(-eta / halfLifeMs);

    num += w * ritmoIstantaneo;
    den += w;
    campioni++;
  }

  if (campioni === 0 || den <= 0 || vUltimo <= 0) return { ...empty, campioni };

  const ritmo = num / den;
  if (!(ritmo > RITMO_MINIMO)) return { ...empty, campioni };

  const oreLeft = vUltimo / ritmo;
  return {
    ritmo,
    esaurimentoAt: tUltimo + oreLeft * 3_600_000,
    esaurimentoMs: oreLeft * 3_600_000,
    campioni,
    halfLifeMs,
  };
}
