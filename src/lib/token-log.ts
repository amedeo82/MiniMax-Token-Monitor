/**
 * Registro del consumo token REALE misurato tramite /v1/chat/completions.
 *
 * L'endpoint di quota (token_plan/remains) espone solo percentuali (docs/02 §8):
 * questo registro raccoglie il campo `usage` restituito da ogni chat completion
 * (prompt_tokens, completion_tokens, total_tokens, cached_tokens) e lo persiste
 * in localStorage per costruire statistiche e storico locali.
 *
 * NB: con una Subscription Key ogni chiamata chat CONSUMA la quota del piano
 * (docs/01 §6) — il registro misura quindi esattamente il consumo reale.
 */

import type { Region } from "./minimax";

/** Un singolo invocazione di chat completion con il suo consumo. */
export interface TokenCallRecord {
  id: string;
  /** Momento della risposta (epoch ms). */
  t: number;
  /** Modello richiesto (es. "MiniMax-M3.1-Flash-Preview"). */
  model: string;
  region: Region;
  /** Lunghezza del prompt inviato (caratteri), utile quando usage è assente. */
  promptChars: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** Token di prompt serviti dalla cache (prompt_tokens_details.cached_tokens). */
  cachedTokens: number | null;
  /** Caratteri totali dichiarati (total_characters), se presente. */
  totalCharacters: number | null;
  source: "api" | "demo";
}

const TOKEN_LOG_KEY = "mm-dash-tokenlog-v1";
const TOKEN_LOG_MAX = 500;

function readLog(): TokenCallRecord[] {
  try {
    const raw = localStorage.getItem(TOKEN_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is TokenCallRecord => {
      if (typeof r !== "object" || r === null) return false;
      const rec = r as Partial<TokenCallRecord>;
      return typeof rec.id === "string" && typeof rec.t === "number" && typeof rec.model === "string";
    });
  } catch {
    return [];
  }
}

function writeLog(records: TokenCallRecord[]): void {
  try {
    localStorage.setItem(TOKEN_LOG_KEY, JSON.stringify(records.slice(-TOKEN_LOG_MAX)));
  } catch {
    /* quota localStorage piena: il registro resta solo in memoria */
  }
}

/** Carica il registro (dal più vecchio al più recente). */
export function loadTokenLog(): TokenCallRecord[] {
  if (typeof window === "undefined") return [];
  return readLog();
}

/** Aggiunge un record e restituisce il registro aggiornato. */
export function appendTokenCall(rec: TokenCallRecord): TokenCallRecord[] {
  const next = [...readLog(), rec].slice(-TOKEN_LOG_MAX);
  writeLog(next);
  return next;
}

/** Svuota il registro. */
export function clearTokenLog(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_LOG_KEY);
  } catch {
    /* noop */
  }
}

export interface ModelTotals {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  byModel: ModelTotals[];
}

/** Aggrega il registro: totali complessivi e per modello (ordine per token decrescente). */
export function aggregateTokenLog(records: TokenCallRecord[]): TokenTotals {
  const totals: TokenTotals = {
    calls: records.length,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    byModel: [],
  };

  const perModel = new Map<string, ModelTotals>();
  for (const r of records) {
    totals.promptTokens += r.promptTokens ?? 0;
    totals.completionTokens += r.completionTokens ?? 0;
    totals.totalTokens += r.totalTokens ?? (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    totals.cachedTokens += r.cachedTokens ?? 0;

    const cur = perModel.get(r.model) ?? { model: r.model, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    cur.calls += 1;
    cur.promptTokens += r.promptTokens ?? 0;
    cur.completionTokens += r.completionTokens ?? 0;
    cur.totalTokens += r.totalTokens ?? (r.promptTokens ?? 0) + (r.completionTokens ?? 0);
    perModel.set(r.model, cur);
  }

  totals.byModel = [...perModel.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  return totals;
}
