// X-Ray dashboard: reads /api/xray and draws the report, the correlation heatmap and the rebalance plan.
const $ = (s) => document.querySelector(s);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const usd = (x) => `$${Math.round(x).toLocaleString("en-US")}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const COLORS = ["#6a16ff", "#ff2fd8", "#8f6bff", "#c8b6ff", "#ff7ae6", "#4b2bb8", "#b04cff", "#5ad1ff", "#4ee39a", "#ffb547", "#9a99a7"];
const LIMITS = { maxPosition: 15, maxSector: 35, maxCrypto: 10, minCash: 3 };
const NAMES = { maxPosition: "Max per position", maxSector: "Max per sector", maxCrypto: "Max in crypto", minCash: "Cash buffer" };
let data, busy = false;

const scoreColor = (s) => (s < 30 ? "#4ee39a" : s < 55 ? "#ffb547" : s < 75 ? "#ff7a5a" : "#ff2f6d");

async function load() {
  $("#status").textContent = "running X-Ray…";
  const q = new URLSearchParams(LIMITS).toString();
  const r = await fetch(`/api/xray?${q}`);
  data = await r.json();
  if (data.error) { $("#status").textContent = data.error; return; }
  render();
}

function render() {
  const { report: R, plan: P, portfolio } = data;
  const m = R.metrics;
  $("#status").textContent = `${R.holdings.length} holdings · prices to ${m.to}${R.synthetic.length ? ` · synthetic: ${R.synthetic.join(", ")}` : ""}`;

  // score gauge
  $("#score").textContent = R.score; $("#label").textContent = `${R.label} risk`;
  const g = $("#gauge"); g.style.stroke = scoreColor(R.score); g.style.color = scoreColor(R.score);
  requestAnimationFrame(() => (g.style.strokeDashoffset = 314.16 * (1 - R.score / 100)));

  const kpis = [
    ["Account value", usd(R.equity), `${usd(R.cash)} cash`],
    ["Volatility (yearly)", pct(m.volatility, 0), m.spyVolatility ? `S&P 500: ${pct(m.spyVolatility, 0)}` : ""],
    ["Beta vs S&P 500", m.beta?.toFixed(2) ?? "–", m.beta ? `market −10% → you ≈ −${(m.beta * 10).toFixed(0)}%` : ""],
    ["Worst drop (6 mo)", `−${pct(m.maxDrawdown, 1)}`, `holding today's positions`],
    ["Behaves like", `${m.effectivePositions} stocks`, `${R.holdings.length} positions held`],
    ["Crypto", pct(m.crypto), `cap ${LIMITS.maxCrypto}%`],
  ];
  $("#kpis").innerHTML = kpis.map(([a, b, c]) => `<div class="kpi"><small>${a}</small><b>${b}</b><span>${c}</span></div>`).join("");

  $("#findings").innerHTML = R.findings.map((f) => `<li><span class="lv ${f.level}">${f.level}</span><div><b>${esc(f.title)}</b><p>${esc(f.detail)}</p></div></li>`).join("");

  // donut
  let a0 = -Math.PI / 2; const C = 100, rO = 90, rI = 58;
  const arcs = R.sectors.map((s, i) => {
    const a1 = a0 + s.weight * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
    const P1 = (r, a) => `${C + r * Math.cos(a)},${C + r * Math.sin(a)}`;
    const d = s.weight > 0.9999 ? `M${P1(rO, 0)} A${rO},${rO} 0 1 1 ${P1(rO, Math.PI)} A${rO},${rO} 0 1 1 ${P1(rO, 0)} M${P1(rI, 0)} A${rI},${rI} 0 1 0 ${P1(rI, Math.PI)} A${rI},${rI} 0 1 0 ${P1(rI, 0)}`
      : `M${P1(rO, a0)} A${rO},${rO} 0 ${large} 1 ${P1(rO, a1)} L${P1(rI, a1)} A${rI},${rI} 0 ${large} 0 ${P1(rI, a0)} Z`;
    a0 = a1; return `<path d="${d}" fill="${s.sector === "Cash" ? "#3a3746" : COLORS[i % COLORS.length]}" stroke="#0c0b10" stroke-width="2"/>`;
  });
  $("#donut").innerHTML = arcs.join("") + `<text x="100" y="96" text-anchor="middle" fill="#f2f1f6" font-size="26" font-weight="700" font-family="Figtree">${pct(R.sectors[0].weight, 0)}</text><text x="100" y="118" text-anchor="middle" fill="#9a99a7" font-size="12" font-family="Figtree">${esc(R.sectors[0].sector)}</text>`;
  $("#legend").innerHTML = R.sectors.map((s, i) => `<li><i style="background:${s.sector === "Cash" ? "#3a3746" : COLORS[i % COLORS.length]}"></i><span>${esc(s.sector)}</span><em>${pct(s.weight)}</em></li>`).join("");

  // holdings
  const cap = R.limits.maxPosition, scale = Math.max(cap * 1.5, R.holdings[0].weight);
  $("#capnote").textContent = `white line = ${pct(cap, 0)} cap`;
  $("#holdings").innerHTML = `<tr><th>Ticker</th><th>Sector</th><th class="num">Value</th><th class="num">Weight</th><th></th></tr>` + R.holdings.map((h) =>
    `<tr><td class="sym">${esc(h.symbol)}</td><td class="sec">${esc(h.sector)}</td><td class="num">${usd(h.value)}</td><td class="num">${pct(h.weight)}</td>
     <td><div class="wbar"><i class="${h.weight > cap && !["Broad ETF", "Bonds & Cash-like"].includes(h.sector) ? "over" : ""}" style="width:${(h.weight / scale) * 100}%"></i><u style="left:${(cap / scale) * 100}%"></u></div></td></tr>`).join("");

  // correlation heatmap
  const S = R.correlation.symbols, M = R.correlation.matrix, cell = 38, pad = 52, n = S.length;
  const col = (v) => v >= 0 ? `rgba(255,47,216,${Math.min(1, v) * .9 + .05})` : `rgba(90,209,255,${Math.min(1, -v) * .9 + .05})`;
  let svg = "";
  S.forEach((s, i) => {
    svg += `<text x="${pad - 8}" y="${pad + i * cell + cell / 2 + 4}" text-anchor="end">${esc(s)}</text>`;
    svg += `<text x="${pad + i * cell + cell / 2}" y="${pad - 10}" text-anchor="middle">${esc(s)}</text>`;
    S.forEach((_, j) => { const v = M[i][j]; svg += `<g class="cell"><rect x="${pad + j * cell + 1}" y="${pad + i * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="6" fill="${i === j ? "#1c1a24" : col(v)}"><title>${S[i]} / ${S[j]}: ${v}</title></rect>${i === j ? "" : `<text x="${pad + j * cell + cell / 2}" y="${pad + i * cell + cell / 2 + 4}" text-anchor="middle">${v.toFixed(1)}</text>`}</g>`; });
  });
  const hs = $("#heat"); hs.setAttribute("width", pad + n * cell + 4); hs.setAttribute("height", pad + n * cell + 4); hs.innerHTML = svg;

  // plan
  const A = P.afterReport;
  $("#ba").innerHTML = `<span class="pill" style="color:${scoreColor(R.score)}">${R.score} · ${R.label}</span><span>→</span><span class="pill" style="color:${scoreColor(A.score)}">${A.score} · ${A.label}</span><span class="hint">${P.orders.length} orders · ${usd(P.turnover)} traded</span>`;
  $("#orders").innerHTML = P.orders.length ? `<tr><th>Side</th><th>Ticker</th><th class="num">Qty</th><th class="num">≈ USD</th><th>Why</th></tr>` + P.orders.map((o) =>
    `<tr><td class="${o.side}">${o.side.toUpperCase()}</td><td class="sym">${esc(o.symbol)}</td><td class="num">${o.qty}</td><td class="num">${usd(o.notional)}</td><td class="why">${esc(o.why)}</td></tr>`).join("")
    : `<tr><td class="why">Nothing to do: the account is inside every limit.</td></tr>`;
  $("#apply").disabled = !P.orders.length;

  // editor (only when not being edited)
  if (document.activeElement !== $("#positions")) $("#positions").value = Object.entries(portfolio.positions).map(([k, v]) => `${k} ${v}`).join("\n");
  if (document.activeElement !== $("#cash")) $("#cash").value = portfolio.cash;
}

