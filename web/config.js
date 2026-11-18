// All copy for the hero. Change the brand / text here; layout and motion stay the same.
export default {
  brand: "Ballast",
  nav: [
    { label: "Home", href: "#top", active: true },
    { label: "How it works", href: "#how" },
    { label: "Developers", href: "#developers" },
    { label: "X-Ray", href: "app" },
    // external links (icon + label, open in a new tab). Leave href empty to hide one (e.g. X until the account exists).
    { label: "CLI", icon: "cli", href: "https://www.npmjs.com/package/ballast-mcp", ext: true },
    { label: "GitHub", icon: "github", href: "https://github.com/brakeline-devv/ballast", ext: true },
    { label: "X", icon: "x", href: "https://x.com/ballastmcp", ext: true },
  ],
  // token strip under the hero. Hidden while `ca` is empty.
  token: {
    ticker: "$BALLAST",
    chain: "Robinhood Chain",
    ca: "", // contract address, e.g. "0x..."
    buy: "https://www.ponsfamily.com/launchpad/", // + ca
    explorer: "https://robinhoodchain.blockscout.com/token/", // + ca
  },
  navCta: { label: "Open X-Ray", href: "app" },
  title: ["Every Asset In.", "One Clear", "Risk Picture."],
  // two fixed lines, clipped to the same box width as the reference
  sub: ["Portfolio X-Ray for AI agents: hidden concentration, sector exposure and", "correlations, plus a rebalance plan your agent runs through Brakeline."],
  cta: { label: "Run the X-Ray", href: "app" },
};
