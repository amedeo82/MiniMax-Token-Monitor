import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Proxy server-side verso MiniMax Chat Completions (OpenAI-compatible).
 *
 * Scopo: catturare il campo `usage` di ogni risposta (prompt_tokens,
 * completion_tokens, total_tokens, total_characters, cached_tokens) per il
 * contatore di consumo token reale — l'endpoint di quota espone solo percentuali.
 *
 * NOTA: con una Subscription Key la chiamata CONSUMA la quota del Token Plan
 * secondo il prezzo pay-as-you-go dell'endpoint (docs/01 §6); con una API Key
 * standard consuma il saldo pay-as-you-go.
 *
 * POST { apiKey: string, region?: "eu"|"cn", model: string, prompt: string, maxTokens?: number }
 * → 200 { ok: true, status, fetchedAt, endpoint, model, content, reasoning?, usage }
 * → 200 { ok: false, status?, fetchedAt, endpoint, error }
 * → 4xx { ok: false, error } (richiesta malformata)
 */

const CHAT_ENDPOINTS: Record<"eu" | "cn", string> = {
  eu: "https://api.minimax.io/v1/chat/completions",
  cn: "https://api.minimaxi.com/v1/chat/completions",
};

/** Estrae il testo da message.content (stringa o array di parti multimodali). */
function estraiContenuto(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in (part as Record<string, unknown>)
          ? String((part as Record<string, unknown>)["text"] ?? "")
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function estraiMessaggioErrore(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;

  // stile base_resp (MiniMax)
  if (rec["base_resp"] && typeof rec["base_resp"] === "object") {
    const base = rec["base_resp"] as Record<string, unknown>;
    const msg = typeof base["status_msg"] === "string" ? base["status_msg"] : null;
    const code = typeof base["status_code"] === "number" ? base["status_code"] : null;
    if (msg || code !== null) return `${code !== null ? `status_code ${code}` : "errore API"}${msg ? `: ${msg}` : ""}`;
  }
  // stile OpenAI
  if (rec["error"] && typeof rec["error"] === "object") {
    const err = rec["error"] as Record<string, unknown>;
    if (typeof err["message"] === "string") return err["message"];
  }
  if (typeof rec["message"] === "string") return rec["message"];
  return null;
}

export async function POST(req: NextRequest) {
  let body: {
    apiKey?: string;
    region?: string;
    model?: string;
    prompt?: string;
    maxTokens?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Il corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const region: "eu" | "cn" = body.region === "cn" ? "cn" : "eu";
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const maxTokens =
    typeof body.maxTokens === "number" && body.maxTokens > 0 ? Math.min(8192, Math.floor(body.maxTokens)) : undefined;
  const endpoint = CHAT_ENDPOINTS[region];
  const fetchedAt = Date.now();

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_key", message: "Chiave API mancante." } },
      { status: 400 },
    );
  }
  if (!model) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_model", message: "Modello mancante (es. MiniMax-M3.1-Flash-Preview)." } },
      { status: 400 },
    );
  }
  if (!prompt.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "missing_prompt", message: "Prompt vuoto." } },
      { status: 400 },
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    };
    if (maxTokens) payload["max_tokens"] = maxTokens;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "MiniMax-Usage-Dashboard/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    const text = await res.text();
    let data: unknown = null;
    let parseError = false;
    try {
      data = JSON.parse(text);
    } catch {
      parseError = true;
    }

    if (!res.ok || parseError) {
      const dettaglio = estraiMessaggioErrore(data) ?? (parseError ? "risposta non interpretabile come JSON" : null);
      return NextResponse.json({
        ok: false,
        status: res.status,
        fetchedAt,
        endpoint,
        error: {
          code: res.status === 401 || res.status === 403 ? "unauthorized" : parseError ? "bad_json" : "http_error",
          message:
            res.status === 401 || res.status === 403
              ? `Autenticazione rifiutata (HTTP ${res.status}). Verifica la chiave e la regione selezionata.`
              : `Errore HTTP ${res.status} da Chat Completions${dettaglio ? ` — ${dettaglio}` : ""}`,
        },
      });
    }

    const rec = (data ?? {}) as Record<string, unknown>;
    const choices = Array.isArray(rec["choices"]) ? (rec["choices"] as Record<string, unknown>[]) : [];
    const message =
      choices.length > 0 && typeof choices[0]["message"] === "object"
        ? (choices[0]["message"] as Record<string, unknown>)
        : undefined;
    const content = message ? estraiContenuto(message["content"]) : "";
    const reasoning = message && typeof message["reasoning_content"] === "string" ? message["reasoning_content"] : null;

    const usageRaw =
      rec["usage"] && typeof rec["usage"] === "object" ? (rec["usage"] as Record<string, unknown>) : undefined;
    const promptDetails =
      usageRaw && usageRaw["prompt_tokens_details"] && typeof usageRaw["prompt_tokens_details"] === "object"
        ? (usageRaw["prompt_tokens_details"] as Record<string, unknown>)
        : undefined;

    const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

    const usage = usageRaw
      ? {
          promptTokens: num(usageRaw["prompt_tokens"]),
          completionTokens: num(usageRaw["completion_tokens"]),
          totalTokens: num(usageRaw["total_tokens"]),
          totalCharacters: num(usageRaw["total_characters"]),
          cachedTokens: promptDetails ? num(promptDetails["cached_tokens"]) : null,
        }
      : null;

    if (!usage) {
      return NextResponse.json({
        ok: false,
        status: res.status,
        fetchedAt,
        endpoint,
        error: {
          code: "no_usage",
          message: "Risposta ricevuta ma senza campo usage: impossibile misurare il consumo di questa chiamata.",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      status: res.status,
      fetchedAt,
      endpoint,
      model: typeof rec["model"] === "string" ? rec["model"] : model,
      content,
      reasoning,
      usage,
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
          ? "Timeout: Chat Completions non ha risposto entro 90 secondi."
          : `Errore di rete nella connessione a ${endpoint}: ${err instanceof Error ? err.message : "sconosciuto"}`,
      },
    });
  }
}
