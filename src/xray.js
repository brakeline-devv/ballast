// Portfolio X-Ray: what the account is really made of, and a plan to fix it.
// Pure functions: analyze(portfolio, history, limits) and plan(portfolio, history, limits).
import { sectorOf, CRYPTO, DIVERSIFIERS } from "./universe.js";

export const DEFAULT_LIMITS = { maxPosition: 0.15, maxSector: 0.35, maxCrypto: 0.10, minCash: 0.03, corrThreshold: 0.7 };
// sectors that are already diversified on their own; the sector cap doesn't apply to them
const UNCAPPED = new Set(["Broad ETF", "Bonds & Cash-like"]);

const r2 = (x) => Math.round(x * 100) / 100, r4 = (x) => Math.round(x * 1e4) / 1e4;
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

// line up daily log-returns on the dates every symbol traded (crypto trades on weekends, stocks don't)
export function alignReturns(hist, symbols) {
  const sets = symbols.map((s) => new Set(hist[s].days));
  let days = hist[symbols[0]].days.filter((d) => sets.every((st) => st.has(d)));
  const closes = {};
  if (days.length >= 30) {
    for (const s of symbols) { const m = new Map(hist[s].days.map((d, i) => [d, hist[s].closes[i]])); closes[s] = days.map((d) => m.get(d)); }
  } else { // mixed sources with no common calendar: align the most recent bars
    const n = Math.min(...symbols.map((s) => hist[s].closes.length));
    for (const s of symbols) closes[s] = hist[s].closes.slice(-n);
    days = hist[symbols[0]].days.slice(-n);
  }
  const rets = Object.fromEntries(symbols.map((s) => [s, closes[s].slice(1).map((c, i) => Math.log(c / closes[s][i]))]));
  return { days, closes, rets };
}

function cov(a, b) { const ma = mean(a), mb = mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); }

