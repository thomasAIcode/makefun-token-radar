// Implied-value model for the token radar. This file names no protocol.
//
// Comps are rows with a positive mcap_usd. For each comp:
//   y = log(mcap_usd)
//   x = [1, log(tvl_usd / TVL_ANCHOR), growth, age_years, age_missing]
//   growth = clamp(change_7d, -GROWTH_CLAMP, GROWTH_CLAMP) / 100, or 0 when change_7d is null
//   age_years = (as_of - listed_at) / YEAR_DAYS, or 0 when listed_at is null
//   age_missing = 1 when listed_at is null, else 0
//
// beta is ordinary least squares. GROWTH_RIDGE is added only to the growth
// diagonal of X'X, because one week of TVL change is a noisy column and an
// unshrunk slope lets that week dominate the rank.
// The category effect is n / (n + CATEGORY_PRIOR) times the mean log residual
// of that category. A category with no comps has effect 0 (the global mean).
//
// Fitted comps value = exp(x·beta + category effect).
// A row that records no token is ranked at round(fitted comps value × PRETOKEN_DISCOUNT).
// The low/high band multiplies that product by exp of the in-sample residual
// quartiles (order statistics at floor((n-1)·p)), not a confidence claim.

export const CONST = {
  tvlAnchor: 50_000_000,
  growthClamp: 20,
  growthRidge: 2,
  categoryPrior: 8,
  preTokenDiscount: 0.5,
  holdDays: 56,
  yearDays: 365.25,
  positionBps: 2,
  positionMin: 1000,
  positionMax: 20000,
  borrowLtv: 0.4,
  borrowApr: 0.04,
  ilRate: 0.02,
  derivFee: 0.0006,
  derivTurns: 8,
  derivLeverage: 2,
  bridgeFee: 0.0006,
  rwaFee: 0.0025,
  coverPremium: 0.015,
  predictStakeShare: 0.1,
  predictFee: 0.02,
  cdpLtv: 0.25,
  cdpApr: 0.02,
  gasDefault: 1.5,
};

// Stated gas per simple action, in dollars. Not a live quote.
export const GAS_USD_BY_CHAIN = {
  Solana: 0.02,
  Stellar: 0.02,
  Ripple: 0.03,
  Sui: 0.03,
  Aptos: 0.03,
  Near: 0.04,
  xDai: 0.04,
  Polygon: 0.05,
  Celo: 0.05,
  Sei: 0.05,
  Base: 0.06,
  Sonic: 0.06,
  Mantle: 0.08,
  Fantom: 0.08,
  Flare: 0.08,
  Unichain: 0.08,
  Monad: 0.08,
  "Robinhood Chain": 0.08,
  Binance: 0.1,
  Blast: 0.1,
  Berachain: 0.1,
  Kava: 0.1,
  "Hyperliquid L1": 0.1,
  Plasma: 0.1,
  Scroll: 0.12,
  Linea: 0.12,
  "zkSync Era": 0.12,
  Cronos: 0.12,
  Optimism: 0.14,
  TON: 0.15,
  Arc: 0.15,
  Arbitrum: 0.18,
  Avalanche: 0.2,
  Cardano: 0.2,
  Tron: 0.25,
  Bitcoin: 2.5,
  Ethereum: 3.8,
};

export function usdText(n) {
  const cents = Math.round(Number(n) * 100) / 100;
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const fixed = abs.toFixed(2);
  const parts = fixed.split(".");
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const tail = parts[1] === "00" ? "" : "." + parts[1];
  return (neg ? "-$" : "$") + grouped + tail;
}

export function pctText(n) {
  if (n == null || !Number.isFinite(Number(n))) return "unreported";
  const v = Number(n);
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}

export function gasUsd(chain) {
  if (Object.prototype.hasOwnProperty.call(GAS_USD_BY_CHAIN, chain)) return GAS_USD_BY_CHAIN[chain];
  return CONST.gasDefault;
}

