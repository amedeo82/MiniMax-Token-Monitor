/**
 * I95 — Accettazione route-level della guard ADMIN_TOKEN (docs/08 I95):
 * «con ADMIN_TOKEN impostato, DELETE senza header → 401/403 e con header → 200;
 * uso locale senza token invariato».
 *
 * Db mockato (pattern I93), env manipolata per-caso con ripristino.
 */
import { describe, test, expect, afterEach } from "bun:test";

const ENV_ORIGINE = { ...process.env };
afterEach(() => {
  process.env.ADMIN_TOKEN = ENV_ORIGINE["ADMIN_TOKEN"];
  ripulisciProtezione();
});

const punti = {
  async deleteMany() {
    return { count: 5 };
  },
  async count() {
    return 0;
  },
};

const { mock } = await import("bun:test");
mock.module("@/lib/db", () => ({
  db: { usagePoint: punti, usageEventRecord: { count: async () => 0, deleteMany: async () => ({ count: 0 }) }, downsampledPoint: { count: async () => 0, deleteMany: async () => ({ count: 0 }) } },
}));

const { ripulisciProtezione } = await import("../../src/lib/api-protezione");
const delStorico = (await import("@/app/api/history/route")).DELETE as unknown as (req: Request) => Promise<Response>;

describe("I95 — accettazione route: DELETE /api/history con ADMIN_TOKEN", () => {
  test("guard SPENTA (default): DELETE senza header → 200 (uso locale invariato)", async () => {
    delete process.env.ADMIN_TOKEN;
    const res = (await delStorico(new Request("http://localhost:3000/api/history", { method: "DELETE" }))) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
    expect(res.status).toBe(200);
    expect((await res.json())["ok"]).toBe(true);
  });

  test("guard ATTIVA: DELETE senza header → 401; con header sbagliato → 401", async () => {
    process.env.ADMIN_TOKEN = "segreto-demo";
    const senza = (await delStorico(new Request("http://localhost:3000/api/history", { method: "DELETE" }))) as unknown as { status: number; json: () => Promise<Record<string, unknown>> };
    expect(senza.status).toBe(401);
    expect(((await senza.json())["error"] as Record<string, unknown>)["code"]).toBe("unauthorized");

    const sbagliato = (await delStorico(new Request("http://localhost:3000/api/history", { method: "DELETE", headers: { "x-admin-token": "nope" } }))) as unknown as { status: number };
    expect(sbagliato.status).toBe(401);
  });

  test("guard ATTIVA + header corretto → 200 (accettazione I95)", async () => {
    process.env.ADMIN_TOKEN = "segreto-demo";
    const res = (await delStorico(new Request("http://localhost:3000/api/history", { method: "DELETE", headers: { "x-admin-token": "segreto-demo" } }))) as unknown as { status: number };
    expect(res.status).toBe(200);
    expect((await res.json())["ok"]).toBe(true);
  });
});