export function analyze(portfolio, hist, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const syms = Object.keys(portfolio.positions).filter((s) => portfolio.positions[s] > 0 && hist[s]);
  const missing = Object.keys(portfolio.positions).filter((s) => portfolio.positions[s] > 0 && !hist[s]);
  const price = Object.fromEntries(syms.map((s) => [s, hist[s].closes.at(-1)]));
  const value = Object.fromEntries(syms.map((s) => [s, portfolio.positions[s] * price[s]]));
  const invested = syms.reduce((a, s) => a + value[s], 0), cash = portfolio.cash || 0, equity = invested + cash;
  if (!syms.length || equity <= 0) return { empty: true, equity, cash, holdings: [], findings: [{ level: "info", title: "No positions", detail: "Add positions to see the X-Ray." }] };

  const w = Object.fromEntries(syms.map((s) => [s, value[s] / equity]));
  const holdings = syms.map((s) => ({ symbol: s, sector: sectorOf(s), qty: portfolio.positions[s], price: r4(price[s]), value: r2(value[s]), weight: r4(w[s]), source: hist[s].source }))
    .sort((a, b) => b.value - a.value);

  // sectors
  const sectorMap = {};
  for (const h of holdings) sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.weight;
  const sectors = Object.entries(sectorMap).map(([sector, weight]) => ({ sector, weight: r4(weight) })).sort((a, b) => b.weight - a.weight);
  if (cash > 0) sectors.push({ sector: "Cash", weight: r4(cash / equity) });

  // returns, correlation, covariance (SPY for beta even if not held)
  const withSpy = hist.SPY ? [...new Set([...syms, "SPY"])] : syms;
  const { rets, days, closes } = alignReturns(hist, withSpy);
  const corr = syms.map((a) => syms.map((b) => { const c = cov(rets[a], rets[b]) / Math.sqrt(cov(rets[a], rets[a]) * cov(rets[b], rets[b])); return r2(isFinite(c) ? c : 0); }));
  let pv = 0;
  for (const a of syms) for (const b of syms) pv += w[a] * w[b] * cov(rets[a], rets[b]);
  const vol = Math.sqrt(Math.max(pv, 0) * 252);
  const pr = rets[syms[0]].map((_, i) => syms.reduce((s, k) => s + w[k] * rets[k][i], 0));
  const spy = rets.SPY;
  const beta = spy ? cov(pr, spy) / cov(spy, spy) : null;
  const spyVol = spy ? Math.sqrt(cov(spy, spy) * 252) : null;

  // drawdown of today's holdings over the window (constant quantities)
  const series = closes[syms[0]].map((_, i) => cash + syms.reduce((s, k) => s + portfolio.positions[k] * closes[k][i], 0));
  let peak = series[0], maxDD = 0;
  for (const v of series) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, 1 - v / peak); }
  const periodReturn = series.at(-1) / series[0] - 1;

  // concentration
  const risky = syms.reduce((a, s) => a + w[s], 0);
  // a broad ETF or bond fund already holds hundreds of names: count it as 20 equal slices
  const effN = 1 / syms.reduce((a, s) => a + (UNCAPPED.has(sectorOf(s)) ? (w[s] / risky) ** 2 / 20 : (w[s] / risky) ** 2), 0);
  const cryptoW = syms.filter((s) => CRYPTO.has(s)).reduce((a, s) => a + w[s], 0);

  // groups of holdings that move together (correlation >= threshold, each holding >= 2%)
  const big = syms.map((s, i) => [s, i]).filter(([s]) => w[s] >= 0.02);
  const parent = Object.fromEntries(big.map(([s]) => [s, s]));
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, i] of big) for (const [b, j] of big) if (i < j && corr[i][j] >= L.corrThreshold) parent[find(a)] = find(b);
  const groups = Object.values(big.reduce((g, [s]) => ((g[find(s)] ||= []).push(s), g), {}))
    .filter((g) => g.length > 1).map((g) => ({ symbols: g.sort((a, b) => w[b] - w[a]), weight: r4(g.reduce((a, s) => a + w[s], 0)) }))
    .sort((a, b) => b.weight - a.weight);

  // findings, worst first
  const F = [];
  const top = holdings[0];
  if (top.weight > L.maxPosition) F.push({ level: top.weight > L.maxPosition * 1.6 ? "high" : "medium", title: `${top.symbol} is ${pct(top.weight)} of the account`, detail: `One position above your ${pct(L.maxPosition)} cap. A 30% drop in ${top.symbol} alone would cost ${pct(top.weight * 0.3)} of the whole account.` });
  for (const h of holdings.slice(1)) if (h.weight > L.maxPosition) F.push({ level: "medium", title: `${h.symbol} is ${pct(h.weight)} of the account`, detail: `Also above the ${pct(L.maxPosition)} position cap.` });
  for (const s of sectors) if (s.sector !== "Cash" && !UNCAPPED.has(s.sector) && s.weight > L.maxSector) F.push({ level: s.weight > 0.5 ? "high" : "medium", title: `${pct(s.weight)} in ${s.sector}`, detail: `Above your ${pct(L.maxSector)} sector cap: ${holdings.filter((h) => h.sector === s.sector).map((h) => h.symbol).join(", ")} tend to fall together on sector news.` });
  if (cryptoW > L.maxCrypto) F.push({ level: cryptoW > 2 * L.maxCrypto ? "high" : "medium", title: `${pct(cryptoW)} in crypto`, detail: `Above your ${pct(L.maxCrypto)} crypto cap. Crypto can drop 50%+ in weeks.` });
  for (const g of groups) if (g.weight > 0.25) F.push({ level: g.weight > 0.45 ? "high" : "medium", title: `${g.symbols.join(" + ")} move together (${pct(g.weight)})`, detail: `Daily correlation of ${L.corrThreshold} or more over the last ${days.length} trading days: these act like one big bet, not ${g.symbols.length} separate ones.` });
  if (effN < 5) F.push({ level: effN < 3 ? "high" : "medium", title: `Behaves like ${effN.toFixed(1)} stocks`, detail: `${syms.length} positions, but weighted so unevenly that the account is as diversified as ${effN.toFixed(1)} equal positions.` });
  if (beta && beta > 1.3) F.push({ level: "medium", title: `Beta ${beta.toFixed(2)} vs the S&P 500`, detail: `When the market falls 10%, this account has tended to fall about ${(beta * 10).toFixed(0)}%.` });
  if (cash / equity < L.minCash) F.push({ level: "info", title: `Cash ${pct(cash / equity)}`, detail: `Below the ${pct(L.minCash)} buffer: no dry powder for a dip without selling something.` });
  if (!F.length) F.push({ level: "ok", title: "No hidden concentration found", detail: "Every position, sector and correlation group is within your limits." });
  const order = { high: 0, medium: 1, info: 2, ok: 3 };
  F.sort((a, b) => order[a.level] - order[b.level]);

  // risk score 0-100 (higher = riskier)
  const over = (x, cap) => Math.max(0, x / cap - 1);
  const maxSec = Math.max(0, ...sectors.filter((s) => s.sector !== "Cash" && !UNCAPPED.has(s.sector)).map((s) => s.weight));
  const score = Math.round(Math.min(100,
    18 * Math.min(1, over(top.weight, L.maxPosition)) +
    22 * Math.min(1, over(maxSec, L.maxSector)) +
    16 * Math.min(1, over(cryptoW, L.maxCrypto) / 2) +
    16 * Math.min(1, Math.max(0, (8 - effN) / 6)) +
    16 * Math.min(1, spyVol ? Math.max(0, vol / spyVol - 1) : 0) +
    12 * Math.min(1, maxDD / 0.3)));
  const label = score < 30 ? "Low" : score < 55 ? "Moderate" : score < 75 ? "High" : "Extreme";

  return {
    equity: r2(equity), cash: r2(cash), invested: r2(invested), limits: L,
    score, label, holdings, sectors, groups, findings: F,
    metrics: { volatility: r4(vol), spyVolatility: spyVol && r4(spyVol), beta: beta && r2(beta), maxDrawdown: r4(maxDD), periodReturn: r4(periodReturn), effectivePositions: r2(effN), crypto: r4(cryptoW), days: days.length, from: days[0], to: days.at(-1) },
    correlation: { symbols: syms, matrix: corr },
    synthetic: syms.filter((s) => hist[s].source !== "yahoo"), missing,
  };
}

