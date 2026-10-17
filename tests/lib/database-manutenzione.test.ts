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
 * 4. MOTORE REALE IN PROCESSO FIGLIO (fix CI run #22/#23): db.test.ts mocka
 *    "@prisma/client" a livello di processo e l'ordine dei file in bun NON è
 *    garantito tra ambienti; bun «latest» in CI (non pinnata) chiave i mock
 *    DIVERSAMENTE dal 1.3.14 locale — anche l'import via percorso assoluto
 *    (che in 1.3.14 scampava il mock, verificato con probe dedicata) in CI l'ha
 *    preso lo stesso. Soluzione deterministica: l'e2e gira in
 *    `scripts/verifiche/verifica-i111-motore-reale.ts` (processo figlio SENZA
 *    mock — precedente del repo: check anti-drift «in un processo figlio»);
 *    il padre asserisce exit 0 + verdetto marcato e, in caso di fallimento,
 *    riporta l'output del figlio: dice SEMPRE perché.
 */
import { describe, test, expect } from "bun:test";
import {
  dettaglioManutenzione,
  eseguiManutenzioneDb,
  eseguiPuliziaRitenuta,
  eseguiRimozioneDemo,
  eseguiVacuum,
  formattaBytes,
  leggiUltimeEsecuzioni,
  LIMITI_TURSO_FREE,
  misuraDimensioneDb,
  politicaRitenutaDaEnv,
  proiezioneScrittureMese,
  REGISTRO_CAP,
  registraEsecuzione,
  RETENZIONE_DEFAULT,
  RIMOZIONE_DEMO_BACKUP_MAX,
  SOGLIA_OMISSIONE_INTEGRITA_BYTES,
  soglieQuotaDaEnv,
  statisticaTabelle,
  valutazioneQuotaStorage,
  verificaIntegritaDb,
} from "@/lib/manutenzione-db";

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
/* 2-bis. I122 — rimozione selettiva demo (client finto dedicato)      */
/* ------------------------------------------------------------------ */

describe("I122 — eseguiRimozioneDemo (semantica su client finto)", () => {
  const RIGHE_DEMO = [
    { id: 2, t: 1790000000000, interval: 37.1, weekly: 77.6, source: "demo", region: "eu" },
    { id: 1, t: 1789999000000, interval: 39, weekly: 77.1, source: "demo", region: "eu" },
  ];

  /** Client finto SELF-CONTAINED: registra query/exec IN ORDINE (log unico per
      l'assert del backup PRIMA del DELETE), risponde a COUNT/SELECT/DELETE demo. */
  function clientDemo(opzioni: { conteggio?: number; righe?: unknown[]; eliminati?: number } = {}) {
    const log: string[] = [];
    const execParams: unknown[][] = [];
    const c = {
      async $queryRaw(q: TemplateStringsArray, ...vals: unknown[]): Promise<unknown[]> {
        const sql = q.join("");
        log.push(`Q: ${sql}`);
        if (sql.includes("COUNT(*)") && sql.includes('"source"')) return [{ v: opzioni.conteggio ?? 2 }];
        if (sql.includes('FROM "UsagePoint" WHERE "source"')) {
          // Simula il LIMIT: l'ultimo parametro è il cap (il fake è LIMIT-aware).
          const cap = Number(vals[vals.length - 1] ?? Number.POSITIVE_INFINITY);
          return (opzioni.righe ?? RIGHE_DEMO).slice(0, cap);
        }
        return [{ v: 0 }];
      },
      async $executeRaw(q: TemplateStringsArray, ...vals: unknown[]): Promise<number> {
        const sql = q.join("");
        log.push(`E: ${sql}`);
        execParams.push(vals);
        return opzioni.eliminati ?? 2;
      },
      async $executeRawUnsafe(): Promise<number> {
        return 0;
      },
    };
    return { c, log, execParams };
  }

  test("dryRun: ZERO DELETE — conteggio + backup delle righe che verrebbero eliminate", async () => {
    const { c, log, execParams } = clientDemo({ conteggio: 2 });
    const esito = await eseguiRimozioneDemo(c, { dryRun: true });
    expect(esito.dryRun).toBe(true);
    expect(esito.eseguita).toBe(false);
    expect(esito.eliminati).toBe(2);
    expect(esito.righe).toHaveLength(2);
    expect(esito.righe.every((r) => r.source === "demo")).toBe(true);
    expect(esito.troncato).toBe(false);
    expect(log.some((s) => s.startsWith("E:"))).toBe(false); // nessuna scrittura emessa
    expect(execParams).toHaveLength(0);
  });

  test("modalità reale: backup (SELECT) PRIMA del DELETE, cancellazione parametrizzata su source=demo", async () => {
    const { c, log, execParams } = clientDemo({ eliminati: 2 });
    const esito = await eseguiRimozioneDemo(c);
    expect(esito.eseguita).toBe(true);
    expect(esito.dryRun).toBe(false);
    expect(esito.eliminati).toBe(2);
    expect(esito.righe).toHaveLength(2);
    // Backup PRIMA: l'ultima SELECT delle righe demo precede il DELETE nel log unico.
    const ultimaSelect = Math.max(
      ...log.map((s, i) => (s.startsWith("Q:") && s.includes('FROM "UsagePoint" WHERE "source"') ? i : -1)),
    );
    const deleteIdx = log.findIndex((s) => s.startsWith("E:") && s.includes('DELETE FROM "UsagePoint"'));
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(deleteIdx).toBeGreaterThan(ultimaSelect);
    // Parametrizzato: il valore "demo" è un PARAMETRO (nell'array dei vals),
    // mai parte della stringa SQL (lezione tagged template: il join non contiene
    // i valori — l'asserzione del parametro è quella su execParams qui sopra).
    expect(execParams).toHaveLength(1);
    expect(execParams[0]).toContain("demo");
    expect(log[deleteIdx]).not.toContain("= demo");
  });

  test("backup cap: oltre il cap il backup è PARZIALE ma il conteggio resta completo (troncato: true)", async () => {
    const { c } = clientDemo({ conteggio: 34, righe: RIGHE_DEMO });
    const esito = await eseguiRimozioneDemo(c, { dryRun: true, backupMax: 2 });
    expect(esito.righe).toHaveLength(2);
    expect(esito.eliminati).toBe(34);
    expect(esito.troncato).toBe(true);
    // Il cap di default è 500 e il clamp tiene il valore ≥ 1 (mai cap 0 = backup vuoto).
    expect(RIMOZIONE_DEMO_BACKUP_MAX).toBe(500);
    const cap1 = await eseguiRimozioneDemo(c, { dryRun: true, backupMax: 0 });
    expect(cap1.righe).toHaveLength(1); // clamp a 1
    expect(cap1.troncato).toBe(true);
  });

  test("client senza superficie SQL → errore ONESTO (mai un fallback silenzioso)", async () => {
    expect(eseguiRimozioneDemo({} as object)).rejects.toThrow(/superficie SQL/);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Motore reale su file temporaneo (e2e)                            */
/* ------------------------------------------------------------------ */

describe("I111 — motore reale (processo figlio, immune dai mock): pulizia, PRAGMA, quick_check, ciclo completo", () => {
  test("end-to-end: ritenuta che elimina davvero (ENTRAMBE le codifiche), cap FIFO, statistiche, quota, vacuum", () => {
    /* IL MOTORE REALE GIRA IN UN PROCESSO FIGLIO — lezione CI run #22/#23:
       db.test.ts mocka "@prisma/client" a livello di processo e l'ordine dei
       file in bun NON è garantito tra ambienti; bun «latest» in CI chiave i
       mock DIVERSAMENTE dal 1.3.14 locale (il percorso assoluto, che in 1.3.14
       scampava il mock, in CI l'ha preso lo stesso). Il processo figlio non
       ha mock: "@prisma/client" è sempre il reale (precedente del repo: il
       check anti-drift «in un processo figlio, immune dai mock»). Il padre
       asserisce exit code 0 e il verdetto marcato; in caso di fallimento
       RIPORTA l'output del figlio: il test dice SEMPRE perché. */
    const proc = Bun.spawnSync(
      [process.execPath, "scripts/verifiche/verifica-i111-motore-reale.ts"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const out = `${proc.stdout.toString()}\n${proc.stderr.toString()}`.trim();
    if (proc.exitCode !== 0) {
      throw new Error(
        `verifica-i111-motore-reale.ts fallita (exit ${proc.exitCode}):\n${out}`,
      );
    }
    expect(out).toContain("I111-MOTORE-REALE: PASS");
  }, 120_000);
});

/* ------------------------------------------------------------------ */
/* 3-bis. Registro delle esecuzioni (I117)                             */
/* ------------------------------------------------------------------ */

/** Client dedicato al registro: cattura parametri INSERT/DELETE, risponde a
    COUNT e SELECT con dati configurabili. */
function clientRegistro(
  opzioni: {
    insertFallisce?: boolean;
    conteggio?: number;
    pruneFallisce?: boolean;
    righe?: Array<Record<string, unknown>>;
  } = {},
) {
  const reg = {
    insert: [] as unknown[][],
    delete: [] as string[],
    deleteParams: [] as unknown[][],
    select: [] as string[],
    selectParams: [] as unknown[][],
  };
  const c = {
    $queryRaw: async (q: TemplateStringsArray, ...vals: unknown[]): Promise<unknown[]> => {
      const sql = q.join("");
      reg.select.push(sql);
      reg.selectParams.push(vals);
      if (sql.includes("COUNT(*)")) return [{ v: opzioni.conteggio ?? 0 }];
      if (sql.includes('FROM "RegistroManutenzione"')) return opzioni.righe ?? [];
      return [];
    },
    $executeRaw: async (q: TemplateStringsArray, ...vals: unknown[]): Promise<number> => {
      const sql = q.join("");
      if (sql.includes("INSERT INTO")) {
        if (opzioni.insertFallisce) throw new Error("INSERT rifiutato dal motore");
        reg.insert.push(vals);
        return 1;
      }
      if (sql.startsWith("DELETE")) {
        if (opzioni.pruneFallisce) throw new Error("DELETE del cap rifiutata");
        reg.delete.push(sql);
        reg.deleteParams.push(vals);
        return 1;
      }
      return 0;
    },
    $executeRawUnsafe: async () => 0,
  };
  return { c, reg };
}

describe("I117 — registro delle esecuzioni (registra/leggi, cap FIFO alla scrittura, dettaglio)", () => {
  test("registraEsecuzione: INSERT parametrizzato con t ISO, innesco, esito, durata e dettaglio JSON", async () => {
    const { c, reg } = clientRegistro();
    const esito = await registraEsecuzione(c, {
      innesco: "cron",
      esito: "ok",
      durataMs: 123,
      dettaglio: { bytes: 4096, quota: "ok" },
      ora: Date.UTC(2026, 9, 17, 2, 30, 0),
    });
    expect(esito).toEqual({ registrato: true });
    expect(reg.insert).toHaveLength(1);
    const [t, innesco, esitoCiclo, durata, dettaglio] = reg.insert[0] as unknown[];
    expect(t).toBe("2026-10-17T02:30:00.000Z");
    expect(innesco).toBe("cron");
    expect(esitoCiclo).toBe("ok");
    expect(durata).toBe(123);
    expect(JSON.parse(String(dettaglio))).toEqual({ bytes: 4096, quota: "ok" });
    // durata assente → NULL (colonna nullable), dettaglio assente → {}
    const vuota = clientRegistro();
    await registraEsecuzione(vuota.c, { innesco: "post", esito: "fallito" });
    const [, , , durataNull, dettaglioVuoto] = vuota.reg.insert[0] as unknown[];
    expect(durataNull).toBeNull();
    expect(JSON.parse(String(dettaglioVuoto))).toEqual({});
  });

  test("registraEsecuzione: INSERT rifiutato → { registrato: false, errore } — MAI un lancio", async () => {
    const { c } = clientRegistro({ insertFallisce: true });
    const esito = await registraEsecuzione(c, { innesco: "cron", esito: "fallito" });
    expect(esito.registrato).toBe(false);
    expect(esito.errore).toMatch(/rifiutato/);
  });

  test("cap FIFO ALLA SCRITTURA: COUNT > cap → DELETE delle più vecchie; COUNT ≤ cap → nessuna DELETE", async () => {
    const sopra = clientRegistro({ conteggio: REGISTRO_CAP + 5 });
    await registraEsecuzione(sopra.c, { innesco: "cron", esito: "ok" });
    expect(sopra.reg.delete).toHaveLength(1);
    expect(sopra.reg.delete[0]).toContain('FROM "RegistroManutenzione"');
    expect(sopra.reg.delete[0]).toContain('ORDER BY "id" DESC');
    expect(sopra.reg.deleteParams[0]?.[0]).toBe(REGISTRO_CAP); // LIMIT parametrizzato col cap

    const alLimite = clientRegistro({ conteggio: REGISTRO_CAP });
    await registraEsecuzione(alLimite.c, { innesco: "cron", esito: "ok" });
    expect(alLimite.reg.delete).toHaveLength(0);
  });

  test("cap del registro rifiutato dal motore → registrato: true comunque (l'INSERT è riuscito; errore segnalato, non mascherato)", async () => {
    const originale = console.error;
    console.error = () => {};
    try {
      const { c, reg } = clientRegistro({ conteggio: REGISTRO_CAP + 1, pruneFallisce: true });
      const esito = await registraEsecuzione(c, { innesco: "cron", esito: "ok" });
      expect(esito.registrato).toBe(true);
      expect(esito.errore).toBeUndefined();
      expect(reg.delete).toHaveLength(0); // tentata ma rifiutata: riprova alla prossima esecuzione
    } finally {
      console.error = originale;
    }
  });

  test("leggiUltimeEsecuzioni: mappa robusta — righe malformate SALTATE, dettaglio JSON parsato, non-JSON → { grezzo }, LIMIT clampato", async () => {
    const righe = [
      { id: 2, t: "2026-10-17T02:30:00.000Z", innesco: "cron", esito: "ok", durataMs: 120, dettaglio: '{"bytes":4096,"quota":"ok"}' },
      { v: 0 }, // malformata (mock, contenuto inatteso): saltata
      { id: 1, t: "2026-10-16T02:30:00.000Z", innesco: "post", esito: "fallito", durataMs: null, dettaglio: "non-json{" },
    ];
    const { c, reg } = clientRegistro({ righe });
    const estratte = await leggiUltimeEsecuzioni(c);
    expect(estratte).toHaveLength(2);
    expect(estratte[0]?.id).toBe(2);
    expect(estratte[0]?.t).toBe("2026-10-17T02:30:00.000Z");
    expect(estratte[0]?.dettaglio).toEqual({ bytes: 4096, quota: "ok" });
    expect(estratte[1]?.esito).toBe("fallito");
    expect(estratte[1]?.durataMs).toBeNull();
    expect(estratte[1]?.dettaglio).toEqual({ grezzo: "non-json{" });
    // clamp: 999 → 50 (massimo), 0 → 1 (minimo); il limite è SEMPRE parametrizzato
    await leggiUltimeEsecuzioni(c, 999);
    expect(reg.selectParams.at(-1)?.[0]).toBe(50);
    await leggiUltimeEsecuzioni(c, 0);
    expect(reg.selectParams.at(-1)?.[0]).toBe(1);
  });

  test("dettaglioManutenzione: SOLO numeri ed esiti del motore, puliziaAutomatica solo se dichiarata", async () => {
    const { c } = clientFinto();
    const rapporto = await eseguiManutenzioneDb(c, { pulizia: true, vacuum: "auto" });
    const conOpzione = dettaglioManutenzione(rapporto, { puliziaAutomatica: true });
    expect(conOpzione).toEqual({
      bytes: 64 * 4096,
      quota: "ok",
      integrita: "ok",
      eliminati: 0,
      vacuum: "omesso", // pulizia senza eliminazioni → nessun VACUUM in auto
      puliziaAutomatica: true,
    });
    expect("puliziaAutomatica" in dettaglioManutenzione(rapporto)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3-ter. Registro su motore reale (processo figlio, immune dai mock)  */
/* ------------------------------------------------------------------ */

describe("I117 — registro delle esecuzioni su motore reale (processo figlio): roundtrip, cap FIFO, ordine", () => {
  test("end-to-end: INSERT/SELECT reali sulla tabella del registro, cap che riporta ESATTAMENTE a REGISTRO_CAP", () => {
    /* Stesso partitore di I107-fix3/I111: il motore reale gira in un processo
       figlio SENZA mock ("@prisma/client" è sempre quello reale); il padre
       asserisce exit 0 + verdetto marcato e, in fallimento, RIPORTA l'output
       del figlio: dice SEMPRE perché. */
    const proc = Bun.spawnSync(
      [process.execPath, "scripts/verifiche/verifica-i117-registro-reale.ts"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const out = `${proc.stdout.toString()}\n${proc.stderr.toString()}`.trim();
    if (proc.exitCode !== 0) {
      throw new Error(`verifica-i117-registro-reale.ts fallita (exit ${proc.exitCode}):\n${out}`);
    }
    expect(out).toContain("I117-REGISTRO-REALE: PASS");
  }, 120_000);
});