export function chooseChain(chains) {
  const list = Array.isArray(chains) ? chains.filter((c) => typeof c === "string" && c.length > 0) : [];
  const known = list.filter((c) => Object.prototype.hasOwnProperty.call(GAS_USD_BY_CHAIN, c));
  if (known.length) {
    let best = known[0];
    for (const c of known) {
      const g = GAS_USD_BY_CHAIN[c];
      if (g < GAS_USD_BY_CHAIN[best] || (g === GAS_USD_BY_CHAIN[best] && c < best)) best = c;
    }
    return { chain: best, gas: GAS_USD_BY_CHAIN[best], known: true };
  }
  const sorted = list.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { chain: sorted[0] || "unspecified", gas: CONST.gasDefault, known: false };
}

export function recordsToken(p) {
  return p.mcap_usd != null || p.gecko_id != null || p.symbol != null;
}

export function isComp(p) {
  return p.mcap_usd != null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

export function isLaunch(p, watch, floorUsd) {
  if (recordsToken(p) || !(p.tvl_usd > 0)) return false;
  if (watch.has(p.slug)) return true;
  return p.tvl_usd < floorUsd;
}

export function playbookFor(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("uncollateral")) return "deposit";
  if (c.includes("deriv") || c.includes("option") || c.includes("perp") || c.includes("synthet")) return "derivatives";
  if (c.includes("lend")) return "lending";
  if (c.includes("cdp") || c.includes("stablecoin")) return "cdp";
  if (c.includes("dex") || c.includes("amm") || c.includes("liquidity manager")) return "dex";
  if (c.includes("yield") || c.includes("farm")) return "yield";
  if (c.includes("stak") || c.includes("restak")) return "stake";
  if (c.includes("bridge")) return "bridge";
  if (c.includes("rwa")) return "rwa";
  if (c.includes("launchpad")) return "launchpad";
  if (c.includes("insur")) return "insurance";
  if (c.includes("predict")) return "predict";
  if (c.includes("basis")) return "basis";
  return "deposit";
}

const PLAYBOOK_TITLE = {
  lending: "lending loop",
  dex: "liquidity provision",
  yield: "vault deposit",
  derivatives: "hedged volume",
  cdp: "collateral mint",
  stake: "stake deposit",
  bridge: "bridge round trip",
  rwa: "RWA subscription",
  launchpad: "sale commit",
  insurance: "cover purchase",
  predict: "single-market ticket",
  basis: "basis pair",
  deposit: "plain deposit",
};

