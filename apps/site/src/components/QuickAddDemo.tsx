"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { parseTask, type ParsedTask } from "@kriyan/core/parse";
import { todayIn } from "@kriyan/core/dates";
import {
  describeReminder,
  describeRepeat,
  formatDay,
  formatDuration,
  formatTime,
} from "@kriyan/core/format";
import css from "./QuickAddDemo.module.css";

const EXAMPLES = [
  "essay fri 5pm #school every week remind 1h before",
  "Calculus II lecture every tue and thu 9am for 1h30 until dec 11",
  "rent every month on the 1st remind day before at 20:00",
  "Mum's birthday 16 oct every year",
  "run every 2 days after done",
  "problem set due thu",
];

// "Today" is the visitor's own date, so it is only known in the browser. The server renders
// the same layout with the values left empty.
const noop = () => () => {};
function useToday(): string | null {
  return useSyncExternalStore(
    noop,
    () => todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => null,
  );
}

interface Chip {
  label: string;
  value: string;
}

function chipsFor(parsed: ParsedTask, today: string): Chip[] {
  const chips: Chip[] = [];
  if (parsed.spaceName) chips.push({ label: "Space", value: parsed.spaceName });
  if (parsed.date) chips.push({ label: "Date", value: formatDay(parsed.date, today) });
  if (parsed.time !== undefined) chips.push({ label: "Time", value: formatTime(parsed.time) });
  if (parsed.length !== undefined) chips.push({ label: "Length", value: formatDuration(parsed.length) });
  if (parsed.repeat && parsed.date)
    chips.push({ label: "Repeats", value: describeRepeat(parsed.repeat, parsed.date, today) });
  for (const reminder of parsed.reminders) chips.push({ label: "Reminder", value: describeReminder(reminder) });
  if (parsed.deadline) chips.push({ label: "Due", value: formatDay(parsed.deadline, today) });
  return chips;
}

export function QuickAddDemo() {
  const id = useId();
  const today = useToday();
  const [text, setText] = useState(EXAMPLES[0] ?? "");
  const parsed = today ? parseTask(text, today) : null;
  const chips = parsed && today ? chipsFor(parsed, today) : [];

  return (
    <div className={css.demo}>
      <label htmlFor={`${id}-input`} className={css.label}>
        Type a task the way you would say it
      </label>
      <div className={css.field}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={css.plus}>
          <path d="M12 5v14M5 12h14" />
        </svg>
        <input
          id={`${id}-input`}
          name="task"
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoComplete="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Add a task, like “essay fri 5pm every week”"
        />
      </div>

      <div className={css.result} aria-label="What Kriyan understood">
        <p className={css.title}>
          <span className={css.chipLabel}>Task</span>
          <span>{parsed ? parsed.title || "Untitled" : " "}</span>
        </p>
        <ul className={css.chips}>
          {chips.map((chip, index) => (
            <li key={`${chip.label}-${index}`} className={css.chip}>
              <span className={css.chipLabel}>{chip.label}</span>
              {chip.value}
            </li>
          ))}
          {parsed && chips.length === 0 && (
            <li className={css.empty}>No date or time, so it waits in your inbox.</li>
          )}
        </ul>
      </div>

      <div className={css.examples}>
        <span className={css.chipLabel}>Try</span>
        {EXAMPLES.slice(1).map((example) => (
          <button key={example} type="button" className={css.example} onClick={() => setText(example)}>
            {example}
          </button>
        ))}
      </div>
    </div>
  );
}
