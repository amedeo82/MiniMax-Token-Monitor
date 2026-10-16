import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toEpoch } from "@/lib/http-validate";
import { schemaCorpoPunti, schemaPuntoModello } from "@/lib/api-schemi";
import { bloccoScrittura } from "@/lib/api-protezione";
import { preparaSchema } from "@/lib/schema-persistenza";
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
 *
 * I107-fix4 — ogni handler attende il gate `preparaSchema(db)` PRIMA di
 * toccare il DB (bootstrap DDL fire-and-forget della factory + istanze
 * serverless fredde = 500 «table does not exist» anche sull'SQL raw della
 * lib I42; probe verifica-i107-fix4-gate.mjs 0/8 senza gate, 8/8 col gate).
 * Il gate è condiviso (cache WeakMap): dopo il primo avvio è un no-op.
 */

const MODEL_HISTORY_MAX = 10_000;
const GET_LIMIT_MAX = 10_000;

export async function POST(req: NextRequest) {
  /* I95 — hardening: guard ADMIN_TOKEN (default spenta) + rate limit scritture. */
  const blocco = bloccoScrittura(req);
  if (blocco) return blocco;

  /* I103 — validazione del body con zod (lib/api-schemi.ts): cap batch 500 e
     normalizzazione (t/model/finestre/source/region) negli schemi; contratto
     esterno invariato (test I99). */
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const parsedCorpo = schemaCorpoPunti.safeParse(body);
  const points = parsedCorpo.success ? parsedCorpo.data : [];
  if (points.length === 0) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Nessun punto valido nell'array points." } },
      { status: 400 },
    );
  }

  try {
    // I107-fix4 — gate del bootstrap: nessuna scrittura parte a schema
    // incompleto (l'attesa è condivisa: dopo il primo avvio è immediata).
    await preparaSchema(db);
    let stored = 0;
    for (const p of points) {
      /* I103 — riga normalizzata dallo schema: t/model null → scartata. */
      const parsed = schemaPuntoModello.safeParse(p);
      if (!parsed.success) continue;
      const { t, model, interval, weekly, source, region } = parsed.data;
      if (t === null || model === null) continue;
      // Formato LONG: una riga per finestra non null (upsert dedup su model+win+t).
      if (interval !== null) {
        await upsertModelPoint({ model, win: "interval", t, percent: interval, source, region });
      }
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
    // I107-fix4 — gate del bootstrap: la lettura non corre col DDL in volo.
    await preparaSchema(db);
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
  /* I95 — hardening: guard ADMIN_TOKEN (default spenta) + rate limit scritture. */
  const blocco = bloccoScrittura(req);
  if (blocco) return blocco;

  const url = new URL(req.url);
  const modelRaw = url.searchParams.get("model") ?? undefined;
  try {
    // I107-fix4 — gate del bootstrap anche per la cancellazione d'archivio.
    await preparaSchema(db);
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
