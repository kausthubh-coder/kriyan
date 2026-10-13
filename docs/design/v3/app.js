// Renders the Kriyan prototype screens. Each page sets <body data-screen="...">.
// Static markup only: the point is layout, type, colour and states, checked by `critly check`.

const I = (d, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ic = {
  inbox: I('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
  today: I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
  upcoming: I('<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  goal: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  habit: I('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  browse: I('<path d="m12.83 2.18 8.58 3.9a.5.5 0 0 1 0 .92l-8.58 3.91a2 2 0 0 1-1.66 0L2.6 7a.5.5 0 0 1 0-.92l8.58-3.9a2 2 0 0 1 1.66 0Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65M22 12.65l-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  settings: I('<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
  plus: I('<path d="M5 12h14M12 5v14"/>'),
  repeat: I('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  bell: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  flag: I('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
  pin: I('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
  right: I('<path d="m9 18 6-6-6-6"/>'),
  down: I('<path d="m6 9 6 6 6-6"/>'),
  left: I('<path d="m15 18-6-6 6-6"/>'),
  x: I('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: I('<path d="M20 6 9 17l-5-5"/>'),
  more: I('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
  note: I('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>'),
  arrow: I('<path d="M5 12h14M12 5l7 7-7 7"/>'),
  panel: I('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>'),
  cake: I('<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3"/>'),
  agent: I('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>'),
  link: I('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  list: I('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  heading: I('<path d="M6 12h12M6 20V4M18 20V4"/>'),
  quote: I('<path d="M17 6H3M21 12H8M21 18H8M3 12v6"/>'),
  todo: I('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4M13 6h8M13 12h8M13 18h8"/>'),
};

/* The mark: a day drawn as one brush stroke (ensō), open where you are now. */
function enso() {
  const R = 9.2, r = 6.35, d = 1.25, phi = 32, a = 78, b = 20 + 360; // clock degrees
  const rad = (deg) => ((deg - 90) * Math.PI) / 180;
  const ic0 = [12 + d * Math.cos(rad(phi)), 12 + d * Math.sin(rad(phi))];
  const O = (deg) => [12 + R * Math.cos(rad(deg)), 12 + R * Math.sin(rad(deg))];
  const In = (deg) => [ic0[0] + r * Math.cos(rad(deg)), ic0[1] + r * Math.sin(rad(deg))];
  const f = (p) => p.map((v) => v.toFixed(2)).join(" ");
  const cap = (deg) => { const o = O(deg), i = In(deg); const cx = (o[0] + i[0]) / 2, cy = (o[1] + i[1]) / 2; const rr = Math.hypot(o[0] - i[0], o[1] - i[1]) / 2; return `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rr.toFixed(2)}"/>`; };
  const path = `M${f(O(a))}A${R} ${R} 0 1 1 ${f(O(b))}L${f(In(b))}A${r} ${r} 0 1 0 ${f(In(a))}Z`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${path}"/>${cap(a)}${cap(b)}</svg>`;
}
const MARK = enso();
window.KRIYAN_MARK = MARK;

const sp = { school: ["blue", 245], calc: ["blue", 245], physics: ["blue", 245], work: ["orange", 62], kriyan: ["purple", 305], launch: ["purple", 305], clients: ["orange", 62], life: ["green", 150] };
const col = (k) => `var(--${sp[k][0]})`;
const blk = (k) => `--c:var(--${sp[k][0]});--bs:var(--${sp[k][0]}-surface)`;

/* ---------- Shell ---------- */
function sidebar(active) {
  const nav = (id, icon, label, count, href) => `<a class="nav" href="${href}" ${active === id ? 'aria-current="page"' : ""}>${icon}${label}${count ? `<span class="count">${count}</span>` : ""}</a>`;
  const space = (k, label, depth, id) => `<a class="space ${depth ? "d" + depth : ""}" href="space.html" ${active === id ? 'aria-current="page"' : ""}><span class="dot" style="--c:${col(k)}"></span>${label}</a>`;
  return `<aside class="side" aria-label="Main">
    <div class="brand">${MARK}<span>kriyan</span><button class="btn icon" aria-label="Hide sidebar">${ic.panel}</button></div>
    ${nav("inbox", ic.inbox, "Inbox", 3, "today.html")}
    ${nav("today", ic.today, "Today", "", "today.html")}
    ${nav("upcoming", ic.upcoming, "Upcoming", "", "upcoming.html")}
    <div class="group">Spaces</div>
    ${space("school", "School", 0)}
    ${space("calc", "Calculus II", 1)}
    ${space("physics", "Physics", 1)}
    ${space("work", "Work", 0)}
    ${space("kriyan", "Kriyan", 1, "kriyan")}
    ${space("launch", "Launch", 2)}
    ${space("clients", "Clients", 1)}
    ${space("life", "Life", 0)}
    <div class="group">Progress</div>
    ${nav("goals", ic.goal, "Goals", "", "progress.html")}
    ${nav("habits", ic.habit, "Habits", "", "progress.html")}
    <div class="bottom">
      <a class="nav" href="command.html">${ic.search}Search<kbd>Ctrl K</kbd></a>
      <a class="nav" href="today.html">${ic.settings}Settings</a>
    </div>
  </aside>`;
}
function appbar(title, actions = "") {
  return `<header class="appbar"><h1>${title}</h1>${actions}<button class="btn icon" aria-label="Search">${ic.search}</button></header>`;
}
function navbar(active) {
  const a = (id, icon, label, href) => `<a href="${href}" ${active === id ? 'aria-current="page"' : ""}><span class="pill">${icon}</span>${label}</a>`;
  return `<nav class="navbar" aria-label="Main">${a("today", ic.today, "Today", "today.html")}${a("upcoming", ic.upcoming, "Upcoming", "upcoming.html")}${a("inbox", ic.inbox, "Inbox", "today.html")}${a("browse", ic.browse, "Browse", "space.html")}</nav>
  <button class="fab press" aria-label="Add task">${ic.plus}</button>`;
}
function page(active, inner, extra = "", cls = "") {
  return `<div class="shell ${cls}">${sidebar(active)}<main class="main">${inner}</main></div>${navbar(active === "kriyan" ? "browse" : active === "goals" ? "browse" : active)}${extra}`;
}
/* While a modal is open, everything behind it is inert: no focus, no clicks, hidden from screen readers (Overlays). */
function makeInert(when) {
  const phone = matchMedia("(max-width: 760px)").matches;
  if (when === "always" || (when === "phone" && phone)) {
    document.querySelectorAll(".shell, .appbar, .navbar, .fab, .panel.behind").forEach((el) => { el.inert = true; });
  }
}

/* ---------- Pieces ---------- */
function task({ k, title, info = [], len = "", done = false, sel = false }) {
  return `<div class="task ${done ? "done" : ""}" ${sel ? 'aria-selected="true"' : ""}>
    <button class="check press ${done ? "done" : ""}" style="--c:${col(k)}" aria-label="${done ? "Mark not done" : "Complete"}: ${title}">${done ? ic.check : ""}</button>
    <button class="body"><span class="title">${title}</span>${info.length ? `<span class="info">${info.map((x) => `<span>${x}</span>`).join("")}</span>` : ""}</button>
    ${len ? `<span class="len">${len}</span>` : ""}
  </div>`;
}
function timeline({ from, to, H, blocks, now, extra = "" }) {
  const y = (h, m = 0) => (h - from + m / 60) * H + 8;
  const nowMin = now ? now[0] * 60 + now[1] : -1;
  let s = "";
  for (let h = from; h <= to; h++) {
    const near = Math.abs(h * 60 - nowMin) <= 30;
    s += `<div class="hour" style="top:${y(h)}px"><span class="tnum">${near ? "" : String(h).padStart(2, "0") + ":00"}</span></div>`;
  }
  for (const b of blocks) {
    const top = y(b.h1, b.m1) + 1, height = y(b.h2, b.m2) - y(b.h1, b.m1) - 2;
    const t = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const lead = b.event ? `<span class="ev"></span>` : `<button class="check press ${b.done ? "done" : ""}" aria-label="Complete: ${b.title}">${b.done ? ic.check : ""}</button>`;
    s += `<div class="block ${b.cls || ""} ${b.done ? "done" : ""}" style="${blk(b.k)};top:${top}px;height:${height}px">${lead}<div class="txt"><span class="t">${b.title}</span>${height >= 44 ? `<span class="m tnum">${b.meta || `${t(b.h1, b.m1)}–${t(b.h2, b.m2)}`}</span>` : ""}</div></div>`;
  }
  if (now) s += `<div class="now-line" style="top:${y(now[0], now[1])}px"></div><span class="now-label tnum" style="top:${y(now[0], now[1])}px">${String(now[0]).padStart(2, "0")}:${String(now[1]).padStart(2, "0")}</span>`;
  return `<div class="timeline" style="height:${y(to) + 8}px">${s}${extra}</div>`;
}

function todayColumn({ drag = true, sel = false } = {}) {
  const H = 56, from = 11, y = (h, m = 0) => (h - from + m / 60) * H + 8;
  return `
  <div class="column">
    <div class="head">
      <div><h1>Today</h1><p class="sub">Tue 13 Oct</p></div>
      <div class="right"><span class="meta">3 h 20 min free</span></div>
    </div>
    <label class="add">${ic.plus}<span class="vh">Add a task</span><input placeholder="Add a task, like “essay fri 5pm every week”"><kbd>N</kbd></label>

    <section class="now-block" aria-label="Now">
      <span class="eyebrow"><span class="dot"></span>Now, until 12:30</span>
      <h2>Write MCP tools</h2>
      <div class="row"><div class="bar" style="--p:72%"><i></i></div><span class="meta tnum">25 min left</span><button class="btn">${ic.check}Done</button></div>
      <p class="next">${ic.arrow}<span class="tnum">13:00</span><b>Lunch with Maya</b></p>
    </section>

    <section class="habits" aria-label="Habits today">
      <button class="habit press" aria-pressed="true"><span class="check done" style="--c:var(--green)">${ic.check}</span>Read</button>
      <button class="habit press" aria-pressed="false"><span class="check" style="--c:var(--green)"></span>Run</button>
      <button class="habit press" aria-pressed="false"><span class="check" style="--c:var(--blue)"></span>Duolingo</button>
    </section>

    <section class="section">
      <div class="section-head"><h3>Anytime today</h3><span class="meta">4 left</span></div>
      <div class="rows">
        ${task({ k: "calc", title: "Problem set 4", info: [`${ic.flag}Due Thu`, `${ic.bell}2`], len: "1 h", sel })}
        ${task({ k: "clients", title: "Send invoice to Ardent", info: [`${ic.repeat}Last day of the month`], len: "15 min" })}
        ${task({ k: "kriyan", title: "Reply to Sam about the launch date" })}
        ${task({ k: "life", title: "Order a birthday present for Mum", info: [`${ic.cake}Fri 16 Oct`, `${ic.note}Note`] })}
        ${task({ k: "life", title: "Book the dentist", done: true })}
      </div>
      <div class="earlier">2 from earlier<button class="btn">Move to today</button><button class="btn">Pick a day</button></div>
    </section>

    <section class="section">
      <div class="section-head"><h3>Schedule</h3><button class="btn quiet" style="margin-left:auto">Earlier today, 2 done</button></div>
      ${timeline({ from, to: 20, H, now: [12, 20], blocks: [
        { k: "kriyan", h1: 11, m1: 0, h2: 12, m2: 30, title: "Write MCP tools" },
        { k: "life", h1: 13, m1: 0, h2: 13, m2: 45, title: "Lunch with Maya", event: true, cls: "half" },
        { k: "clients", h1: 13, m1: 0, h2: 14, m2: 0, title: "Client call: Ardent", event: true, cls: "half2" },
        { k: "calc", h1: 14, m1: 30, h2: 15, m2: 30, title: "Problem set 4", cls: drag ? "lift" : "" },
        { k: "life", h1: 17, m1: 30, h2: 18, m2: 30, title: "Run 6 km", meta: `${ic.repeat}Every 2 days after done` },
        { k: "calc", h1: 19, m1: 0, h2: 20, m2: 0, title: "Read chapter 7.4" },
      ], extra: drag ? `<div class="drag-tip tnum" style="top:${y(14, 30) - 30}px">14:30–15:30</div>` : "" })}
    </section>
  </div>`;
}

/* ---------- Screens ---------- */
const screens = {
  today() {
    return appbar("Today", `<span class="meta" style="margin-left:auto">3 h 20 min free</span>`) .replace('<button class="btn icon" aria-label="Search">', '<button class="btn icon" aria-label="Search" style="margin-left:0">') + page("today", todayColumn());
  },

  task() {
    const panel = `
    <div class="sheet-scrim"></div>
    <aside class="panel" aria-label="Task">
      <div class="panel-top"><span class="crumb"><span class="dot" style="--c:var(--blue)"></span><b>School</b>/<b>Calculus II</b></span><button class="btn icon" aria-label="More">${ic.more}</button><button class="btn icon" aria-label="Close">${ic.x}</button></div>
      <div class="panel-body">
        <div class="panel-title"><button class="check press" style="--c:var(--blue)" aria-label="Complete: Calculus II lecture"></button><span>Calculus II lecture</span></div>
        <div class="props">
          <div class="prop"><span class="k">${ic.clock}When</span><div class="v"><button class="btn">Tue 13 Oct, 09:00–10:30</button></div></div>
          <div class="prop"><span class="k">${ic.repeat}Repeat</span><div class="v"><button class="btn" aria-expanded="true">Every Tue and Thu, until 11 Dec</button></div></div>
          <div class="prop"><span class="k">${ic.bell}Reminders</span><div class="v"><button class="btn">10 min before${ic.x.replace('class="i"', 'class="i x"')}</button><button class="btn">Day before at 20:00${ic.x.replace('class="i"', 'class="i x"')}</button><button class="btn empty">Add reminder</button></div></div>
          <div class="prop"><span class="k">${ic.pin}Where</span><div class="v"><button class="btn">Room 204</button></div></div>
          <div class="prop"><span class="k">${ic.flag}Deadline</span><div class="v"><button class="btn empty">Add deadline</button></div></div>
          <div class="prop"><span class="k">${ic.goal}Goal</span><div class="v"><button class="btn empty">Add to a goal</button></div></div>
        </div>
        <div class="rule"></div>
        <div class="note">
          <h4>Before class</h4>
          <div class="todo done"><i>${ic.check}</i>Read 7.3, integration by parts</div>
          <div class="todo"><i></i>Bring problem set 4</div>
          <ul><li>Ask about the substitution in example 6</li><li>Office hours moved to Wednesday</li></ul>
          <p class="ghost"><span class="caret"></span> Type / for blocks</p>
        </div>
      </div>
    </aside>
    <div class="popover" style="right:452px;top:96px" role="dialog" aria-label="Repeat">
      <label class="field">${ic.repeat}<span class="vh">Repeat rule</span><input value="every tue and thu until dec 11"></label>
      <p class="parsed">${ic.check}Every Tuesday and Thursday, until Fri 11 Dec</p>
      <div class="chips">
        <button class="chip">Every day</button><button class="chip">Weekdays</button><button class="chip on" aria-pressed="true">Weekly</button>
        <button class="chip">Monthly on the 13th</button><button class="chip">Last day of the month</button><button class="chip">Every year on 13 Oct</button>
      </div>
      <div class="line-row">Every<button class="select">1</button><button class="select">week${ic.down}</button>on</div>
      <div class="days">${["M", "T", "W", "T", "F", "S", "S"].map((d, i) => `<button class="day" aria-pressed="${i === 1 || i === 3}" aria-label="${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}">${d}</button>`).join("")}</div>
      <div class="line-row">Ends<button class="select">on a date${ic.down}</button><button class="select">Fri 11 Dec</button></div>
      <div class="line-row">Repeats from<button class="select">the schedule${ic.down}</button></div>
      <div class="preview"><span class="caption">Next five</span>${["Thu 15 Oct", "Tue 20 Oct", "Thu 22 Oct", "Tue 27 Oct", "Thu 29 Oct"].map((d) => `<div class="r tnum"><span>${d}</span><span>09:00–10:30</span></div>`).join("")}</div>
      <div class="pop-foot"><button class="btn">Cancel</button><button class="btn primary press">Save repeat</button></div>
    </div>`;
    return appbar("Today") + page("today", todayColumn({ drag: false }), panel.replace('<aside class="panel"', '<aside class="panel behind"'), "with-panel");
  },

  panel() {
    return screens.task().replace(/<div class="popover"[\s\S]*$/, "").replace('<aside class="panel behind"', '<aside class="panel"').replace('aria-expanded="true"', 'aria-expanded="false"');
  },

  upcoming() {
    const H = 44, from = 8, to = 20, y = (h, m = 0) => (h - from + m / 60) * H;
    const days = [
      ["Mon", 12, 4.5, 7], ["Tue", 13, 6.5, 7, true], ["Wed", 14, 3, 7], ["Thu", 15, 8, 7], ["Fri", 16, 5, 6], ["Sat", 17, 1, 5], ["Sun", 18, 0, 5],
    ];
    const due = { 3: [ic.flag, "Problem set 4 due"], 4: [ic.cake, "Mum's birthday"], 6: [ic.flag, "Invoice due"] };
    const ev = {
      0: [["physics", 10, 0, 11, 30, "Physics lab", 1], ["clients", 14, 0, 16, 0, "Ardent sprint"]],
      1: [["calc", 9, 0, 10, 30, "Calculus II", 1], ["kriyan", 11, 0, 12, 30, "Write MCP tools"], ["life", 13, 0, 13, 45, "Lunch with Maya", 1], ["calc", 14, 30, 15, 30, "Problem set 4"], ["life", 17, 30, 18, 30, "Run 6 km"]],
      2: [["physics", 10, 0, 11, 0, "Physics lecture", 1], ["clients", 15, 0, 16, 30, "Ardent review"]],
      3: [["calc", 9, 0, 10, 30, "Calculus II", 1], ["kriyan", 11, 0, 13, 0, "Launch page copy", 0, "proposed"], ["clients", 14, 0, 15, 0, "Client call", 1], ["kriyan", 15, 30, 17, 0, "Record the demo", 0, "proposed"], ["life", 18, 0, 19, 0, "Football", 1]],
      4: [["kriyan", 10, 0, 12, 0, "Ship the CLI", 0, "proposed"], ["calc", 13, 0, 14, 0, "Office hours", 1], ["life", 17, 30, 18, 30, "Run 6 km"]],
      5: [["life", 10, 0, 11, 0, "Groceries"]],
      6: [],
    };
    const t = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const cols = days.map((d, i) => `<div class="wcol" style="grid-column:${i + 2};grid-row:2;height:${y(to)}px">${ev[i].map(([k, h1, m1, h2, m2, title, event, cls]) => {
      const top = y(h1, m1) + 1, height = y(h2, m2) - y(h1, m1) - 2;
      return `<div class="block ${cls || ""}" style="${blk(k)};top:${top}px;height:${height}px">${event ? '<span class="ev" style="margin:4px 0 0"></span>' : ""}<div class="txt"><span class="t">${title}</span>${height >= 40 ? `<span class="m tnum">${t(h1, m1)}</span>` : ""}</div></div>`;
    }).join("")}${i === 1 ? `<div class="now-line" style="top:${y(12, 20)}px;left:0"></div>` : ""}</div>`).join("");
    const head = days.map(([dn, n, p, f, today], i) => `<div class="wday ${today ? "today" : ""}" style="grid-column:${i + 2};grid-row:1"><span class="d">${dn}<span class="n tnum">${n}</span></span><div class="load ${p > f ? "over" : ""}" style="--p:${Math.min(100, (p / f) * 100)}%"><i></i></div><span class="lt tnum ${p > f ? "over" : ""}">${p > f ? `${p} h, ${p - f} h over` : `${p} of ${f} h`}</span>${due[i] ? `<span class="due">${due[i][0]}${due[i][1]}</span>` : `<span class="due"></span>`}</div>`).join("");
    const agenda = `<div class="agenda">${[
      ["Tomorrow", "Wed 14 Oct", "3 of 7 h", [["physics", "10:00", "Physics lecture"], ["clients", "15:00", "Ardent review"]]],
      ["Thursday", "15 Oct", "8 h, 1 h over", [["calc", "All day", "Problem set 4 due"], ["calc", "09:00", "Calculus II"], ["kriyan", "11:00", "Launch page copy"], ["clients", "14:00", "Client call"]], true],
      ["Friday", "16 Oct", "5 of 6 h", [["life", "All day", "Mum's birthday"], ["kriyan", "10:00", "Ship the CLI"]]],
    ].map(([d, date, load, items, over]) => `<section class="aday"><div class="dh"><h3>${d}</h3><span class="meta" style="margin-left:0">${date}</span><span class="meta ${over ? "late" : ""}">${load}</span></div><div class="load ${over ? "over" : ""}" style="--p:${over ? 100 : 50}%"><i></i></div>${items.map(([k, when, what]) => `<button class="aitem" style="--c:${col(k)}"><span class="when tnum">${when}</span><span class="bar"></span>${what}</button>`).join("")}</section>`).join("")}</div>`;
    const inner = `
    <div class="week-main">
      <div class="head big">
        <div><h1>12 to 18 Oct</h1><p class="sub">33 h planned of 44 h free</p></div>
        <div class="right"><button class="btn icon" aria-label="Previous week">${ic.left}</button><button class="btn">This week</button><button class="btn icon" aria-label="Next week">${ic.right}</button></div>
      </div>
      <div class="week">
        ${head}
        <div class="wtimes" style="grid-column:1;grid-row:2;height:${y(to)}px">${Array.from({ length: to - from }, (_, k) => (k ? `<span class="tnum" style="top:${k * H}px">${String(from + k).padStart(2, "0")}:00</span>` : "")).join("")}</div>
        ${cols}
      </div>
      ${agenda}
    </div>
    <div class="proposal" role="status">${ic.agent}<span>Claude proposed 3 blocks for Thu and Fri</span><button class="btn">Review</button><button class="btn">Discard</button><button class="btn primary press">Accept all</button></div>`;
    return appbar("Upcoming") + page("upcoming", inner);
  },

  space() {
    const inner = `
    <div class="column" style="max-width:1040px">
      <div>
        <p class="breadcrumb"><span class="dot" style="--c:var(--orange)"></span>Work</p>
        <div class="title-row"><span class="dot" style="--c:var(--purple)"></span><h1 class="space-title">Kriyan</h1><span class="title-actions"><button class="btn">${ic.plus}Add space</button><button class="btn primary press">${ic.plus}Add task</button></span></div>
        <p class="stats"><span>6 open</span><span>14 done this month</span><span class="tnum">11 h 30 min this week</span></p>
      </div>
      <div class="space-cols">
        <div style="display:grid;gap:48px;align-content:start">
          <section class="section"><div class="section-head"><h3>Next</h3></div><div class="rows">
            ${task({ k: "kriyan", title: "Write MCP tools", info: ["Today, 11:00–12:30"] })}
            ${task({ k: "kriyan", title: "Launch page copy", info: ["Thu 15 Oct", `${ic.goal}Launch by 1 Nov`], len: "2 h" })}
            ${task({ k: "kriyan", title: "Record the demo video", info: ["Thu 15 Oct", `${ic.note}Note`], len: "1 h 30 min" })}
          </div></section>
          <section class="section"><div class="section-head"><h3>Later</h3><span class="meta">2</span></div><div class="rows">
            ${task({ k: "kriyan", title: "Ship the CLI to npm" })}
            ${task({ k: "kriyan", title: "Write the self-hosting guide" })}
          </div></section>
          <section class="section"><div class="section-head"><h3>Inside Kriyan</h3></div>
            <button class="child"><span class="dot" style="--c:var(--purple)"></span>Launch<span class="meta">3 open</span>${ic.right}</button>
            <button class="child"><span class="dot" style="--c:var(--purple)"></span>Bugs<span class="meta">7 open</span>${ic.right}</button>
            <button class="child quiet">${ic.plus}Add a space inside Kriyan</button>
          </section>
          <section class="section"><div class="section-head"><h3>Goal</h3></div>
            <div class="goal" style="--c:var(--purple)"><div class="top"><span>Launch by 1 Nov</span><span class="meta">9 of 14 tasks</span></div><div class="track" style="--p:64%;--pace:70%"><i></i><b></b></div><span class="meta">A little behind pace: 5 tasks in 19 days</span></div>
          </section>
        </div>
        <section class="section" style="position:relative;align-content:start">
          <div class="section-head"><h3>Note</h3><span class="meta">Edited by Claude 10 min ago</span></div>
          <div class="note">
            <h3>Launch plan</h3>
            <p>Ship web, Android and the MCP server together. Keep the landing page to one screen.</p>
            <h4>Before launch</h4>
            <div class="todo done"><i>${ic.check}</i>Production sign-in on kriyan.app</div>
            <div class="todo done"><i>${ic.check}</i>New Convex project</div>
            <div class="todo"><i></i>Demo video, 60 seconds</div>
            <div class="todo"><i></i>Post on X and Hacker News</div>
            <blockquote>Make the first minute obvious: add a task, see it on the day.</blockquote>
            <p>/<span class="caret"></span></p>
          </div>
          <div class="slash" style="left:0;top:392px" role="listbox" aria-label="Blocks">
            <span class="caption">Turn into</span>
            <div class="opt" role="option" aria-selected="true"><span class="g">${ic.heading}</span>Heading<kbd>#</kbd></div>
            <div class="opt" role="option"><span class="g">${ic.todo}</span>Checklist<kbd>[ ]</kbd></div>
            <div class="opt" role="option"><span class="g">${ic.list}</span>Bullet list<kbd>-</kbd></div>
            <div class="opt" role="option"><span class="g">${ic.quote}</span>Quote<kbd>&gt;</kbd></div>
            <div class="opt" role="option"><span class="g">${ic.link}</span>Link a task<kbd>@</kbd></div>
          </div>
        </section>
      </div>
    </div>`;
    return appbar("Kriyan") + page("kriyan", inner);
  },

  progress() {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const vals = (n, lift = 0) => Array.from({ length: n }, (_, i) => { const wk = i % 7 >= 5 ? 0.25 : 0; const r = rnd() + wk - lift * (i / n); return r < 0.25 ? 0 : r < 0.52 ? 0.18 : r < 0.76 ? 0.36 : r < 0.92 ? 0.6 : 0.88; });
    const heat = (v, c) => `<div class="heat" ${c ? `style="--hc:${c}"` : ""} role="img" aria-label="Heatmap">${v.map((a) => (a ? `<i style="--a:${a}"></i>` : `<i class="z"></i>`)).join("")}</div>`;
    const inner = `
    <div class="column">
      <div class="head big"><div><h1>Progress</h1><p class="sub">Week 42</p></div><div class="right"><button class="btn">All spaces${ic.down}</button></div></div>
      <section class="section">
        <div class="figures">
          <div class="figure"><span class="big tnum">23 h</span><span class="meta">planned work done this week</span></div>
          <div class="figure"><span class="big tnum">612 h</span><span class="meta">this year</span></div>
        </div>
        <div class="split" style="margin-top:16px"><i style="--c:var(--blue);--f:44"></i><i style="--c:var(--orange);--f:21"></i><i style="--c:var(--purple);--f:19"></i><i style="--c:var(--green);--f:16"></i></div>
        <p class="legend"><span><span class="dot" style="--c:var(--blue)"></span>School 44%</span><span><span class="dot" style="--c:var(--orange)"></span>Clients 21%</span><span><span class="dot" style="--c:var(--purple)"></span>Kriyan 19%</span><span><span class="dot" style="--c:var(--green)"></span>Life 16%</span></p>
      </section>
      <section class="section">
        <div class="section-head"><h3>The last 12 months</h3></div>
        <div class="months"><span>Nov</span><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span></div>
        <div class="heat-wrap">${heat(vals(51 * 7, -0.15))}</div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Goals</h3><button class="btn" style="margin-left:auto">${ic.plus}Add goal</button></div>
        <div style="display:grid;gap:24px">
          <div class="goal" style="--c:var(--purple)"><div class="top"><span>Launch Kriyan by 1 Nov</span><span class="meta">9 of 14 tasks</span></div><div class="track" style="--p:64%;--pace:70%"><i></i><b></b></div><span class="meta">A little behind pace</span></div>
          <div class="goal" style="--c:var(--green)"><div class="top"><span>Run 100 km this term</span><span class="meta tnum">62 km</span></div><div class="track" style="--p:62%;--pace:55%"><i></i><b></b></div><span class="meta">7 km ahead of pace</span></div>
          <div class="goal" style="--c:var(--blue)"><div class="top"><span>Calculus II: an A in the final</span><span class="meta">4 of 9 steps</span></div><div class="track" style="--p:44%;--pace:48%"><i></i><b></b></div><span class="meta">On pace, final on Tue 15 Dec</span></div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h3>Habits</h3><span class="meta">This week</span></div>
        <div style="display:grid;gap:24px">
          ${[["Read 20 min", "4 times a week", "green", 3, 4, 0.2], ["Run", "3 times a week", "green", 1, 3, -0.1], ["Duolingo", "Every day", "blue", 2, 7, 0]].map(([n, tgt, c, done, of, lift]) => `
          <div class="habit-row" style="--c:var(--${c})">
            <div><div class="name">${n}</div><div class="meta">${tgt}, 11 weeks on target</div></div>
            <div style="display:grid;gap:var(--s1);justify-items:end"><span class="of tnum">${done} of ${of}</span><div class="weekdots">${Array.from({ length: of }, (_, k) => `<i class="${k < done ? "on" : ""}"></i>`).join("")}</div></div>
            <div class="heat-wrap" style="grid-column:1/-1;justify-content:flex-start">${heat(vals(26 * 7, lift), `var(--${c})`)}</div>
          </div>`).join("")}
        </div>
      </section>
    </div>`;
    return appbar("Progress") + page("goals", inner);
  },

  command() {
    const menu = `
    <div class="scrim"></div>
    <div class="cmd" role="dialog" aria-label="Command menu">
      <label class="cmd-q">${ic.search}<span class="vh">Search or type a task</span><input style="flex:1;font:inherit" value="call mum fri 6pm #life every week"></label>
      <div class="cmd-list" role="listbox" aria-label="Results">
        <span class="caption">Add</span>
        <button class="opt tall" role="option" aria-selected="true">${ic.plus}<span class="stack"><span>Add “Call Mum”</span><span class="parse"><span class="chip"><span class="dot" style="--c:var(--green)"></span>Life</span><span class="chip">${ic.clock}Fri 16 Oct, 18:00</span><span class="chip">${ic.repeat}Every Friday</span></span></span><kbd>Enter</kbd></button>
        <span class="caption">Go to</span>
        <button class="opt" role="option">${ic.upcoming}<span>Upcoming</span><kbd>U</kbd></button>
        <button class="opt" role="option">${ic.agent}<span>Connect an AI</span><span class="kw">mcp, claude, chatgpt</span></button>
        <span class="caption">Tasks</span>
        <button class="opt" role="option"><span class="check" style="--c:var(--green);width:16px;height:16px"></span><span>Call the bank</span><span class="kw">Life</span></button>
      </div>
      <div class="cmd-foot"><span>Enter to add</span><span>Tab for details</span><span>Esc to close</span></div>
    </div>`;
    return appbar("Today") + page("today", todayColumn({ drag: false }), menu);
  },
};

const name = document.body.dataset.screen;
if (screens[name]) document.body.insertAdjacentHTML("afterbegin", screens[name]());
document.querySelectorAll("[data-mark]").forEach((el) => { el.innerHTML = MARK; });
makeInert({ task: "always", command: "always", panel: "phone" }[name]);
