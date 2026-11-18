// Ballast (Portfolio X-Ray) MCP server (stdio). Read-only analysis plus a rebalance plan.
// Orders are never sent to a broker from here: the agent executes the plan through Brakeline's
// place_order (so every order is risk-checked), or applies it to the simulated portfolio.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import * as pf from "./portfolio.js";
import { DEFAULT_LIMITS } from "./xray.js";

const obj = (properties = {}, required = []) => ({ type: "object", properties, required });
const LIMITS = obj({
  maxPosition: { type: "number", description: `Max share of the account in one position (0-1). Default ${DEFAULT_LIMITS.maxPosition}` },
  maxSector: { type: "number", description: `Max share in one sector (0-1). Default ${DEFAULT_LIMITS.maxSector}` },
  maxCrypto: { type: "number", description: `Max share in crypto (0-1). Default ${DEFAULT_LIMITS.maxCrypto}` },
  minCash: { type: "number", description: `Cash buffer to keep (0-1). Default ${DEFAULT_LIMITS.minCash}` },
  diversifiers: { type: "array", items: { type: "string" }, description: "Tickers to buy with the freed cash, in order of preference. Default VTI, BND, GLD. Use only tickers your broker (or Brakeline's simulator) can trade, e.g. [\"SPY\"]." },
});
const compact = (r) => ({
  equity: r.equity, cash: r.cash, riskScore: `${r.score}/100 (${r.label})`, findings: r.findings,
  holdings: r.holdings?.map((h) => `${h.symbol} ${(h.weight * 100).toFixed(1)}% (${h.sector})`),
  sectors: r.sectors?.map((s) => `${s.sector} ${(s.weight * 100).toFixed(1)}%`),
  movesTogether: r.groups?.map((g) => `${g.symbols.join(" + ")}: ${(g.weight * 100).toFixed(1)}%`),
  metrics: r.metrics, limits: r.limits,
  ...(r.synthetic?.length ? { warning: `No real price history for ${r.synthetic.join(", ")}: synthetic series used for them.` } : {}),
});

const TOOLS = [
  { name: "xray_report", description: "X-Ray of the portfolio: risk score 0-100, every finding (oversized positions, sector and crypto concentration, holdings that move together, beta, drawdown), weights per holding and per sector. Read-only. Call this first.", inputSchema: LIMITS, run: async (a) => compact(await pf.report(a)) },
  { name: "get_correlation", description: "Daily-return correlation matrix between the holdings over the last ~6 months.", inputSchema: obj(), run: async () => (await pf.report()).correlation },
  { name: "rebalance_plan", description: "Orders that bring the account inside the limits (trim oversized positions/sectors/crypto, park the proceeds in broad diversifiers), with the risk score before and after. Does NOT trade. To execute on a real account, place each order through Brakeline's place_order so it is risk-checked; show the plan to the human first.", inputSchema: LIMITS, run: async (a) => { const r = await pf.rebalance(a); return { orders: r.orders, turnover: r.turnover, riskBefore: `${r.before.score} (${r.before.label})`, riskAfter: `${r.afterReport.score} (${r.afterReport.label})`, cashAfter: r.after.cash, notes: r.notes, brakelineCaps: r.brakeline, findingsAfter: r.afterReport.findings }; } },
  { name: "apply_rebalance_simulated", description: "Apply the rebalance plan to the SIMULATED portfolio only (no broker). Use to show the human the result.", inputSchema: LIMITS, run: async (a) => { const r = await pf.applyPlan(a); return { applied: r.orders.length, riskAfter: `${r.afterReport.score} (${r.afterReport.label})` }; } },
  { name: "get_portfolio", description: "Positions (quantities) and cash X-Ray is analysing.", inputSchema: obj(), run: async () => pf.load() },
  { name: "set_portfolio", description: "Replace the analysed portfolio, e.g. with the human's real holdings read from their broker. Quantities, not dollars. Crypto as BTC/ETH/SOL/DOGE.", inputSchema: obj({ cash: { type: "number" }, positions: { type: "object", additionalProperties: { type: "number" }, description: '{"AAPL": 10, "BTC": 0.05}' } }, ["positions"]), run: async (a) => pf.save(a) },
];

export async function startMcp() {
  const server = new Server({ name: "ballast", version: "0.1.1" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params: { name, arguments: args = {} } }) => {
    const t = TOOLS.find((x) => x.name === name);
    if (!t) return { isError: true, content: [{ type: "text", text: `Unknown tool ${name}` }] };
    try { return { content: [{ type: "text", text: JSON.stringify(await t.run(args), null, 2) }] }; }
    catch (e) { return { isError: true, content: [{ type: "text", text: String(e.message ?? e) }] }; }
  });
  await server.connect(new StdioServerTransport());
}
