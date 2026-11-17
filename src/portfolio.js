// The portfolio X-Ray looks at. Simulation: a demo retail account in data/portfolio.json that the human
// (dashboard) or the agent (set_portfolio) can replace with their real holdings.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataFile } from "./paths.js";
import { DEMO, DIVERSIFIERS } from "./universe.js";
import { history } from "./prices.js";
import { analyze, plan } from "./xray.js";
import { brakelineLimits, FUNDS } from "./brakeline.js";

const FILE = dataFile("portfolio.json");
const clean = (p) => {
  const positions = {};
  for (const [k, v] of Object.entries(p?.positions || {})) {
    const sym = String(k).trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    const q = Number(v);
    if (sym && isFinite(q) && q > 0) positions[sym] = q;
  }
  const cash = Math.max(0, Number(p?.cash) || 0);
  return { cash, positions };
};
export function load() { try { return existsSync(FILE) ? clean(JSON.parse(readFileSync(FILE, "utf8"))) : clean(DEMO); } catch { return clean(DEMO); } }
export function save(p) { const c = clean(p); if (!Object.keys(c.positions).length) throw new Error("portfolio needs at least one position"); writeFileSync(FILE, JSON.stringify(c, null, 2)); return c; }
export function reset() { return save(DEMO); }

async function histFor(p, extra = []) { return history([...new Set([...Object.keys(p.positions), "SPY", ...DIVERSIFIERS, ...extra.map((s) => String(s).toUpperCase())])]); }
export async function report(limits, p = load()) { return analyze(p, await histFor(p), limits); }
// Brakeline's caps are applied to the plan's buys when Brakeline is installed (XRAY_IGNORE_BRAKELINE=1 to skip)
export const guard = () => (process.env.XRAY_IGNORE_BRAKELINE ? { found: false } : brakelineLimits());
export async function rebalance(limits = {}, p = load()) {
  const g = guard();
  const L = g.found ? { ...limits, buyCaps: { stock: g.stock, fund: g.fund, funds: [...FUNDS] } } : limits;
  const h = await histFor(p, limits?.diversifiers || []), pl = plan(p, h, L);
  const afterReport = analyze(pl.after, h, limits);
  const idle = afterReport.cash / afterReport.equity;
  const notes = [];
  if (g.found) notes.push(`Buys are sized to your Brakeline caps (${(g.stock * 100).toFixed(1)}% per stock, ${(g.fund * 100).toFixed(1)}% per broad fund), so every order should pass Brakeline.`);
  if (idle > 0.15) notes.push(`${(idle * 100).toFixed(0)}% of the account would sit in cash after the plan${g.found ? " because of the Brakeline caps" : ""}. Add more diversifiers or raise the caps to put it to work.`);
  return { ...pl, before: analyze(p, h, limits), afterReport, brakeline: g.found ? { stock: g.stock, fund: g.fund } : null, notes };
}
// apply the plan to the simulated portfolio (the real account is never touched from here)
export async function applyPlan(limits) { const r = await rebalance(limits); save(r.after); return r; }
