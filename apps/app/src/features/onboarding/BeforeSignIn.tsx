// Steps 1 to 5 of onboarding.html, before any account: the welcome, what Kriyan should help
// with, the day's hours, the free-time sum, and a first task typed the way you'd say it.

import { useMemo, useState, type ReactNode } from "react";
import { Platform, TextInput, View } from "react-native";
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Hourglass,
  Minus,
  Moon,
  Plus,
  Repeat2,
  Bell,
  Sparkles,
  Sun,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react-native";
import { diffDays, formatClock, parts, type CivilDate } from "@kriyan/core/dates";
import { describeReminder, describeRepeat, formatDay, formatDuration } from "@kriyan/core/format";
import { parseTask, type ParsedTask } from "@kriyan/core/parse";
import { playSound } from "@/features/feel/sound";
import { commitHaptic, toggleHaptic } from "@/features/tasks/haptics";
import { useType } from "@/theme/layout";
import { c, family, hex, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { DayName, DayRows } from "./Day";
import { updateDraft, type Draft, type Help } from "./draft";
import { FullButton, Lead, LinkButton, MiniLabel, Question, StepFrame } from "./Frame";
import { Wheel } from "./Wheel";

export interface StepProps {
  d: Draft;
  today: CivilDate;
  next: () => void;
  back: () => void;
}

/** Step 1: the product itself, a day told in one sentence. No feature tour. */
export function Welcome({ today, next, signIn }: { today: CivilDate; next: () => void; signIn: () => void }) {
  const dim = (t: string) => (
    <Txt variant="title" tone="headDim">
      {t}
    </Txt>
  );
  return (
    <StepFrame
      step={1}
      dark
      foot={
        <>
          <FullButton inverse label="Plan my first day" onPress={next} />
          <LinkButton onDark label="I already have an account" onPress={signIn} />
        </>
      }
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1, minHeight: 48 }}>
        <Txt variant="subhead" tone="headInk">
          Kriyan
        </Txt>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.now }} />
      </View>
      <View style={{ marginTop: s.s8, gap: s.s6 }}>
        <DayName today={today} big />
        <Txt variant="title" tone="headInk" aria-label="An example day">
          {dim("Good morning. You have ")}3 events, 6 tasks{dim(" and ")}2 habits{dim(" today. You're ")}
          mostly free{dim(" after 18:00.")}
        </Txt>
      </View>
      <View style={{ flex: 1, minHeight: s.s12 }} />
      <Txt variant="display" tone="headInk" heading={1}>
        Your whole day,{" "}
        <Txt variant="display" tone="headDim">
          in one sentence.
        </Txt>
      </Txt>
      <Txt variant="body" tone="headDim" style={{ marginTop: s.s3 }}>
        Tasks, events and habits on one calm timeline. Set up takes about a minute.
      </Txt>
    </StepFrame>
  );
}

const HELPS: [Help, LucideIcon, string, string][] = [
  ["days", CalendarDays, "Plan my days", "One timeline for tasks, events and habits"],
  ["uni", BookOpen, "Uni deadlines and classes", "Repeating classes, due dates, reminders"],
  ["habits", Repeat2, "Build habits", "Small daily things that stick"],
  ["focus", Timer, "Focus and timebox", "Give work a time and protect it"],
  ["goal", Target, "Reach a big goal", "Break it into weeks and steps"],
  ["ai", Sparkles, "Let my AI plan with me", "Claude, ChatGPT or Codex, through Kriyan"],
];

/** Step 2: big rows to tick. The answer orders nothing yet; nothing is locked behind it. */
export function Helps({ d, next, back }: StepProps) {
  return (
    <StepFrame step={2} onBack={back} onSkip={next} foot={<FullButton label="Continue" onPress={next} />}>
      <Question text="What should Kriyan help with?" />
      <Lead>Pick any. It changes what you see first, nothing else.</Lead>
      <View role="group" aria-label="What Kriyan should help with" style={{ gap: s.s2, marginTop: s.s6 }}>
        {HELPS.map(([key, icon, title, sub]) => {
          const on = d.helps.includes(key);
          return (
            <Press
              key={key}
              role="checkbox"
              aria-checked={on}
              accessibilityLabel={title}
              onPress={() => {
                toggleHaptic(!on);
                updateDraft({ helps: on ? d.helps.filter((h) => h !== key) : [...d.helps, key] });
              }}
              hoverBg={null}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s3,
                minHeight: 64,
                paddingVertical: s.s2,
                paddingHorizontal: s.s3,
                borderRadius: r.card,
                backgroundColor: on ? c.raised : c.sunken,
                boxShadow: `inset 0 0 0 ${on ? 2 : 1}px ${on ? c.ink : "transparent"}`,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: r.ctl,
                  backgroundColor: on ? c.sunken : c.raised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon icon={icon} size={20} tone="ink2" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="subhead">{title}</Txt>
                <Txt variant="meta" tone="ink3">
                  {sub}
                </Txt>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? c.ink : "transparent",
                  boxShadow: on ? undefined : `inset 0 0 0 1.5px ${c.lineStrong}`,
                }}
              >
                {on ? <Icon icon={Check} size={14} tone="onInk" strokeWidth={2.6} /> : null}
              </View>
            </Press>
          );
        })}
      </View>
    </StepFrame>
  );
}

