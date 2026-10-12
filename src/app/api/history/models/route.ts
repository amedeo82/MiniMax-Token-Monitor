import { NextRequest, NextResponse } from "next/server";
import {
  countModelPoints,
  deleteModelPoints,
  findModelPoints,
  pruneModelHistory,
  upsertModelPoint,
} from "@/lib/server-model-history";

export const dynamic = "force-dynamic";

/**
 * I82 — Persistenza server-side dello storico quota PER-MODELLO (tabella
 * `ModelUsagePoint`, accesso tramite la lib I42 `server-model-history.ts`,
 * SQL raw parametrizzato). Stesso contratto offline-first di /api/history
 * (I16): il browser replica qui i punti nuovi (fire-and-forget) e all'avvio
 * riscarica l'archivio fondendolo con il buffer locale. La chiave API NON
 * viene mai salvata: solo timestamp, nomi modello e percentuali residue.
 *
 * POST   { points: [{ t, model, interval, weekly, source, region }] }
 *        → per ogni punto UNA riga per finestra non null (upsert su model+win+t) + pruning
 * GET    ?model=video&win=interval&since=<epoch ms>&limit=4000  → righe LONG ordinate per t
 * DELETE ?model=video (assente = TUTTI i modelli)               → svuota
 */

const MODEL_HISTORY_MAX = 10_000;
const GET_LIMIT_MAX = 10_000;
/** Limite difensivo sulla lunghezza del nome modello. */
const MODEL_NAME_MAX = 32;

interface IncomingModelPoint {
  t?: unknown;
  model?: unknown;
  interval?: unknown;
  weekly?: unknown;
  source?: unknown;
  region?: unknown;
}

function toFloat(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return Math.max(0, Math.min(100, v));
  if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) {
    return Math.max(0, Math.min(100, Number(v)));
  }
  return null;
}

function toEpoch(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!isFinite(n)) return null;
  if (n > 1_000_000_000_000) return n; // ms
  if (n > 1_000_000_000) return n * 1000; // s
  return null;
}

function toModelName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim().slice(0, MODEL_NAME_MAX);
  return name.length > 0 ? name : null;
}

export async function POST(req: NextRequest) {
  let body: { points?: IncomingModelPoint[] };
  try {
    body = (await req.json()) as { points?: IncomingModelPoint[] };
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const points = Array.isArray(body.points) ? body.points.slice(0, 500) : [];
  if (points.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Nessun punto valido nell'array points." } },
      { status: 400 },
    );
  }

  try {
    let stored = 0;
    for (const p of points) {
      const t = toEpoch(p.t);
      const model = toModelName(p.model);
      if (t === null || model === null) continue;
      const source = typeof p.source === "string" && p.source ? p.source.slice(0, 16) : "api";
      const region = p.region === "cn" ? "cn" : "eu";
      // Formato LONG: una riga per finestra non null (upsert dedup su model+win+t).
      const interval = toFloat(p.interval);
      if (interval !== null) {
        await upsertModelPoint({ model, win: "interval", t, percent: interval, source, region });
      }
      const weekly = toFloat(p.weekly);
      if (weekly !== null) {
        await upsertModelPoint({ model, win: "weekly", t, percent: weekly, source, region });
      }
      stored += 1;
    }

    await pruneModelHistory(MODEL_HISTORY_MAX);
    const total = await countModelPoints();
    return NextResponse.json({ ok: true, stored, total });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di scrittura sul database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_write", message } },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "4000");
  const limit = isFinite(limitRaw) ? Math.max(1, Math.min(GET_LIMIT_MAX, Math.floor(limitRaw))) : 4000;
  const modelRaw = url.searchParams.get("model") ?? undefined;
  const winRaw = url.searchParams.get("win");
  const win = winRaw === "interval" || winRaw === "weekly" ? winRaw : undefined;
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw !== null ? toEpoch(sinceRaw) ?? undefined : undefined;

  try {
    const rows = await findModelPoints({ model: modelRaw ?? undefined, win, since, limit });
    const total = await countModelPoints();
    return NextResponse.json({ ok: true, total, points: rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di lettura dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_read", message } },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const modelRaw = url.searchParams.get("model") ?? undefined;
  try {
    const deleted = await deleteModelPoints(modelRaw ?? undefined);
    return NextResponse.json({ ok: true, deleted: Number(deleted) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di cancellazione dal database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_delete", message } },
      { status: 500 },
    );
  }
}
