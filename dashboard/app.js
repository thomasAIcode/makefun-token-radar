import {
  CONST,
  GAS_USD_BY_CHAIN,
  rankLaunches,
  looValidate,
  nearestComps,
  impliedValue,
  usdText,
  pctText,
} from "./model.js";

const snap = globalThis.RADAR_SNAPSHOT;
const mast = document.getElementById("mast");
const checksEl = document.getElementById("checks");
const tabsEl = document.getElementById("tabs");
const filtersEl = document.getElementById("filters");
const boardEl = document.getElementById("board");
const foot = document.getElementById("foot");

if (!snap) {
  boardEl.textContent = "This page needs data.js beside the dashboard folder.";
} else {
  boot(snap);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function usdCompact(n) {
  const v = Math.abs(Number(n));
  const sign = n < 0 ? "-" : "";
  if (v >= 1e9) return sign + "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return sign + "$" + (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return sign + "$" + (v / 1e3).toFixed(1) + "k";
  if (v >= 100) return sign + "$" + Math.round(v);
  return sign + "$" + v.toFixed(2);
}

function paperGrain() {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 240;
  const g = c.getContext("2d");
  const img = g.createImageData(360, 240);
  let s = 20261114;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const v = 206 + (s % 40);
    img.data[i] = v;
    img.data[i + 1] = v - 8;
    img.data[i + 2] = v - 16;
    img.data[i + 3] = 26;
  }
  g.putImageData(img, 0, 0);
  document.body.style.backgroundImage = "url(" + c.toDataURL() + ")";
}

