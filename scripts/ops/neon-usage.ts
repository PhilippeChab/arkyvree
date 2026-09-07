#!/usr/bin/env bun
/**
 * Usage: bun --env-file=.env.production run scripts/ops/neon-usage.ts [--csv]
 * Or:    bun run prod:neon-usage [--csv]
 *
 * Prints current billing-period usage for the Neon project identified by
 * NEON_PROJECT_ID, authenticated with NEON_API_KEY.
 *
 * Neon's `/consumption_history` endpoint only works on Scale/Business/
 * Enterprise plans, so we read the totals off `GET /projects/{id}` instead,
 * which works on every plan (including Launch / Free).
 */
export {};

const API = "https://console.neon.tech/api/v2";
const csv = process.argv.includes("--csv");

const apiKey = process.env.NEON_API_KEY;
const projectId = process.env.NEON_PROJECT_ID;
if (!apiKey || !projectId) {
  console.error("Missing NEON_API_KEY or NEON_PROJECT_ID in env");
  process.exit(1);
}

type Project = {
  id: string;
  name: string;
  compute_time_seconds: number;
  active_time_seconds: number;
  written_data_bytes: number;
  data_transfer_bytes: number;
  synthetic_storage_size: number;
  data_storage_bytes_hour: number;
  consumption_period_start: string;
  consumption_period_end: string;
  owner?: { subscription_type?: string };
};

const r = await fetch(`${API}/projects/${projectId}`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});
if (!r.ok) {
  console.error(`Neon API ${r.status}: ${await r.text()}`);
  process.exit(1);
}
const { project } = (await r.json()) as { project: Project };

const mb = (b: number) => b / 1024 / 1024;
const gb = (b: number) => b / 1024 / 1024 / 1024;
const hrs = (s: number) => s / 3600;

const periodStart = project.consumption_period_start.slice(0, 10);
const periodEnd = project.consumption_period_end.slice(0, 10);
const plan = project.owner?.subscription_type ?? "unknown";

const rows: [string, string][] = [
  ["project", `${project.name} (${project.id})`],
  ["plan", plan],
  ["period", `${periodStart} → ${periodEnd}`],
  ["compute_hours", hrs(project.compute_time_seconds).toFixed(2)],
  ["active_hours", hrs(project.active_time_seconds).toFixed(2)],
  ["written_MB", mb(project.written_data_bytes).toFixed(2)],
  ["data_transfer_MB", mb(project.data_transfer_bytes).toFixed(2)],
  ["storage_GB", gb(project.synthetic_storage_size).toFixed(4)],
  ["storage_GB_hours", gb(project.data_storage_bytes_hour).toFixed(2)],
];

if (csv) {
  console.log("metric,value");
  for (const [k, v] of rows) console.log(`${k},${v}`);
} else {
  const pad = Math.max(...rows.map(([k]) => k.length));
  console.log(`Neon usage — current billing period\n`);
  for (const [k, v] of rows) console.log(`${k.padEnd(pad)}  ${v}`);
}
