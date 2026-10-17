import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { preparaSchema } from "@/lib/schema-persistenza";
import { tokenUguale } from "@/lib/api-protezione";
import {
  dettaglioManutenzione,
  eseguiManutenzioneDb,
  politicaRitenutaDaEnv,
  registraEsecuzione,
} from "@/lib/manutenzione-db";

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
 *
 * I117 — REGISTRO DELLE ESECUZIONI (tabella RegistroManutenzione): ogni ciclo
 * — RIUSCITO o FALLITO — lascia una riga nel database con innesco, esito,
 * durata e dettaglio compatto. È la prova DURATURA dell'esecuzione che i log
 * Vercel NON possono dare (retention breve, solo esito HTTP senza contenuto):
 * dopo il run di stanotte si verifica con GET /api/manutenzione (campo
 * «ultimeEsecuzioni») anche a distanza di settimane. La scrittura è
 * BEST-EFFORT (registraEsecuzione non lancia mai): un problema del registro
 * non maschera l'esito reale, che resta nella risposta e in console.log —
 * RIGA COMPATTA ad ogni ciclo (`[manutenzione-cron] …`): nei runtime logs
 * l'esito NON è solo lo status code ma anche i numeri del rapporto.
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
  /* I117 — la durata registrata copre gate + ciclo + registrazione. */
  const avvioCron = Date.now();
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
    const avvio = Date.now();
    const rapporto = await eseguiManutenzioneDb(db, {
      pulizia: puliziaAutomatica(),
      vacuum: "auto",
      politica: politicaRitenutaDaEnv(),
    });
    const durataMs = Date.now() - avvio;
    /* I117 — esito registrato nel database (best-effort) + riga compatta nei
       runtime logs: la verifica non dipende più dalla retention Vercel. */
    const registrazione = await registraEsecuzione(db, {
      innesco: "cron",
      esito: "ok",
      durataMs,
      dettaglio: dettaglioManutenzione(rapporto, { puliziaAutomatica: puliziaAutomatica() }),
    });
    if (!registrazione.registrato) {
      console.error("[manutenzione-cron] registro non aggiornato:", registrazione.errore);
    }
    console.log(
      `[manutenzione-cron] esito=ok durata=${durataMs}ms bytes=${rapporto.misura.bytes} quota=${rapporto.quota.livello} integrita=${rapporto.integrita.eseguito ? (rapporto.integrita.ok ? "ok" : "ko") : "omessa"} eliminati=${rapporto.pulizia?.totale ?? 0} vacuum=${rapporto.vacuum ? (rapporto.vacuum.eseguito ? "eseguito" : "rifiutato") : "omesso"} registro=${registrazione.registrato ? "si" : "no"}`,
    );
    return NextResponse.json({
      ok: true,
      azione: "manutenzione-programmata",
      puliziaAutomatica: puliziaAutomatica(),
      manutenzione: rapporto,
      registro: registrazione,
      generatoIl: rapporto.generatoIl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Manutenzione programmata fallita.";
    const durataMs = Date.now() - avvioCron;
    /* I117 — anche il FALLITO lascia traccia (best-effort: se il DB è rotto
       tanto da rifiutare anche l'INSERT, la riga manca ONESTAMENTE e resta
       il console.error — nessuna mascheratura del 500 originale). */
    try {
      const registrazione = await registraEsecuzione(db, {
        innesco: "cron",
        esito: "fallito",
        durataMs,
        dettaglio: { errore: message.slice(0, 500) },
      });
      console.error(
        `[manutenzione-cron] esito=fallito durata=${durataMs}ms errore=${message} registro=${registrazione.registrato ? "si" : "no"}`,
      );
    } catch {
      console.error(`[manutenzione-cron] esito=fallito durata=${durataMs}ms errore=${message} registro=no`);
    }
    return NextResponse.json(
      { ok: false, error: { code: "db_write", message } },
      { status: 500 },
    );
  }
}
