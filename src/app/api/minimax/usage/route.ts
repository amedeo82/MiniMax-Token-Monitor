import { NextRequest, NextResponse } from "next/server";
import { REGION_ENDPOINTS, Region } from "@/lib/minimax";

export const dynamic = "force-dynamic";

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
 * → 200 { ok: false, status, error, fetchedAt, endpoint }  (errore gestito)
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const res = await fetch(endpoint, {
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
    clearTimeout(timeout);

    const text = await res.text();
    let data: unknown = null;
    let parseError: string | null = null;
    try {
      data = JSON.parse(text);
    } catch {
      parseError = "La risposta non è JSON valido.";
    }

    if (!res.ok) {
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
  } catch (err: unknown) {
    const isAbort = err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
    return NextResponse.json({
      ok: false,
      fetchedAt,
      endpoint,
      error: {
        code: isAbort ? "timeout" : "network",
        message: isAbort
          ? "Timeout: l'API MiniMax non ha risposto entro 12 secondi."
          : `Errore di rete nella connessione a ${endpoint}: ${err instanceof Error ? err.message : "sconosciuto"}`,
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
