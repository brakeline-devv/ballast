import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, plan, alignReturns } from "../src/xray.js";

// deterministic history: two tech stocks that move together, one bond fund that doesn't
const days = Array.from({ length: 80 }, (_, i) => `2026-01-${String(i + 1).padStart(3, "0")}`);
const walk = (seed, amp, follow) => { let p = 100; return days.map((_, i) => (p *= 1 + amp * Math.sin(i * seed) + (follow ? 0.01 * Math.sin(i * 1.3) : 0))); };
const H = (closes) => ({ days, closes, source: "yahoo" });
const hist = {
  NVDA: H(walk(1.3, 0.004, true)), AMD: H(walk(1.31, 0.004, true)),
  BND: H(walk(0.37, 0.002, false)), SPY: H(walk(1.29, 0.003, true)),
  VTI: H(walk(1.28, 0.003, true)), GLD: H(walk(0.71, 0.002, false)),
};

test("weights add up and the biggest holding is flagged", () => {
  const r = analyze({ cash: 1000, positions: { NVDA: 100, AMD: 20, BND: 5 } }, hist);
  const total = r.holdings.reduce((a, h) => a + h.weight, 0) + r.cash / r.equity;
  assert.ok(Math.abs(total - 1) < 1e-3);
  assert.equal(r.holdings[0].symbol, "NVDA");
  assert.ok(r.findings.some((f) => f.title.startsWith("NVDA is")));
  assert.ok(r.findings.some((f) => f.title.includes("in Tech")));
});

test("holdings that move together are grouped", () => {
  const r = analyze({ cash: 0, positions: { NVDA: 50, AMD: 50, BND: 50 } }, hist);
  assert.deepEqual([...r.groups[0].symbols].sort(), ["AMD", "NVDA"]);
});

test("a diversified account scores low risk", () => {
  const r = analyze({ cash: 500, positions: { VTI: 40, BND: 40 } }, hist);
  assert.ok(r.score < 30, `score ${r.score}`);
});

test("the plan brings every position and sector inside the limits", () => {
  const p = { cash: 0, positions: { NVDA: 100, AMD: 60, BND: 5 } };
  const pl = plan(p, hist);
  assert.ok(pl.orders.some((o) => o.side === "sell" && o.symbol === "NVDA"));
  const after = analyze(pl.after, hist);
  for (const h of after.holdings) if (!["Broad ETF", "Bonds & Cash-like"].includes(h.sector)) assert.ok(h.weight <= 0.15 + 0.01, `${h.symbol} ${h.weight}`);
  const tech = after.sectors.find((s) => s.sector === "Tech");
  assert.ok(!tech || tech.weight <= 0.35 + 0.01);
  assert.ok(after.score < analyze(p, hist).score);
  assert.ok(pl.after.cash >= 0);
});

test("never sells more than is held", () => {
  const pl = plan({ cash: 0, positions: { NVDA: 1 } }, hist);
  for (const o of pl.orders) if (o.side === "sell") assert.ok(o.qty <= 1);
});

test("crypto and stocks are aligned on common dates", () => {
  const crypto = { days: [...days, "2026-01-999"], closes: [...walk(0.9, 0.01, false), 50], source: "yahoo" };
  const { days: d } = alignReturns({ NVDA: hist.NVDA, BTC: crypto }, ["NVDA", "BTC"]);
  assert.equal(d.length, days.length);
});

test("buy caps from Brakeline limit the diversifier buys", () => {
  const p = { cash: 0, positions: { NVDA: 100, AMD: 60, BND: 5 } };
  const free = plan(p, hist);
  const capped = plan(p, hist, { buyCaps: { stock: 0.05, fund: 0.30, funds: ["VTI", "BND", "GLD", "SPY"] } });
  const eq = analyze(p, hist).equity;
  for (const o of capped.orders.filter((o) => o.side === "buy")) {
    const held = ((p.positions[o.symbol] || 0) + o.qty) * o.price;
    const cap = ["VTI", "BND", "GLD", "SPY"].includes(o.symbol) ? 0.30 : 0.05;
    assert.ok(held <= cap * eq + 1, `${o.symbol} ${held} > ${cap * eq}`);
  }
  assert.ok(capped.after.cash >= free.after.cash);
});