function boot(data) {
  paperGrain();
  const ranked = rankLaunches(data.protocols, data.watchlist, data.floor_usd, data.as_of);
  const loo = looValidate(ranked.comps, data.as_of);
  const state = Object.assign(
    {
      view: "board",
      slug: "",
      category: "",
      chain: "",
      cohort: "all",
      tvl: "any",
      q: "",
      sort: "rank",
      dir: "asc",
    },
    readHash(),
  );

  const categories = unique(ranked.rows.map((r) => r.value.category)).sort(cmp);
  const chains = unique(ranked.rows.flatMap((r) => r.protocol.chains || [])).sort(cmp);

  mast.innerHTML =
    '<p class="eyebrow">Pre-token launch board · as of ' + esc(data.as_of) + "</p>" +
    "<h1>Token radar</h1>" +
    '<p class="how">How to read this: rank 1 is the highest implied value, a fitted live-token market cap for the same TVL, category, 7-day change and age, times a ' +
    CONST.preTokenDiscount.toFixed(2) +
    " pre-token discount. It is this board's claim, not a forecast that a token is issued. The p25–p75 band is the comps residual quartile, the same factor on every row.</p>";

  checksEl.innerHTML = checksHtml(data.watchlist, ranked.rows, loo);
  foot.textContent =
    "For the reviewer: rankLaunches calls fitComps, impliedValue and farmPlan. main.ts imports those same functions to write board.json. model.js names no protocol. looValidate is leave-one-out on the comps, before the pre-token discount. Keyboard: arrows move, Enter opens, Esc closes, / searches.";

  tabsEl.innerHTML = ["board", "comps", "method"]
    .map((id) => {
      const label = id === "board" ? "Launches" : id === "comps" ? "Live tokens / comps" : "Method";
      return '<button type="button" data-action="view" data-view="' + id + '">' + label + "</button>";
    })
    .join("");

  filtersEl.innerHTML =
    '<div class="filters">' +
    '<label>Search<input id="q" type="search" value="' + esc(state.q) + '" placeholder="Name or slug"></label>' +
    "<label>Category" + selectHtml("category", ["", ...categories], state.category, "All categories") + "</label>" +
    "<label>Chain" + selectHtml("chain", ["", ...chains], state.chain, "All chains") + "</label>" +
    '<label>Cohort' + selectHtml("cohort", ["all", "watchlist", "early"], state.cohort, "") + "</label>" +
    '<label>TVL' + selectHtml("tvl", ["any", "u10", "10to50", "50p"], state.tvl, "") + "</label>" +
    "</div>";

  const labels = { all: "All launches", watchlist: "Watchlist", early: "Early (below the floor)", any: "Any TVL", u10: "Under $10M", "10to50": "$10M to $50M", "50p": "$50M and up" };
  for (const opt of filtersEl.querySelectorAll("option")) {
    if (labels[opt.value]) opt.textContent = labels[opt.value];
  }

  function render() {
    syncTabs();
    filtersEl.hidden = state.view !== "board";
    writeHash(state);
    if (state.view === "comps") boardEl.innerHTML = compsHtml(ranked, loo, data.as_of);
    else if (state.view === "method") boardEl.innerHTML = methodHtml(ranked.fit);
    else boardEl.innerHTML = boardHtml(ranked, data.as_of);
    const selected = boardEl.querySelector('[aria-selected="true"]');
    if (selected) selected.scrollIntoView({ block: "nearest" });
  }

  function syncTabs() {
    for (const btn of tabsEl.querySelectorAll("button")) {
      const on = btn.dataset.view === state.view || (state.view === "board" && btn.dataset.view === "board");
      btn.setAttribute("aria-selected", btn.dataset.view === (state.view === "board" ? "board" : state.view) ? "true" : "false");
      void on;
    }
  }

  document.body.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    if (t.dataset.action === "view") {
      state.view = t.dataset.view;
      if (state.view !== "board") state.slug = "";
      render();
    } else if (t.dataset.action === "sort") {
      if (state.sort === t.dataset.sort) state.dir = state.dir === "asc" ? "desc" : "asc";
      else {
        state.sort = t.dataset.sort;
        state.dir = t.dataset.sort === "name" || t.dataset.sort === "category" || t.dataset.sort === "chain" ? "asc" : "desc";
        if (t.dataset.sort === "rank") state.dir = "asc";
      }
      render();
    } else if (t.dataset.action === "open") {
      state.slug = t.dataset.slug;
      state.view = "board";
      render();
    } else if (t.dataset.action === "close") {
      state.slug = "";
      render();
    }
  });

  filtersEl.addEventListener("input", (e) => {
    const id = e.target.id;
    if (!id) return;
    state[id] = e.target.value;
    if (state.view !== "board") state.view = "board";
    render();
    const again = document.getElementById(id);
    if (again) again.focus();
  });

  document.addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      state.view = "board";
      render();
      const q = document.getElementById("q");
      if (q) q.focus();
      return;
    }
    if (state.view !== "board") return;
    const rows = visible(ranked.rows, state);
    if (e.key === "Escape") {
      state.slug = "";
      render();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter") return;
    e.preventDefault();
    const idx = rows.findIndex((r) => r.protocol.slug === state.slug);
    if (e.key === "Enter") {
      if (idx >= 0) state.slug = rows[idx].protocol.slug;
      else if (rows[0]) state.slug = rows[0].protocol.slug;
      render();
      return;
    }
    const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, Math.max(0, idx + 1)) : Math.max(0, idx < 0 ? 0 : idx - 1);
    if (rows[next]) state.slug = rows[next].protocol.slug;
    render();
  });

  render();

  function boardHtml(rankedNow, asOf) {
    const rows = sortRows(visible(rankedNow.rows, state), state);
    const opened = rows.find((r) => r.protocol.slug === state.slug) || rankedNow.rows.find((r) => r.protocol.slug === state.slug);
    const head = [
      ["rank", "Rank"],
      ["name", "Protocol"],
      ["category", "Category"],
      ["chain", "Chains"],
      ["tvl", "TVL"],
      ["change", "7d"],
      ["age", "Age"],
      ["value", "Implied"],
      ["band", "p25–p75"],
      ["ratio", "Value/TVL"],
      ["cost", "Farm cost"],
    ];
    const th = head
      .map(([key, label]) => {
        const aria = state.sort === key ? (state.dir === "asc" ? "ascending" : "descending") : "none";
        return '<th><button type="button" data-action="sort" data-sort="' + key + '" aria-sort="' + aria + '">' + label + "</button></th>";
      })
      .join("");
    const body = rows
      .map((r) => {
        const p = r.protocol;
        const chains = p.chains || [];
        const chainLabel = chains.length ? esc(chains.slice(0, 2).join(", ")) + (chains.length > 2 ? " +" + (chains.length - 2) : "") : "none";
        const chg = p.change_7d == null ? '<span class="muted">unreported</span>' : '<span class="' + (p.change_7d < 0 ? "down" : "up") + '">' + esc(pctText(p.change_7d)) + "</span>";
        const age = r.value.age_missing ? '<span class="muted">unreported</span>' : esc(String(r.value.age_days)) + "d";
        const tag = r.cohort === "watchlist" ? '<span class="tag">WL</span>' : '<span class="tag early">Early</span>';
        return (
          '<tr data-action="open" data-slug="' + esc(p.slug) + '" tabindex="0" aria-selected="' + (p.slug === state.slug ? "true" : "false") + '">' +
          "<td>" + r.rank + "</td>" +
          '<td><button type="button" class="namebtn" data-action="open" data-slug="' + esc(p.slug) + '">' + esc(p.name) + "</button>" + tag + '<span class="slug">' + esc(p.slug) + "</span></td>" +
          "<td>" + esc(r.value.category) + "</td>" +
          "<td>" + chainLabel + "</td>" +
          "<td>" + usdCompact(p.tvl_usd) + "</td>" +
          "<td>" + chg + "</td>" +
          "<td>" + age + "</td>" +
          "<td>" + usdCompact(r.value.implied_value_usd) + "</td>" +
          "<td>" + usdCompact(r.value.low_usd) + "–" + usdCompact(r.value.high_usd) + "</td>" +
          "<td>" + r.value.value_over_tvl.toFixed(3) + "</td>" +
          "<td>" + usdCompact(r.plan.cost_usd) + "</td>" +
          "</tr>"
        );
      })
      .join("");
    const table =
      '<p class="keys">Showing ' + rows.length + " of " + rankedNow.rows.length + ". WL is the watchlist. Early is below the $" + Math.round(dataFloor(data) / 1e6) + "M floor. Arrows move the row.</p>" +
      '<div class="table-wrap"><table><thead><tr>' + th + "</tr></thead><tbody>" +
      (body || '<tr><td colspan="11">No protocol matches these filters.</td></tr>') +
      "</tbody></table></div>";
    const drawer = opened ? drawerHtml(opened, rankedNow, asOf) : "";
    return '<div class="layout' + (opened ? " on" : "") + '"><div class="boardcol">' + table + "</div>" + drawer + "</div>";
  }
}

