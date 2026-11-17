// Daily closes for the last ~6 months from Yahoo Finance, cached once per day in data/history.json.
// If a symbol can't be fetched (offline, unknown ticker) X-Ray falls back to a clearly labelled synthetic
// series so the report still renders; the report lists which symbols are synthetic.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dataFile } from "./paths.js";
import { yahooSymbol, sectorOf } from "./universe.js";

const FILE = dataFile("history.json");
const today = () => new Date().toISOString().slice(0, 10);
const load = () => { try { return existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}; } catch { return {}; } };

async function fetchYahoo(sym, timeoutMs) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(sym))}?range=6mo&interval=1d`,
    { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0" } });
  const res = (await r.json())?.chart?.result?.[0];
  const ts = res?.timestamp, cl = res?.indicators?.quote?.[0]?.close;
  if (!ts?.length || !cl?.length) throw new Error("no data");
  const days = [], closes = [];
  ts.forEach((t, i) => { if (cl[i] > 0) { days.push(new Date(t * 1000).toISOString().slice(0, 10)); closes.push(+cl[i].toFixed(4)); } });
  if (closes.length < 30) throw new Error("too short");
  return { days, closes, source: "yahoo" };
}

// deterministic stand-in: a shared market factor + a sector factor + noise, seeded by the ticker
function synthetic(sym, n = 125) {
  let seed = [...sym].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const rnd = (s) => { s = (s * 1664525 + 1013904223) >>> 0; return [s, s / 2 ** 32]; };
  const gauss = (st) => { let u, v; [st, u] = rnd(st); [st, v] = rnd(st); return [st, Math.sqrt(-2 * Math.log(u || 1e-9)) * Math.cos(2 * Math.PI * v)]; };
  let sseed = [...sectorOf(sym)].reduce((a, c) => a * 17 + c.charCodeAt(0), 3) >>> 0, mseed = 99;
  const closes = [100], days = [];
  for (let i = 1; i < n; i++) {
    let m, s, e; [mseed, m] = gauss(mseed + i); [sseed, s] = gauss(sseed + i); [seed, e] = gauss(seed);
    closes.push(+(closes[i - 1] * Math.exp(0.009 * m + 0.008 * s + 0.012 * e)).toFixed(4));
  }
  const d = new Date(); for (let i = n - 1; i >= 0; i--) days.push(new Date(d - i * 86_400_000).toISOString().slice(0, 10));
  return { days, closes, source: "synthetic" };
}

export async function history(symbols, { timeoutMs = 6000 } = {}) {
  const cache = load(), out = {}, day = today();
  await Promise.all(symbols.map(async (s) => {
    if (cache[s]?.fetched === day && cache[s].source === "yahoo") { out[s] = cache[s]; return; }
    try { out[s] = { ...(await fetchYahoo(s, timeoutMs)), fetched: day }; cache[s] = out[s]; }
    catch { out[s] = cache[s]?.source === "yahoo" ? cache[s] : { ...synthetic(s), fetched: day }; }
  }));
  try { writeFileSync(FILE, JSON.stringify(cache)); } catch { /* read-only disk: fine */ }
  return out;
}
