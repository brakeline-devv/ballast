#!/usr/bin/env node
// ballast            → MCP server on stdio (what Claude / Cursor start)
// ballast dashboard  → website + dashboard on http://localhost:6100 (/app)
// ballast report     → print the X-Ray in the terminal
// ballast reset      → back to the demo portfolio
const cmd = process.argv[2] ?? "mcp";
if (cmd === "mcp") (await import("./mcp.js")).startMcp();
else if (cmd === "dashboard") (await import("./server.js")).startServer();
else if (cmd === "reset") { (await import("./portfolio.js")).reset(); console.log("Demo portfolio restored."); }
else if (cmd === "report") {
  const r = await (await import("./portfolio.js")).report();
  console.log(`Equity $${r.equity.toLocaleString()}  ·  risk ${r.score}/100 (${r.label})`);
  for (const f of r.findings) console.log(`  [${f.level}] ${f.title}: ${f.detail}`);
} else { console.error(`unknown command ${cmd}. Use: mcp | dashboard | report | reset`); process.exit(1); }
