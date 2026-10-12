// Every command. `run` takes the process's streams and environment and returns the exit code:
// 0 done, 1 Kriyan said no (its message is printed as is), 2 a usage or network problem.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { todayIn, type CivilDate } from "@kriyan/core/dates";
import {
  describeReminder,
  describeRepeat,
  formatDate,
  formatDuration,
  formatTime,
  formatTimeRange,
} from "@kriyan/core/format";
import { findOp, OPS } from "@kriyan/core/ops";
import { parseDate, parseTask, type ParsedTask } from "@kriyan/core/parse";
import { version } from "../package.json";
import { ApiError, client, DEFAULT_API_URL, NetworkError, type Client } from "./api.ts";
import { parseArgs, UsageError, type Args } from "./args.ts";
import { configDir, Store, type Config, type Listed } from "./config.ts";
import { COMMAND_HELP, MAIN_HELP } from "./help.ts";
import { classifyRef, matchTitle, splitMove, type Candidate } from "./refs.ts";
import {
  dayLabel,
  RefBook,
  renderInbox,
  renderProgress,
  renderSpaces,
  renderToday,
  renderWeek,
  type View,
} from "./render.ts";
import type {
  InboxResult,
  ProgressResult,
  SpacesResult,
  TaskView,
  TodayResult,
  WeekResult,
} from "./shapes.ts";

export interface Io {
  argv: string[];
  env: NodeJS.ProcessEnv;
  stdout: { write(text: string): unknown; isTTY?: boolean };
  stderr: { write(text: string): unknown };
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  /** The current instant in ms. */
  now: () => number;
}

const USER_AGENT = `kriyan-cli/${version}`;

class Session {
  readonly store: Store;
  readonly config: Config;

  constructor(
    readonly io: Io,
    readonly args: Args,
  ) {
    this.store = new Store(configDir(io.env));
    this.config = this.store.config();
  }

  print(text: string): void {
    this.io.stdout.write(`${text}\n`);
  }

  printJson(value: unknown): void {
    this.print(JSON.stringify(value, null, 2));
  }

  get view(): View {
    return { color: Boolean(this.io.stdout.isTTY) && !this.io.env.NO_COLOR, now: this.io.now() };
  }

  baseUrl(): string {
    return this.io.env.KRIYAN_API_URL || this.config.apiUrl || DEFAULT_API_URL;
  }

  api(): Client {
    const token = this.io.env.KRIYAN_TOKEN || this.config.token;
    if (!token) throw new UsageError("You're not signed in. Run kriyan login, or set KRIYAN_TOKEN.");
    return client(this.baseUrl(), token, USER_AGENT);
  }

  /** Today in the person's time zone (from their profile once known, else this computer's). */
  today(): CivilDate {
    const zone = this.config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    return todayIn(zone, this.io.now());
  }

  rememberZone(timeZone: string): void {
    if (this.config.timeZone === timeZone) return;
    this.config.timeZone = timeZone;
    this.store.saveConfig(this.config);
  }

  saveListing(refs: RefBook): void {
    this.store.saveListing(refs.tasks);
  }
}

type Command = (s: Session) => Promise<void>;

/** The words after the command name. */
const rest = (s: Session) => s.args.positionals.slice(1);

function dayArg(s: Session): CivilDate | undefined {
  const phrase = rest(s).join(" ").trim();
  if (!phrase) return undefined;
  const date = parseDate(phrase, s.today());
  if (!date)
    throw new UsageError(
      `"${phrase}" isn't a date Kriyan knows. Try tomorrow, fri, next mon, 13 oct or 2026-10-13.`,
    );
  return date;
}

async function today(s: Session): Promise<void> {
  const date = dayArg(s);
  const day = await s.api().call<TodayResult>("get_today", date ? { date } : {});
  s.rememberZone(day.profile.timeZone);
  if (s.args.json) return s.printJson(day);
  const refs = new RefBook();
  s.print(renderToday(day, s.view, refs));
  s.saveListing(refs);
}

async function week(s: Session): Promise<void> {
  const start = dayArg(s);
  const result = await s.api().call<WeekResult>("get_week", start ? { start } : {});
  if (s.args.json) return s.printJson(result);
  const refs = new RefBook();
  s.print(renderWeek(result, s.view, refs, s.today()));
  s.saveListing(refs);
}

async function inbox(s: Session): Promise<void> {
  const result = await s.api().call<InboxResult>("get_inbox");
  if (s.args.json) return s.printJson(result);
  const refs = new RefBook();
  s.print(renderInbox(result, s.view, refs));
  s.saveListing(refs);
}

