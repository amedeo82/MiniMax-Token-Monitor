/**
 * I95 — Hardening delle API pubbliche: guard ADMIN_TOKEN + rate limiting
 * in-memory per-IP sulle SCRITTURE (POST/DELETE degli archivi, POST proxy).
 *
 * Contratto documentato (docs/08 I95):
 * - `ADMIN_TOKEN` NON impostato (default) → scritture aperte: l'uso locale e
 *   le verifiche esistenti non cambiano nulla;
 * - `ADMIN_TOKEN` impostato → le scritture richiedono l'header
 *   `x-admin-token` (confronto timing-safe via SHA-256), altrimenti 401;
 * - rate limit: budget di scritture per IP per minuto (deterrente base,
 *   120/minuto default, configurabile con `RATE_LIMIT_WRITES_PER_MINUTO`),
 *   superato il budget → 429 con Retry-After. LIMITE DOCUMENTATO: lo stato è
 *   in-memory PER ISTANZA — su serverless ogni istanza ha il suo contatore
 *   (è un deterrente, non una policy di sicurezza rigorosa);
 * - `/api/summary` resta pubblica per design (I80: solo letture aggregate);
 * - il rate limit si applica anche senza ADMIN_TOKEN (deterrente sempre attivo).
 *
 * L'IP deduce da `x-forwarded-for` (Vercel/proxy), fallback «locale».
 */

import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";

const FINESTRA_MS = 60_000;
const LIMITE_DEFAULT = 120;

/** Tentativi di scrittura per IP (epoch ms dentro la finestra). Stato di processo. */
const tentativi = new Map<string, number[]>();

/** Ripristina lo stato (test). */
export function ripulisciProtezione(): void {
  tentativi.clear();
}

function ipDi(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0].trim() : "locale";
}

/** Confronto timing-safe di due stringhe (normalizzate con SHA-256 alla stessa lunghezza). */
export function tokenUguale(atteso: string, ricevuto: string): boolean {
  const hashA = createHash("sha256").update(atteso).digest();
  const hashB = createHash("sha256").update(ricevuto).digest();
  return timingSafeEqual(hashA, hashB);
}

/** I95 — la guardia ADMIN_TOKEN è ATTIVA solo se l'env è impostata (default: no). */
export function adminRichiesto(): boolean {
  return typeof process.env.ADMIN_TOKEN === "string" && process.env.ADMIN_TOKEN !== "";
}

/** True se la richiesta può scrivere: guard spenta, oppure header corretto. */
export function adminAutorizzato(req: Request): boolean {
  const atteso = process.env.ADMIN_TOKEN;
  if (!atteso) return true;
  const ricevuto = req.headers.get("x-admin-token");
  return typeof ricevuto === "string" && tokenUguale(atteso, ricevuto);
}

/** Budget scritture/minuto per IP (env configurabile, default 120). */
function limiteScritture(): number {
  const n = Number(process.env.RATE_LIMIT_WRITES_PER_MINUTO);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : LIMITE_DEFAULT;
}

/** True se la richiesta entra nel budget per-IP (registra il tentativo). */
export function sottoLimiteScritture(req: Request, ora: number = Date.now()): boolean {
  const ip = ipDi(req);
  const vive = (tentativi.get(ip) ?? []).filter((t) => ora - t < FINESTRA_MS);
  if (vive.length >= limiteScritture()) {
    tentativi.set(ip, vive);
    return false;
  }
  vive.push(ora);
  tentativi.set(ip, vive);
  return true;
}

/**
 * Guardia composta per le route di SCRITTURA: `null` = procedi;
 * Response = blocca (401 guard attiva e header assente/sbagliato, 429 budget esaurito).
 */
export function bloccoScrittura(req: Request, ora: number = Date.now()): Response | null {
  if (!adminAutorizzato(req)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthorized",
          message: "Scrittura protetta: serve l'header x-admin-token (ADMIN_TOKEN è impostato su questo server).",
        },
      },
      { status: 401 },
    );
  }
  if (!sottoLimiteScritture(req, ora)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "rate_limited",
          message: "Troppe richieste di scrittura da questo indirizzo: riprova più tardi.",
          retryAfterMs: FINESTRA_MS,
          transient: true,
        },
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(FINESTRA_MS / 1000)) } },
    );
  }
  return null;
}
