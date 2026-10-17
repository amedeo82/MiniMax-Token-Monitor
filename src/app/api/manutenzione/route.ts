import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schemaAzioneManutenzione } from "@/lib/api-schemi";
import { bloccoScrittura } from "@/lib/api-protezione";
import { preparaSchema } from "@/lib/schema-persistenza";
import { modalitaPersistenza } from "@/lib/modalita-persistenza";
import {
  dettaglioManutenzione,
  eseguiManutenzioneDb,
  eseguiPuliziaRitenuta,
  eseguiRimozioneDemo,
  eseguiVacuum,
  formattaBytes,
  leggiUltimeEsecuzioni,
  misuraDimensioneDb,
  politicaRitenutaDaEnv,
  registraEsecuzione,
  soglieQuotaDaEnv,
  valutazioneQuotaStorage,
} from "@/lib/manutenzione-db";

export const dynamic = "force-dynamic";

/**
 * I111 — Manutenzione del database di persistenza (anti-rottura + quota
 * free tier Turso, procedure complete in docs/10).
 *
 * GET (SOLO LETTURA, senza chiave — stesso perimetro di /api/persistenza):
 * rapporto di manutenzione completo SENZA alcuna scrittura — misura dello
 * storage (PRAGMA page_count × page_size), statistiche per tabella con
 * velocità delle ultime 24 h, integrità (PRAGMA quick_check, omessa oltre la
 * soglia), valutazione della quota (livello ok/attenzione/critica), proiezione
 * mensile delle scritture e politica di ritenuta attiva (giorni/caps).
 * I117 — include anche «ultimeEsecuzioni»: le ultime righe del registro della
 * manutenzione (cron notturno + azioni manuali) — la prova DURATURA che il
 * cron è realmente passato, indipendente dalla breve retention dei log Vercel.
 *
 * POST (protetto dalla guardia I95: ADMIN_TOKEN + rate limit scritture):
 * { "azione": "pulizia" | "vacuum" | "manutenzione" | "rimuovi-demo", "dryRun"?: boolean }
 * - «pulizia»: DELETE oltre la ritenuta e i cap FIFO (ritorna ciò che elimina
 *   e la quota rivalutata a fine cancellazioni);
 * - «vacuum»: riscrive il file restituendo le pagine libere al servizio
 *   (prima/dopo misurati, byte recuperati dichiarati);
 * - «manutenzione»: ciclo completo — misura, integrità, quota, pulizia e
 *   VACUUM automatico SOLO se la pulizia ha eliminato righe;
 * - I122 «rimuovi-demo»: DELETE selettivo dei SOLI punti source="demo" (i
 *   rilevamenti demo replicati generano falsi reset nelle analisi) con BACKUP
 *   delle righe nella risposta; con "dryRun": true conta e mostra le righe
 *   SENZA cancellare (verifica pre-volo).
 *
 * I107-fix4 — ogni handler attende il gate `preparaSchema(db)` PRIMA di
 * toccare il DB: nessuna misura o scrittura parte a schema incompleto.
 *
 * Nessun segreto attraversa mai la risposta: il rapporto contiene conteggi,
 * byte ed esiti del motore — MAI URL, token o variabili d'ambiente (della
 * configurazione compaiono solo i NUMERI della politica attiva).
 *
 * La variante AUTOMATICA è il cron notturno: /api/manutenzione/cron (GET con
 * Bearer CRON_SECRET, configurato in vercel.json §crons).
 */