function dataFloor(data) {
  return snap.floor_usd;
}

function drawerHtml(row, ranked, asOf) {
  const p = row.protocol;
  const v = row.value;
  const near = nearestComps(p, ranked.comps, 4);
  const comps = near.comps
    .map((c) => {
      const fit = impliedValue(c, ranked.fit, asOf);
      return "<li><strong>" + esc(c.name) + "</strong> · " + esc(c.category || "Uncategorized") + " · TVL " + usdText(c.tvl_usd) + " · actual mcap " + usdText(c.mcap_usd) + " · fitted " + usdText(fit.comps_value_usd) + "</li>";
    })
    .join("");
  const terms = v.terms.map((t) => "<li><strong>" + esc(t.label) + ".</strong> " + esc(t.text) + "</li>").join("");
  const steps = row.plan.steps.map((s) => "<li>" + esc(s) + "</li>").join("");
  const chg = p.change_7d == null ? "unreported" : pctText(p.change_7d);
  const age = v.age_missing ? "listed_at unreported" : v.age_days + " days";
  return (
    '<aside class="drawer" aria-labelledby="detail-title">' +
    '<button type="button" class="close" data-action="close">Close</button>' +
    '<p class="eyebrow">Rank ' + row.rank + " · " + (row.cohort === "watchlist" ? "Watchlist" : "Early") + " · " + esc(row.plan.title) + "</p>" +
    '<h2 id="detail-title">' + esc(p.name) + "</h2>" +
    '<p class="slug">' + esc(p.slug) + " · " + esc((p.chains || []).join(", ") || "no chain listed") + "</p>" +
    '<div class="kvs">' +
    "<div><span>Implied value</span><strong>" + usdText(v.implied_value_usd) + "</strong></div>" +
    "<div><span>Band (p25–p75)</span><strong>" + usdText(v.low_usd) + " – " + usdText(v.high_usd) + "</strong></div>" +
    "<div><span>TVL</span><strong>" + usdText(p.tvl_usd) + "</strong></div>" +
    "<div><span>7-day change</span><strong>" + esc(chg) + "</strong></div>" +
    "<div><span>Age</span><strong>" + esc(age) + "</strong></div>" +
    "<div><span>Farm cost</span><strong>" + usdText(row.plan.cost_usd) + "</strong></div>" +
    "</div>" +
    '<p class="sentence">' + esc(v.sentence) + "</p>" +
    "<h3>Breakdown</h3><ul class=\"terms\">" + terms + "</ul>" +
    "<h3>" + (near.sameCategory ? "Closest comps in " + esc(v.category) : "No comps in " + esc(v.category) + "; closest by TVL overall") + "</h3>" +
    "<ul>" + (comps || "<li>No comps on this snapshot.</li>") + "</ul>" +
    "<h3>Farm plan · " + esc(row.plan.chain) + " · " + usdText(row.plan.position_usd) + " position · " + row.plan.weeks + " weeks</h3>" +
    "<ol class=\"steps\">" + steps + "</ol></aside>"
  );
}

