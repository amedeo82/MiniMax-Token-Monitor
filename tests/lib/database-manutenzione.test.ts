/**
 * I111 — Test della manutenzione database (src/lib/manutenzione-db.ts).
 *
 * Tre livelli, stessa partitura di database-schema.test.ts:
 * 1. FUNZIONI PURE (nessun motore): politica di ritenuta da env (default,
 *    parsing, clamp — una env sbagliata non può disarmare la manutenzione né
 *    svuotare l'archivio), valutazione della quota (livelli ok/attenzione/
 *    critica), proiezione scritture, formattaBytes (formato it-IT deterministico
 *    senza dipendere dai dati ICU del runtime — lezione I107);
 * 2. CLIENT FINTO (semantica senza motore): dryRun NON emette DELETE (solo
 *    COUNT), la modalità reale emette ritenuta + cap FIFO con i cutoff della
 *    politica, VACUUM riuscito/rifiutato (errore ONESTO nel rapporto, mai
 *    mascherato), orchestratore con vacuum "auto" solo dopo cancellazioni;
 * 3. MOTORE REALE su file temporaneo (pattern I107-fix3: client nativo +
 *    preparaSchema): PRAGMA misurabili, quick_check ok, pulizia che elimina
 *    davvero le righe vecchie e rispetta il cap FIFO, statistiche coerenti,
 *    ciclo completo end-to-end.
 *
 * CLIENT REALE IMMUNE DAI MOCK (fix CI run #22): db.test.ts mocka "@prisma/client"
 * a livello di processo e l'ordine dei file in bun NON è garantito (lezione
 * Task 55: «rinominare i file per l'ordine è inutile» — in CI db.test.ts ha
 * caricato PRIMA di questo file che in locale girava prima: e2e caduto su un
 * client senza accessori di modello). Il PrismaClient REALE si importa via
 * PERCORSO ASSOLUTO: il mock è chiave sullo specificatore "@prisma/client" e
 * non copre il percorso del pacchetto — deterministico in ogni ordine. L'import
 * del TIPO resta statico (erasure: non tocca il mock a runtime).
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PrismaClient } from "@prisma/client";

/* PrismaClient REALE via percorso assoluto — vedi la nota in testa: immune dal
   mock process-wide di "@prisma/client" (chiave sullo specificatore) in OGNI
   ordine di caricamento dei file. */
const clienteRealePacchetto = (await import(
  join(process.cwd(), "node_modules/@prisma/client/default.js")
)) as { PrismaClient: typeof PrismaClient };
const PrismaClientReale = clienteRealePacchetto.PrismaClient;

import {
  eseguiManutenzioneDb,
  eseguiPuliziaRitenuta,
  eseguiVacuum,
  formattaBytes,
  LIMITI_TURSO_FREE,
  misuraDimensioneDb,
  politicaRitenutaDaEnv,
  proiezioneScrittureMese,
  RETENZIONE_DEFAULT,
  SOGLIA_OMISSIONE_INTEGRITA_BYTES,
  soglieQuotaDaEnv,
  statisticaTabelle,
  valutazioneQuotaStorage,
  verificaIntegritaDb,
} from "@/lib/manutenzione-db";
import { preparaSchema } from "@/lib/schema-persistenza";

/* ------------------------------------------------------------------ */
/* Client finto: registra gli SQL, risponde ai PRAGMA/COUNT            */
/* ------------------------------------------------------------------ */

interface FintoRegistrato {
  query: string[];
  exec: string[];
  unsafe: string[];
  eliminatiPerSql: Map<string, number>;
}

