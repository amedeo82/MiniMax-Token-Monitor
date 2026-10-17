/**
 * I107-fix3 — Test dello schema INCORPORATO (src/lib/schema-persistenza.ts).
 *
 * MOTORE REALE IN PROCESSO FIGLIO (fix CI run #22/#23 — aggiorna la vecchia
 * lezione «ordine alfabetico», già fragile): l'ordine dei file in bun NON è
 * garantito né alfabetico né stabile tra ambienti (Task 55), e bun «latest» in
 * CI chiave i mock DIVERSAMENTE dal 1.3.14 locale — anche l'import via percorso
 * assoluto in CI ha preso il mock process-wide di db.test.ts. Soluzione
 * deterministica: l'e2e gira in `scripts/verifiche/verifica-i107fix3-motore-reale.ts`
 * (processo figlio SENZA mock — precedente del repo: check anti-drift); il
 * padre asserisce exit 0 + verdetto marcato e riporta l'output in caso di
 * fallimento: dice SEMPRE perché.
 *
 * Tre livelli di verifica:
 * 1. END-TO-END con motore reale: preparaSchema su un file SQLite vuoto → le
 *    5 tabelle esistono, una create() per UsagePoint e per DownsampledPoint
 *    (la tabella del report utente: «The table main.DownsampledPoint does not
 *    exist») va a buon fine, count coerente; la SECONDA preparaSchema è un
 *    no-op (idempotenza, nessun errore, dati intatti);
 * 2. ESATTEZZA DEL DDL: lo statement set incorporato è confrontato con quello
 *    generato da `prisma migrate diff --from-empty` sullo schema Prisma (in un
 *    processo figlio, immune dai mock) — ogni cambio di schema.prisma che non
 *    aggiorni il DDL incorporato rompe questo test (anti-drift);
 * 3. SEMANTICA DEL GATE: cache WeakMap (stessa promise per client, statement
 *    eseguiti UNA volta per passata) e client senza $executeRawUnsafe →
 *    promise risolta senza rovesciamenti (i mock dei test restano silenziosi);
 * 4. RIPROVA I107-FIX4: un motore "freddo" che rifiuta i primi statement
 *    («Engine is not yet connected») NON lascia lo schema parziale — le
 *    passate successive completano ciò che la prima non è riuscita a creare
 *    (probe verifica-i107-fix4-gate.mjs: senza gate 0/8, col gate 8/8); con
 *    guasti PERMANENTI il bootstrap si esaurisce in tempi finiti e la promise
 *    si risolve comunque: il guasto non è mascherato, riemerge dalle query
 *    reali col messaggio preciso del motore.
 */
import { describe, test, expect } from "bun:test";

import { preparaSchema, SCHEMA_PERSISTENZA } from "@/lib/schema-persistenza";