function utcDayNumber(iso) {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function ageFeature(listedAt, asOf) {
  if (!listedAt) return { days: null, years: 0, missing: 1 };
  const days = utcDayNumber(asOf) - utcDayNumber(listedAt);
  return { days, years: days / CONST.yearDays, missing: 0 };
}

export function growthFeature(change7d) {
  if (change7d == null || !Number.isFinite(Number(change7d))) {
    return { raw: null, clamped: 0, missing: 1, unit: 0 };
  }
  const raw = Number(change7d);
  const clamped = Math.max(-CONST.growthClamp, Math.min(CONST.growthClamp, raw));
  return { raw, clamped, missing: 0, unit: clamped / 100 };
}

function catKey(p) {
  return p.category ? p.category : "Uncategorized";
}

function bySlug(a, b) {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

function design(p, asOf) {
  const g = growthFeature(p.change_7d);
  const age = ageFeature(p.listed_at, asOf);
  const logTvl = Math.log(p.tvl_usd / CONST.tvlAnchor);
  return { g, age, logTvl, x: [1, logTvl, g.unit, age.years, age.missing] };
}

function solve(matrix, vector) {
  const n = vector.length;
  const m = matrix.map((row, i) => row.concat([vector[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) throw new Error("fitComps: normal equations are singular at column " + col);
    if (piv !== col) {
      const tmp = m[col];
      m[col] = m[piv];
      m[piv] = tmp;
    }
    const div = m[col][col];
    for (let j = col; j <= n; j++) m[col][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((row) => row[n]);
}

function quantile(sorted, p) {
  const idx = Math.floor((sorted.length - 1) * p);
  return sorted[idx];
}

function median(values) {
  const a = values.slice().sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return a[(n - 1) / 2];
  return (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function fitComps(comps, asOf) {
  const rows = comps.slice().sort(bySlug);
  const k = 5;
  const xtx = Array.from({ length: k }, () => Array(k).fill(0));
  const xty = Array(k).fill(0);
  const designed = rows.map((p) => {
    const d = design(p, asOf);
    return { p, d, y: Math.log(p.mcap_usd) };
  });
  for (const row of designed) {
    for (let j = 0; j < k; j++) {
      xty[j] += row.d.x[j] * row.y;
      for (let t = 0; t < k; t++) xtx[j][t] += row.d.x[j] * row.d.x[t];
    }
  }
  xtx[2][2] += CONST.growthRidge;
  const betaArr = solve(xtx, xty);
  const groups = new Map();
  for (const row of designed) {
    let pred = 0;
    for (let j = 0; j < k; j++) pred += row.d.x[j] * betaArr[j];
    const key = catKey(row.p);
    const slot = groups.get(key) || { n: 0, sum: 0 };
    slot.n += 1;
    slot.sum += row.y - pred;
    groups.set(key, slot);
  }
  const effects = new Map();
  const categories = [];
  for (const [name, slot] of groups) {
    const mean = slot.sum / slot.n;
    const effect = (slot.n / (slot.n + CONST.categoryPrior)) * mean;
    effects.set(name, effect);
    categories.push({ name, n: slot.n, effect, multiplier: Math.exp(effect) });
  }
  categories.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const residuals = [];
  for (const row of designed) {
    let pred = 0;
    for (let j = 0; j < k; j++) pred += row.d.x[j] * betaArr[j];
    pred += effects.get(catKey(row.p)) || 0;
    residuals.push(row.y - pred);
  }
  const sorted = residuals.slice().sort((a, b) => a - b);
  const abs = residuals.map((r) => Math.abs(r));
  let ss = 0;
  for (const r of residuals) ss += r * r;
  return {
    n: rows.length,
    betaArr,
    beta: {
      intercept: betaArr[0],
      log_tvl: betaArr[1],
      growth: betaArr[2],
      age_years: betaArr[3],
      age_missing: betaArr[4],
    },
    effects,
    categories,
    sigma: Math.sqrt(ss / rows.length),
    residP25: quantile(sorted, 0.25),
    residP75: quantile(sorted, 0.75),
    inSampleMedianAbsLog: median(abs),
  };
}

function predictLog(fit, p, asOf) {
  const d = design(p, asOf);
  let y = 0;
  for (let j = 0; j < fit.betaArr.length; j++) y += d.x[j] * fit.betaArr[j];
  const key = catKey(p);
  const effect = fit.effects.get(key) || 0;
  const known = fit.effects.has(key);
  return { y: y + effect, d, effect, known, key };
}

function clampInt(n) {
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 1e14) return 1e14;
  return Math.round(n);
}

function multText(m) {
  return "×" + m.toFixed(2);
}

export function impliedValue(p, fit, asOf) {
  const pred = predictLog(fit, p, asOf);
  const base = Math.exp(fit.beta.intercept + fit.beta.log_tvl * pred.d.logTvl);
  const catMult = Math.exp(pred.effect);
  const growthMult = Math.exp(fit.beta.growth * pred.d.g.unit);
  const ageMult = Math.exp(fit.beta.age_years * pred.d.age.years + fit.beta.age_missing * pred.d.age.missing);
  const product = base * catMult * growthMult * ageMult * CONST.preTokenDiscount;
  const implied = clampInt(Math.round(product));
  let low = clampInt(Math.round(product * Math.exp(fit.residP25)));
  let high = clampInt(Math.round(product * Math.exp(fit.residP75)));
  if (low > implied) low = implied;
  if (high < implied) high = implied;
  const g = pred.d.g;
  const age = pred.d.age;
  const catNote = pred.known
    ? (fit.effects.get(pred.key) !== undefined ? categoryCount(fit, pred.key) + " comps, shrunk toward 0 with prior " + CONST.categoryPrior : "no comps")
    : "no comps in this category, effect held at the global mean";
  let growthLine;
  if (g.missing) {
    growthLine = "7-day change unreported, scored as 0 growth " + multText(growthMult) + " (no comp is missing change_7d, so there is no missing-growth coefficient)";
  } else if (g.raw !== g.clamped) {
    growthLine = "growth " + pctText(g.raw) + " clamped to " + pctText(g.clamped) + " " + multText(growthMult);
  } else {
    growthLine = "growth " + pctText(g.raw) + " " + multText(growthMult);
  }
  const ageLine = age.missing
    ? "listed_at unreported " + multText(ageMult) + " (missing-age coefficient, not a day count)"
    : age.days + " days on record " + multText(ageMult);
  const terms = [
    {
      id: "base",
      label: "TVL",
      text: "TVL " + usdText(p.tvl_usd) + " → base " + usdText(base) + " (log(TVL / " + usdText(CONST.tvlAnchor) + ") = " + pred.d.logTvl.toFixed(3) + ", slope " + fit.beta.log_tvl.toFixed(3) + ")",
    },
    {
      id: "category",
      label: "Category",
      text: "category " + pred.key + " " + multText(catMult) + " (" + catNote + ")",
    },
    { id: "growth", label: "Growth", text: growthLine },
    { id: "age", label: "Age", text: ageLine },
    {
      id: "discount",
      label: "Pre-token discount",
      text: "pre-token discount " + multText(CONST.preTokenDiscount) + " (stated; the snapshot has no pre-token prices to fit)",
    },
  ];
  const sentence = terms.map((t) => t.text).join("; ") + " = " + usdText(product) + " before rounding, ranked at " + usdText(implied) + ".";
  return {
    comps_value_usd: base * catMult * growthMult * ageMult,
    product,
    implied_value_usd: implied,
    low_usd: low,
    high_usd: high,
    terms,
    sentence,
    category: pred.key,
    category_known: pred.known,
    category_effect: pred.effect,
    age_days: age.days,
    age_missing: age.missing === 1,
    growth_missing: g.missing === 1,
    value_over_tvl: implied / p.tvl_usd,
  };
}

function categoryCount(fit, key) {
  for (const c of fit.categories) if (c.name === key) return c.n;
  return 0;
}

function averageRanks(values) {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j += 1;
    const avg = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs, ys) {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxx += xs[i] * xs[i];
    syy += ys[i] * ys[i];
    sxy += xs[i] * ys[i];
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
  return den === 0 ? 0 : num / den;
}

function spearman(xs, ys) {
  return pearson(averageRanks(xs), averageRanks(ys));
}

export function fittedCompsValue(p, fit, asOf) {
  return Math.exp(predictLog(fit, p, asOf).y);
}

export function looValidate(comps, asOf) {
  const rows = comps.slice().sort(bySlug);
  const abs = [];
  const points = [];
  let within = 0;
  for (let i = 0; i < rows.length; i++) {
    const train = rows.slice(0, i).concat(rows.slice(i + 1));
    const fit = fitComps(train, asOf);
    const predicted = fittedCompsValue(rows[i], fit, asOf);
    const actual = rows[i].mcap_usd;
    const err = Math.abs(Math.log(predicted) - Math.log(actual));
    abs.push(err);
    if (err <= Math.log(2)) within += 1;
    points.push({
      slug: rows[i].slug,
      name: rows[i].name,
      category: rows[i].category,
      tvl_usd: rows[i].tvl_usd,
      actual,
      predicted,
      abs_log_error: err,
      within_2x: err <= Math.log(2),
    });
  }
  return {
    n: rows.length,
    median_abs_log_error: median(abs),
    mean_abs_log_error: abs.reduce((s, x) => s + x, 0) / (abs.length || 1),
    within_2x: within,
    within_2x_share: rows.length ? within / rows.length : 0,
    spearman: spearman(points.map((p) => p.predicted), points.map((p) => p.actual)),
    points,
  };
}

export function nearestComps(protocol, comps, k) {
  const want = k || 4;
  const same = [];
  const other = [];
  for (const c of comps) {
    if (c.slug === protocol.slug) continue;
    if (c.category === protocol.category) same.push(c);
    else other.push(c);
  }
  const pool = same.length ? same : comps.filter((c) => c.slug !== protocol.slug);
  const lx = Math.log(protocol.tvl_usd);
  const ranked = pool.map((c) => ({ c, d: Math.abs(Math.log(c.tvl_usd) - lx) }));
  ranked.sort((a, b) => a.d - b.d || bySlug(a.c, b.c));
  return { sameCategory: same.length > 0, comps: ranked.slice(0, want).map((x) => x.c) };
}

function cents(n) {
  return Math.round(n * 100) / 100;
}

export function positionUsd(tvl) {
  const raw = tvl * (CONST.positionBps / 10000);
  const clamped = Math.min(CONST.positionMax, Math.max(CONST.positionMin, raw));
  return Math.round(clamped / 100) * 100;
}

function chainListText(chains) {
  const names = (Array.isArray(chains) ? chains : []).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!names.length) return "none listed";
  if (names.length <= 4) return names.join(", ");
  return names.slice(0, 3).join(", ") + ", and " + (names.length - 3) + " more";
}

function bookSpec(book, pos, gas) {
  const u = usdText;
  const days = CONST.holdDays;
  const yearFrac = days / CONST.yearDays;
  if (book === "lending") {
    const borrow = pos * CONST.borrowLtv;
    const fee = borrow * CONST.borrowApr * yearFrac;
    return {
      title: PLAYBOOK_TITLE.lending,
      fee,
      feeName: "borrow interest at 4% APR",
      openActions: 4,
      touchActions: 1,
      exitActions: 3,
      hold: "Touch the position once during the 8 weeks so activity is recorded.",
      exit: "repay the full borrow, then withdraw the supply",
      risk: "Liquidation risk sits on the borrow if the collateral price moves.",
      action: `Supply ${u(pos)}, borrow 40% (${u(borrow)}) and supply it once. Capital in the app: ${u(pos)}. 4 actions, about ${u(4 * gas)} gas. Day 0. No second loop. No deposit fee: the snapshot names none.`,
      second: `Interest is 4% APR for ${days} days on ${u(borrow)}, which is ${u(fee)}. Stay only if the health factor is at least 1.8; otherwise repay first.`,
    };
  }
  if (book === "dex") {
    const fee = pos * CONST.ilRate;
    return {
      title: PLAYBOOK_TITLE.dex,
      fee,
      feeName: "2% impermanent-loss allowance",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "One transaction during the 8 weeks is enough activity; do not hop pools.",
      exit: "remove the liquidity and unwrap any receipt back to the two assets",
      risk: "Impermanent loss can exceed the 2% allowance if the pair diverges.",
      action: `Add ${u(pos)} to the deepest major-pair pool, split across the two assets. Capital in the pool: ${u(pos)}. 2 actions, about ${u(2 * gas)}. Day 0. No fee rebate: the snapshot names none.`,
      second: `Impermanent-loss allowance: 2% over 8 weeks, ${u(fee)}, on top of gas. Do not hop pools. If that 2% is used in week 1, exit instead of adding size.`,
    };
  }
  if (book === "yield") {
    return {
      title: PLAYBOOK_TITLE.yield,
      fee: 0,
      feeName: "no extra fee, the snapshot names none",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "One transaction during the 8 weeks is enough; do not restake the receipt elsewhere.",
      exit: "withdraw the deposit and unwrap the receipt",
      risk: "Vault and strategy risk sit on the whole deposit.",
      action: `Deposit ${u(pos)} in one asset into the main vault. Capital in the app: ${u(pos)}. 2 actions, about ${u(2 * gas)}. Day 0. No performance fee: the snapshot names none.`,
      second: `Fee line: $0 on that assumption. Do not restake the receipt elsewhere. Hold ${days} days and read the balance once a week (about 10 minutes).`,
    };
  }
  if (book === "derivatives") {
    const notional = pos * CONST.derivLeverage;
    const fee = CONST.derivTurns * notional * CONST.derivFee;
    return {
      title: PLAYBOOK_TITLE.derivatives,
      fee,
      feeName: "6 bps of notional on each of 8 weekly turns",
      openActions: 1,
      touchActions: CONST.derivTurns,
      exitActions: 1,
      hold: "The weekly turnover in the previous step is the activity; do not add another weekly transaction on top.",
      exit: "close the hedge and withdraw the remaining margin",
      risk: "Funding and a gap through the hedge can lose more than the fee allowance.",
      action: `Post ${u(pos)} margin and open a near-flat hedge, notional about ${u(notional)} (2×), such as a short perp against spot held. 1 action, about ${u(gas)}. Capital at risk: ${u(pos)}. Day 0.`,
      second: `Once a week, close and reopen that hedge: ${CONST.derivTurns} turns. Fee: 6 bps of notional each turn, ${CONST.derivTurns} × ${u(notional)} × 0.0006 = ${u(fee)}. About 20 minutes a week. If it cannot stay near flat, close and stop.`,
    };
  }
  if (book === "cdp") {
    const mint = pos * CONST.cdpLtv;
    const fee = mint * CONST.cdpApr * yearFrac;
    return {
      title: PLAYBOOK_TITLE.cdp,
      fee,
      feeName: "2% APR stability fee on the minted stablecoin",
      openActions: 3,
      touchActions: 1,
      exitActions: 3,
      hold: "Touch the position once to record activity, and check the collateral ratio each week.",
      exit: "repay the minted stablecoin and withdraw the collateral",
      risk: "If the collateral ratio breaks the app's safety line, the position can be liquidated.",
      action: `Post ${u(pos)} collateral and mint about 25% (${u(mint)}) of the app's stablecoin. 3 actions, about ${u(3 * gas)}. Capital posted: ${u(pos)}. Day 0. Leave the stablecoin in the wallet.`,
      second: `Stability fee: 2% APR for ${days} days on ${u(mint)} = ${u(fee)}. If the collateral ratio breaks the app's safety line, repay before adding more. Check weekly, about 10 minutes.`,
    };
  }
  if (book === "stake") {
    return {
      title: PLAYBOOK_TITLE.stake,
      fee: 0,
      feeName: "no extra fee, the snapshot names none",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "One transaction during the 8 weeks is enough. Do not restake the receipt.",
      exit: "start the unstake on day " + CONST.holdDays + " and wait out whatever unbond the app shows",
      risk: "Unbonding can run past day 56, and a receipt depeg sits on the staked amount.",
      action: `Stake ${u(pos)} of the asset the market already accepts. 2 actions, about ${u(2 * gas)}. Capital staked: ${u(pos)}. Day 0. Do not restake the receipt.`,
      second: `Fee line: $0, because the snapshot names none. Start the unstake on day ${days}; unbonding may run longer, so 8 weeks is a minimum hold, not the unlock time.`,
    };
  }
  if (book === "bridge") {
    const fee = pos * CONST.bridgeFee * 2;
    return {
      title: PLAYBOOK_TITLE.bridge,
      fee,
      feeName: "6 bps each way",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "Leave the bridged balance where it landed. One read of the destination balance is the weekly touch.",
      exit: "bridge the same amount back along the route you came",
      risk: "A bridge message can stall, and the fee allowance does not cover a failed message.",
      action: `Bridge ${u(pos)} of a major asset on a route the app already offers. 2 actions, about ${u(2 * gas)}. Capital in flight: ${u(pos)}. Day 0. One listed chain still uses this fee.`,
      second: `Fee: 6 bps each way, 2 × ${u(pos)} × 0.0006 = ${u(fee)}. The return on day ${days} is the exit. Do not send a second stack while the first is out.`,
    };
  }
  if (book === "rwa") {
    const fee = pos * CONST.rwaFee;
    return {
      title: PLAYBOOK_TITLE.rwa,
      fee,
      feeName: "0.25% subscription fee",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "After the subscription is accepted, hold it still. One weekly read is enough.",
      exit: "redeem or transfer the position back to the wallet",
      risk: "Allowlist and transfer-agent delays can push the calendar past 8 weeks, and the underlying can gate redemptions.",
      action: `Subscribe ${u(pos)} to the primary RWA market. Capital: ${u(pos)}. Budget 7 days for an allowlist before the hold, so about 9 weeks on the calendar. 2 actions, about ${u(2 * gas)}.`,
      second: `Subscription fee assumed at 0.25%, ${u(fee)}, because the snapshot names none. Hold ${days} days after acceptance. Do not loop it into a lender.`,
    };
  }
  if (book === "launchpad") {
    return {
      title: PLAYBOOK_TITLE.launchpad,
      fee: 0,
      feeName: "no sale fee, the snapshot names none",
      openActions: 2,
      touchActions: 4,
      exitActions: 1,
      hold: "If a sale is open, the commit is the activity. If none opens, the four weekly checks are the activity.",
      exit: "claim, or unfreeze the reserved capital if no sale opened",
      risk: "A sale can fill, slip, or never open; reserved capital earns nothing while it waits.",
      action: `Reserve ${u(pos)} for the sale the app lists. If none is open, leave it on the farm chain and check weekly. A commit is 2 actions, about ${u(2 * gas)}. Time: the week a sale opens, or 8 weeks if none does.`,
      second: `Fee line: $0, because the snapshot names no sale fee. Four weekly checks (about 10 minutes) are the activity if nothing is listed. Do not split the reserve.`,
    };
  }
  if (book === "insurance") {
    const fee = pos * CONST.coverPremium;
    return {
      title: PLAYBOOK_TITLE.insurance,
      fee,
      feeName: "1.5% premium on covered principal",
      openActions: 2,
      touchActions: 1,
      exitActions: 1,
      hold: "The cover runs for the 8 weeks. Set a reminder on day 49 so it does not lapse unnoticed.",
      exit: "let the cover expire, or cancel if the app returns unused premium",
      risk: "The premium is spent even when no claim is paid, and a claim can be refused.",
      action: `Buy ${days} days of cover on ${u(pos)} of principal, on a listed market. 2 actions, about ${u(2 * gas)}. Day 0. Cash outlay is the premium unless the app also escrows principal.`,
      second: `Premium assumed at 1.5% of principal, ${u(fee)}, because the snapshot names none. Do not buy a second policy. If principal is escrowed, capital in the app is ${u(pos)} plus the premium.`,
    };
  }
  if (book === "predict") {
    const stake = Math.round(pos * CONST.predictStakeShare);
    const fee = stake * CONST.predictFee;
    return {
      title: PLAYBOOK_TITLE.predict,
      fee,
      feeName: "2% of the stake for spread and fees",
      openActions: 1,
      touchActions: 1,
      exitActions: 1,
      hold: "Leave the ticket alone. One check during the 8 weeks is enough.",
      exit: "close the ticket when the market resolves, or on day " + CONST.holdDays + " if it is still open",
      risk: "A prediction market can go to zero on the stake; that is why the ticket is 10% of the position, not the whole of it.",
      action: `Stake ${u(stake)} (10% of ${u(pos)}) on one listed market and keep ${u(pos - stake)} in the wallet. 1 action, about ${u(gas)}. Day 0. One ticket, not a grid.`,
      second: `Fee: 2% of the stake, ${u(fee)}. Do not average down. Resolve or exit by day ${days}. If the market ends sooner, the hold ends then.`,
    };
  }
  if (book === "basis") {
    const fee = pos * CONST.derivFee * 2;
    return {
      title: PLAYBOOK_TITLE.basis,
      fee,
      feeName: "6 bps to open the perp and 6 bps to close",
      openActions: 2,
      touchActions: 1,
      exitActions: 2,
      hold: "Check once a week that the short still has enough margin. One transaction is budgeted if margin must be tapped.",
      exit: "buy back the perp and sell the spot, in that order",
      risk: "If the short needs more margin than the position holds, the hedge breaks and both legs should be closed.",
      action: `Buy ${u(pos)} of the basis spot and short the same notional. 2 actions, about ${u(2 * gas)}. If the short needs more margin, cap cash at ${u(pos)} and shrink the notional. Day 0.`,
      second: `Fee: 6 bps to open and 6 to close, 2 × ${u(pos)} × 0.0006 = ${u(fee)}. Keep net exposure near flat for ${days} days. If margin runs past the position, close both legs.`,
    };
  }
  return {
    title: PLAYBOOK_TITLE.deposit,
    fee: 0,
    feeName: "no extra fee, the snapshot names none",
    openActions: 2,
    touchActions: 1,
    exitActions: 2,
    hold: "One transaction during the 8 weeks is enough. Do not move the receipt to a second protocol.",
    exit: "withdraw the deposit back to the wallet",
    risk: "The category has no dedicated playbook, so this is a plain deposit and the contract risk is the whole position.",
    action: `Deposit ${u(pos)} in one asset into the primary market and stop. Capital in the app: ${u(pos)}. 2 actions, about ${u(2 * gas)}. Day 0. This category has no loop, pool, or hedge in the model.`,
    second: `Fee line: $0, because the snapshot names none. Do not move the receipt to a second protocol. Hold ${days} days and write down the balance weekly.`,
  };
}

export function farmPlan(p, impliedUsd) {
  const pos = positionUsd(p.tvl_usd);
  const chosen = chooseChain(p.chains);
  const book = playbookFor(p.category);
  const spec = bookSpec(book, pos, chosen.gas);
  const actions = spec.openActions + spec.touchActions + spec.exitActions;
  const gasCost = cents(actions * chosen.gas);
  const fee = cents(spec.fee);
  const cost = cents(gasCost + fee);
  const gasNote = chosen.known
    ? `Assumed gas on ${chosen.chain} is ${usdText(chosen.gas)} per action (stated table, not a live quote).`
    : `No named gas row for ${chosen.chain}; default ${usdText(chosen.gas)} per action.`;
  const why = chosen.known
    ? `${chosen.chain} is the cheapest chain here with a named gas assumption.`
    : `${chosen.chain} is used because no listed chain has a named gas assumption.`;
  const chg = pctText(p.change_7d);
  const steps = [
    `Open a fresh wallet on ${chosen.chain} and record the address. Chains on the record: ${chainListText(p.chains)}. ${gasNote} ${why} Time: under 1 hour. Capital this step: $0.`,
    `Size the position at ${usdText(pos)}, ${((pos / p.tvl_usd) * 100).toFixed(3)}% of TVL ${usdText(p.tvl_usd)}, under the 0.1% ceiling. Rule: ${CONST.positionBps} bps of TVL, clamped to ${usdText(CONST.positionMin)}–${usdText(CONST.positionMax)}, rounded to $100. Same hour. Cost so far: $0.`,
    spec.action,
    spec.second,
    `Hold ${CONST.holdDays} days. Points programs usually reward duration times size; hold 8 or more weeks. ${spec.hold} Budget ${spec.touchActions} extra transaction${spec.touchActions === 1 ? "" : "s"}, about ${usdText(spec.touchActions * chosen.gas)}, already in the total. A weekly note takes about 10 minutes.`,
    `Each week record position size, any points or XP, and TVL. The snapshot 7-day change was ${chg}. Tracking costs $0. If value falls 15% from ${usdText(pos)}, stop and exit.`,
    `Risk: this record shows no token, so points may never convert. The implied value of ${usdText(impliedUsd)} is this board's claim, not a prediction that a token is issued. ${spec.risk}`,
    `Exit on day ${CONST.holdDays}, or sooner if the 15% line trips: ${spec.exit}. Exit gas: ${spec.exitActions} actions, about ${usdText(spec.exitActions * chosen.gas)}. Fee: ${usdText(fee)} (${spec.feeName}). Gas for ${actions} actions: ${usdText(gasCost)}. Total estimated cost: ${usdText(cost)}. Keep points beside the transaction hashes.`,
  ];
  for (let i = 0; i < steps.length; i++) {
    const n = steps[i].trim().length;
    if (n < 20 || n > 600) throw new Error("farm step " + (i + 1) + " for playbook " + book + " is " + n + " chars");
  }
  return {
    steps,
    cost_usd: cost,
    position_usd: pos,
    chain: chosen.chain,
    gas_usd: chosen.gas,
    gas_known: chosen.known,
    weeks: 8,
    playbook: book,
    title: spec.title,
    actions,
    fee_usd: fee,
    gas_cost_usd: gasCost,
  };
}

export function rankLaunches(protocols, watchlist, floorUsd, asOf) {
  const watch = watchlist instanceof Set ? watchlist : new Set(watchlist);
  const comps = [];
  for (const p of protocols) if (isComp(p)) comps.push(p);
  comps.sort(bySlug);
  const fit = fitComps(comps, asOf);
  const rows = [];
  for (const p of protocols) {
    if (!isLaunch(p, watch, floorUsd)) continue;
    const value = impliedValue(p, fit, asOf);
    const plan = farmPlan(p, value.implied_value_usd);
    rows.push({
      protocol: p,
      value,
      plan,
      cohort: watch.has(p.slug) ? "watchlist" : "early",
    });
  }
  rows.sort((a, b) => {
    const d = b.value.implied_value_usd - a.value.implied_value_usd;
    if (d !== 0) return d;
    return bySlug(a.protocol, b.protocol);
  });
  for (let i = 0; i < rows.length; i++) rows[i].rank = i + 1;
  return { fit, comps, rows };
}