async function spaces(s: Session): Promise<void> {
  const result = await s.api().call<SpacesResult>("list_spaces");
  if (s.args.json) return s.printJson(result);
  s.print(renderSpaces(result, s.view));
}

async function progress(s: Session): Promise<void> {
  const result = await s.api().call<ProgressResult>("get_progress");
  if (s.args.json) return s.printJson(result);
  s.print(renderProgress(result, s.view));
}

/** What quick add understood, one line per part, in the words the app uses. */
export function describeParsed(parsed: ParsedTask, today: CivilDate): string[] {
  const lines: [string, string][] = [];
  if (parsed.date) lines.push(["Date", dayLabel(parsed.date, today)]);
  if (parsed.time !== undefined) lines.push(["Time", formatTimeRange(parsed.time, parsed.length)]);
  else if (parsed.length !== undefined) lines.push(["Length", formatDuration(parsed.length)]);
  if (parsed.deadline) lines.push(["Due", dayLabel(parsed.deadline, today)]);
  if (parsed.spaceName) lines.push(["Space", parsed.spaceName]);
  if (parsed.repeat) lines.push(["Repeats", describeRepeat(parsed.repeat, parsed.date ?? today, today)]);
  if (parsed.reminders.length)
    lines.push([
      parsed.reminders.length === 1 ? "Reminder" : "Reminders",
      parsed.reminders.map(describeReminder).join(", "),
    ]);
  const width = Math.max(0, ...lines.map(([k]) => k.length));
  return lines.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`);
}

async function add(s: Session): Promise<void> {
  const text = rest(s).join(" ").trim();
  if (!text) throw new UsageError('Say what to add, like: kriyan add "essay fri 5pm #school"');
  const today = s.today();
  const parsed = parseTask(text, today);
  const result = await s.api().call<{ taskId: string }>("add_task", { text });
  const title = parsed.title || text;
  if (s.args.json) {
    const { spans: _spans, ...understood } = parsed;
    return s.printJson({ ...result, understood: { ...understood, title } });
  }
  const details = describeParsed(parsed, today);
  if (!details.length) return s.print(`Added "${title}" to your inbox.`);
  s.print([`Added "${title}"`, ...details].join("\n"));
}

interface Resolved {
  id: string;
  title: string | null;
}

/** Open tasks the person can see in Today and the week, to find one by part of its title. */
async function candidates(s: Session): Promise<TaskView[]> {
  const api = s.api();
  const [day, wk] = await Promise.all([api.call<TodayResult>("get_today"), api.call<WeekResult>("get_week")]);
  const all = [
    ...day.scheduled,
    ...day.anytime,
    ...day.earlier,
    ...wk.days.flatMap((d) => [...d.scheduled, ...d.anytime, ...d.deadlines]),
    ...wk.inbox,
    ...wk.unscheduled,
  ];
  return all.filter((t) => !t.done && !t.projected);
}

function ambiguous(s: Session, text: string, tasks: TaskView[], noun = "tasks"): UsageError {
  const refs = new RefBook();
  const lines = tasks.map((t) => {
    const when = t.date
      ? `${formatDate(t.date, s.today())}${t.time !== null ? ` ${formatTime(t.time)}` : ""}`
      : "";
    return `  ${refs.ref(t).padStart(2)}  ${t.title}${when ? `  ${when}` : ""}`;
  });
  s.saveListing(refs);
  return new UsageError(
    [
      `"${text}" matches ${tasks.length} ${noun}:`,
      ...lines,
      "Run the command again with a number, or more of the title.",
    ].join("\n"),
  );
}

/** Numbers and ids name one task each; anything else is read as one title. */
async function resolveTasks(s: Session, words: string[]): Promise<Resolved[]> {
  if (!words.length)
    throw new UsageError("Say which task: its number from the last listing, part of its title, or its id.");
  const refs = words.map(classifyRef);
  if (refs.every((r) => r.kind !== "title")) {
    const listing = s.store.listing();
    return refs.map((r) => {
      if (r.kind === "id") return { id: r.id, title: listing.find((l) => l.id === r.id)?.title ?? null };
      if (r.kind !== "number") throw new Error("unreachable");
      const found: Listed | undefined = listing[r.n - 1];
      if (!found)
        throw new UsageError(
          `There's no task ${r.n} in your last listing. Run kriyan today or kriyan week to see the numbers.`,
        );
      return { id: found.id, title: found.title };
    });
  }
  const text = words.join(" ");
  const match = matchTitle(await candidates(s), text);
  if (match.kind === "none")
    throw new UsageError(
      `No open task matches "${text}". Run kriyan today or kriyan week to see your tasks.`,
    );
  if (match.kind === "many") throw ambiguous(s, text, match.tasks);
  return [{ id: match.task._id, title: match.task.title }];
}

