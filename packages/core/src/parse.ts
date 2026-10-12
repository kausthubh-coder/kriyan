// Quick add: one sentence becomes a task. The same grammar runs in the app, the CLI and MCP.
//
//   essay fri 5pm #school every week remind 1h before
//   standup every weekday 9:30 for 15m
//   rent every month on the 1st remind day before at 20:00
//   mum's birthday 16 oct every year
//   run every 2 days after done
//   problem set due thu

import {
  addDays,
  daysInMonth,
  fromParts,
  parts,
  startOfWeek,
  weekday,
  type CivilDate,
  type Weekday,
} from "./dates.ts";
import { monthDate, type MonthlyRule, type Repeat } from "./repeat.ts";
import type { Reminder } from "./reminders.ts";

export type SpanKind = "space" | "date" | "time" | "length" | "repeat" | "reminder" | "deadline";

export interface ParsedTask {
  title: string;
  spaceName?: string;
  date?: CivilDate;
  /** Minutes after midnight. */
  time?: number;
  /** Minutes. Never invented: only set when the sentence says so. */
  length?: number;
  repeat?: Repeat;
  reminders: Reminder[];
  deadline?: CivilDate;
  /** Where each recognised phrase sits in the input, for highlighting. */
  spans: { start: number; end: number; kind: SpanKind }[];
}

const WD =
  "mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?";
const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DAYNUM = "(?:[12]\\d|3[01]|0?[1-9])(?:st|nd|rd|th)?";
/** A day of the month with its suffix, so "every 2 days" never reads as "every 2nd". */
const DAYORD = "(?:[12]\\d|3[01]|0?[1-9])(?:st|nd|rd|th)";
const DATE =
  `today|tonight|tomorrow|tmrw?|next\\s+(?:${WD})|this\\s+(?:${WD})|${WD}|in\\s+\\d+\\s+(?:days?|weeks?)|` +
  `${DAYNUM}\\s+(?:${MONTHS})|(?:${MONTHS})\\s+${DAYNUM}|\\d{4}-\\d{2}-\\d{2}`;
const TIME = "\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}:\\d{2}|noon|midnight";
const UNIT_MIN = "m|min|mins|minutes?";
const UNIT_H = "h|hr|hrs|hours?";
const UNIT_D = "d|days?";

function weekdayOf(word: string): Weekday {
  const key = word.slice(0, 3).toLowerCase();
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(key) as Weekday;
}

function monthOf(word: string): number {
  return (
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      word.slice(0, 3).toLowerCase(),
    ) + 1
  );
}

function onOrAfter(today: CivilDate, wd: Weekday): CivilDate {
  return addDays(today, (wd - weekday(today) + 7) % 7);
}

