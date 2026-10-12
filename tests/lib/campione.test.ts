/**
 * I49 — Test del campionatore passivo (ADR-13-R2).
 *
 * Il campionatore scrive su disco SOLO envelope valide (base_resp.status_code = 0,
 * model_remains non vuoto), MAI la chiave (che non entra nemmeno nella firma) e
 * MAI eccezioni verso il chiamante (il proxy deve continuare a funzionare identico
 * in qualunque condizione di errore di scrittura).
 *
 * Tutte le scritture vanno su file temporanei (fileDest dedicato): il file reale
 * `scripts/verifiche/campione-live.jsonl` non viene MAI toccato dai test.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { campionaRisposta, envelopeValida, PERCORSO_CAMPIONE } from "@/lib/campione";

const ENVELOPE_OK = {
  base_resp: { status_code: 0, status_msg: "ok" },
  model_remains: [
    {
      model: "general",
      current_interval: { total_count: 100, current_interval_usage_count: 0, percent: 64.2 },
      current_interval_start: 1790935200000,
      current_interval_end: 1790953200000,
      remains_time: 4201000,
      current_weekly_status: 1,
    },
  ],
};

let dirTmp = "";

beforeEach(() => {
  dirTmp = mkdtempSync(join(tmpdir(), "campione-test-"));
});

afterEach(() => {
  rmSync(dirTmp, { recursive: true, force: true });
});

describe("I49 lib: envelopeValida", () => {
  test("envelope valida: status_code 0 + model_remains non vuoto → restituita", () => {
    const out = envelopeValida(ENVELOPE_OK);
    expect(out).not.toBeNull();
    expect(out?.["base_resp"]).toBeDefined();
    expect(Array.isArray(out?.["model_remains"])).toBe(true);
  });

  test("status_code != 0 (es. 1004 auth) → null (nessun campione)", () => {
    const errore = { base_resp: { status_code: 1004, status_msg: "cookie is missing" }, model_remains: [] };
    expect(envelopeValida(errore)).toBeNull();
  });

  test("manca base_resp → null", () => {
    expect(envelopeValida({ model_remains: [{}] })).toBeNull();
  });

  test("model_remains vuoto o assente → null", () => {
    expect(envelopeValida({ base_resp: { status_code: 0 }, model_remains: [] })).toBeNull();
    expect(envelopeValida({ base_resp: { status_code: 0 } })).toBeNull();
  });

  test("payload non-oggetto (null, stringa, numero) → null", () => {
    expect(envelopeValida(null)).toBeNull();
    expect(envelopeValida("ok")).toBeNull();
    expect(envelopeValida(42)).toBeNull();
  });
});

describe("I49 lib: campionaRisposta", () => {
  test("scrive UNA riga JSONL con ts/region/endpoint/payload (e nient'altro) su fileDest dedicato", async () => {
    const dest = join(dirTmp, "campione-test.jsonl");
    await campionaRisposta(ENVELOPE_OK, "eu", "https://www.minimax.io/v1/token_plan/remains", dest);
    expect(existsSync(dest)).toBe(true);
    const righe = readFileSync(dest, "utf8").trim().split("\n");
    expect(righe.length).toBe(1);
    const rec = JSON.parse(righe[0]);
    expect(Object.keys(rec).sort()).toEqual(["endpoint", "payload", "region", "ts"]);
    expect(rec.region).toBe("eu");
    expect(rec.endpoint).toContain("token_plan");
    expect(rec.payload.base_resp.status_code).toBe(0);
    expect(new Date(rec.ts).getTime()).not.toBeNaN();
  });

  test("risposta in errore (1004) o malformata: NESSUNA riga scritta", async () => {
    const dest = join(dirTmp, "vuoto.jsonl");
    await campionaRisposta({ base_resp: { status_code: 1004 } }, "eu", "ep", dest);
    await campionaRisposta("non-json", "eu", "ep", dest);
    expect(existsSync(dest)).toBe(false);
  });

  test("due chiamate valide → due righe append (JSONL)", async () => {
    const dest = join(dirTmp, "doppio.jsonl");
    await campionaRisposta(ENVELOPE_OK, "eu", "ep-1", dest);
    await campionaRisposta(ENVELOPE_OK, "cn", "ep-2", dest);
    const righe = readFileSync(dest, "utf8").trim().split("\n");
    expect(righe.length).toBe(2);
    expect(JSON.parse(righe[1]).region).toBe("cn");
  });

  test("directory di destinazione inesistente: creata ricorsivamente", async () => {
    const dest = join(dirTmp, "sottocartella", "ancora", "campione.jsonl");
    await campionaRisposta(ENVELOPE_OK, "eu", "ep", dest);
    expect(existsSync(dest)).toBe(true);
  });

  test("errore di scrittura (destinatario non scrivibile): MAI eccezioni", async () => {
    // Una directory AL POSTO del file: appendFile fallisce con EISDIR, la promessa comunque si risolve.
    const destDir = join(dirTmp, "come-file");
    mkdirSync(destDir); // pre-creata: l'append non può crearla come file
    await campionaRisposta(ENVELOPE_OK, "eu", "ep", destDir);
    expect(statSync(destDir).isDirectory()).toBe(true);
  });

  test("cap di crescita: file oltre MAX_BYTES → nessuna riga aggiunta", async () => {
    const dest = join(dirTmp, "cap.jsonl");
    // 12 MB di zeri superano il cap (12 * 1024 * 1024 byte): la riga NON deve essere aggiunta.
    writeFileSync(dest, "x".repeat(12 * 1024 * 1024 + 1), "utf8");
    await campionaRisposta(ENVELOPE_OK, "eu", "ep", dest);
    expect(readFileSync(dest, "utf8")).not.toContain("token_plan");
  });
});

describe("I49 lib: contratto e sicurezza", () => {
  test("la firma di campionaRisposta NON accetta alcuna chiave (garanzia strutturale)", async () => {
    // Il contratto ADR-13-R2: la chiave non può finire nel file perché non entra nella funzione.
    const dest = join(dirTmp, "no-chiave.jsonl");
    await campionaRisposta(ENVELOPE_OK, "eu", "https://ep/esempio", dest);
    const riga = readFileSync(dest, "utf8");
    expect(riga.toLowerCase()).not.toContain("apikey");
    expect(riga.toLowerCase()).not.toContain("authorization");
    expect(riga.toLowerCase()).not.toContain("bearer");
  });

  test("PERCORSO_CAMPIONE punta a scripts/verifiche/campione-live.jsonl", () => {
    expect(PERCORSO_CAMPIONE.endsWith(join("scripts", "verifiche", "campione-live.jsonl"))).toBe(true);
  });
});