const range = (from: number, to: number) =>
  Array.from({ length: (to - from) / 15 + 1 }, (_, i) => from + i * 15);
const WAKE_TIMES = range(4 * 60, 11 * 60);
/** Up to midnight: the day has to end on the day it starts. */
const WIND_TIMES = range(19 * 60, 24 * 60);

/** Step 3: wake and wind-down on wheels, and fixed hours counted first. */
export function Hours({ d, next, back }: StepProps) {
  const keep = () => {
    updateDraft({ hours: true });
    next();
  };
  return (
    <StepFrame step={3} onBack={back} onSkip={next} foot={<FullButton label="Continue" onPress={keep} />}>
      <Question text="When does your day" dim="start and end?" />
      <Lead>Kriyan only plans inside these hours.</Lead>
      <View style={{ flexDirection: "row", gap: s.s3, marginTop: s.s6 }}>
        <Wheel
          label="Wake up"
          icon={Sun}
          times={WAKE_TIMES}
          value={d.wake}
          onChange={(wake) => updateDraft({ wake })}
        />
        <Wheel
          label="Wind down"
          icon={Moon}
          times={WIND_TIMES}
          value={d.wind}
          onChange={(wind) => updateDraft({ wind })}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          marginTop: s.s3,
          padding: s.s3,
          paddingLeft: s.s4,
          borderRadius: r.sheet,
          backgroundColor: c.sunken,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt variant="label" style={family("600")}>
            Classes or work on a weekday
          </Txt>
          <Txt variant="meta" tone="ink3">
            Roughly, hours a day
          </Txt>
        </View>
        <Stepper
          value={d.fixed}
          onChange={(fixed) => updateDraft({ fixed: Math.max(0, Math.min(12, fixed)) })}
        />
      </View>
    </StepFrame>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const round = { borderRadius: r.pill, backgroundColor: c.raised, width: 44, height: 44 } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
      <Button
        icon={Minus}
        accessibilityLabel="One hour less"
        onPress={() => onChange(value - 1)}
        style={round}
      />
      <Txt variant="title" tnum aria-live="polite" style={{ minWidth: 44, textAlign: "center" }}>
        {`${value}h`}
      </Txt>
      <Button
        icon={Plus}
        accessibilityLabel="One hour more"
        onPress={() => onChange(value + 1)}
        style={round}
      />
    </View>
  );
}

/** Meals, getting ready and travel, a stated assumption shown on screen: 2 hours a day. */
const EVERYDAY_HOURS = 2 * 7;

export function weekMath(d: Draft) {
  const awake = Math.round(((d.wind - d.wake) / 60) * 7);
  const fixed = d.fixed * 5;
  const free = Math.max(0, awake - fixed - EVERYDAY_HOURS);
  return { awake, fixed, everyday: EVERYDAY_HOURS, free };
}