const named = (r: Resolved) => (r.title ? `"${r.title}"` : r.id);
const several = (rs: Resolved[]) => (rs.length === 1 ? named(rs[0]!) : `${rs.length} tasks`);

async function done(s: Session): Promise<void> {
  const tasks = await resolveTasks(s, rest(s));
  const api = s.api();
  for (const t of tasks) {
    const result = await api.call<{ taskId: string; finished: boolean }>("complete_task", { taskId: t.id });
    if (s.args.json) s.printJson(result);
    else
      s.print(
        result.finished ? `Done ${named(t)}.` : `Done ${named(t)}. It repeats, so it moved to its next date.`,
      );
  }
}

async function move(s: Session): Promise<void> {
  const split = splitMove(rest(s), s.today());
  if (!split)
    throw new UsageError(
      "Say which task and when, like: kriyan move 3 tomorrow, or kriyan move essay fri 9am",
    );
  const tasks = await resolveTasks(s, split.refs);
  const { date, time } = split.when;
  const result = await s
    .api()
    .call<{ moved: number }>("move_tasks", {
      taskIds: tasks.map((t) => t.id),
      date,
      ...(time !== undefined ? { time } : {}),
    });
  if (s.args.json) return s.printJson(result);
  s.print(
    `Moved ${several(tasks)} to ${formatDate(date, s.today())}${time !== undefined ? ` at ${formatTime(time)}` : ""}.`,
  );
}

async function rm(s: Session): Promise<void> {
  const tasks = await resolveTasks(s, rest(s));
  const api = s.api();
  for (const t of tasks) {
    const result = await api.call<{ taskId: string }>("delete_task", { taskId: t.id });
    if (s.args.json) s.printJson(result);
  }
  if (!s.args.json)
    s.print(`Deleted ${several(tasks)}. You can restore ${tasks.length === 1 ? "it" : "them"} from the app.`);
}

async function habit(s: Session): Promise<void> {
  const name = rest(s).join(" ").trim();
  if (!name) throw new UsageError("Say which habit, like: kriyan habit read");
  const api = s.api();
  const day = await api.call<TodayResult>("get_today");
  if (!day.habits.length) throw new UsageError("You have no habits yet. Add one in the app.");
  const match = matchTitle(day.habits, name);
  if (match.kind === "none")
    throw new UsageError(
      `No habit matches "${name}". Your habits: ${day.habits.map((h) => h.title).join(", ")}.`,
    );
  if (match.kind === "many")
    throw new UsageError(
      `"${name}" matches ${match.tasks.length} habits: ${match.tasks.map((h) => h.title).join(", ")}. Use more of the name.`,
    );
  const h = match.task;
  const doneNow = !s.args.undo;
  const result = await api.call<{ habitId: string; done: boolean }>("check_habit", {
    habitId: h._id,
    done: doneNow,
  });
  if (s.args.json) return s.printJson(result);
  const count = h.thisWeek + (doneNow === h.doneToday ? 0 : doneNow ? 1 : -1);
  s.print(`${doneNow ? "Checked" : "Unchecked"} "${h.title}" for today. ${count} of ${h.target} this week.`);
}

async function readInput(io: Io, path: string): Promise<string> {
  if (path !== "-") {
    try {
      return readFileSync(path, "utf8");
    } catch {
      throw new UsageError(`Couldn't read ${path}. Check the path.`);
    }
  }
  let text = "";
  for await (const chunk of io.stdin) text += String(chunk);
  return text;
}

interface Block {
  title: string;
  date: string;
  time: number;
  length?: number;
}

