/**
 * Payload di MOCK per la risposta del proxy /api/minimax/usage (pattern I51):
 * snapshot "live" finto ma valido al 50 % (5h) e 70 % (settimanale) per general,
 * video inattivo al 100 %. Scritto su file per agent-browser route --body.
 * Nessuna chiamata reale: il route-mock intercetta nel browser PRIMA del server.
 */
const now = Date.now();
const payload = {
  ok: true,
  endpoint: "https://www.minimax.io/v1/token_plan/remains (MOCK b3)",
  fallback: false,
  data: {
    base_resp: { status_code: 0, status_msg: "success" },
    model_remains: [
      {
        model_name: "general",
        current_interval_remaining_percent: 50,
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: "in uso",
        start_time: Math.floor((now - 3 * 3600 * 1000) / 1000),
        end_time: Math.floor((now + 2 * 3600 * 1000) / 1000),
        remains_time: 2 * 3600 * 1000,
        current_weekly_remaining_percent: 70,
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        current_weekly_status: "in uso",
        weekly_start_time: Math.floor((now - 3 * 86400 * 1000) / 1000),
        weekly_end_time: Math.floor((now + 4 * 86400 * 1000) / 1000),
        weekly_remains_time: 4 * 86400 * 1000,
      },
      {
        model_name: "video",
        current_interval_remaining_percent: 100,
        current_interval_total_count: 0,
        current_interval_usage_count: 0,
        current_interval_status: "inattiva",
        start_time: Math.floor((now - 3600 * 1000) / 1000),
        end_time: Math.floor((now + 23 * 3600 * 1000) / 1000),
        remains_time: 23 * 3600 * 1000,
        current_weekly_remaining_percent: 100,
        current_weekly_total_count: 0,
        current_weekly_usage_count: 0,
        current_weekly_status: "inattiva",
        weekly_start_time: Math.floor((now - 3 * 86400 * 1000) / 1000),
        weekly_end_time: Math.floor((now + 4 * 86400 * 1000) / 1000),
        weekly_remains_time: 4 * 86400 * 1000,
      },
    ],
  },
};
const fs = await import("node:fs");
fs.writeFileSync(new URL("./mock-proxy-b3.json", import.meta.url), JSON.stringify(payload));
console.log("payload mock scritto: general 50%/70%, video 100%/100%");