/** Step 4: the answers as one personal number, time you get to choose. */
export function TheMath({ d, today, next, back }: StepProps) {
  const m = weekMath(d);
  const [year] = parts(today);
  const daysLeft = diffDays(`${year}-12-31`, today) + 1;
  const bar = (label: string, hours: number, free?: boolean) => (
    <View key={label} style={{ gap: s.s1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: s.s3 }}>
        <Txt variant="body" tone="ink2">
          {label}
        </Txt>
        <Txt variant="body" tnum style={family("600")}>
          {`${hours}h`}
        </Txt>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.hover, overflow: "hidden" }}>
        <View
          style={{
            width: `${m.awake ? Math.round((hours / m.awake) * 100) : 0}%`,
            height: "100%",
            borderRadius: 4,
            backgroundColor: free ? c.ink : c.lineStrong,
          }}
        />
      </View>
    </View>
  );
  return (
    <StepFrame
      step={4}
      onBack={back}
      onSkip={next}
      foot={<FullButton label="Plan the first one" onPress={next} />}
    >
      <Question text="Let's do the math." />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s2, marginTop: s.s6 }}>
        <Txt variant="display" tnum aria-label={`About ${m.free} free hours this week`}>
          {m.free}
        </Txt>
        <Txt variant="title">hours</Txt>
      </View>
      <Txt variant="subhead" tone="ink2" style={{ ...family("400"), marginTop: s.s2 }}>
        {"That's about how much time you get to choose this week."}
      </Txt>
      <View style={{ gap: s.s3, marginTop: s.s6 }}>
        {bar(`Awake, ${formatClock(d.wake)} to ${formatClock(d.wind)}`, m.awake)}
        {bar("Classes or work", m.fixed)}
        {bar("Meals, getting ready, travel", m.everyday)}
        {bar("Yours to plan", m.free, true)}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          marginTop: s.s6,
          padding: s.s4,
          borderRadius: r.card,
          backgroundColor: c.sunken,
        }}
      >
        <Icon icon={Hourglass} size={20} tone="ink" />
        <Txt variant="body" tone="ink2" style={{ flex: 1 }}>
          <Txt variant="body" style={family("600")}>
            {`${daysLeft} ${daysLeft === 1 ? "day" : "days"}`}
          </Txt>
          {` left in ${year}. A good time to start.`}
        </Txt>
      </View>
    </StepFrame>
  );
}

const SUGGESTIONS = [
  "Read 20 pages tonight at 21:30 for 30m",
  "Gym tomorrow 7am for 45m every Mon Wed Fri",
  "Call mum at 18:30",
  "Lab report at 14:00 for 90m remind 10m before",
];

/** The typed text in pieces: the words quick add understood come out blue. */
function pieces(text: string, parsed: ParsedTask): { text: string; understood: boolean }[] {
  const out: { text: string; understood: boolean }[] = [];
  let at = 0;
  for (const span of [...parsed.spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    if (span.start > at) out.push({ text: text.slice(at, span.start), understood: false });
    out.push({ text: text.slice(span.start, span.end), understood: true });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), understood: false });
  return out;
}

function ParseChip({ icon, label, set }: { icon: LucideIcon; label: string; set: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s1,
        height: 32,
        paddingHorizontal: s.s3,
        borderRadius: r.ctl,
        backgroundColor: set ? c.select : "transparent",
        boxShadow: set ? undefined : `inset 0 0 0 1px ${c.lineStrong}`,
      }}
    >
      <Icon icon={icon} size={14} tone={set ? "parse" : "ink3"} />
      <Txt variant="label" tone={set ? "parse" : "ink3"}>
        {label}
      </Txt>
    </View>
  );
}

/** What quick add understood, one chip each; unset ones are quiet ("Anytime", "No length"). */
function ParseChips({ parsed, today }: { parsed: ParsedTask; today: CivilDate }) {
  const chips: ReactNode[] = [
    <ParseChip
      key="day"
      icon={CalendarDays}
      label={parsed.date ? formatDay(parsed.date, today) : "Today"}
      set
    />,
    <ParseChip
      key="time"
      icon={Clock}
      label={parsed.time !== undefined ? formatClock(parsed.time) : "Anytime"}
      set={parsed.time !== undefined}
    />,
    <ParseChip
      key="length"
      icon={Hourglass}
      label={parsed.length ? formatDuration(parsed.length) : "No length"}
      set={Boolean(parsed.length)}
    />,
  ];
  if (parsed.repeat)
    chips.push(
      <ParseChip
        key="repeat"
        icon={Repeat2}
        label={describeRepeat(parsed.repeat, parsed.date ?? today, today)}
        set
      />,
    );
  parsed.reminders.forEach((rem, i) =>
    chips.push(<ParseChip key={`rem${i}`} icon={Bell} label={describeReminder(rem)} set />),
  );
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s3 }}>{chips}</View>;
}

/**
 * Step 5: one thing for today, typed like you'd say it. Words turn blue as they're understood;
 * no time or length is guessed. Adding it puts it on the day below, before any sign-up.
 */