/** A date phrase from `DATE`, relative to today. */
export function parseDate(text: string, today: CivilDate): CivilDate | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (t === "today" || t === "tonight") return today;
  if (/^(tomorrow|tmrw?)$/.test(t)) return addDays(today, 1);
  let m = new RegExp(`^next (${WD})$`).exec(t);
  if (m) return addDays(startOfWeek(today), 7 + weekdayOf(m[1]!));
  m = new RegExp(`^(?:this )?(${WD})$`).exec(t);
  if (m) return onOrAfter(today, weekdayOf(m[1]!));
  m = /^in (\d+) (days?|weeks?)$/.exec(t);
  if (m) return addDays(today, Number(m[1]) * (m[2]!.startsWith("week") ? 7 : 1));
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return fromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m =
    new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)? (${MONTHS})$`).exec(t) ??
    swap(new RegExp(`^(${MONTHS}) (\\d{1,2})(?:st|nd|rd|th)?$`).exec(t));
  if (m) {
    const day = Number(m[1]);
    const month = monthOf(m[2]!);
    const [y] = parts(today);
    for (const year of [y, y + 1]) {
      if (day > daysInMonth(year, month)) continue;
      const date = fromParts(year, month, day);
      if (date >= today) return date;
    }
  }
  return null;
}

function swap(m: RegExpExecArray | null): RegExpExecArray | null {
  if (!m) return null;
  const copy = [...m] as unknown as RegExpExecArray;
  copy[1] = m[2]!;
  copy[2] = m[1]!;
  return copy;
}

/** A time phrase from `TIME`, in minutes after midnight. `at 5` means 17:00. */
export function parseClock(text: string, viaAt = false): number | null {
  const t = text.trim().toLowerCase();
  if (t === "noon") return 12 * 60;
  if (t === "midnight") return 0;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3] === "am") h = h % 12;
    else h = (h % 12) + 12;
  } else if (!m[2] && viaAt && h >= 1 && h <= 7) {
    h += 12;
  }
  return h < 24 ? h * 60 + min : null;
}

function minutesOf(amount: string, unit: string): number {
  const n = Number(amount);
  if (new RegExp(`^(?:${UNIT_D})$`).test(unit)) return Math.round(n * 1440);
  if (new RegExp(`^(?:${UNIT_H})$`).test(unit)) return Math.round(n * 60);
  return Math.round(n);
}

export function parseTask(input: string, today: CivilDate): ParsedTask {
  const out: ParsedTask = { title: "", reminders: [], spans: [] };
  let masked = input;

  // Finds phrases left to right. A rejected match is skipped, an accepted one is blanked out
  // (same length, so later spans keep their positions). Without the "g" flag, stops at the first accepted.
  const take = (pattern: RegExp, kind: SpanKind, handle: (m: RegExpExecArray) => boolean | void) => {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (handle(m) === false) {
        re.lastIndex = m.index + 1;
        continue;
      }
      // A span ends at its last word: trailing spaces may be a phrase already taken (masked).
      out.spans.push({ start: m.index, end: m.index + m[0].trimEnd().length, kind });
      masked = masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length);
      if (!pattern.global) break;
    }
  };

  // #space or #parent/child
  take(/(?<!\S)#([\p{L}\p{N}_\-/]+)/giu, "space", (m) => {
    if (out.spaceName) return false;
    out.spaceName = m[1]!.replace(/[-_]/g, " ");
  });

  // Repeats, with their own "until" and "N times".
  // Most specific first: alternation is ordered.
  const REPEAT_SPEC =
    `every!?\\s+(?:month\\s+on\\s+)?(?:the\\s+)?(?:last\\s+day|(?:first|second|third|fourth|last|1st|2nd|3rd|4th)\\s+(?:${WD})|${DAYORD})` +
    `|every!?\\s+(?:weekdays?|weekend)` +
    `|every!?\\s+(?:${WD})(?:\\s*(?:,|and|&)\\s*(?:${WD}))*` +
    `|every!?\\s+(?:other\\s+|\\d+\\s+)?(?:days?|weeks?|months?|years?)(?:\\s+on)?(?:\\s+(?:${WD})(?:\\s*(?:,|and|&)\\s*(?:${WD}))*)?` +
    `|daily|weekly|monthly|yearly|annually`;
  take(new RegExp(`(?<!\\S)(${REPEAT_SPEC})(\\s+after\\s+done)?(?!\\S)`, "i"), "repeat", (m) => {
    const rule = repeatFrom(m[1]!.toLowerCase().replace(/\s+/g, " "));
    if (!rule) return false;
    if (m[2] || m[1]!.startsWith("every!")) rule.fromCompletion = true;
    out.repeat = rule;
  });
  // "until dec 11" and "10 times" end a repeat wherever they appear in the sentence.
  take(new RegExp(`(?<!\\S)(?:until|till)\\s+(${DATE})(?!\\S)`, "i"), "repeat", (m) => {
    const until = out.repeat ? parseDate(m[1]!, today) : null;
    if (!until || !out.repeat) return false;
    out.repeat.end = { kind: "on", date: until };
  });
  take(/(?<!\S)(?:for\s+)?(\d+)\s+times(?!\S)/i, "repeat", (m) => {
    if (!out.repeat) return false;
    out.repeat.end = { kind: "count", count: Number(m[1]) };
  });

  // remind 10m before / remind 1 day before / remind at 8am / remind day before at 20:00 (chainable with "and")
  const ONE_REMINDER = `(?:(\\d+(?:\\.\\d+)?)\\s*(${UNIT_MIN}|${UNIT_H}|${UNIT_D})\\s+before|(?:the\\s+)?(day\\s+before|on\\s+the\\s+day)\\s+at\\s+(${TIME})|at\\s+(${TIME}))`;
  take(
    new RegExp(`(?<!\\S)remind(?:\\s+me)?\\s+${ONE_REMINDER}(?:\\s+and\\s+${ONE_REMINDER})*(?!\\S)`, "gi"),
    "reminder",
    (m) => {
      const each = new RegExp(ONE_REMINDER, "gi");
      let r: RegExpExecArray | null;
      while ((r = each.exec(m[0]))) {
        if (r[1] && r[2])
          out.reminders.push({ kind: "before", minutes: minutesOf(r[1], r[2].toLowerCase()) });
        else if (r[3] && r[4]) {
          const time = parseClock(r[4]);
          if (time !== null)
            out.reminders.push({ kind: "day", offset: r[3].toLowerCase().startsWith("day") ? -1 : 0, time });
        } else if (r[5]) {
          const time = parseClock(r[5], true);
          if (time !== null) out.reminders.push({ kind: "day", offset: 0, time });
        }
      }
    },
  );

  // due fri / by 13 oct
  take(new RegExp(`(?<!\\S)(?:due|by)\\s+(${DATE})(?!\\S)`, "i"), "deadline", (m) => {
    const date = parseDate(m[1]!, today);
    if (!date) return false;
    out.deadline = date;
  });

  // for 1h / for 30 min / for 1h30
  take(
    new RegExp(
      `(?<!\\S)for\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_H}|${UNIT_MIN})(?:\\s*(\\d+)\\s*(?:${UNIT_MIN})?)?(?!\\S)`,
      "i",
    ),
    "length",
    (m) => {
      let minutes = minutesOf(m[1]!, m[2]!.toLowerCase());
      if (m[3]) minutes += Number(m[3]);
      if (minutes <= 0 || minutes > 24 * 60) return false;
      out.length = minutes;
    },
  );

  // 9-10:30am, 14:00-15:30
  take(
    new RegExp(
      `(?<!\\S)(?:at\\s+)?(\\d{1,2}(?::\\d{2})?)\\s*(am|pm)?\\s*(?:-|–|to)\\s*(\\d{1,2}(?::\\d{2})?)\\s*(am|pm)?(?!\\S)`,
      "i",
    ),
    "time",
    (m) => {
      const endMer = m[4]?.toLowerCase();
      const startMer = m[2]?.toLowerCase() ?? endMer;
      if (!startMer && !(m[1]!.includes(":") && m[3]!.includes(":"))) return false;
      const start = parseClock(m[1]! + (startMer ?? ""));
      const end = parseClock(m[3]! + (endMer ?? ""));
      if (start === null || end === null || end <= start) return false;
      out.time = start;
      out.length ??= end - start;
    },
  );

  // 5pm / at 17:00 / at 5 / noon
  take(new RegExp(`(?<!\\S)(at\\s+)?(${TIME}|\\d{1,2})(?!\\S)`, "i"), "time", (m) => {
    if (out.time !== undefined) return false;
    const viaAt = Boolean(m[1]);
    if (!viaAt && /^\d{1,2}$/.test(m[2]!)) return false;
    const time = parseClock(m[2]!, viaAt);
    if (time === null) return false;
    out.time = time;
  });

  // today / fri / next fri / 13 oct / in 3 days (optionally "on")
  take(new RegExp(`(?<!\\S)(?:on\\s+)?(${DATE})(?!\\S)`, "i"), "date", (m) => {
    if (out.date) return false;
    const date = parseDate(m[1]!, today);
    if (!date) return false;
    out.date = date;
    if (/^tonight$/i.test(m[1]!) && out.time === undefined) out.time = 20 * 60;
  });

  if (out.repeat && !out.date) out.date = firstOccurrence(out.repeat, today);
  if (out.reminders.length && !out.date) out.date = today;
  out.title = masked.replace(/\s+/g, " ").trim();
  out.spans.sort((a, b) => a.start - b.start);
  return out;
}

function repeatFrom(spec: string): Repeat | null {
  const s = spec.replace(/^every!/, "every");
  const simple: Record<string, Repeat> = {
    daily: { freq: "day", interval: 1 },
    weekly: { freq: "week", interval: 1 },
    monthly: { freq: "month", interval: 1 },
    yearly: { freq: "year", interval: 1 },
    annually: { freq: "year", interval: 1 },
    "every weekday": { freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] },
    "every weekdays": { freq: "week", interval: 1, weekdays: [0, 1, 2, 3, 4] },
    "every weekend": { freq: "week", interval: 1, weekdays: [5, 6] },
  };
  if (simple[s]) return { ...simple[s] };

  let m = new RegExp(
    `^every (other |\\d+ )?(days?|weeks?|months?|years?)(?: on)?((?: (?:${WD})(?:\\s*(?:,|and|&)\\s*(?:${WD}))*)?)$`,
  ).exec(s);
  if (m) {
    const interval = m[1]?.trim() === "other" ? 2 : m[1] ? Number(m[1]) : 1;
    const freq = m[2]!.replace(/s$/, "") as Repeat["freq"];
    const rule: Repeat = { freq, interval };
    const days = weekdaysIn(m[3] ?? "");
    if (days.length) {
      if (freq !== "week") return null;
      rule.weekdays = days;
    }
    return rule;
  }
  m = new RegExp(`^every ((?:${WD})(?:\\s*(?:,|and|&)\\s*(?:${WD}))*)$`).exec(s);
  if (m) return { freq: "week", interval: 1, weekdays: weekdaysIn(m[1]!) };

  m = new RegExp(
    `^every (?:month on )?(?:the )?(last day|(first|second|third|fourth|last|1st|2nd|3rd|4th) (${WD})|(${DAYNUM}))$`,
  ).exec(s);
  if (m) {
    let monthly: MonthlyRule;
    if (m[1] === "last day") monthly = { kind: "last" };
    else if (m[2]) {
      const n = {
        first: 1,
        "1st": 1,
        second: 2,
        "2nd": 2,
        third: 3,
        "3rd": 3,
        fourth: 4,
        "4th": 4,
        last: -1,
      }[m[2]] as 1 | 2 | 3 | 4 | -1;
      monthly = { kind: "nth", n, weekday: weekdayOf(m[3]!) };
    } else {
      // "every 15" without a suffix reads as an interval, not a day of the month.
      if (!/(st|nd|rd|th)$/.test(m[4]!)) return null;
      monthly = { kind: "day", day: parseInt(m[4]!, 10) };
    }
    return { freq: "month", interval: 1, monthly };
  }
  return null;
}

function weekdaysIn(text: string): Weekday[] {
  const found = text.toLowerCase().match(new RegExp(WD, "g")) ?? [];
  return [...new Set(found.map(weekdayOf))].sort((a, b) => a - b);
}

/** The first date on or after today that a new repeat lands on. */
export function firstOccurrence(rule: Repeat, today: CivilDate): CivilDate {
  if (rule.freq === "week" && rule.weekdays?.length) {
    const candidates = rule.weekdays.map((wd) => onOrAfter(today, wd));
    return candidates.sort()[0]!;
  }
  if (rule.freq === "month" && rule.monthly) {
    const [y, m] = parts(today);
    for (let k = 0; k < 13; k++) {
      const yy = y + Math.floor((m - 1 + k) / 12);
      const mm = ((m - 1 + k) % 12) + 1;
      const date = monthDate(yy, mm, rule.monthly);
      if (date >= today) return date;
    }
  }
  return today;
}