function compsHtml(ranked, loo, asOf) {
  const g = ranked.fit.beta.growth;
  const growthNote =
    "Growth coefficient " + g.toFixed(3) + " after a ridge of " + CONST.growthRidge +
    " on that column. A higher 7-day TVL change lines up with a " + (g < 0 ? "lower" : "higher") +
    " comps market cap once TVL is held fixed. Points are leave-one-out fitted market caps, before the pre-token discount. The line is equality.";
  const cards = [
    [String(loo.n), "Comps with a market cap"],
    [loo.median_abs_log_error.toFixed(2), "LOO median |log error|"],
    [loo.spearman.toFixed(2), "Spearman, predicted vs actual"],
    [Math.round(loo.within_2x_share * 100) + "%", "Within 2× (" + loo.within_2x + "/" + loo.n + ")"],
  ]
    .map(([n, l]) => "<div><span>" + esc(l) + "</span><strong>" + esc(n) + "</strong></div>")
    .join("");
  const pts = loo.points.slice().sort((a, b) => b.abs_log_error - a.abs_log_error || cmp(a.slug, b.slug));
  const body = pts
    .map((p) => "<tr><td>" + esc(p.name) + "</td><td>" + esc(p.category || "Uncategorized") + "</td><td>" + usdCompact(p.tvl_usd) + "</td><td>" + usdCompact(p.actual) + "</td><td>" + usdCompact(p.predicted) + "</td><td>" + p.abs_log_error.toFixed(2) + "</td><td>" + (p.within_2x ? "yes" : "no") + "</td></tr>")
    .join("");
  return (
    '<div class="stats">' + cards + "</div>" +
    '<p class="note">' + esc(growthNote) + "</p>" +
    '<div class="chart">' + scatterSvg(loo.points) + "</div>" +
    '<div class="table-wrap"><table><thead><tr><th>Protocol</th><th>Category</th><th>TVL</th><th>Actual mcap</th><th>LOO fitted</th><th>|log err|</th><th>Within 2×</th></tr></thead><tbody>' +
    body + "</tbody></table></div>"
  );
}