export function FirstTask({ d, today, next, back }: StepProps) {
  const roles = useType();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseTask(text, today), [text, today]);
  const ready = Boolean(text.trim() && parsed.title);
  const landed = Boolean(d.task);
  const add = () => {
    if (!ready) return;
    commitHaptic();
    playSound("tick");
    updateDraft({ task: { text: text.trim(), date: today } });
  };
  const big = { ...roles.title, ...family("600") };
  // On the web the field's own text is see-through over the coloured copy, so the understood
  // words turn blue in place; the field sits right on the card so the focus ring is the card's.
  // Android shows the coloured copy under the field instead.
  const overlay = Platform.OS === "web";
  return (
    <StepFrame
      step={5}
      onBack={back}
      onSkip={next}
      foot={
        landed ? (
          <>
            <FullButton label="Continue" onPress={next} />
            <LinkButton label="Change it" onPress={() => updateDraft({ task: null })} />
          </>
        ) : (
          <FullButton label="Add to today" onPress={add} disabled={!ready} />
        )
      }
    >
      {landed ? (
        <>
          <Question text="That's a plan." />
          <Lead>{"Here's your day. Add more any time with the + button."}</Lead>
        </>
      ) : (
        <>
          <Question text="What's one thing" dim="for today?" />
          <Lead>{"Type it like you'd say it. Add a time if it has one."}</Lead>
          <View
            style={{
              marginTop: s.s6,
              paddingHorizontal: s.s4,
              paddingVertical: s.s3,
              borderRadius: r.sheet,
              backgroundColor: c.sunken,
            }}
          >
            {overlay ? (
              <Txt aria-hidden style={[big, { color: c.ink, minHeight: 56 }]}>
                {pieces(text, parsed).map((p, i) => (
                  <Txt key={i} style={[big, { color: p.understood ? c.parse : c.ink }]}>
                    {p.text}
                  </Txt>
                ))}
                {"​"}
              </Txt>
            ) : null}
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={add}
              submitBehavior="submit"
              returnKeyType="done"
              multiline
              autoFocus={Platform.OS === "web"}
              placeholder="Read 20 pages tonight at 21:30"
              placeholderTextColor={hex.ink3}
              accessibilityLabel="Your first task"
              autoCapitalize="sentences"
              autoCorrect={false}
              cursorColor={hex.ink}
              onKeyPress={(e) => {
                if (Platform.OS === "web" && e.nativeEvent.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              style={[
                big,
                { padding: 0, minHeight: 56, textAlignVertical: "top" },
                overlay
                  ? ({
                      position: "absolute",
                      top: s.s3,
                      left: s.s4,
                      right: s.s4,
                      bottom: s.s3,
                      color: "transparent",
                      caretColor: c.ink,
                      outlineStyle: "none",
                      resize: "none",
                    } as object)
                  : { color: c.ink },
              ]}
            />
          </View>
          {text.trim() ? (
            <>
              {overlay ? null : (
                <Txt
                  variant="body"
                  tone="ink3"
                  style={{ marginTop: s.s2 }}
                  accessibilityLabel={`Understood: ${parsed.title}`}
                >
                  {pieces(text, parsed).map((p, i) => (
                    <Txt key={i} variant="body" tone={p.understood ? "parse" : "ink3"}>
                      {p.text}
                    </Txt>
                  ))}
                </Txt>
              )}
              <ParseChips parsed={parsed} today={today} />
            </>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s4 }}>
              {SUGGESTIONS.map((sug) => (
                <Press
                  key={sug}
                  role="button"
                  accessibilityLabel={`Try: ${sug}`}
                  onPress={() => setText(sug)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: s.s3,
                    borderRadius: r.pill,
                    boxShadow: `inset 0 0 0 1px ${c.lineStrong}`,
                  }}
                >
                  <Txt variant="label" tone="ink2">
                    {sug.replace(/ (for|remind|every) .*/, "")}
                  </Txt>
                </Press>
              ))}
            </View>
          )}
        </>
      )}
      <View style={{ marginTop: s.s6 }}>
        <MiniLabel text={landed ? "Today" : "Your day so far"} />
        <DayRows d={d} today={today} pending={landed ? undefined : parsed} />
      </View>
      {landed ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, marginTop: s.s4 }}>
          <Icon icon={Check} size={18} tone="done" strokeWidth={2.4} />
          <Txt variant="label" style={family("600")}>
            Saved on this {Platform.OS === "web" ? "device" : "phone"}. Next, keep it safe.
          </Txt>
        </View>
      ) : null}
    </StepFrame>
  );
}
