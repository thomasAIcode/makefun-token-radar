// Token radar entry. Reads the sealed snapshot, ranks pre-token protocols with
// dashboard/model.js, and writes board.json, data.js, the dashboard, screenshots
// and dossier.json. Node 22, standard library only.

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSnapshot } from "./lib/snapshot.ts";
import { rankLaunches, looValidate } from "./dashboard/model.js";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith(".")) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const inputArg = arg("input", "/input");
const inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const snapshot = loadSnapshot(inputFile);
const ranked = rankLaunches(snapshot.protocols, snapshot.watchlist, snapshot.floor_usd, snapshot.as_of);
const loo = looValidate(ranked.comps, snapshot.as_of);

const board = ranked.rows.map((row) => ({
  slug: row.protocol.slug,
  name: row.protocol.name,
  rank: row.rank,
  implied_value_usd: row.value.implied_value_usd,
  farm_steps: row.plan.steps,
}));

for (let i = 0; i < board.length; i++) {
  const row = board[i]!;
  if (row.rank !== i + 1) throw new Error(`rank gap at ${row.slug}`);
  if (i > 0 && row.implied_value_usd > board[i - 1]!.implied_value_usd) {
    throw new Error(`value rose at rank ${row.rank}`);
  }
  if (!(row.implied_value_usd > 0) || row.implied_value_usd > 1e14) throw new Error(`bad value at ${row.slug}`);
  if (row.farm_steps.length < 3 || row.farm_steps.length > 12) throw new Error(`farm count at ${row.slug}`);
  for (const step of row.farm_steps) {
    const n = step.trim().length;
    if (n < 20 || n > 600) throw new Error(`farm length ${n} at ${row.slug}`);
  }
}
const watch = new Set(snapshot.watchlist);
for (const slug of snapshot.watchlist) {
  if (!board.some((row) => row.slug === slug)) throw new Error(`watchlist missing ${slug}`);
}
const early = ranked.rows.filter((row) => row.cohort === "early").length;
if (early < 60) throw new Error(`only ${early} early rows`);

const payload = {
  as_of: snapshot.as_of,
  floor_usd: snapshot.floor_usd,
  watchlist: snapshot.watchlist.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  protocols: snapshot.protocols.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
  })),
};

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "board.json"), `${JSON.stringify({ rows: board }, null, 2)}\n`);
writeFileSync(join(out, "data.js"), `globalThis.RADAR_SNAPSHOT=${JSON.stringify(payload)};\n`);
copyFiles(join(here, "dashboard"), join(out, "dashboard"));
const shots = copyFiles(join(here, "screenshots"), join(out, "screenshots"));
const requiredShots = ["1-board.png", "2-detail.png", "3-filtered.png"];
for (const name of requiredShots) {
  if (!shots.includes(name)) throw new Error(`screenshots/${name} is missing`);
}

const top = ranked.rows[0];
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${watch.size} on the watchlist, ${board.length} rows (${early} early, ${ranked.comps.length} comps)\n` +
    `token radar: LOO median |log err| ${loo.median_abs_log_error.toFixed(3)}, spearman ${loo.spearman.toFixed(3)}, within 2x ${(loo.within_2x_share * 100).toFixed(1)}%\n` +
    `token radar: rank 1 ${top.protocol.slug} ${top.value.implied_value_usd}\n`,
);

if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} images; need 3 before dossier.json\n`);
  process.exit(1);
}

writeFileSync(
  join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  }),
);
process.stdout.write(`token radar: wrote ${join(out, "board.json")}, data.js, dashboard, screenshots (${shots.length}) and dossier.json\n`);
