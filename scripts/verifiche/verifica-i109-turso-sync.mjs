// I109 — Probe empirica della superficie API «sync» di @libsql/client installato.
// Obiettivo: dimostrare SU QUESTA MACCHINA (senza credenziali Turso) che:
//   1. lo stack embedded replicas è già presente (@libsql/client → nativo libsql);
//   2. la config accetta syncUrl/syncInterval e il client espone sync();
//   3. sync() senza syncUrl fallisce con errore DETERMINISTICO e leggibile
//      (comportamento documentabile per la proposta I109);
//   4. il ramo file: locale resta intatto (SELECT 1 come in I106 scenario A).
// La verifica e2e CON primario Turso reale richiede credenziali: runbook in docs/09 §7.4.
//
// Uso: node scripts/verifiche/verifica-i109-turso-sync.mjs

import { createClient } from "@libsql/client";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function versione(pkg, percorso) {
  try {
    const p = JSON.parse(readFileSync(new URL(percorso, import.meta.url), "utf8"));
    return p.version;
  } catch {
    return "non risolvibile";
  }
}

const esiti = [];
function registra(titolo, ok, dettaglio) {
  esiti.push({ titolo, ok, dettaglio });
  console.log(`${ok ? "PASS" : "FAIL"} — ${titolo}${dettaglio ? ` — ${dettaglio}` : ""}`);
}

console.log("=== I109 — probe superficie API sync (@libsql/client) ===");
console.log("versioni:", {
  client: versione("client", "../../node_modules/@libsql/client/package.json"),
  core: versione("core", "../../node_modules/@libsql/core/package.json"),
  native: versione("libsql", "../../node_modules/libsql/package.json"),
  adapter: versione("adapter", "../../node_modules/@prisma/adapter-libsql/package.json"),
});

// 1. Ramo file: locale intatto (baseline I106)
const dir = mkdtempSync(join(tmpdir(), "i109-probe-"));
const percorsoDb = join(dir, "probe.db");
try {
  const cliente = createClient({ url: `file:${percorsoDb}` });
  const rs = await cliente.execute("SELECT 1 AS uno");
  registra(
    "ramo file: locale funzionante",
    Number(rs.rows[0].uno) === 1,
    `file ${percorsoDb}`
  );
  registra("client.sync è una funzione", typeof cliente.sync === "function");

  // 2. sync() SENZA syncUrl: errore deterministico atteso
  try {
    await cliente.sync();
    registra("sync() senza syncUrl", false, "non ha lanciato: comportamento inatteso");
  } catch (e) {
    registra(
      "sync() senza syncUrl → errore deterministico",
      true,
      `code=${e.code ?? "(senza codice)"} message="${String(e.message).slice(0, 140)}"`
    );
  }

  // 3. La config accetta syncUrl/syncInterval a livello TIPi (verifica statica sul sorgente del pacchetto)
  const apiTs = readFileSync(
    new URL("../../node_modules/@libsql/core/lib-esm/api.d.ts", import.meta.url),
    "utf8"
  );
  const haSyncUrl = /syncUrl\?\s*:\s*string/.test(apiTs);
  const haSyncInterval = /syncInterval\?\s*:\s*number/.test(apiTs);
  const haSync = /sync\(\)\s*:\s*Promise<void>/.test(apiTs);
  registra(
    "typings @libsql/core: syncUrl/syncInterval/sync() presenti",
    haSyncUrl && haSyncInterval && haSync,
    `syncUrl=${haSyncUrl} syncInterval=${haSyncInterval} sync()=${haSync}`
  );
} catch (e) {
  registra("probe principale", false, `${e.name}: ${e.message}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 4. Client creato CON syncUrl verso un primario IRRAGGIUNGIIBILE (dominio fittizio,
//    zero credenziali reali): la creazione fallisce subito o rinvia l'errore a sync()?
//    ATTENZIONE (riscontrato empiricamente): il driver nativo può BLOCCARSI a lungo
//    tentando la sync iniziale — ogni passo è quindi delimitato con un timeout di 20 s
//    (Promise.race) per quantificare il comportamento senza appendere la sessione.
//    È l'evidenza di progettazione per la degradazione della factory I109.
const TIMEOUT_PASSO_MS = 20_000;
async function conTimeout(etichetta, operazione) {
  let timer;
  const guardia = new Promise((risolvi) => {
    timer = setTimeout(() => risolvi({ timeout: true }), TIMEOUT_PASSO_MS);
  });
  try {
    const vincitore = await Promise.race([operazione(), guardia]);
    clearTimeout(timer);
    return vincitore; // { timeout: true } oppure { errore } / { ok, valore }
  } catch (e) {
    clearTimeout(timer);
    return { errore: e };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const dir2 = mkdtempSync(join(tmpdir(), "i109-probe-replica-"));
const percorsoReplica = join(dir2, "replica.db");
try {
  const esitoCreazione = await conTimeout("createClient", () =>
    import("@libsql/client").then(({ createClient }) =>
      createClient({
        url: `file:${percorsoReplica}`,
        syncUrl: "libsql://i109-primario-inesistente.example",
        authToken: "token-fittizio-non-valido",
      })
    )
  );
  if (esitoCreazione.timeout) {
    registra(
      "createClient CON syncUrl irraggiungibile",
      true,
      `BLOCCATO oltre ${TIMEOUT_PASSO_MS / 1000}s (retry lunghi del driver) → la factory I109 deve proteggere l'avvio con un limite di tempo o pre-validare la raggiungibilità`
    );
  } else if (esitoCreazione.errore) {
    registra(
      "createClient CON syncUrl irraggiungibile: errore IMMEDIATO alla creazione",
      true,
      `code=${esitoCreazione.errore.code ?? "(senza codice)"} message="${String(esitoCreazione.errore.message).slice(0, 140)}"`
    );
  } else {
    const replica = esitoCreazione.valore;
    registra(
      "createClient CON syncUrl irraggiungibile: creazione riuscita (errore rinviato)",
      true,
      "il primario viene contattato pigramente alla prima sync/query"
    );
    const esitoSync = await conTimeout("sync", () => replica.sync());
    registra(
      "sync() verso primario irraggiungibile",
      true,
      esitoSync.timeout
        ? `BLOCCATO oltre ${TIMEOUT_PASSO_MS / 1000}s`
        : esitoSync.errore
          ? `errore deterministico: code=${esitoSync.errore.code ?? "(senza codice)"} message="${String(esitoSync.errore.message).slice(0, 140)}"`
          : "inatteso: completata senza primario"
    );
    const esitoQuery = await conTimeout("query", () => replica.execute("SELECT 1 AS uno"));
    registra(
      "query su replica mai sincronizzata",
      true,
      esitoQuery.timeout
        ? `BLOCCATO oltre ${TIMEOUT_PASSO_MS / 1000}s`
        : esitoQuery.errore
          ? `errore deterministico: code=${esitoQuery.errore.code ?? "(senza codice)"} message="${String(esitoQuery.errore.message).slice(0, 140)}"`
          : "inatteso: risponde senza primario"
    );
  }
} finally {
  rmSync(dir2, { recursive: true, force: true });
}

const falliti = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - falliti}/${esiti.length} PASS`);
process.exit(falliti === 0 ? 0 : 1);