export async function GET() {
  try {
    await preparaSchema(db);
    // vacuum "mai" + nessuna pulizia: il GET NON scrive nulla sul database.
    const rapporto = await eseguiManutenzioneDb(db, { vacuum: "mai" });
    /* I117 — lettura del registro (SOLO SELECT, resta read-only): le ultime
       esecuzioni della manutenzione, la più recente prima. */
    const ultimeEsecuzioni = await leggiUltimeEsecuzioni(db);
    return NextResponse.json({
      ok: true,
      modalita: modalitaPersistenza(),
      manutenzione: rapporto,
      ultimeEsecuzioni,
      generatoIl: rapporto.generatoIl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Manutenzione non disponibile.";
    return NextResponse.json(
      { ok: false, error: { code: "db_read", message } },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  /* I95 — hardening: guard ADMIN_TOKEN (default spenta) + rate limit scritture.
     Qui la guardia conta DOPPIO: le azioni cancellano righe di archivio. */
  const blocco = bloccoScrittura(req);
  if (blocco) return blocco;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: "Il corpo della richiesta non è JSON valido." } },
      { status: 400 },
    );
  }

  const parsed = schemaAzioneManutenzione.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "bad_request",
          message:
            'Azione non valida: serve { "azione": "pulizia" | "vacuum" | "manutenzione" | "rimuovi-demo" }.',
        },
      },
      { status: 400 },
    );
  }
  const { azione } = parsed.data;
  /* I117 — la durata registrata per l'azione «manutenzione» copre gate + ciclo. */
  const avvioAzione = Date.now();

  try {
    await preparaSchema(db);
    if (azione === "pulizia") {
      const pulizia = await eseguiPuliziaRitenuta(db, politicaRitenutaDaEnv());
      // Quota rivalutata DOPO le cancellazioni: il rapporto mostra l'effetto.
      const quota = valutazioneQuotaStorage((await misuraDimensioneDb(db)).bytes, soglieQuotaDaEnv());
      return NextResponse.json({
        ok: true,
        azione,
        pulizia,
        quota,
        generatoIl: new Date().toISOString(),
      });
    }
    if (azione === "vacuum") {
      const prima = (await misuraDimensioneDb(db)).bytes;
      const vacuum = await eseguiVacuum(db);
      const dopo = (await misuraDimensioneDb(db)).bytes;
      return NextResponse.json({
        ok: true,
        azione,
        vacuum,
        bytesPrima: prima,
        bytesDopo: dopo,
        recuperati: vacuum.eseguito ? Math.max(0, prima - dopo) : 0,
        riepilogo: vacuum.eseguito
          ? `VACUUM eseguito: ${formattaBytes(prima)} → ${formattaBytes(dopo)}`
          : `VACUUM non eseguito: ${vacuum.errore ?? "motivo non noto"}`,
        generatoIl: new Date().toISOString(),
      });
    }
    if (azione === "rimuovi-demo") {
      /* I122 — backup PRIMA del DELETE dentro eseguiRimozioneDemo: la risposta
         contiene le righe da conservare (il recupero è rincollare il JSON). */
      const rimozione = await eseguiRimozioneDemo(db, { dryRun: parsed.data.dryRun === true });
      return NextResponse.json({
        ok: true,
        azione,
        rimozione,
        generatoIl: new Date().toISOString(),
      });
    }
    // azione === "manutenzione": ciclo completo (pulizia reale + VACUUM auto).
    const rapporto = await eseguiManutenzioneDb(db, { pulizia: true, vacuum: "auto" });
    /* I117 — anche il ciclo MANUALE entra nel registro (innesco "post"):
       la storia del registro distingue le esecuzioni programmate da quelle
       dell'operatore. Le azioni parziali (pulizia/vacuum) NON si registrano:
       sono interattive e direttamente visibili al chiamante. */
    const durataMs = Date.now() - avvioAzione;
    const registrazione = await registraEsecuzione(db, {
      innesco: "post",
      esito: "ok",
      durataMs,
      dettaglio: dettaglioManutenzione(rapporto),
    });
    if (!registrazione.registrato) {
      console.error("[manutenzione] registro non aggiornato:", registrazione.errore);
    }
    return NextResponse.json({
      ok: true,
      azione,
      manutenzione: rapporto,
      registro: registrazione,
      generatoIl: rapporto.generatoIl,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore di manutenzione sul database.";
    return NextResponse.json(
      { ok: false, error: { code: "db_write", message } },
      { status: 500 },
    );
  }
}