function clientFinto(opzioni: { vacuumFallisce?: boolean; eliminati?: number } = {}) {
  const reg: FintoRegistrato = {
    query: [],
    exec: [],
    unsafe: [],
    eliminatiPerSql: new Map(),
  };
  const c = {
    $queryRaw: async (q: TemplateStringsArray): Promise<unknown[]> => {
      const sql = q.join("");
      reg.query.push(sql);
      if (sql.includes("page_count")) return [{ page_count: 64 }];
      if (sql.includes("page_size")) return [{ page_size: 4096 }];
      if (sql.includes("freelist_count")) return [{ freelist_count: 4 }];
      if (sql.includes("quick_check")) return [{ quick_check: "ok" }];
      return [{ v: 0 }];
    },
    $executeRaw: async (q: TemplateStringsArray): Promise<number> => {
      const sql = q.join("");
      reg.exec.push(sql);
      const n = opzioni.eliminati ?? 0;
      reg.eliminatiPerSql.set(sql, (reg.eliminatiPerSql.get(sql) ?? 0) + n);
      return n;
    },
    $executeRawUnsafe: async (sql: string): Promise<number> => {
      reg.unsafe.push(sql);
      if (opzioni.vacuumFallisce && sql === "VACUUM") throw new Error("VACUUM non supportato dal server");
      return 0;
    },
  };
  return { c, reg };
}

/* ------------------------------------------------------------------ */
/* 1. Funzioni pure                                                    */
/* ------------------------------------------------------------------ */

describe("I111 — funzioni pure (quota, proiezione, ritenuta, formato)", () => {
  test("valutazioneQuotaStorage: livelli ok/attenzione/critica sulle soglie", () => {
    const soglie = { limite: 1000, sogliaAttenzione: 0.8, sogliaCritica: 0.9 };
    expect(valutazioneQuotaStorage(0, soglie).livello).toBe("ok");
    expect(valutazioneQuotaStorage(799, soglie).livello).toBe("ok");
    expect(valutazioneQuotaStorage(800, soglie).livello).toBe("attenzione");
    expect(valutazioneQuotaStorage(899, soglie).livello).toBe("attenzione");
    expect(valutazioneQuotaStorage(900, soglie).livello).toBe("critica");
    const oltre = valutazioneQuotaStorage(1200, soglie);
    expect(oltre.livello).toBe("critica");
    expect(oltre.percento).toBe(120); // oltre 100: è il campanello, non un errore
  });

  test("valutazioneQuotaStorage: default sui limiti del free tier Turso", () => {
    const q = valutazioneQuotaStorage(LIMITI_TURSO_FREE.storageBytes);
    expect(q.limite).toBe(5 * 1024 * 1024 * 1024);
    expect(q.percento).toBe(100);
    expect(q.livello).toBe("critica");
  });

  test("proiezioneScrittureMese: 24 h × 30 con nota onesta sull'amplificazione", () => {
    const p = proiezioneScrittureMese(1000);
    expect(p.stimateMese).toBe(30_000);
    expect(p.limite).toBe(LIMITI_TURSO_FREE.scrittureMese);
    expect(p.frazione).toBeCloseTo(30_000 / 10_000_000, 8);
    expect(p.nota).toMatch(/sotto-stimata/);
    expect(proiezioneScrittureMese(0).stimateMese).toBe(0);
    expect(proiezioneScrittureMese(-5).stimateMese).toBe(0);
  });

  test("politicaRitenutaDaEnv: default allineati alle pruning on-write", () => {
    expect(politicaRitenutaDaEnv({})).toEqual(RETENZIONE_DEFAULT);
    expect(RETENZIONE_DEFAULT.giorniPunti).toBe(90);
    expect(RETENZIONE_DEFAULT.giorniEventi).toBe(180);
    expect(RETENZIONE_DEFAULT.maxPunti).toBe(10_000);
    expect(RETENZIONE_DEFAULT.maxEventi).toBe(5_000);
  });

  test("politicaRitenutaDaEnv: legge le env e normalizza (parse, clamp, insensate)", () => {
    const p = politicaRitenutaDaEnv({
      MANUTENZIONE_RETENTION_PUNTI_GIORNI: "30",
      MANUTENZIONE_RETENTION_EVENTI_GIORNI: "365",
      MANUTENZIONE_MAX_EVENTI: "2000",
    });
    expect(p.giorniPunti).toBe(30);
    expect(p.giorniEventi).toBe(365);
    expect(p.maxEventi).toBe(2000);
    // Non menzionate → default.
    expect(p.giorniBucket).toBe(90);
    expect(p.maxModelli).toBe(10_000);
    // Insensate → default (mai eccezioni).
    expect(politicaRitenutaDaEnv({ MANUTENZIONE_RETENTION_PUNTI_GIORNI: "abc" }).giorniPunti).toBe(90);
    // Clamp: mai «cancella tutto» (0→1) né oltre 10 anni, cap nei limiti.
    expect(politicaRitenutaDaEnv({ MANUTENZIONE_RETENTION_PUNTI_GIORNI: "0" }).giorniPunti).toBe(1);
    expect(politicaRitenutaDaEnv({ MANUTENZIONE_RETENTION_PUNTI_GIORNI: "99999" }).giorniPunti).toBe(3650);
    expect(politicaRitenutaDaEnv({ MANUTENZIONE_MAX_PUNTI: "10" }).maxPunti).toBe(100);
    expect(politicaRitenutaDaEnv({ MANUTENZIONE_MAX_PUNTI: "99999999" }).maxPunti).toBe(1_000_000);
  });

  test("soglieQuotaDaEnv: default 5 GiB 80/90% e override con clamp", () => {
    expect(soglieQuotaDaEnv({})).toEqual({ limite: LIMITI_TURSO_FREE.storageBytes, sogliaAttenzione: 0.8, sogliaCritica: 0.9 });
    const s = soglieQuotaDaEnv({ MANUTENZIONE_QUOTA_STORAGE_BYTES: "2000000", MANUTENZIONE_SOGLIA_ATTENZIONE: "50", MANUTENZIONE_SOGLIA_CRITICA: "120" });
    expect(s.limite).toBe(2_000_000);
    expect(s.sogliaAttenzione).toBe(0.5);
    expect(s.sogliaCritica).toBe(1); // clamp: mai sopra il 100%
    // clamp inferiore: un limite sotto 1 MiB salirebbe al minimo (mai quote assurde)
    expect(soglieQuotaDaEnv({ MANUTENZIONE_QUOTA_STORAGE_BYTES: "100" }).limite).toBe(1024 * 1024);
  });

  test("formattaBytes: it-IT deterministico (virgola decimale, senza dati ICU)", () => {
    expect(formattaBytes(0)).toBe("0 B");
    expect(formattaBytes(512)).toBe("512 B");
    expect(formattaBytes(1024)).toBe("1,00 KB");
    expect(formattaBytes(2048)).toBe("2,00 KB");
    expect(formattaBytes(3.5 * 1024 * 1024)).toBe("3,50 MB");
    expect(formattaBytes(5 * 1024 * 1024 * 1024)).toBe("5,00 GB");
    expect(formattaBytes(-3)).toBe("0 B");
  });
});

