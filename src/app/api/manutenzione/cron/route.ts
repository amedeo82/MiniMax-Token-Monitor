import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { preparaSchema } from "@/lib/schema-persistenza";
import { tokenUguale } from "@/lib/api-protezione";
import { eseguiManutenzioneDb, politicaRitenutaDaEnv } from "@/lib/manutenzione-db";

export const dynamic = "force-dynamic";

/**
 * I111 — Cron NOTTURNO della manutenzione database (procedure in docs/10 §5 P1).
 *
 * Vercel Cron (vercel.json §crons, schedula «30 2 * * *» = 02:30 UTC ogni
 * giorno) chiama QUESTA GET con header `Authorization: Bearer <CRON_SECRET>`
 * quando la variabile CRON_SECRET è impostata nell'ambiente del progetto
 * (meccanismo nativo Vercel: docs/10 §5 P1).
 *
 * AUTENTICAZIONE (distinta dalla guardia I95):
 * - CRON_SECRET NON impostata → 403 ONESTO: l'endpoint non può distinguere un
 *   cron legittimo da qualunque visitatore — meglio un cron che fallisce
 *   (visibile nei log Vercel) che un endpoint distruttivo aperto al pubblico;
 * - Bearer assente/sbagliato → 401 (confronto timing-safe, riuso `tokenUguale`
 *   di api-protezione); il token NON viene mai restituito nei messaggi.
 *
 * AZIONE: ciclo completo con pulizia di ritenuta REALE (rete di sicurezza che
 * gira anche quando il traffico cessa — il pruning on-write delle route, invece,
 * pulisce solo quando arrivano nuove scrittura) e VACUUM automatico SOLO se la
 * pulizia ha eliminato righe. Disattivabile con MANUTENZIONE_AUTO_PULIZIA="0"
 * (il cron resta una verifica di salute: misura, integrità, quota).
 *
 * Fallimenti → 500 con il messaggio del motore: mai mascherati (il rapporto
 * della manutenzione degrada onesto, es. VACUUM rifiutato dal server).
 */

/** MANUTENZIONE_AUTO_PULIZIA="0" disarma SOLO la cancellazione, non la verifica. */
function puliziaAutomatica(): boolean {
  return process.env.MANUTENZIONE_AUTO_PULIZIA?.trim() !== "0";
}

/** Estrae il token da «Bearer <token>» (l'unica forma accettata). */
function bearerDi(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

export async function GET(req: NextRequest) {
  const atteso = process.env.CRON_SECRET?.trim();
  if (!atteso) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "cron_non_configurato",
          message:
            "Manutenzione programmata disattivata: imposta CRON_SECRET nell'ambiente (Vercel invia automaticamente l'header Bearer al cron). Procedure: docs/10 §5 P1.",
        },
      },
      { status: 403 },
    );
  }
  const ricevuto = bearerDi(req);
  if (!ricevuto || !tokenUguale(atteso, ricevuto)) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "Bearer CRON_SECRET mancante o errato." } },
      { status: 401 },
    );
  }

  try {
    await preparaSchema(db);
    const rapporto = await eseguiManutenzioneDb(db, {
      pulizia: puliziaAutomatica(),
      vacuum: "auto",
      politica: politicaRitenutaDaEnv(),
    });
    return NextResponse.json({
      ok: true,
      azione: "manutenzione-programmata",
      puliziaAutomatica: puliziaAutomatica(),
      manutenzione: rapporto,
      generatoIl: rapporto.generatoIl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Manutenzione programmata fallita.";
    return NextResponse.json(
      { ok: false, error: { code: "db_write", message } },
      { status: 500 },
    );
  }
}