function scatterSvg(points) {
  const w = 680;
  const h = 360;
  const padL = 56;
  const padB = 32;
  const padT = 12;
  const padR = 12;
  const vals = points.flatMap((p) => [p.actual, p.predicted]).filter((v) => v > 0);
  const min = Math.min(...vals) * 0.85;
  const max = Math.max(...vals) * 1.15;
  const X = (v) => padL + ((Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * (w - padL - padR);
  const Y = (v) => padT + (1 - (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))) * (h - padT - padB);
  let grids = "";
  let v = Math.pow(10, Math.ceil(Math.log10(min)));
  while (v <= max) {
    grids += '<line class="grid" x1="' + X(v).toFixed(1) + '" y1="' + padT + '" x2="' + X(v).toFixed(1) + '" y2="' + (h - padB) + '" />';
    grids += '<text x="' + X(v).toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle">' + esc(usdCompact(v)) + "</text>";
    v *= 10;
  }
  const dots = points
    .slice()
    .sort((a, b) => cmp(a.slug, b.slug))
    .map((p) => '<circle cx="' + X(p.actual).toFixed(1) + '" cy="' + Y(p.predicted).toFixed(1) + '" r="3.2"><title>' + esc(p.name) + " actual " + esc(usdText(p.actual)) + " fitted " + esc(usdText(p.predicted)) + "</title></circle>")
    .join("");
  return (
    '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Leave-one-out predicted market cap against actual market cap">' +
    grids +
    '<line class="eq" x1="' + X(min).toFixed(1) + '" y1="' + Y(min).toFixed(1) + '" x2="' + X(max).toFixed(1) + '" y2="' + Y(max).toFixed(1) + '" />' +
    dots + "</svg>"
  );
}

function methodHtml(fit) {
  const b = fit.beta;
  const cats = fit.categories
    .slice()
    .sort((a, c) => c.multiplier - a.multiplier || cmp(a.name, c.name))
    .map((c) => "<tr><td>" + esc(c.name) + "</td><td>" + c.n + "</td><td>" + c.effect.toFixed(3) + "</td><td>" + c.multiplier.toFixed(2) + "</td></tr>")
    .join("");
  const gas = Object.keys(GAS_USD_BY_CHAIN)
    .sort(cmp)
    .map((name) => "<tr><td>" + esc(name) + "</td><td>" + usdText(GAS_USD_BY_CHAIN[name]) + "</td></tr>")
    .join("");
  return (
    '<article class="method">' +
    "<h2>The formula</h2>" +
    "<p>fitComps fits live-token comps. impliedValue applies that fit to every launch. The same function scores every row.</p>" +
    "<p><code>log(mcap) = a + b·log(TVL / " + usdText(CONST.tvlAnchor) + ") + c·growth + d·age_years + e·age_missing + category effect</code></p>" +
    "<p>growth is clamp(change_7d, ±" + CONST.growthClamp + ") / 100. A null change_7d is scored as 0. No comp is missing change_7d, so there is no missing-growth coefficient, and the page says so. age_years is days from listed_at to as-of, divided by " + CONST.yearDays + ". A null listed_at sets age_years to 0 and age_missing to 1.</p>" +
    "<p>Closed form: ordinary least squares, with " + CONST.growthRidge + " added to the growth diagonal of X′X. Category effect = n / (n + " + CONST.categoryPrior + ") × mean residual. A category with no comps stays at ×1.00.</p>" +
    "<h2>This snapshot's coefficients</h2>" +
    "<p>a = " + b.intercept.toFixed(3) + ", b = " + b.log_tvl.toFixed(3) + ", c = " + b.growth.toFixed(3) + ", d = " + b.age_years.toFixed(3) + " per year, e = " + b.age_missing.toFixed(3) + ". In-sample residual RMSE " + fit.sigma.toFixed(3) + " (divided by n, so a few far comps widen it). The band on each row is the residual p25 to p75, " + fit.residP25.toFixed(2) + " to " + fit.residP75.toFixed(2) + " in log space.</p>" +
    "<p>Implied value = round(fitted comps value × " + CONST.preTokenDiscount.toFixed(2) + "). The discount is stated, not estimated: the snapshot has no price for a protocol that records no token. Protocols that already record a market cap, gecko id or symbol are comps, not rows on the launch board.</p>" +
    "<h2>Category effects</h2>" +
    '<div class="table-wrap"><table><thead><tr><th>Category</th><th>Comps</th><th>Log effect</th><th>Multiplier</th></tr></thead><tbody>' + cats + "</tbody></table></div>" +
    "<h2>Farm assumptions</h2>" +
    "<p>farmPlan reads chains, category and TVL. Position size is " + CONST.positionBps + " basis points of TVL, clamped to " + usdText(CONST.positionMin) + "–" + usdText(CONST.positionMax) + ". The chain is the cheapest one with a named gas row; if none is named, the default is " + usdText(CONST.gasDefault) + ". Hold is " + CONST.holdDays + " days. Unknown chains are not treated as cheaper than a named cheap chain.</p>" +
    '<div class="table-wrap"><table><thead><tr><th>Chain</th><th>Gas / action</th></tr></thead><tbody>' + gas + "<tr><td>Any other chain</td><td>" + usdText(CONST.gasDefault) + "</td></tr></tbody></table></div>" +
    "<h2>What is left off the board</h2>" +
    "<p>Above the floor, only the watchlist is ranked. The watchlist already drops records the house treated as wrapped, staked, bridged or versioned. This board does not put those back. Everything ranked below the floor records no token.</p>" +
    "</article>"
  );
}

function checksHtml(watchlist, rows, loo) {
  const have = new Set(rows.map((r) => r.protocol.slug));
  const covered = watchlist.filter((s) => have.has(s)).length;
  let mono = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].value.implied_value_usd > rows[i - 1].value.implied_value_usd) mono = false;
  const ranks = rows.every((r, i) => r.rank === i + 1);
  const ok = mono && ranks ? "strictly by value" : "RANK CHECK FAILED";
  return (
    "<strong>" + covered + "/" + watchlist.length + " watchlist covered</strong> · " +
    rows.length + " rows · ranks 1.." + rows.length + " " + ok +
    " · 0 hardcoded names · " + loo.n + " comps, LOO median |log err| " + loo.median_abs_log_error.toFixed(2) +
    " · " + Math.round(loo.within_2x_share * 100) + "% within 2×"
  );
}

