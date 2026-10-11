/**
 * I62 — Salute del monitor: analisi degli episodi di errore del registro.
 *
 * Un «episodio» è una raffica di errori consecutivi (a meno di
 * `episodeGapMs`, default 15 min): gli errori dello stesso guasto non devono
 * contare come N problemi diversi — il backoff (I51) infatti li dilata, e la
 * pagina genera un evento solo sulla transizione ok → errore.
 *
 * La finestra considerata sono le ultime 7 giorni (Europe/Rome, iniettabile
 * per i test). Funzione pura sugli eventi del registro (`kind: "error"`).
 */

import type { UsageEvent } from "./usage-events";

/** Un episodio di errore raggruppato (I62). */
export interface EpisodioErrore {
  /** Epoch ms del primo errore dell'episodio. */
  inizio: number;
  /** Epoch ms dell'ultimo errore dell'episodio. */
  fine: number;
  /** Errori nell'episodio. */
  conteggio: number;
  /** Ultimo messaggio registrato nell'episodio. */
  ultimoMessaggio: string;
}

/** Stato di salute del monitor (I62). */
export interface SaluteMonitor {
  /** Episodi nelle ultime 7 giorni, dal più recente. */
  episodi: EpisodioErrore[];
  /** Numero totale di episodi. */
  totale: number;
  /** Ultimo errore registrato (epoch ms + messaggio) o null. */
  ultimoErrore: { t: number; message: string } | null;
  /** Messaggio d'errore più ricorrente (con conteggio) o null. */
  piuFrequente: { message: string; conteggio: number } | null;
}

const EPISODE_GAP_DEFAULT_MS = 15 * 60_000;
const WINDOW_DEFAULT_MS = 7 * 86_400_000;

export function saluteMonitor(
  events: UsageEvent[],
  opts: { now?: number; windowMs?: number; episodeGapMs?: number } = {},
): SaluteMonitor {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? WINDOW_DEFAULT_MS;
  const gapMs = opts.episodeGapMs ?? EPISODE_GAP_DEFAULT_MS;

  const errori = events
    .filter((e) => e.kind === "error")
    .filter((e) => e.t <= now && now - e.t <= windowMs)
    .sort((a, b) => a.t - b.t);

  const episodi: EpisodioErrore[] = [];
  for (const e of errori) {
    const last = episodi[episodi.length - 1];
    if (last && e.t - last.fine <= gapMs) {
      last.fine = e.t;
      last.conteggio += 1;
      last.ultimoMessaggio = e.message;
    } else {
      episodi.push({ inizio: e.t, fine: e.t, conteggio: 1, ultimoMessaggio: e.message });
    }
  }
  episodi.reverse(); // più recente prima

  const ultimo = errori.length > 0 ? errori[errori.length - 1] : null;

  // Messaggio più ricorrente (normalizzato: senza timestamp, il messaggio
  // d'errore tipico contiene solo il motivo del guasto)
  const conteggi = new Map<string, number>();
  for (const e of errori) conteggi.set(e.message, (conteggi.get(e.message) ?? 0) + 1);
  let piuFrequente: SaluteMonitor["piuFrequente"] = null;
  for (const [message, conteggio] of conteggi) {
    if (!piuFrequente || conteggio > piuFrequente.conteggio) {
      piuFrequente = { message, conteggio };
    }
  }

  return {
    episodi,
    totale: episodi.length,
    ultimoErrore: ultimo ? { t: ultimo.t, message: ultimo.message } : null,
    piuFrequente,
  };
}