async function propose(s: Session): Promise<void> {
  if (!s.args.file)
    throw new UsageError("Pass the plan with --file plan.json. Run kriyan propose --help for its shape.");
  let data: unknown;
  try {
    data = JSON.parse(await readInput(s.io, s.args.file));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    throw new UsageError(`${s.args.file} isn't valid JSON.`);
  }
  const fromFile =
    data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const blocks = Array.isArray(data) ? data : fromFile.blocks;
  if (!Array.isArray(blocks) || !blocks.length)
    throw new UsageError('The file needs a list of blocks, or an object with "blocks".');
  const agent = s.args.agent ?? (typeof fromFile.agent === "string" ? fromFile.agent : undefined);
  if (!agent) throw new UsageError("Say who is proposing with --agent, like --agent Claude.");
  const result = await s
    .api()
    .call<{ taskIds: string[]; proposed: boolean }>("propose_plan", { agent, blocks });
  if (s.args.json) return s.printJson(result);
  const today = s.today();
  const n = `${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}`;
  s.print(
    result.proposed
      ? `Proposed ${n} from ${agent}. Accept or discard them in the app.`
      : `Added ${n} from ${agent} to your plan.`,
  );
  for (const b of blocks as Block[])
    s.print(`  ${formatDate(b.date, today)}  ${formatTimeRange(b.time, b.length)}  ${b.title}`);
}

async function call(s: Session): Promise<void> {
  const [name, ...json] = rest(s);
  if (!name) throw new UsageError("Say which operation, like: kriyan call get_today. kriyan ops lists them.");
  if (!findOp(name))
    throw new UsageError(`There's no operation called "${name}". Run kriyan ops to see them.`);
  const body = json.join(" ").trim() || "{}";
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    throw new UsageError(`The input isn't valid JSON: ${body}`);
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new UsageError('The input must be a JSON object, like {"date":"2026-10-13"}.');
  s.printJson(await s.api().call(name, input as Record<string, unknown>));
}

async function ops(s: Session): Promise<void> {
  if (s.args.json) return s.printJson(OPS);
  const width = Math.max(...OPS.map((o) => o.name.length));
  s.print(OPS.map((o) => `${o.name.padEnd(width)}  ${o.kind.padEnd(5)}  ${o.title}`).join("\n"));
}

async function readSecret(io: Io): Promise<string> {
  if (!io.stdin.isTTY) {
    let text = "";
    for await (const chunk of io.stdin) text += String(chunk);
    return text.trim();
  }
  const rl = createInterface({ input: io.stdin, output: process.stderr, terminal: true });
  try {
    return (
      await new Promise<string>((resolve) =>
        rl.question("Paste a personal access token from Settings: ", resolve),
      )
    ).trim();
  } finally {
    rl.close();
  }
}

async function login(s: Session): Promise<void> {
  const token = s.args.token ?? (await readSecret(s.io));
  if (!token)
    throw new UsageError("Paste a token, or pass one with --token. Create it in Kriyan under Settings.");
  const apiUrl = s.io.env.KRIYAN_API_URL || undefined;
  const base = apiUrl ?? DEFAULT_API_URL;
  const day = await client(base, token, USER_AGENT).call<TodayResult>("get_today");
  s.store.saveConfig({ token, ...(apiUrl ? { apiUrl } : {}), timeZone: day.profile.timeZone });
  s.print(`Signed in. Saved your token in ${s.store.configPath}`);
}

async function logout(s: Session): Promise<void> {
  if (!s.config.token) s.print("You weren't signed in on this computer.");
  else {
    s.store.removeConfig();
    s.print(`Signed out. Removed your token from ${s.store.configPath}`);
  }
  if (s.io.env.KRIYAN_TOKEN) s.print("KRIYAN_TOKEN is still set in this shell, so commands keep using it.");
}

const COMMANDS: Record<string, Command> = {
  today,
  week,
  inbox,
  spaces,
  progress,
  add,
  done,
  move,
  rm,
  habit,
  propose,
  call,
  ops,
  login,
  logout,
};

export async function run(io: Io): Promise<number> {
  const fail = (message: string, code: number) => {
    io.stderr.write(`${message}\n`);
    return code;
  };
  try {
    const args = parseArgs(io.argv);
    const name = args.positionals[0];
    if (args.version) {
      io.stdout.write(`${version}\n`);
      return 0;
    }
    if (!name || name === "help") {
      const topic = args.positionals[1];
      io.stdout.write(`${(topic && COMMAND_HELP[topic]) || MAIN_HELP}\n`);
      return 0;
    }
    const command = COMMANDS[name];
    if (!command) return fail(`There's no command called "${name}". Run kriyan --help to see them.`, 2);
    if (args.help) {
      io.stdout.write(`${COMMAND_HELP[name] ?? MAIN_HELP}\n`);
      return 0;
    }
    await command(new Session(io, args));
    return 0;
  } catch (error) {
    if (error instanceof ApiError) return fail(error.message, 1);
    if (error instanceof UsageError || error instanceof NetworkError) return fail(error.message, 2);
    return fail(
      `Something went wrong in kriyan: ${error instanceof Error ? error.message : String(error)}`,
      2,
    );
  }
}
