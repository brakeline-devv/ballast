// Website + dashboard + local API on http://localhost:6100 (127.0.0.1 only: the dashboard is for the human).
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import * as pf from "./portfolio.js";

const ROOT = fileURLToPath(new URL("../web/", import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" };
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch { r({}); } }); });
const limitsFrom = (q) => Object.fromEntries(["maxPosition", "maxSector", "maxCrypto", "minCash"].filter((k) => q.has(k)).map((k) => [k, Math.min(1, Math.max(0.01, Number(q.get(k)) / 100))]));

async function api(req, res, url) {
  const origin = req.headers.origin; // refuse cross-site writes from other websites
  if (req.method !== "GET" && origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json(res, 403, { error: "forbidden origin" });
  const L = limitsFrom(url.searchParams), p = url.pathname;
  try {
    if (p === "/api/xray" && req.method === "GET") return json(res, 200, { portfolio: pf.load(), report: await pf.report(L), plan: await pf.rebalance(L) });
    if (p === "/api/portfolio" && req.method === "POST") return json(res, 200, pf.save(await body(req)));
    if (p === "/api/apply" && req.method === "POST") { const r = await pf.applyPlan(L); return json(res, 200, { applied: r.orders.length }); }
    if (p === "/api/reset" && req.method === "POST") return json(res, 200, pf.reset());
    return json(res, 404, { error: "not found" });
  } catch (e) { return json(res, 400, { error: e.message }); }
}

export function startServer(port = Number(process.env.PORT || 6100)) {
  createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/")) return api(req, res, url);
    if (p === "/app" || p === "/app/") p = "/app.html";
    if (p.endsWith("/")) p += "index.html";
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403).end(); return; }
    try {
      const { size } = await stat(file), type = TYPES[extname(file)] || "application/octet-stream";
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ""), data = await readFile(file);
      if (range) { // byte ranges so the hero video can seek and loop
        const a = range[1] ? +range[1] : 0, b = range[2] ? +range[2] : size - 1;
        res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${a}-${b}/${size}`, "Accept-Ranges": "bytes", "Content-Length": b - a + 1 });
        res.end(data.subarray(a, b + 1));
      } else { res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" }); res.end(data); }
    } catch { res.writeHead(404).end("not found"); }
  }).listen(port, "127.0.0.1", () => console.log(`Ballast → site http://localhost:${port}  ·  dashboard http://localhost:${port}/app`));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) startServer();