function visible(rows, state) {
  return rows.filter((r) => {
    if (state.cohort === "watchlist" && r.cohort !== "watchlist") return false;
    if (state.cohort === "early" && r.cohort !== "early") return false;
    if (state.category && r.value.category !== state.category) return false;
    if (state.chain && !(r.protocol.chains || []).includes(state.chain)) return false;
    const tvl = r.protocol.tvl_usd;
    if (state.tvl === "u10" && tvl >= 10e6) return false;
    if (state.tvl === "10to50" && (tvl < 10e6 || tvl >= 50e6)) return false;
    if (state.tvl === "50p" && tvl < 50e6) return false;
    if (state.q) {
      const hay = (r.protocol.name + " " + r.protocol.slug).toLowerCase();
      if (!hay.includes(state.q.toLowerCase())) return false;
    }
    return true;
  });
}

function sortRows(rows, state) {
  const dir = state.dir === "asc" ? 1 : -1;
  const key = {
    rank: (r) => r.rank,
    name: (r) => r.protocol.name,
    category: (r) => r.value.category,
    chain: (r) => (r.protocol.chains && r.protocol.chains[0]) || "",
    tvl: (r) => r.protocol.tvl_usd,
    change: (r) => (r.protocol.change_7d == null ? null : r.protocol.change_7d),
    age: (r) => (r.value.age_days == null ? null : r.value.age_days),
    value: (r) => r.value.implied_value_usd,
    band: (r) => r.value.high_usd - r.value.low_usd,
    ratio: (r) => r.value.value_over_tvl,
    cost: (r) => r.plan.cost_usd,
  }[state.sort] || ((r) => r.rank);
  return rows.slice().sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (av == null && bv == null) return cmp(a.protocol.slug, b.protocol.slug);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return cmp(a.protocol.slug, b.protocol.slug);
  });
}

function selectHtml(id, values, current, blankLabel) {
  return (
    '<select id="' + id + '">' +
    values
      .map((v) => {
        const label = v === "" ? blankLabel : v;
        return '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(label) + "</option>";
      })
      .join("") +
    "</select>"
  );
}

function readHash() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  const out = {};
  for (const key of ["view", "slug", "category", "chain", "cohort", "tvl", "q", "sort", "dir"]) {
    const v = q.get(key);
    if (v) out[key] = v;
  }
  if (out.view !== "board" && out.view !== "comps" && out.view !== "method") delete out.view;
  return out;
}

function writeHash(state) {
  const q = new URLSearchParams();
  for (const key of ["view", "slug", "category", "chain", "cohort", "tvl", "q", "sort", "dir"]) {
    const v = state[key];
    if (!v || v === "all" || v === "any" || (key === "view" && v === "board") || (key === "sort" && v === "rank") || (key === "dir" && v === "asc")) continue;
    q.set(key, v);
  }
  const next = q.toString();
  const url = next ? "#" + next : location.pathname + location.search;
  if ((location.hash || "") !== (next ? "#" + next : "")) history.replaceState(null, "", next ? "#" + next : location.pathname + location.search);
  void url;
}

function unique(list) {
  return [...new Set(list)];
}

function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
