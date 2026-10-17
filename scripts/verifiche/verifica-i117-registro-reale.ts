/**
 * I117 — Verifica END-TO-END del registro delle esecuzioni della manutenzione
 * su MOTORE REALE, in PROCESSO FIGLIO (stesso pattern I107-fix3/I111: nessun
 * mock, nessun bun.test — "@prisma/client" qui è sempre quello REALE; lezione
 * CI run #22/#23: bun «latest» in CI chiave i mock diversamente dal locale).
 *
 * Scenario (file SQLite temporaneo, zero credenziali):
 * 1. preparaSchema su file vuoto → la 5ª tabella RegistroManutenzione esiste;
 * 2. registraEsecuzione × 3 (cron ok, post ok, cron fallito) →
 *    leggiUltimeEsecuzioni restituisce 3 righe coi campi giusti (ordine id
 *    DESC, dettaglio JSON parsato, durataMs null conservato);
 * 3. cap FIFO REALE: si portano le righe oltre REGISTRO_CAP (+2) → la scrittura
 *    successiva elimina il surplus: restano ESATTAMENTE REGISTRO_CAP righe,
 *    le PIÙ RECENTI (le prime di prova sono state eliminate dal FIFO);
 * 4. i tipi del motore reale non sorprendono la mappa (id numerico, testo ISO).
 *
 * Esito: «I117-REGISTRO-REALE: PASS» + exit 0, altrimenti FAIL + exit 1
 * (il test padre riporta l'output: dice SEMPRE perché).
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

import { leggiUltimeEsecuzioni, REGISTRO_CAP, registraEsecuzione } from "../../src/lib/manutenzione-db";
import { preparaSchema } from "../../src/lib/schema-persistenza";

const DIR = join(tmpdir(), "i117-registro-reale");
let client: PrismaClient | undefined;

try {
  rmSync(DIR, { recursive: true, force: true });
  // Come nella probe I107-fix3: la directory padre va creata ESPlicitamente
  // (qui il test bypassa la factory; SQLite non crea le cartelle).
  mkdirSync(DIR, { recursive: true });
  // I115 — prisma 7: adapter obbligatorio anche sul file: locale.
  client = new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${join(DIR, "prova.db")}` }) });

  const verifica = (condizione: boolean, messaggio: string): void => {
    if (!condizione) throw new Error(`verifica non soddisfatta: ${messaggio}`);
  };

  await preparaSchema(client);

  /* 1) Tre esecuzioni distinte: cron ok, post ok, cron fallito. */
  verifica(
    (
      await registraEsecuzione(client, {
        innesco: "cron",
        esito: "ok",
        durataMs: 15,
        dettaglio: { bytes: 4096, quota: "ok", puliziaAutomatica: true },
        ora: Date.UTC(2026, 9, 15, 2, 30),
      })
    ).registrato,
    "registrazione cron ok",
  );
  verifica(
    (
      await registraEsecuzione(client, {
        innesco: "post",
        esito: "ok",
        durataMs: 20,
        dettaglio: { bytes: 8192, quota: "ok" },
        ora: Date.UTC(2026, 9, 16, 10, 0),
      })
    ).registrato,
    "registrazione post ok",
  );
  verifica(
    (
      await registraEsecuzione(client, {
        innesco: "cron",
        esito: "fallito",
        dettaglio: { errore: "prova: VACUUM rifiutato" },
        ora: Date.UTC(2026, 9, 17, 2, 30),
      })
    ).registrato,
    "registrazione cron fallito",
  );

  /* 2) Roundtrip: 3 righe, ordine id DESC, campi e JSON come scritti. */
  const ultime = await leggiUltimeEsecuzioni(client);
  verifica(ultime.length === 3, `leggi restituisce 3 righe (trovate ${ultime.length})`);
  verifica(ultime[0]?.innesco === "cron" && ultime[0]?.esito === "fallito", "la più recente è il cron FALLITO (id DESC)");
  verifica(ultime[0]?.durataMs === null, "durataMs null conservato come null (non 0)");
  verifica(ultime[0]?.dettaglio["errore"] === "prova: VACUUM rifiutato", "dettaglio del fallito parsato");
  verifica(ultime[1]?.innesco === "post", "seconda riga = post");
  verifica(ultime[1]?.durataMs === 20, "durata reale conservata");
  verifica(ultime[2]?.dettaglio["bytes"] === 4096 && ultime[2]?.dettaglio["puliziaAutomatica"] === true, "dettaglio JSON parsato (cron ok)");
  verifica(ultime[2]?.t === "2026-10-15T02:30:00.000Z", `t in ISO com'è stato scritto (ricevuto: ${JSON.stringify(ultime[2]?.t)})`);

  /* 3) Cap FIFO REALE: si sfora il cap di 2 → la scrittura riporta ESATTAMENTE
     al cap, sopravvivendo le più recenti. */
  for (let i = 0; i < REGISTRO_CAP + 2; i++) {
    const esito = await registraEsecuzione(client, { innesco: "cron", esito: "ok", dettaglio: { i } });
    verifica(esito.registrato, `registrazione serie ${i}`);
  }
  const conteggio = (await client.$queryRaw`SELECT COUNT(*) AS v FROM "RegistroManutenzione"`) as Array<{
    v: number | bigint;
  }>;
  verifica(Number(conteggio[0]?.v) === REGISTRO_CAP, `cap FIFO rispettato sul motore reale (${REGISTRO_CAP} righe esatte)`);
  const minimo = (await client.$queryRaw`SELECT MIN("id") AS v FROM "RegistroManutenzione"`) as Array<{
    v: number | bigint;
  }>;
  verifica(Number(minimo[0]?.v) > 3, "sopravvivono le PIÙ RECENTI: le prime 3 di prova eliminate dal FIFO (MIN(id) > 3)");
  /* La lib è limitata a 50 (clamp REGISTRO_LETTURA_MAX, il GET ne mostra 10):
     le 50 più recenti bastano a dimostrare ordine e sopravvivenza del FIFO. */
  const dopoCap = await leggiUltimeEsecuzioni(client, 50);
  verifica(dopoCap.length === 50, `lettura post-cap (clamp 50): trovate ${dopoCap.length}`);
  verifica(dopoCap.every((r) => r.id > 3), "nessuna delle righe di prova sopravvissuta fra le più recenti");
  verifica(dopoCap[0]?.dettaglio["i"] === REGISTRO_CAP + 1, "la più recente è l'ultima scritta");

  await client.$disconnect();
  rmSync(DIR, { recursive: true, force: true });
  console.log("I117-REGISTRO-REALE: PASS");
  process.exit(0);
} catch (e) {
  await client?.$disconnect().catch(() => undefined);
  rmSync(DIR, { recursive: true, force: true });
  const messaggio = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  console.error(`I117-REGISTRO-REALE: FAIL ${messaggio}`);
  process.exit(1);
}
