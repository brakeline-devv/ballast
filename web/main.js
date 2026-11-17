import C from "./config.js";

const $ = (s) => document.querySelector(s);
document.title = `${C.brand} · Portfolio X-Ray`;
$(".logo .name").textContent = C.brand;
document.querySelectorAll(".brand-name").forEach((e) => (e.textContent = C.brand));
$(".links").innerHTML = C.nav.map((n) => `<a href="${n.href}"${n.active ? ' class="on"' : ""}>${n.label}</a>`).join("");
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