// Orders that bring the account inside the limits: trim what's too big, park the proceeds in diversifiers.
export function plan(portfolio, hist, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const syms = Object.keys(portfolio.positions).filter((s) => portfolio.positions[s] > 0 && hist[s]);
  const px = (s) => hist[s].closes.at(-1);
  const target = Object.fromEntries(syms.map((s) => [s, portfolio.positions[s] * px(s)]));
  const equity = (portfolio.cash || 0) + syms.reduce((a, s) => a + target[s], 0);
  const why = {};
  const note = (s, m) => { (why[s] ||= []).push(m); };

  // 1. position cap (broad ETFs and bond funds are diversified already)
  for (const s of syms) if (!UNCAPPED.has(sectorOf(s)) && target[s] > L.maxPosition * equity) { target[s] = L.maxPosition * equity; note(s, `position cap ${pct(L.maxPosition)}`); }
  // 2. sector cap: scale every holding in the sector down proportionally
  const bySector = {};
  for (const s of syms) (bySector[sectorOf(s)] ||= []).push(s);
  for (const [sec, list] of Object.entries(bySector)) {
    if (UNCAPPED.has(sec)) continue;
    const tot = list.reduce((a, s) => a + target[s], 0);
    if (tot > L.maxSector * equity) { const k = (L.maxSector * equity) / tot; for (const s of list) { target[s] *= k; note(s, `${sec} cap ${pct(L.maxSector)}`); } }
  }
  // 3. crypto cap
  const cr = syms.filter((s) => CRYPTO.has(s)), crTot = cr.reduce((a, s) => a + target[s], 0);
  if (crTot > L.maxCrypto * equity) { const k = (L.maxCrypto * equity) / crTot; for (const s of cr) { target[s] *= k; note(s, `crypto cap ${pct(L.maxCrypto)}`); } }

  // sells: crypto fractional to 4 decimals, stocks in whole shares (round up so the cap is really met)
  const orders = [];
  let freed = 0;
  for (const s of syms) {
    const cut = portfolio.positions[s] * px(s) - target[s];
    if (cut <= 0.5) continue;
    let qty = CRYPTO.has(s) ? Math.ceil((cut / px(s)) * 1e4) / 1e4 : Math.ceil(cut / px(s) - 1e-9);
    qty = Math.min(qty, portfolio.positions[s]);
    if (qty <= 0) continue;
    freed += qty * px(s);
    orders.push({ symbol: s, side: "sell", qty, price: r4(px(s)), notional: r2(qty * px(s)), why: why[s].filter((v, i, a) => a.indexOf(v) === i).join(", ") });
  }

  // buys: spread what is above the cash buffer across the diversifiers that have prices
  const cashAfter = (portfolio.cash || 0) + freed;
  const spend = Math.max(0, cashAfter - L.minCash * equity);
  // each diversifier only gets the room its own position/sector cap leaves; the rest goes to uncapped funds
  const div = (limits.diversifiers?.length ? limits.diversifiers.map((s) => String(s).toUpperCase()) : DIVERSIFIERS).filter((s) => hist[s]);
  if (spend > 50 && div.length) {
    const held = (s) => (portfolio.positions[s] || 0) * px(s);
    const sectorHeld = (sec) => syms.filter((k) => sectorOf(k) === sec).reduce((a, k) => a + target[k], 0);
    // optional buy caps from the broker-side guard (Brakeline): never plan a buy it would block
    const bc = limits.buyCaps, funds = new Set(bc?.funds || []);
    const guardRoom = (s) => (bc ? Math.max(0, (funds.has(s) ? bc.fund : bc.stock) * equity * 0.995 - held(s)) : Infinity);
    const room = Object.fromEntries(div.map((s) => [s, Math.min(guardRoom(s), UNCAPPED.has(sectorOf(s)) ? Infinity
      : Math.max(0, Math.min(L.maxPosition * equity - held(s), L.maxSector * equity - sectorHeld(sectorOf(s)))))]));
    const alloc = Object.fromEntries(div.map((s) => [s, 0]));
    let left = spend;
    for (let pass = 0; pass < div.length && left > 1; pass++) {
      const open = div.filter((s) => room[s] - alloc[s] > 1);
      if (!open.length) break;
      const share = left / open.length;
      for (const s of open) { const add = Math.min(share, room[s] - alloc[s]); alloc[s] += add; left -= add; }
    }
    for (const s of div) {
      const qty = Math.floor(alloc[s] / px(s));
      if (qty > 0) orders.push({ symbol: s, side: "buy", qty, price: r4(px(s)), notional: r2(qty * px(s)), why: `diversifier (${sectorOf(s)})${bc && room[s] - alloc[s] <= 1 ? ", sized to the Brakeline cap" : ""}` });
    }
  }

  const after = { cash: portfolio.cash || 0, positions: { ...portfolio.positions } };
  for (const o of orders) {
    after.positions[o.symbol] = r4((after.positions[o.symbol] || 0) + (o.side === "buy" ? o.qty : -o.qty));
    after.cash += o.side === "buy" ? -o.notional : o.notional;
  }
  after.cash = r2(after.cash);
  for (const k of Object.keys(after.positions)) if (after.positions[k] <= 0) delete after.positions[k];
  return { orders, after, turnover: r2(orders.reduce((a, o) => a + o.notional, 0)) };
}
