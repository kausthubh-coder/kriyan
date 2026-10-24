// The onboarding draft and the choices it offers (docs/design/v4/onboarding.html).

export const HELP = [
  { key: "days", title: "Plan my days", sub: "One timeline for tasks, events and habits" },
  { key: "uni", title: "Uni deadlines and classes", sub: "Repeating classes, due dates, reminders" },
  { key: "habits", title: "Build habits", sub: "Small daily things that stick" },
  { key: "focus", title: "Focus and timebox", sub: "Give work a time and protect it" },
  { key: "goal", title: "Reach a big goal", sub: "Break it into weeks and steps" },
  { key: "ai", title: "Let my AI plan with me", sub: "Claude, ChatGPT or Codex, through Kriyan" },
] as const;

export type HelpKey = (typeof HELP)[number]["key"];

export interface Draft {
  help: HelpKey[];
  /** Minutes after midnight. */
  dayStart: number;
  dayEnd: number;
  /** Hours a weekday goes to classes or work; only for the "do the math" number. */
  busyHours: number;
  /** The first thing for today, as typed. */
  text: string;
}

export const EMPTY_DRAFT: Draft = {
  help: [],
  dayStart: 7 * 60,
  dayEnd: 22 * 60 + 30,
  busyHours: 6,
  text: "",
};

export const SUGGESTIONS = [
  "Read 20 pages tonight at 21:30 for 30m",
  "Call mum at 18:30",
  "Gym tomorrow 7am for 45m every Mon Wed Fri",
];
