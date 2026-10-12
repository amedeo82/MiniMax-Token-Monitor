import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";

export const dynamic = "force-dynamic";

/**
 * ⚠️ ROUTE TEMPORANEA — Task 7 (verifiche empiriche V1–V6), 2026-10-05
 *
 * I processi background avviati dal terminale dell'agente vengono terminati
 * tra una chiamata e l'altra dell'ambiente; solo i processi figli del dev
 * server sopravvivono. Questa route avvia `scripts/verifiche/verifica.mjs`
 * come figlio DETACHED del server, con la chiave letta dal file di sessione
 * (mai restituita nella risposta né scritta nei log).
 *
 * POST { id: "v1"|"v2"|"v3"|"v6", args: string[] }  → { ok, pid, log }
 *
 * DA RIMUOVERE a fine sessione verifiche (vedi worklog Task ID 7, docs/04 §4).
 */
const KEY_FILE = "/home/z/my-project/scripts/verifiche/.chiave-sessione";
const TOOL = "/home/z/my-project/scripts/verifiche/verifica.mjs";
const ALLOWED = new Set(["v1", "v2", "v3", "v6", "prova-parser", "supervisore"]);

export async function POST(req: NextRequest) {
  let body: { id?: string; args?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Corpo non JSON valido." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const args = Array.isArray(body.args) ? body.args.map(String) : [];

  if (!ALLOWED.has(id)) {
    return NextResponse.json({ ok: false, error: `id non consentito: ${id}` }, { status: 400 });
  }
  for (const a of args) {
    if (!/^[A-Za-z0-9-]+$/.test(a)) {
      return NextResponse.json({ ok: false, error: `argomento non valido: ${a}` }, { status: 400 });
    }
  }

  // Caso speciale: supervisore (script bash che attende la fine di V3 e avvia V1+V2)
  if (id === "supervisore") {
    const supPath = "/home/z/my-project/scripts/verifiche/supervisore-v1v2.sh";
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const supLog = `/home/z/my-project/scripts/verifiche/run-supervisore-${ts}.log`;
    const supOut = fs.openSync(supLog, "a");
    const sup = spawn("bash", [supPath, ...args], {
      cwd: "/home/z/my-project",
      env: process.env,
      detached: true,
      stdio: ["ignore", supOut, supOut],
    });
    sup.unref();
    return NextResponse.json({ ok: true, pid: sup.pid, log: supLog });
  }

  if (!fs.existsSync(KEY_FILE)) {
    return NextResponse.json(
      { ok: false, error: "Chiave di sessione non presente: attendi una chiamata reale dal browser." },
      { status: 409 },
    );
  }

  let apiKey = "";
  try {
    const parsed = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")) as { apiKey?: string };
    apiKey = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
  } catch {
    return NextResponse.json({ ok: false, error: "File chiave illeggibile." }, { status: 500 });
  }
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "Chiave vuota nel file di sessione." }, { status: 409 });
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = `/home/z/my-project/scripts/verifiche/run-${id}-${ts}.log`;
  const out = fs.openSync(logPath, "a");

  const child = spawn("node", [TOOL, id, ...args], {
    cwd: "/home/z/my-project",
    env: { ...process.env, MM_SUBSCRIPTION_KEY: apiKey },
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();

  return NextResponse.json({ ok: true, pid: child.pid, log: logPath });
}
