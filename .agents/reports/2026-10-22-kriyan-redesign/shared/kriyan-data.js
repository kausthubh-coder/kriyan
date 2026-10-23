// Shared sample data and helpers for the three Kriyan design variants.
// Every variant renders this same week so the designs compare like for like.
// Plain script (no modules) so each prototype works when opened from disk.

(function () {
  const NOW = new Date(2026, 9, 22, 10, 40); // Thu 22 Oct 2026, 10:40

  const DAY = 86400000;
  const atDay = (offset, h = 0, m = 0) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset, h, m);
    return d;
  };
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // "Tue 13 Oct"
  const fmtDate = (d) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  // "14:30"
  const fmtTime = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  // 95 -> "1h 35m", 60 -> "1h", 20 -> "20m"
  const fmtDur = (min) => {
    if (min == null) return "";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m}m`;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  const minutesBetween = (a, b) => Math.round((b - a) / 60000);

  // Spaces nest. Colours are hues the variants can map onto their own palettes.
  const spaces = [
    { id: "uni", name: "Uni", hue: "blue", parent: null },
    { id: "comp2310", name: "COMP2310", hue: "blue", parent: "uni" },
    { id: "thesis", name: "Thesis", hue: "violet", parent: "uni" },
    { id: "work", name: "Studio job", hue: "amber", parent: null },
    { id: "health", name: "Health", hue: "green", parent: null },
    { id: "home", name: "Home", hue: "rose", parent: null },
    { id: "people", name: "People", hue: "pink", parent: null },
  ];

  // kind: "event" (you attend it) | "task" (you tick it off)
  // start/end: Date or null. duration: minutes or null (never invented).
  // repeat: human rule text or null. reminders: list of human strings.
  const items = [
    {
      id: "bday-ananya", kind: "event", allDay: true, title: "Ananya's birthday", space: "people",
      start: atDay(0), end: null, duration: null, repeat: "Every year on 22 Oct",
      reminders: ["1 day before, 09:00", "On the day, 08:00"], notes: "Gift idea: the Murakami she mentioned.",
    },
    {
      id: "run", kind: "task", title: "Run 5k", space: "health", habit: "run",
      start: atDay(0, 7, 30), end: atDay(0, 8, 10), duration: 40, repeat: "Every Tue, Thu and Sat",
      reminders: ["At start"], done: true, tracked: 38,
    },
    {
      id: "lecture", kind: "event", title: "COMP2310 lecture", space: "comp2310", location: "CSIT N101",
      start: atDay(0, 9, 0), end: atDay(0, 10, 30), duration: 90, repeat: "Every Tue and Thu until Fri 13 Nov",
      reminders: ["15 min before"],
    },
    {
      id: "lab", kind: "task", title: "Write lab report 4", space: "comp2310", goal: "distinction",
      start: atDay(0, 10, 45), end: atDay(0, 12, 15), duration: 90, repeat: null,
      reminders: ["10 min before", "At start", "Fri 23 Oct, 09:00 if not done"],
      due: atDay(1, 17, 0),
      notes: "Marking guide says the discussion is worth 40%. Compare the mutex and spinlock timings, then explain the cache line bouncing.",
      subtasks: [
        { title: "Run the benchmark 5 times", done: true },
        { title: "Make the timing chart", done: false },
        { title: "Write the discussion", done: false },
      ],
      tracked: 0,
    },
    {
      id: "lunch", kind: "event", title: "Lunch with Riya", space: "people", location: "Mocan & Green Grout",
      start: atDay(0, 12, 30), end: atDay(0, 13, 30), duration: 60, repeat: null, reminders: ["30 min before"],
    },
    {
      id: "litreview", kind: "task", title: "Thesis: read 3 papers for the lit review", space: "thesis", goal: "thesis",
      start: atDay(0, 14, 0), end: atDay(0, 15, 30), duration: 90, repeat: "Every weekday",
      reminders: ["At start"], notes: "Start with Herlihy 1991, then the two survey papers in the Zotero inbox.",
    },
    {
      id: "bank", kind: "task", title: "Call the bank about the new card", space: "home",
      start: atDay(0, 16, 0), end: null, duration: null, repeat: null, reminders: ["At 16:00", "At 16:45"],
    },
    {
      id: "crit", kind: "event", title: "Design crit", space: "work", location: "Zoom",
      start: atDay(0, 17, 0), end: atDay(0, 17, 45), duration: 45, repeat: "Every Thu", reminders: ["10 min before"],
    },
    {
      id: "read", kind: "task", title: "Read 20 pages", space: "health", habit: "read",
      start: atDay(0, 21, 30), end: atDay(0, 22, 0), duration: 30, repeat: "Every day", reminders: ["At start"],
    },
    // Anytime today: no time, maybe no duration.
    { id: "paper", kind: "task", title: "Buy printer paper", space: "home", anytime: true, duration: null, repeat: null, reminders: [] },
    { id: "email", kind: "task", title: "Reply to Prof. Lee about the extension", space: "uni", anytime: true, duration: 15, repeat: null, reminders: ["At 13:30"] },
    { id: "rent", kind: "task", title: "Pay rent", space: "home", anytime: true, duration: 5, repeat: "Monthly on the 22nd", reminders: ["At 09:00"], due: atDay(0, 23, 59) },
    // From earlier (never "overdue").
    { id: "dentist", kind: "task", title: "Book the dentist", space: "health", anytime: true, from: atDay(-2), duration: 5, repeat: null, reminders: [] },
    { id: "library", kind: "task", title: "Return library books", space: "uni", anytime: true, from: atDay(-1), duration: null, repeat: null, reminders: [] },
  ];

  // The rest of the week, for week and calendar views. Mon 19 to Sun 25 Oct.
  const week = [
    { day: -3, kind: "event", title: "Studio shift", space: "work", h: 9, m: 0, dur: 240 },
    { day: -3, kind: "task", title: "Thesis: outline chapter 2", space: "thesis", h: 14, m: 0, dur: 90, done: true },
    { day: -2, kind: "task", title: "Run 5k", space: "health", h: 7, m: 30, dur: 40, done: true },
    { day: -2, kind: "event", title: "COMP2310 lecture", space: "comp2310", h: 9, m: 0, dur: 90 },
    { day: -2, kind: "event", title: "Supervisor meeting", space: "thesis", h: 11, m: 0, dur: 30 },
    { day: -2, kind: "task", title: "Thesis: read 3 papers", space: "thesis", h: 14, m: 0, dur: 90, done: true },
    { day: -1, kind: "event", title: "Studio shift", space: "work", h: 9, m: 0, dur: 240 },
    { day: -1, kind: "task", title: "COMP2310 tutorial prep", space: "comp2310", h: 15, m: 0, dur: 60, done: true },
    { day: 1, kind: "event", title: "Studio shift", space: "work", h: 9, m: 0, dur: 240 },
    { day: 1, kind: "task", title: "Submit lab report 4", space: "comp2310", h: 16, m: 30, dur: 15 },
    { day: 1, kind: "event", title: "Climbing with Sam", space: "people", h: 18, m: 30, dur: 120 },
    { day: 2, kind: "task", title: "Run 5k", space: "health", h: 8, m: 0, dur: 40 },
    { day: 2, kind: "task", title: "Weekly review", space: "home", h: 10, m: 0, dur: 30, repeat: "Every Sat" },
    { day: 2, kind: "task", title: "Groceries", space: "home", h: 11, m: 0, dur: 45 },
    { day: 3, kind: "event", title: "Family call", space: "people", h: 19, m: 0, dur: 60, repeat: "Every Sun" },
  ].map((w) => {
    const start = atDay(w.day, w.h, w.m);
    return { ...w, start, end: new Date(start.getTime() + w.dur * 60000), duration: w.dur };
  });

  // Not yet scheduled; the person timeboxes these by dragging them into the week.
  const inbox = [
    { id: "i1", title: "Thesis: draft section 2.1", space: "thesis", duration: 120, goal: "thesis" },
    { id: "i2", title: "Fix the bike's back brake", space: "home", duration: 45 },
    { id: "i3", title: "Plan Riya's surprise", space: "people", duration: null },
    { id: "i4", title: "Portfolio: case study for the studio app", space: "work", duration: 180 },
    { id: "i5", title: "Renew passport", space: "home", duration: 30, due: atDay(28) },
  ];

  // 28 days of history ending yesterday; 1 = done, 0 = missed, null = not due that day.
  const hist = (s) => s.split("").map((c) => (c === "1" ? 1 : c === "0" ? 0 : null));
  const habits = [
    { id: "read", title: "Read 20 pages", space: "health", rule: "Every day", target: "20 pages", history: hist("1111011111101111111011111111"), todayDone: false },
    { id: "meditate", title: "Meditate", space: "health", rule: "Every day", target: "10 min", history: hist("1101100111011100110111011011"), todayDone: true },
    { id: "run", title: "Run 5k", space: "health", rule: "Tue, Thu, Sat", target: "5 km", history: hist("-1-1-1--1-1-0--1-1-1--1-1-1-"), todayDone: true },
    { id: "spanish", title: "Spanish", space: "health", rule: "Every day", target: "15 min", history: hist("0011111111111011111110111101"), todayDone: false },
  ];

  const goals = [
    {
      id: "distinction", title: "Finish the semester with a distinction", space: "uni",
      due: atDay(29), why: "Keeps the honours scholarship open.",
      milestones: [
        { title: "Lab reports 1 to 3", done: true }, { title: "Mid-semester exam", done: true },
        { title: "Lab report 4", done: false }, { title: "Assignment 2", done: false }, { title: "Final exam", done: false },
      ],
      hoursPlannedThisWeek: 6.5, hoursDoneThisWeek: 4,
    },
    {
      id: "thesis", title: "Thesis chapter 2 to my supervisor", space: "thesis",
      due: atDay(43), why: "Draft by end of November so the summer is for experiments.",
      milestones: [
        { title: "Outline", done: true }, { title: "Read 30 papers", done: false, progress: 19, of: 30 },
        { title: "Draft 2.1 to 2.4", done: false }, { title: "Send to Dr. Okafor", done: false },
      ],
      hoursPlannedThisWeek: 9, hoursDoneThisWeek: 4.5,
    },
    {
      id: "half", title: "Run a half marathon", space: "health",
      due: new Date(2027, 2, 14), why: "Canberra Times half, Sun 14 Mar.",
      milestones: [{ title: "Run 5k three times a week", done: true }, { title: "First 10k", done: false }, { title: "First 15k", done: false }, { title: "Race day", done: false }],
      metric: { label: "km this month", value: 46, of: 80 },
    },
    {
      id: "books", title: "Read 24 books in 2026", space: "health", due: new Date(2026, 11, 31),
      metric: { label: "books", value: 19, of: 24 },
    },
  ];

  // Time left: what the person has, not what they've lost.
  const startOfYear = new Date(2026, 0, 1);
  const endOfYear = new Date(2027, 0, 1);
  const timeLeft = {
    yearDaysLeft: Math.round((endOfYear - atDay(0)) / DAY), // 71 including today
    yearFraction: (NOW - startOfYear) / (endOfYear - startOfYear),
    semesterWeeksLeft: 4, // teaching ends Fri 13 Nov, exams to Fri 20 Nov
    todayFreeMinutes: null, // computed by the variants from today's items
    weekFreeHours: 14.5, // awake hours not yet planned, Thu to Sun
  };

  // Suggestions from the person's agents, waiting for a yes.
  const proposals = [
    {
      id: "p1", from: "Claude", via: "MCP", when: "10:12",
      summary: "Block Sat 14:00 to 16:00 for \"Thesis: draft section 2.1\"",
      reason: "Saturday afternoon is your longest free stretch this week, and the chapter is due in 6 weeks.",
      kind: "schedule",
    },
    {
      id: "p2", from: "Claude", via: "MCP", when: "10:12",
      summary: "Split \"Write lab report 4\" into 3 steps",
      reason: "Unpacked tasks get more honest time estimates.",
      kind: "split",
    },
    {
      id: "p3", from: "Codex", via: "CLI", when: "08:03",
      summary: "Add \"Submit lab report 4\" due Fri 23 Oct, 17:00",
      reason: "Found in the COMP2310 course page you shared.",
      kind: "add",
    },
  ];

  const cli = [
    "$ kriyan today",
    "$ kriyan add \"Gym tomorrow 7:00 for 45m every Mon Wed Fri remind 10m before #health\"",
    "$ kriyan plan week --free",
    "$ kriyan propose --from claude \"Block Sat 14:00-16:00 for thesis draft\"",
  ];

  // ---------- Quick add parser ----------
  // Returns the parsed fields and the token ranges so a UI can highlight them as you type.
  const DAYNAMES = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const MONTHIDX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

  function parseQuickAdd(text) {
    const tokens = [];
    const out = { title: text, date: null, time: null, duration: null, repeat: null, reminders: [], space: null, tokens };
    const take = (re, kind, fn) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const overlaps = tokens.some((t) => m.index < t.end && m.index + m[0].length > t.start);
        if (overlaps) continue;
        const ok = fn(m);
        if (ok !== false) tokens.push({ start: m.index, end: m.index + m[0].length, kind, text: m[0] });
      }
    };
    let explicitDate = false;
    const toMin = (n, unit) => (/^h/.test(unit) ? Math.round(parseFloat(n) * 60) : parseInt(n, 10));

    // Reminders first so "remind 10m before" isn't read as a duration.
    take(/\b(?:remind(?:\s+me)?|alert)\s+(?:(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\s+before|at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)(?:\s+and\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)\s+before)?/gi, "reminder", (m) => {
      if (m[1]) out.reminders.push(`${fmtDur(toMin(m[1], m[2]))} before`);
      if (m[3]) {
        let h = parseInt(m[3], 10);
        if (m[5]?.toLowerCase() === "pm" && h < 12) h += 12;
        if (m[5]?.toLowerCase() === "am" && h === 12) h = 0;
        out.reminders.push(`At ${String(h).padStart(2, "0")}:${m[4] || "00"}`);
      }
      if (m[6]) out.reminders.push(`${fmtDur(toMin(m[6], m[7]))} before`);
    });

    take(/\bevery\s+(?:other\s+)?(?:day|weekday|weekend|week|month|year|(?:\d+\s+(?:days|weeks|months))|(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*(?:\s*(?:,|and)?\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*)*))(?:\s+after\s+done)?/gi, "repeat", (m) => {
      out.repeat = m[0].replace(/^every/i, "Every");
    });
    take(/\b(?:daily|weekly|monthly|yearly)\b/gi, "repeat", (m) => {
      out.repeat = m[0][0].toUpperCase() + m[0].slice(1).toLowerCase();
    });

    take(/\bfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)(?:\s*(\d+)\s*(?:m|min|mins|minutes))?\b|\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours)\s*(?:(\d+)\s*(m|min|mins))?\b|\b(\d+)\s*(min|mins|minutes)\b/gi, "duration", (m) => {
      if (m[1]) out.duration = toMin(m[1], m[2]) + (m[3] ? parseInt(m[3], 10) : 0);
      else if (m[4]) out.duration = toMin(m[4], m[5]) + (m[6] ? parseInt(m[6], 10) : 0);
      else out.duration = parseInt(m[8], 10);
    });

    take(/\b(today|tonight|tomorrow|tmrw|next week)\b/gi, "date", (m) => {
      const w = m[1].toLowerCase();
      out.date = w === "tomorrow" || w === "tmrw" ? atDay(1) : w === "next week" ? atDay(4) : atDay(0);
      if (w === "tonight" && !out.time) out.time = "20:00";
    });
    take(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, "date", (m) => {
      out.date = new Date(2026, MONTHIDX[m[2].toLowerCase()], parseInt(m[1], 10));
      if (out.date < atDay(0)) out.date.setFullYear(2027);
      explicitDate = true;
    });
    take(/\b(?:on\s+)?(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/gi, "date", (m) => {
      // "Tue 3 Nov": the explicit date wins; the weekday is just part of how people write it.
      if (explicitDate) return;
      const target = DAYNAMES[m[1].toLowerCase()];
      let diff = (target - NOW.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      out.date = atDay(diff);
    });

    take(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b|\b(?:at\s+)?(\d{1,2})\s*(am|pm)\b|\bat\s+(\d{1,2})\b|\b(noon|midnight)\b/gi, "time", (m) => {
      let h, mm = "00";
      if (m[1]) { h = parseInt(m[1], 10); mm = m[2]; }
      else if (m[3]) { h = parseInt(m[3], 10); if (m[4].toLowerCase() === "pm" && h < 12) h += 12; if (m[4].toLowerCase() === "am" && h === 12) h = 0; }
      else if (m[5]) { h = parseInt(m[5], 10); if (h < 7) h += 12; }
      else { h = m[6].toLowerCase() === "noon" ? 12 : 0; }
      if (h > 23) return false;
      out.time = `${String(h).padStart(2, "0")}:${mm}`;
    });

    take(/(^|\s)#([\w-]+)/g, "space", (m) => {
      const name = m[2].toLowerCase();
      const s = spaces.find((sp) => sp.id === name || sp.name.toLowerCase() === name || sp.name.toLowerCase().startsWith(name));
      out.space = s ? s.id : name;
    });

    tokens.sort((a, b) => a.start - b.start);
    let title = "";
    let last = 0;
    for (const t of tokens) { title += text.slice(last, t.start); last = t.end; }
    title += text.slice(last);
    out.title = title.replace(/\s+/g, " ").trim();
    if (out.time && !out.date) out.date = atDay(0);
    return out;
  }

  const spaceById = (id) => spaces.find((s) => s.id === id);
  const spacePath = (id) => {
    const s = spaceById(id);
    if (!s) return id || "";
    return s.parent ? `${spaceById(s.parent).name} / ${s.name}` : s.name;
  };

  window.KRIYAN = {
    NOW, DAY, atDay, iso, WEEKDAYS, WEEKDAYS_LONG, MONTHS, MONTHS_LONG,
    fmtDate, fmtTime, fmtDur, minutesBetween,
    spaces, spaceById, spacePath, items, week, inbox, habits, goals, timeLeft, proposals, cli,
    parseQuickAdd,
  };
})();