describe("I107-fix3 — schema incorporato (bootstrap DDL)", () => {
  test("end-to-end motore reale (processo figlio, immune dai mock): file vuoto → 5 tabelle create, scritture ok, seconda passata no-op", () => {
    // Lezione CI run #22/#23: il PrismaClient reale non può essere costruito
    // in-process senza correre il rischio (dipendente da versione/ordine) di
    // ricevere il mock process-wide di db.test.ts — la verifica gira nel
    // processo figlio `verifica-i107fix3-motore-reale.ts` (nessun mock lì) e
    // il padre asserisce exit 0 + verdetto marcato; in fallimento riporta
    // l'output del figlio: dice SEMPRE perché.
    const proc = Bun.spawnSync(
      [process.execPath, "scripts/verifiche/verifica-i107fix3-motore-reale.ts"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    const out = `${proc.stdout.toString()}\n${proc.stderr.toString()}`.trim();
    if (proc.exitCode !== 0) {
      throw new Error(`verifica-i107fix3-motore-reale.ts fallita (exit ${proc.exitCode}):\n${out}`);
    }
    expect(out).toContain("I107FIX3-MOTORE-REALE: PASS");
  }, 120_000);

  test("esattezza anti-drift: il DDL incorporato coincide con `prisma migrate diff` dello schema", () => {
    const diff = Bun.spawnSync(
      ["bunx", "prisma", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
      { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" },
    );
    expect(diff.exitCode).toBe(0);
    const script = diff.stdout.toString();
    expect(script).toContain("CREATE TABLE");

    /* Normalizzazione: via i commenti e gli IF NOT EXISTS, collassati gli
       spazi — così si confrontano gli STATEMENT, non la formattazione. */
    const normalizza = (s: string) =>
      s
        .split("\n")
        .filter((riga) => !riga.trim().startsWith("--"))
        .join(" ")
        .replace(/IF NOT EXISTS /gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const attesi = script
      .split(/;[^\S\n]*\n/)
      .map(normalizza)
      .filter((s) => s.length > 0)
      .sort();
    const incorporati = SCHEMA_PERSISTENZA.map(normalizza).sort();
    expect(incorporati).toEqual(attesi);
  });

  test("gate: cache WeakMap — stessa promise, statement eseguiti UNA volta per client", async () => {
    let chiamate = 0;
    const finto = {
      $executeRawUnsafe: async () => {
        chiamate += 1;
        return 0;
      },
    };
    const p1 = preparaSchema(finto);
    const p2 = preparaSchema(finto);
    expect(p2).toBe(p1); // la seconda richiesta RUSA la prima (cache per client)
    await p1;
    expect(chiamate).toBe(SCHEMA_PERSISTENZA.length);
    expect(SCHEMA_PERSISTENZA.every((s) => s.includes("IF NOT EXISTS"))).toBe(true);
  });

  test("I107-fix4 — motore freddo simulato: i primi DDL rifiutati vengono RIPROVATI e lo schema si completa", async () => {
    // Come la probe su motore reale: i primi 3 statement ricevono «Engine is
    // not yet connected», poi il motore "si connette" e tutto riesce. Senza
    // riprove lo schema resterebbe parziale PER TUTTA LA VITA dell'istanza.
    const FALLISCONO = 3;
    const tentativi = new Map<string, number>();
    const freddo = {
      $executeRawUnsafe: async (sql: string) => {
        const n = tentativi.get(sql) ?? 0;
        tentativi.set(sql, n + 1);
        if (n === 0 && tentativi.size <= FALLISCONO) {
          throw new Error("Engine is not yet connected.");
        }
        return 0;
      },
    };
    await preparaSchema(freddo);
    // Ogni statement è stato applicato: nessuno resta indietro.
    expect(tentativi.size).toBe(SCHEMA_PERSISTENZA.length);
    expect(SCHEMA_PERSISTENZA.every((s) => (tentativi.get(s) ?? 0) >= 1)).toBe(true);
    // La riprova è a PASSATE INTERE (il DDL idempotente riparte da tutti gli
    // statement): passata 1 con 3 rifiuti + passata 2 completa = 2 × 13.
    const totale = [...tentativi.values()].reduce((a, b) => a + b, 0);
    expect(totale).toBe(SCHEMA_PERSISTENZA.length * 2);
  });

  test("I107-fix4 — guasti PERMANENTI: tentativi finiti, promise risolta, guasto non mascherato", async () => {
    // Un motore che rifiuta SEMPRE: il bootstrap si esaurisce (tempi finiti,
    // TENTATIVI_BOOTSTRAP passate) e la promise si risolve comunque — la
    // prima query reale riporterà l'errore preciso (nessuna mascheratura).
    // Il stderr del gate è sospeso SOLO qui per non inquinare l'output della
    // suite: il test asserva i tentativi, che è la controparte misurabile.
    const originale = console.error;
    console.error = () => {};
    let chiamate = 0;
    try {
      const rotto = {
        $executeRawUnsafe: async () => {
          chiamate += 1;
          throw new Error("disk I/O error");
        },
      };
      await expect(preparaSchema(rotto)).resolves.toBeUndefined();
    } finally {
      console.error = originale;
    }
    expect(chiamate).toBe(SCHEMA_PERSISTENZA.length * 3);
  });

  test("client senza $executeRawUnsafe → promise risolta subito (mock di test silenziosi)", async () => {
    await expect(preparaSchema({})).resolves.toBeUndefined();
  });
});