// limits sliders
$("#limits").innerHTML = Object.entries(LIMITS).map(([k, v]) => `<label>${NAMES[k]} <b id="v-${k}">${v}%</b><input type="range" min="${k === "minCash" ? 0 : 5}" max="${k === "minCash" ? 20 : k === "maxSector" ? 80 : 50}" value="${v}" data-k="${k}"></label>`).join("");
let t;
$("#limits").addEventListener("input", (e) => {
  const k = e.target.dataset.k; if (!k) return;
  LIMITS[k] = +e.target.value; $(`#v-${k}`).textContent = `${LIMITS[k]}%`;
  clearTimeout(t); t = setTimeout(load, 250);
});

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json());
$("#apply").onclick = async () => { if (busy) return; busy = true; await post(`/api/apply?${new URLSearchParams(LIMITS)}`); busy = false; load(); };
$("#demo").onclick = async () => { await post("/api/reset"); $("#editmsg").textContent = "Demo account loaded."; load(); };
$("#save").onclick = async () => {
  const positions = {};
  for (const line of $("#positions").value.split(/\n/)) { const [s, q] = line.trim().split(/[\s,:=]+/); if (s && +q > 0) positions[s.toUpperCase()] = +q; }
  const r = await post("/api/portfolio", { cash: +$("#cash").value || 0, positions });
  $("#editmsg").textContent = r.error ? r.error : `Saved ${Object.keys(r.positions).length} positions.`;
  if (!r.error) load();
};
load();
