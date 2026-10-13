import type { Metadata } from "next";
import { parseTask } from "@kriyan/core/parse";
import { formatDate } from "@kriyan/core/format";
import css from "@/components/Prose.module.css";
import { describeParsed } from "@/lib/parsed";

export const metadata: Metadata = {
  title: "Quick add",
  description:
    "Every phrase Kriyan's quick add understands: dates, times, lengths, spaces, repeats, reminders and deadlines.",
  alternates: { canonical: "/docs/quick-add" },
};

// Every example is run through the real parser when the page is built, so the page shows exactly what
// the app, the CLI and MCP do. The reference day is fixed so the dates read the same for everyone.
const TODAY = "2026-10-13";

const SECTIONS: { id: string; title: string; intro: string; examples: string[] }[] = [
  {
    id: "dates",
    title: "Dates",
    intro:
      "A weekday means the next one, counting today. “next” means the one in the week after this. A day and a month mean the next time that date comes round.",
    examples: [
      "call the bank today",
      "pay rent tomorrow",
      "essay fri",
      "lab report next fri",
      "dentist 16 oct",
      "dentist oct 16",
      "renew passport in 3 days",
      "book flights in 2 weeks",
      "submit form 2026-11-02",
      "film night tonight",
    ],
  },
  {
    id: "times",
    title: "Times",
    intro:
      "Write times with am or pm, or on the 24-hour clock. “at 5” on its own means 17:00, because few things start at 5 in the morning. A range sets the start and the length.",
    examples: [
      "standup 9:30am",
      "gym 18:00",
      "call mum at 5",
      "lunch with Maya noon",
      "standup tomorrow 9:30-9:45am",
      "workshop thu 14:00-15:30",
    ],
  },
  {
    id: "length",
    title: "Length",
    intro: "A length is only set when you write one. Leave it out and the task has no length.",
    examples: ["deep work for 2h", "read for 30 min", "lecture tue 9am for 1h30", "buy oat milk"],
  },
  {
    id: "spaces",
    title: "Spaces",
    intro: "A # puts the task in a space. Use / for a space inside another, and - or _ between words.",
    examples: ["essay #school", "ship cli #work/kriyan", "fix the gate #side-project"],
  },
  {
    id: "repeats",
    title: "Repeats",
    intro:
      "A repeat starts on its first date from today. Add “until” or “N times” to end it, and “after done” (or every!) to count from when you finish instead of from the schedule.",
    examples: [
      "water plants daily",
      "review inbox every weekday",
      "Calculus II lecture every tue and thu 9am for 1h30 until dec 11",
      "team sync every 2 weeks on mon",
      "clean the flat every other week",
      "rent every month on the 1st",
      "pay card every 15th",
      "send invoice every last day",
      "review every last fri",
      "book club every second tue",
      "Mum's birthday 16 oct every year",
      "physio every week for 6 times",
      "run every 2 days after done",
      "water the fern every! 3 days",
    ],
  },
  {
    id: "reminders",
    title: "Reminders",
    intro:
      "Start with “remind”, and add more with “and”. A reminder on a task with no date puts the task on today.",
    examples: [
      "essay fri 5pm remind 1h before",
      "flight sat 7am remind 1 day before and 2h before",
      "rent every month on the 1st remind day before at 20:00",
      "pick up parcel thu remind on the day at 8am",
      "take tablets remind at 9pm",
    ],
  },
  {
    id: "deadlines",
    title: "Deadlines",
    intro: "“due” and “by” set when something is due, without planning it for that day.",
    examples: ["problem set due thu", "tax return by 31 oct", "slides fri 10am due mon"],
  },
];

function Example({ text }: { text: string }) {
  const parsed = parseTask(text, TODAY);
  const parts = describeParsed(parsed, TODAY);
  return (
    <tr>
      <td>
        <code>{text}</code>
      </td>
      <td>
        <ul className={css.parts}>
          <li>
            <span className={css.partLabel}>Task</span>
            {parsed.title || "Untitled"}
          </li>
          {parts.map((part, index) => (
            <li key={index}>
              <span className={css.partLabel}>{part.label}</span>
              {part.value}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

export default function QuickAddDocs() {
  return (
    <article className={css.prose}>
      <h1>Quick add</h1>
      <p className={css.lede}>
        Type a task the way you would say it. Kriyan takes out the date, time, length, space, repeat,
        reminders and deadline, and what is left is the title. The same rules run in the app, the{" "}
        <code>kriyan add</code> command and the <code>add_task</code> tool your AI uses.
      </p>
      <p>
        Every example below was read by the parser itself, as if today were {formatDate(TODAY)} 2026. Phrases
        can come in any order.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={section.id} className={css.section}>
          <h2 id={section.id}>{section.title}</h2>
          <p>{section.intro}</p>
          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">You type</th>
                  <th scope="col">Kriyan reads</th>
                </tr>
              </thead>
              <tbody>
                {section.examples.map((example) => (
                  <Example key={example} text={example} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2 id="good-to-know">Good to know</h2>
      <ul>
        <li>Anything without a date or a space goes to your inbox.</li>
        <li>
          “on the 31st” falls on the last day of shorter months, so a monthly repeat never skips a month.
        </li>
        <li>Words quick add doesn&apos;t recognise stay in the title, so nothing you type is lost.</li>
      </ul>
    </article>
  );
}