/* ------------------------------------------------------------------ */
/* 2. Semantica su client finto                                        */
/* ------------------------------------------------------------------ */

describe("I111 — semantica su client finto (dryRun, statement, vacuum)", () => {
  test("dryRun: ZERO DELETE — le condizioni girano solo in COUNT (ritenuta + cap FIFO)", async () => {
    const { c, reg } = clientFinto({ eliminati: 7 });
    const esito = await eseguiPuliziaRitenuta(c, { ...RETENZIONE_DEFAULT, giorniPunti: 30, maxPunti: 100 }, { dryRun: true });
    expect(esito.dryRun).toBe(true);
    expect(esito.eseguita).toBe(false);
    expect(reg.exec).toHaveLength(0); // nessuna DELETE emessa
    expect(reg.unsafe).toHaveLength(0);
    // I COUNT coprono scadenza + cap per le 3 tabelle FIFO e scadenza per i bucket.
    // (filtro con FROM " — «UsagePoint» da solo matcherebbe anche "ModelUsagePoint":
    //  prima stesura bocciata qui, lezione di sottocatalogo)
    const conteggi = reg.query.filter((s) => s.includes("COUNT(*)"));
    expect(conteggi.filter((s) => s.includes('FROM "UsagePoint"'))).toHaveLength(2);
    expect(conteggi.filter((s) => s.includes('FROM "UsageEventRecord"'))).toHaveLength(2);
    expect(conteggi.filter((s) => s.includes('FROM "ModelUsagePoint"'))).toHaveLength(2);
    expect(conteggi.filter((s) => s.includes('FROM "DownsampledPoint"'))).toHaveLength(1);
  });

  test("modalità reale: DELETE di ritenuta + cap FIFO per le stesse tabelle, con i cutoff della politica", async () => {
    const { c, reg } = clientFinto({ eliminati: 3 });
    const esito = await eseguiPuliziaRitenuta(c, RETENZIONE_DEFAULT, { ora: Date.UTC(2026, 9, 16, 12, 0, 0) });
    expect(esito.eseguita).toBe(true);
    expect(esito.dryRun).toBe(false);
    expect(esito.totale).toBeGreaterThan(0);
    const deleteSql = reg.exec.filter((s) => s.startsWith("DELETE"));
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "UsagePoint"'))).toHaveLength(2); // scadenza + cap
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "DownsampledPoint"'))).toHaveLength(1); // solo scadenza (come il pruning on-write I68)
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "UsageEventRecord"'))).toHaveLength(2);
    expect(deleteSql.filter((s) => s.startsWith('DELETE FROM "ModelUsagePoint"'))).toHaveLength(2);
    // Il cap FIFO conserva le più recenti (stesso ordine del pruning di produzione).
    expect(reg.exec.some((s) => s.includes('ORDER BY "t" DESC, "id" DESC LIMIT'))).toBe(true);
    expect(reg.exec.some((s) => s.includes('FROM "UsageEventRecord" ORDER BY "t" DESC LIMIT'))).toBe(true);
  });

  test("eseguiVacuum: riuscito senza errori; rifiutato dal server → errore ONESTO nel rapporto", async () => {
    const ok = clientFinto();
    const esitoOk = await eseguiVacuum(ok.c);
    expect(esitoOk).toEqual({ eseguito: true });
    expect(ok.reg.unsafe).toEqual(["VACUUM"]);
    const ko = clientFinto({ vacuumFallisce: true });
    const esitoKo = await eseguiVacuum(ko.c);
    expect(esitoKo.eseguito).toBe(false);
    expect(esitoKo.errore).toMatch(/VACUUM non supportato/);
  });

  test("misuraDimensioneDb su client finto: page_count × page_size con freelist", async () => {
    const { c } = clientFinto();
    const m = await misuraDimensioneDb(c);
    expect(m.pagine).toBe(64);
    expect(m.dimPagina).toBe(4096);
    expect(m.bytes).toBe(64 * 4096);
    expect(m.bytesLiberi).toBe(4 * 4096);
  });

  test("verificaIntegritaDb: quick_check ok; oltre la soglia è OMESSA con motivo", async () => {
    const { c } = clientFinto();
    const ok = await verificaIntegritaDb(c, 1024);
    expect(ok).toMatchObject({ eseguito: true, ok: true, esito: "ok" });
    const omessa = await verificaIntegritaDb(c, SOGLIA_OMISSIONE_INTEGRITA_BYTES + 1);
    expect(omessa.eseguito).toBe(false);
    expect(omessa.ok).toBe(true);
    expect(omessa.motivo).toMatch(/omessa/);
  });

  test("orchestratore: vacuum \"auto\" SOLO se la pulizia ha eliminato; \"mai\" non tocca nulla; \"sempre\" esegue comunque", async () => {
    const senzaCancellazioni = clientFinto({ eliminati: 0 });
    const r1 = await eseguiManutenzioneDb(senzaCancellazioni.c, { pulizia: true, vacuum: "auto" });
    expect(r1.pulizia?.totale).toBe(0);
    expect(r1.vacuum).toBeNull(); // auto + zero eliminazioni → niente VACUUM

    const conCancellazioni = clientFinto({ eliminati: 5 });
    const r2 = await eseguiManutenzioneDb(conCancellazioni.c, { pulizia: true, vacuum: "auto" });
    expect(r2.pulizia?.totale).toBeGreaterThan(0);
    expect(r2.vacuum?.eseguito).toBe(true);
    expect(r2.bytesPrimaVacuum).toBeDefined();
    expect(r2.bytesDopoVacuum).toBeDefined();
    expect(conCancellazioni.reg.unsafe).toContain("VACUUM");

    const mai = clientFinto({ eliminati: 5 });
    const r3 = await eseguiManutenzioneDb(mai.c, { pulizia: true, vacuum: "mai" });
    expect(r3.vacuum).toBeNull();
    expect(r3.pulizia?.eseguita).toBe(true);

    const sempre = clientFinto({ eliminati: 0 });
    const r4 = await eseguiManutenzioneDb(sempre.c, { pulizia: false, vacuum: "sempre" });
    expect(r4.pulizia).toBeNull(); // pulizia non richiesta
    expect(r4.vacuum?.eseguito).toBe(true);

    const readOnly = clientFinto();
    const r5 = await eseguiManutenzioneDb(readOnly.c, { vacuum: "mai" });
    expect(r5.pulizia).toBeNull();
    expect(r5.vacuum).toBeNull();
    expect(readOnly.reg.exec).toHaveLength(0); // il GET-like NON scrive nulla
    expect(readOnly.reg.unsafe).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Motore reale su file temporaneo (e2e)                            */
/* ------------------------------------------------------------------ */

const DIR_PROVA = join(tmpdir(), "i111-manutenzione-e2e");
let clientReale: PrismaClient | undefined;

afterAll(async () => {
  await clientReale?.$disconnect();
  rmSync(DIR_PROVA, { recursive: true, force: true });
});

describe("I111 — motore reale: pulizia, PRAGMA, quick_check, ciclo completo", () => {
  test("end-to-end: ritenuta che elimina davvero, cap FIFO, statistiche, quota, vacuum", async () => {
    rmSync(DIR_PROVA, { recursive: true, force: true });
    mkdirSync(DIR_PROVA, { recursive: true });
    const client = new PrismaClientReale({ datasourceUrl: `file:${join(DIR_PROVA, "prova.db")}` });
    // Guardia onesta: il client DEVE avere gli accessori di modello (se qui
    // arriva il mock di db.test.ts, il test fallisce DICENDO perché — mai
    // un «pass» silenzioso su un client finto).
    expect(typeof (client as unknown as { usagePoint?: unknown }).usagePoint).toBe("object");
    clientReale = client;
    await preparaSchema(client);

    const ora = Date.now();
    const giorni = (n: number) => new Date(ora - n * 24 * 3600_000);

    // UsagePoint: 2 vecchie (oltre 90 giorni) + 3 recenti via client tipizzato
    // (codifica INTEGER del motore) + 2 via SQL raw con ISO esplicito (codifica
    // TEXT come la lib I42): la ritenuta DEVE contare le vecchie di ENTRAMBE le
    // codifiche e risparmiare le recenti (probe-i111-datetime.ts).
    for (const [i, t] of [200, 150, 1, 2, 3].entries()) {
      await client.usagePoint.create({ data: { t: giorni(t), interval: i, weekly: i * 2 } });
    }
    const iso = (n: number) => new Date(ora - n * 24 * 3600_000).toISOString();
    await client.$executeRaw`INSERT INTO "UsagePoint" ("t", "interval", "weekly", "source", "region", "createdAt") VALUES (${iso(100)}, 1, 2, 'import', 'eu', ${iso(100)})`;
    await client.$executeRaw`INSERT INTO "UsagePoint" ("t", "interval", "weekly", "source", "region", "createdAt") VALUES (${iso(2)}, 3, 6, 'import', 'eu', ${iso(2)})`;
    // DownsampledPoint vecchio + recente.
    await client.downsampledPoint.create({ data: { hourStart: giorni(120), lastT: giorni(120), count: 1 } });
    await client.downsampledPoint.create({ data: { hourStart: giorni(1), lastT: giorni(1), count: 2 } });
    // ModelUsagePoint: 5 righe per il cap FIFO a 3.
    for (const i of [0, 1, 2, 3, 4]) {
      await client.modelUsagePoint.create({ data: { model: "general", win: "interval", t: giorni(i), percent: i } });
    }
    // Evento recente e evento vecchio.
    await client.usageEventRecord.create({ data: { id: "i111-recente", t: giorni(1), kind: "info", message: "recente" } });
    await client.usageEventRecord.create({ data: { id: "i111-vecchio", t: giorni(200), kind: "info", message: "vecchio" } });

    /* DryRun prima: conta ma NON elimina (il database resta com'era). */
    const stima = await eseguiPuliziaRitenuta(client, RETENZIONE_DEFAULT, { dryRun: true });
    expect(stima.dryRun).toBe(true);
    expect(stima.eliminati.punti).toBe(3); // 2 INTEGER (200/150 gg) + 1 TEXT (100 gg)
    expect(stima.eliminati.bucket).toBe(1); // il bucket a 120 giorni
    expect(stima.eliminati.eventi).toBe(1); // l'evento a 200 giorni
    expect(stima.eliminati.modelli).toBe(0); // tutte a ≤ 4 giorni, cap 10.000
    expect(await client.usagePoint.count()).toBe(7); // intatte (5 tipizzate + 2 raw)

    /* Pulizia reale + cap FIFO modelli a 3. */
    const esito = await eseguiPuliziaRitenuta(
      client,
      { ...RETENZIONE_DEFAULT, maxModelli: 3 },
      { ora },
    );
    expect(esito.eseguita).toBe(true);
    expect(esito.eliminati.punti).toBe(3); // 2 vecchie INTEGER + 1 vecchia TEXT
    expect(esito.eliminati.bucket).toBe(1);
    expect(esito.eliminati.eventi).toBe(1);
    expect(esito.eliminati.modelli).toBe(2); // 5 righe → cap 3
    expect(await client.usagePoint.count()).toBe(4); // 3 recenti INTEGER + 1 recente TEXT
    expect(await client.downsampledPoint.count()).toBe(1);
    expect(await client.usageEventRecord.count()).toBe(1);
    const modelliRestanti = await client.modelUsagePoint.findMany({ orderBy: { t: "desc" } });
    expect(modelliRestanti).toHaveLength(3);
    expect(modelliRestanti.map((r) => r.t.getTime())).toEqual(
      [giorni(0), giorni(1), giorni(2)].map((d) => d.getTime()),
    ); // le PIÙ RECENTI

    /* Misure reali: PRAGMA, statistiche, integrità, quota. */
    const misura = await misuraDimensioneDb(client);
    expect(misura.bytes).toBeGreaterThan(0);
    expect(misura.dimPagina).toBeGreaterThan(0);
    expect(misura.pagine).toBeGreaterThan(0);

    const statistiche = await statisticaTabelle(client);
    const perNome = new Map(statistiche.tabelle.map((t) => [t.tabella, t.righe]));
    expect(perNome.get("UsagePoint")).toBe(4);
    expect(perNome.get("DownsampledPoint")).toBe(1);
    expect(perNome.get("UsageEventRecord")).toBe(1);
    expect(perNome.get("ModelUsagePoint")).toBe(3);
    expect(statistiche.totaleRighe).toBe(9);

    const integrita = await verificaIntegritaDb(client, misura.bytes);
    expect(integrita.eseguito).toBe(true);
    expect(integrita.ok).toBe(true);
    expect(integrita.esito).toBe("ok");

    const ciclo = await eseguiManutenzioneDb(client, { pulizia: true, vacuum: "auto" });
    expect(ciclo.quota.limite).toBe(LIMITI_TURSO_FREE.storageBytes);
    expect(ciclo.quota.livello).toBe("ok"); // un file di prova è microscopico
    expect(ciclo.integrita.ok).toBe(true);
    expect(ciclo.statistiche.totaleRighe).toBe(9);
    expect(ciclo.proiezione.stimateMese).toBeGreaterThanOrEqual(0);
    expect(ciclo.vacuum).toBeNull(); // la seconda pulizia non ha eliminato nulla

    /* Seconda pulizia: idempotente — zero righe oltre ritenuta e cap. */
    const ritorno = await eseguiPuliziaRitenuta(client, { ...RETENZIONE_DEFAULT, maxModelli: 3 });
    expect(ritorno.totale).toBe(0);

    /* VACUUM sul motore nativo: eseguito e il file resta usabile. */
    expect((await eseguiVacuum(client)).eseguito).toBe(true);
    expect(await client.usagePoint.count()).toBe(4);
  }, 30_000);
});
