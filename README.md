# Ballast · Portfolio X-Ray for AI agents

**Every asset in. One clear risk picture.** · [Website](https://ballastmcp.com) · [npm](https://www.npmjs.com/package/ballast-mcp) · works with [Brakeline](https://brakeline.trade) · [X](https://x.com/ballastmcp)

Most portfolios look diversified on the app screen: twelve tickers, a few colors. Ballast is an MCP server and
dashboard that reads the actual holdings, prices them over the last six months and shows how the account really
behaves. Then it plans the fix.

- **Risk score 0-100** from position size, sector and crypto concentration, effective number of positions,
  volatility vs the S&P 500 and the 6-month drawdown.
- **Findings in plain words, with numbers**: "PLTR is 26% of the account. A 30% drop in PLTR alone costs 7.8% of everything."
- **Correlation heatmap**: holdings that move together (daily correlation ≥ 0.7) are grouped and weighed as one bet.
- **Rebalance plan**: trims what is above the caps (position 15%, sector 35%, crypto 10%) and parks the proceeds in
  broad diversifiers (VTI, BND, GLD by default) without pushing anything else over a cap. Score before and after.
- **Read-only.** Ballast never sends an order. On a real account the agent places the plan through
  [Brakeline](https://brakeline.trade), so every order is risk-checked. If Brakeline is installed, Ballast reads its
  caps and sizes every buy so Brakeline will accept it.

## Install

Needs Node 20 or newer.

```
claude mcp add ballast -- npx -y ballast-mcp
claude mcp add brakeline -- npx -y brakeline      # the guard that executes the plan
```

Claude Desktop / Cursor (`mcpServers` in the config file):

```json
"ballast": { "command": "npx", "args": ["-y", "ballast-mcp"] }
```

Dashboard (runs on your computer): `npx ballast-mcp dashboard`, then open http://localhost:6100/app

Then ask your agent: *"X-Ray my portfolio, propose a rebalance and run it through Brakeline after I approve."*

## Tools

| Tool | What it does |
|---|---|
| `xray_report` | Risk score, every finding, weights per holding and sector, metrics |
| `get_correlation` | Daily-return correlation matrix of the holdings |
| `rebalance_plan` | Orders that bring the account inside the limits, score before/after, notes. Does not trade |
| `apply_rebalance_simulated` | Applies the plan to the simulated portfolio only |
| `get_portfolio` / `set_portfolio` | Read or replace the analysed holdings (quantities; crypto as BTC/ETH/SOL/DOGE) |

Limits (`maxPosition`, `maxSector`, `maxCrypto`, `minCash`) and `diversifiers` can be passed to `xray_report` and
`rebalance_plan`, or moved with the sliders in the dashboard.

## Tested with Claude

A real Claude session (simulation account): read the holdings from Brakeline, load them into Ballast, X-Ray,
plan, execute through Brakeline.

| | |
|---|---|
| Starting account | 9 positions, 77% in tech, PLTR 28% |
| Ballast risk score | **68 (High) → 16 (Low)** |
| Orders | 5 sells + 3 buys (VTI, BND, GLD), **all 8 passed Brakeline** |
| Beta vs S&P 500 | 2.19 → 1.44 |
| Max drawdown (6 mo) | 21.6% → 14.2% |

## Data

Prices: Yahoo Finance daily closes, cached once a day. If a ticker can't be fetched, a clearly labelled synthetic
series is used and the report says so. State lives in `./data` (git checkout) or `~/.ballast` (npm), or `BALLAST_HOME`.

The starting portfolio is a demo retail account (heavy tech + crypto). Replace it in the dashboard, or let the agent
call `set_portfolio` with what it reads from the broker.

## Develop

```
npm install
npm start      # site + dashboard on http://localhost:6100
npm test
```

The hero animation is rendered in Blender from `blender/scene.py`.

Independent project, not affiliated with or endorsed by Robinhood. Analysis only, not investment advice. MIT license.
