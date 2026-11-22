// Local gate check for /tmp/out or a directory passed as the first argument.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] || "/tmp/out";
const snapPath = process.argv[3] || "/tmp/mf/token-radar-01-kit/input/snapshot.json";
const snap = JSON.parse(readFileSync(snapPath, "utf8"));
const board = JSON.parse(readFileSync(join(out, "board.json"), "utf8"));
const rows = board.rows;
const problems = [];
const slugs = new Set(snap.protocols.map((p) => p.slug));
const bySlug = new Map(snap.protocols.map((p) => [p.slug, p]));
const watch = new Set(snap.watchlist);

if (!Array.isArray(rows) || rows.length < 100 || rows.length > 4000) problems.push(`row count ${rows && rows.length}`);
if (rows.length < 150 || rows.length > 250) problems.push(`want 150..250 rows, got ${rows.length}`);

const seen = new Set();
const values = [];
for (const row of rows) {
  if (!slugs.has(row.slug)) problems.push(`unknown slug ${row.slug}`);
  if (seen.has(row.slug)) problems.push(`duplicate ${row.slug}`);
  seen.add(row.slug);
  if (!row.name) problems.push(`empty name ${row.slug}`);
  if (!Number.isInteger(row.rank) || row.rank < 1) problems.push(`bad rank ${row.slug}`);
  if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) {
    problems.push(`bad value ${row.slug} ${row.implied_value_usd}`);
  }
  if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
    problems.push(`farm count ${row.slug}`);
  } else {
    for (const step of row.farm_steps) {
      const n = String(step).trim().length;
      if (n < 20 || n > 600) problems.push(`farm length ${n} ${row.slug}`);
    }
  }
  const p = bySlug.get(row.slug);
  if (p && (p.mcap_usd != null || p.gecko_id != null || p.symbol != null)) problems.push(`tokened row ${row.slug}`);
  values.push(row.implied_value_usd);
}

const ranks = rows.map((r) => r.rank).slice().sort((a, b) => a - b);
for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) problems.push(`rank set broken at ${i + 1}`);
const ordered = rows.slice().sort((a, b) => a.rank - b.rank);
for (let i = 1; i < ordered.length; i++) {
  if (ordered[i].implied_value_usd > ordered[i - 1].implied_value_usd) problems.push(`value rose at rank ${ordered[i].rank}`);
}
if (new Set(values).size < 2) problems.push("values are all equal");

let early = 0;
for (const slug of watch) if (!seen.has(slug)) problems.push(`missing watchlist ${slug}`);
for (const row of rows) {
  const p = bySlug.get(row.slug);
  if (!p) continue;
  if (!watch.has(row.slug)) {
    if (!(p.tvl_usd < snap.floor_usd)) problems.push(`non-watchlist above floor ${row.slug}`);
    else early += 1;
  }
}
if (early < 60) problems.push(`early rows ${early}`);

const dash = join(out, "dashboard");
let bytes = 0;
let files = 0;
let css = 0;
let js = 0;
let html = 0;
function walk(dir, rel) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) problems.push(`dot name ${rel}${name}`);
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      walk(path, rel + name + "/");
      continue;
    }
    files += 1;
    bytes += st.size;
    if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name)) problems.push(`bad dashboard name ${name}`);
    if (name.endsWith(".css")) css += 1;
    if (name.endsWith(".js")) js += 1;
    if (name === "index.html") html += 1;
    const text = readFileSync(path, "utf8");
    if (/https?:\/\//.test(text)) problems.push(`url in ${rel}${name}`);
  }
}
walk(dash, "");
if (!html || !css || !js) problems.push("dashboard needs index.html, css and js");
if (files > 400 || bytes > 4_194_304) problems.push(`dashboard caps files=${files} bytes=${bytes}`);
if (bytes > 64000) problems.push(`dashboard source ${bytes} bytes leaves no room in the 65536-byte dossier text`);

const shotDir = join(out, "screenshots");
try {
  for (const name of readdirSync(shotDir)) {
    if (name.startsWith(".")) continue;
    const buf = readFileSync(join(shotDir, name));
    const kb = buf.length / 1024;
    let w = 0;
    let h = 0;
    if (buf[0] === 0x89 && buf[1] === 0x50) {
      w = buf.readUInt32BE(16);
      h = buf.readUInt32BE(20);
    }
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    const note = `${name} ${buf.length} bytes ${w}x${h}`;
    if (buf.length < 300 * 1024 || buf.length > 350 * 1024) problems.push(`shot size ${note}`);
    if (long > 1440 || short < 800) problems.push(`shot dim ${note}`);
    console.log("shot", note, "kb", kb.toFixed(1));
  }
} catch {
  console.log("shots: none yet");
}

console.log(`rows ${rows.length} early ${early} watch ${watch.size} dashboard ${files} files ${bytes} bytes`);
if (problems.length) {
  console.log(problems.slice(0, 30).join("\n"));
  process.exit(1);
}
console.log("check-board: ok");
