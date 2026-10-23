// "Why" mode: numbered pins on every element that carries data-why="…".
// Turn it on with ?why=1, or from the index page with postMessage({ why: true }).
// Each note says which finding or reference the element comes from.

(function () {
  let on = new URLSearchParams(location.search).get("why") === "1";
  let layer = null;
  let pop = null;
  let raf = 0;

  const css = `
    .why-layer{position:fixed;inset:0;pointer-events:none;z-index:2147483000}
    .why-pin{position:absolute;pointer-events:auto;min-width:22px;height:22px;padding:0 6px;border-radius:11px;
      background:#ffd400;color:#111;font:600 12px/22px system-ui,sans-serif;text-align:center;border:0;cursor:pointer;
      box-shadow:0 0 0 2px #111;font-variant-numeric:tabular-nums}
    .why-pin:focus-visible{outline:2px solid #111;outline-offset:2px}
    .why-outline{position:absolute;border:1.5px dashed #c9a800;border-radius:6px;pointer-events:none}
    .why-pop{position:fixed;z-index:2147483001;max-width:280px;background:#111;color:#fff;border-radius:10px;
      padding:10px 12px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}
    .why-pop b{display:block;font-weight:600;margin-bottom:2px;color:#ffd400}
  `;

  function ensure() {
    if (layer) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    layer = document.createElement("div");
    layer.className = "why-layer";
    document.body.appendChild(layer);
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") return null;
    return r;
  }

  function draw() {
    raf = 0;
    if (!on) { if (layer) layer.innerHTML = ""; return; }
    ensure();
    layer.innerHTML = "";
    let n = 0;
    document.querySelectorAll("[data-why]").forEach((el) => {
      const r = visible(el);
      if (!r) return;
      n += 1;
      const box = document.createElement("div");
      box.className = "why-outline";
      Object.assign(box.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      const pin = document.createElement("button");
      pin.className = "why-pin";
      pin.textContent = String(n);
      pin.setAttribute("aria-label", `Why ${n}: ${el.dataset.why}`);
      Object.assign(pin.style, { left: `${Math.min(innerWidth - 26, r.right - 11)}px`, top: `${Math.max(2, r.top - 11)}px` });
      pin.addEventListener("click", (e) => { e.stopPropagation(); show(pin, el); });
      layer.append(box, pin);
    });
  }

  function show(pin, el) {
    hide();
    pop = document.createElement("div");
    pop.className = "why-pop";
    const [head, ...rest] = el.dataset.why.split(" | ");
    pop.innerHTML = rest.length ? `<b></b><span></span>` : `<span></span>`;
    if (rest.length) { pop.querySelector("b").textContent = head; pop.querySelector("span").textContent = rest.join(" "); }
    else pop.querySelector("span").textContent = head;
    document.body.appendChild(pop);
    const r = pin.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left - w / 2))}px`;
    pop.style.top = `${r.bottom + 6 + pop.offsetHeight > innerHeight ? r.top - pop.offsetHeight - 6 : r.bottom + 6}px`;
  }
  function hide() { if (pop) { pop.remove(); pop = null; } }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
  addEventListener("scroll", schedule, true);
  addEventListener("resize", schedule);
  addEventListener("click", hide);
  addEventListener("message", (e) => {
    if (e.data && typeof e.data.why === "boolean") { on = e.data.why; hide(); schedule(); }
  });
  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  addEventListener("load", schedule);
  window.KRIYAN_WHY = { refresh: schedule, set: (v) => { on = v; schedule(); } };
})();
