// What X-Ray knows about each ticker: its sector and the Yahoo symbol for price history.
// Unknown tickers still work (sector "Other"); add them here to classify them.
export const SECTORS = {
  Tech: ["AAPL", "MSFT", "NVDA", "AMD", "GOOGL", "META", "AMZN", "PLTR", "AVGO", "ORCL", "CRM", "ADBE", "INTC", "TSM", "NFLX", "SHOP", "UBER"],
  "Consumer": ["TSLA", "NKE", "MCD", "SBUX", "COST", "WMT", "KO", "PEP", "DIS", "HD"],
  "Finance": ["HOOD", "COIN", "JPM", "BAC", "GS", "V", "MA", "PYPL", "SOFI", "BRK-B"],
  "Health": ["UNH", "JNJ", "LLY", "PFE", "MRNA", "ABBV"],
  "Energy": ["XOM", "CVX", "OXY"],
  "Industrial": ["BA", "CAT", "GE", "LMT"],
  "Crypto": ["BTC", "ETH", "SOL", "DOGE"],
  "Broad ETF": ["SPY", "VOO", "VTI", "QQQ", "DIA", "IWM"],
  "Bonds & Cash-like": ["TLT", "BND", "SGOV", "SHY"],
  "Gold": ["GLD", "IAU"],
};
export const sectorOf = (sym) => Object.entries(SECTORS).find(([, l]) => l.includes(sym))?.[0] ?? "Other";
export const CRYPTO = new Set(SECTORS.Crypto);
export const yahooSymbol = (sym) => (CRYPTO.has(sym) ? `${sym}-USD` : sym);

// Diversifiers the rebalance plan may suggest when cash needs a home, in order of preference.
export const DIVERSIFIERS = ["VTI", "BND", "GLD"];

// Demo portfolio: a typical retail Robinhood account (heavy in tech + crypto). Quantities, not dollars.
export const DEMO = {
  cash: 4200,
  positions: { NVDA: 120, AAPL: 60, TSLA: 40, PLTR: 300, AMD: 70, META: 14, HOOD: 150, COIN: 25, BTC: 0.09, ETH: 1.4, SPY: 8, KO: 30 },
};
