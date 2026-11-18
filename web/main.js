import C from "./config.js";

const $ = (s) => document.querySelector(s);
document.title = `${C.brand} · Portfolio X-Ray`;
$(".logo .name").textContent = C.brand;
document.querySelectorAll(".brand-name").forEach((e) => (e.textContent = C.brand));
const ICONS = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.77L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z"/></svg>',
  cli: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
};
$(".links").innerHTML = C.nav.filter((n) => n.href).map((n) => n.ext
  ? `<a href="${n.href}" target="_blank" rel="noopener" class="ext" aria-label="${n.label}">${ICONS[n.icon] || ""}<span>${n.label}</span></a>`
  : `<a href="${n.href}"${n.active ? ' class="on"' : ""}>${n.label}</a>`).join("");
Object.assign($(".demo"), { href: C.navCta.href, textContent: C.navCta.label });
$(".copy h1").innerHTML = C.title.map((l) => `<span>${l}</span>`).join("");
$(".copy .sub").innerHTML = C.sub.map((l) => `<span>${l}</span>`).join(" ");
Object.assign($(".start"), { href: C.cta.href, textContent: C.cta.label });

// The dashboard (/app) runs on the user's own computer. On the public site, "open the X-Ray" links
// point to the install steps instead.
const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
if (!isLocal) document.querySelectorAll('a[href="app"]').forEach((a) => {
  a.href = "#developers";
  if (a.closest(".links")) a.remove();
  else if (/X-Ray/.test(a.textContent)) a.textContent = a.classList.contains("demo") ? "Install" : "Install Ballast";
});

// token strip: shown only once a contract address is set in config.js
{
  const T = C.token || {}, bar = $("#token");
  if (bar && T.ca) {
    bar.hidden = false;
    bar.querySelector(".tk").textContent = `${T.ticker} · ${T.chain}`;
    bar.querySelector("code").textContent = T.ca;
    bar.querySelector(".buy").href = T.buy + T.ca;
    bar.querySelector(".exp").href = T.explorer + T.ca;
    const btn = bar.querySelector(".ca"), lab = bar.querySelector(".cpy");
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(T.ca); lab.textContent = "Copied"; } catch { lab.textContent = "Select & copy"; }
      setTimeout(() => (lab.textContent = "Copy"), 1600);
    });
  }
}

// keep the loop running if the browser pauses autoplay (tab switch, low-power mode); pause it off-screen
const v = $("video.bg");
const play = () => v.play().catch(() => {});
document.addEventListener("visibilitychange", () => { if (!document.hidden) play(); });
play();
new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause())).observe($(".hero"));

// nav turns solid once the hero is scrolled past
const nav = $(".nav");
const onScroll = () => nav.classList.toggle("solid", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true }); onScroll();

// reveal sections and type the terminal lines in as they enter the screen
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (!e.isIntersecting) return;
  e.target.classList.add("in"); io.unobserve(e.target);
  if (e.target.classList.contains("term")) e.target.querySelectorAll(".l").forEach((l, i) => (l.style.transitionDelay = `${i * 0.22}s`));
}), { threshold: 0.15 });
document.querySelectorAll(".reveal, .term").forEach((el) => io.observe(el));
