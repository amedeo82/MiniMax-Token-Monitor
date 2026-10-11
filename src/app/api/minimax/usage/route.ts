import { NextRequest, NextResponse } from "next/server";
import { REGION_ENDPOINTS, Region } from "@/lib/minimax";
import { parseRetryAfterMs } from "@/lib/backoff";

export const dynamic = "force-dynamic";

/**
 * I51 — Errori transitori dell'upstream su cui il proxy ritenta PRIMA di
 * restituire l'errore al client: rate-limit (429) e guasti tipici di server
 * o rete (5xx, timeout, network). Gli errori permanenti (401/403, JSON
 * malformato) NON vengono ritentati: rispondere subito è più utile.
 */
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const PROXY_RETRY_MAX = 2; // 1 tentativo + 2 ritenti
const PROXY_RETRY_BASE_MS = 400; // 400ms, 800ms (senza jitter: pausa corta fissa)
/** Retry-After default quando l'upstream non lo dichiara (prudente, mai invasivo). */
const RETRY_AFTER_DEFAULT_429_MS = 30_000;
const RETRY_AFTER_DEFAULT_OTHER_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Proxy server-side verso l'endpoint MiniMax Token Plan `/v1/token_plan/remains`.
 *
 * Perché un proxy?
 * 1. La chiamata dal browser causerebbe problemi di CORS.
 * 2. La Subscription Key resta lato client (memorizzata solo in localStorage)
 *    ma non finisce nei log di rete di terze parti né nelle URL referer.
 *
 * POST { apiKey: string, region?: "eu" | "cn" }
 * → 200 { ok: true, status, data, fetchedAt, endpoint }
 * → 200 { ok: false, status, error, fetchedAt, endpoint }  (errore gestito;
 *      gli errori transitori esauriti i ritenti includono retryAfterMs e
 *      transient: true perché il client scheduler (I51) respetti il floor)
 * → 4xx { ok: false, error } (richiesta malformata)
 */
export async function POST(req: NextRequest) {
  let body: { apiKey?: string; region?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const region: Region = body.region === "cn" ? "cn" : "eu";
  const endpoint = REGION_ENDPOINTS[region];
  const fetchedAt = Date.now();

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_key", message: "Chiave API mancante." } },
      { status: 400 },
    );
  }

  try {
    /* I51 — ciclo con ritenti transitori: 1 tentativo + fino a 2 ritenti
       (pausa 400/800ms) SOLO per errori transitori; ogni tentativo ha il
       proprio timeout di 12s. */
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "MiniMax-Usage-Dashboard/1.0",
          },
          signal: controller.signal,
          cache: "no-store",
        });
      } catch (err: unknown) {
        clearTimeout(timeout);
        const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
        if (attempt < PROXY_RETRY_MAX) {
          await sleep(PROXY_RETRY_BASE_MS * 2 ** attempt);
          continue;
        }
        return NextResponse.json({
          ok: false,
          fetchedAt,
          endpoint,
          error: {
            code: isAbort ? "timeout" : "network",
            message: isAbort
              ? "Timeout: l'API MiniMax non ha risposto entro 12 secondi (dopo 3 tentativi)."
              : `Errore di rete nella connessione a ${endpoint}: ${err instanceof Error ? err.message : "sconosciuto"}`,
            retryAfterMs: RETRY_AFTER_DEFAULT_OTHER_MS,
            transient: true,
          },
        });
      }
      clearTimeout(timeout);

      const text = await res.text();
      let data: unknown = null;
      let parseError: string | null = null;
      try {
        data = JSON.parse(text);
      } catch {
        parseError = "La risposta non è JSON valido.";
      }

      if (TRANSIENT_HTTP.has(res.status) && attempt < PROXY_RETRY_MAX) {
        await sleep(PROXY_RETRY_BASE_MS * 2 ** attempt);
        continue;
      }

      if (!res.ok) {
        const transient = TRANSIENT_HTTP.has(res.status);
        return NextResponse.json({
          ok: false,
          status: res.status,
          fetchedAt,
          endpoint,
          error: {
            code: res.status === 401 || res.status === 403 ? "unauthorized" : "http_error",
            message:
              res.status === 401 || res.status === 403
                ? `Autenticazione rifiutata (HTTP ${res.status}). Controlla la Subscription Key: deve essere la chiave del Token Plan, non una chiave pay-as-you-go.`
                : `Errore HTTP ${res.status} dall'API MiniMax${parseError ? "" : ":"} ${parseError ?? estraiMessaggio(data)}`,
            httpStatus: res.status,
            ...(transient
              ? {
                  transient: true,
                  retryAfterMs:
                    parseRetryAfterMs(res.headers.get("retry-after")) ??
                    (res.status === 429 ? RETRY_AFTER_DEFAULT_429_MS : RETRY_AFTER_DEFAULT_OTHER_MS),
                }
              : {}),
          },
        });
      }

      if (parseError || data === null) {
        return NextResponse.json({
          ok: false,
          status: res.status,
          fetchedAt,
          endpoint,
          error: { code: "bad_json", message: "Risposta dell'API non interpretabile come JSON.", httpStatus: res.status },
        });
      }

      return NextResponse.json({
        ok: true,
        status: res.status,
        data,
        fetchedAt,
        endpoint,
      });
    }
  } catch (err: unknown) {
    /* Rete/infrastruttura fuori dal ciclo di ritenti (es. body read fallita):
       trattata come transitoria, con floor Retry-After per lo scheduler I51. */
    return NextResponse.json({
      ok: false,
      fetchedAt,
      endpoint,
      error: {
        code: "network",
        message: `Errore di rete nella connessione a ${endpoint}: ${err instanceof Error ? err.message : "sconosciuto"}`,
        retryAfterMs: RETRY_AFTER_DEFAULT_OTHER_MS,
        transient: true,
      },
    });
  }
}

function estraiMessaggio(data: unknown): string {
  if (data && typeof data === "object" && "base_resp" in (data as Record<string, unknown>)) {
    const base = (data as Record<string, unknown>)["base_resp"];
    if (base && typeof base === "object" && "status_msg" in (base as Record<string, unknown>)) {
      const msg = (base as Record<string, unknown>)["status_msg"];
      if (typeof msg === "string") return msg;
    }
  }
  return "";
}
