// One goal as v5 draws it (docs/design/v5 prototype `goalCard`): the title and when it's due,
// a bar in its space's colour, where it stands and what's left in a sentence, a small trend
// line, what feeds it, and quick log buttons (+$20, −0.5 kg). The title opens its editor.

import { useRef, useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import Svg, { Polyline } from "react-native-svg";
import { api } from "@kriyan/convex/api";
import { diffDays } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import type { SpaceColor } from "@kriyan/core/tokens";
import { errorText } from "@/features/tasks/actions";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/bits";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { useLogGoal, type Goal } from "./goalData";

const round1 = (n: number) => Math.round(n * 10) / 10;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

interface Step {
  label: string;
  delta: number;
}

interface Stand {
  /** 0 to 1, for the bar. */
  share: number;
  /** "$1,240 of $2,000". */
  lead: string;
  /** "$760 to go, $84 a week for 9 weeks". */
  rest: string;
  /** The quick log buttons, none for a goal that counts tasks. */
  steps: Step[];
}

const signed = (n: number, unit: string) => `${n < 0 ? "−" : "+"}${Math.abs(n)}${unit}`;

/** Where a goal stands, in the prototype's words. */
function goalStand(goal: Goal, today: string): Stand {
  const weeks = goal.dueDate ? Math.max(1, Math.round(diffDays(goal.dueDate, today) / 7)) : null;
  const unit = goal.unit ? ` ${goal.unit}` : "";
  const onPace = goal.pace !== null && goal.progress >= goal.pace - 0.04 ? " On pace." : "";
  if (goal.kind === "tasks") {
    return {
      share: goal.progress,
      lead: `${goal.current} of ${goal.target} done`,
      rest: goal.dueDate
        ? `Due ${formatDate(goal.dueDate, today)}`
        : goal.next
          ? `Next: ${goal.next.title}`
          : "",
      steps: [],
    };
  }
  const left = Math.max(0, round1(goal.target - goal.current));
  if (goal.unit === "$") {
    return {
      share: goal.progress,
      lead: `${money(goal.current)} of ${money(goal.target)}`,
      rest:
        left === 0
          ? "Reached"
          : weeks
            ? `${money(left)} to go, ${money(left / weeks)} a week for ${plural(weeks, "week")}`
            : `${money(left)} to go`,
      steps: [20, 50, 100].map((n) => ({ label: `+${money(n)}`, delta: n })),
    };
  }
  // "Lose 5 kg" is kept as kilos lost; its buttons read as the scale does (−0.5 kg is 0.5 lost).
  const losing = /^lose\b/i.test(goal.title);
  const small = goal.target <= 20;
  const steps = losing
    ? (small ? [0.2, 0.5, -0.2] : [1, 5, -1]).map((n) => ({ label: signed(-n, unit), delta: n }))
    : (goal.target <= 20 ? [1, 2, 5] : goal.target <= 200 ? [1, 5, 10] : [10, 50, 100]).map((n) => ({
        label: signed(n, unit),
        delta: n,
      }));
  return {
    share: goal.progress,
    lead: `${goal.current} of ${goal.target}${unit}${losing ? " lost" : ""}`,
    rest:
      left === 0
        ? "Reached"
        : `${left}${unit} to go${weeks ? `, about ${round1(left / weeks)}${unit} a week` : ""}.${onPace}`,
    steps,
  };
}

export function GoalCard({ goal, color, today }: { goal: Goal; color: SpaceColor | null; today: string }) {
  const tone = spaceTone(color);
  const stand = goalStand(goal, today);
  const entries = goal.entries.slice(-12);
  const feeds = goal.feeds;
  const log = useLogGoal();
  const fed = [...feeds.habits, ...(feeds.tasks ? [plural(feeds.tasks, "task")] : [])];
  return (
    <View
      style={{
        marginTop: s.s3,
        paddingVertical: s.s4,
        paddingHorizontal: s.s6,
        borderRadius: r.sheet,
        backgroundColor: c.sunken,
      }}
    >
      <GoalHead goal={goal} today={today} />
      <View
        aria-hidden
        style={{
          height: 8,
          borderRadius: r.pill,
          backgroundColor: c.lineStrong,
          marginTop: s.s3,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.round(stand.share * 100)}%`,
            height: "100%",
            borderRadius: r.pill,
            backgroundColor: tone.dot,
          }}
        />
      </View>
      <Txt variant="label" tnum style={[family("600"), { marginTop: s.s3 }]}>
        {stand.lead}
      </Txt>
      {stand.rest ? (
        <Txt variant="body" tone="ink2" tnum>
          {stand.rest}
        </Txt>
      ) : null}
      {entries.length >= 2 ? (
        <Trend values={entries.map((e) => e.value)} target={goal.target} color={tone.dotHex} />
      ) : null}
      {fed.length ? (
        <Txt variant="meta" tone="ink3" style={{ marginTop: s.s2 }}>
          {`Fed by ${fed.join(", ")}`}
        </Txt>
      ) : null}
      {stand.steps.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s4 }}>
          {stand.steps.map((step) => (
            <Press
              key={step.label}
              role="button"
              accessibilityLabel={`Log ${step.label} on ${goal.title}`}
              onPress={() => void log(goal, step.delta)}
              hoverBg={null}
              style={({ hovered }) => ({
                height: 40,
                paddingHorizontal: s.s4,
                borderRadius: r.pill,
                justifyContent: "center",
                backgroundColor: hovered ? c.lineStrong : c.select,
              })}
            >
              <Txt variant="label" tnum style={{ fontSize: 14, lineHeight: 20 }}>
                {step.label}
              </Txt>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The small trend line under the numbers: the logged values, scaled between them and the target. */
function Trend({ values, target, color }: { values: number[]; target: number; color: string }) {
  const lo = Math.min(...values, target);
  const hi = Math.max(...values, target);
  const points = values
    .map((v, k) => `${(k / (values.length - 1)) * 100},${26 - ((v - lo) / (hi - lo || 1)) * 24}`)
    .join(" ");
  return (
    <View style={{ marginTop: s.s3, height: 32 }} aria-hidden>
      <Svg width="100%" height={32} viewBox="0 0 100 28" preserveAspectRatio="none">
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

/** The title (it opens the editor: progress, why it matters, archive) and "by Thu 31 Dec". */
function GoalHead({ goal, today }: { goal: Goal; today: string }) {
  const update = useMutation(api.organize.updateGoal);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(goal.current));
  const [why, setWhy] = useState(goal.why ?? "");
  const ref = useRef<View>(null);
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s3 }}>
      <Press
        ref={ref}
        role="button"
        accessibilityLabel={`${goal.title}. Edit goal`}
        onPress={() => {
          // Start from what's saved now, which an agent may have changed since.
          setValue(String(goal.current));
          setWhy(goal.why ?? "");
          setOpen(true);
        }}
        hoverBg={null}
        scale={false}
        style={{ flex: 1, minWidth: 0 }}
      >
        {({ hovered }) => (
          <Txt variant="title" numberOfLines={2} style={hovered ? { textDecorationLine: "underline" } : null}>
            {goal.title}
          </Txt>
        )}
      </Press>
      {goal.dueDate ? (
        <Txt variant="meta" tone="ink3" tnum>
          {`by ${formatDate(goal.dueDate, today)}`}
        </Txt>
      ) : null}
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} title={goal.title} width={300}>
        <View style={{ gap: s.s3 }}>
          {goal.kind === "number" ? (
            <Field
              label={`Progress${goal.unit ? ` in ${goal.unit}` : ""}`}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              autoFocus
            />
          ) : (
            <Txt variant="body" tone="ink3">
              This goal counts linked tasks as you finish them. Link a task from its Goal field.
            </Txt>
          )}
          <Field
            label="Why it matters (optional)"
            value={why}
            onChangeText={setWhy}
            placeholder="Keeps the scholarship open"
            maxLength={300}
          />
          <Button
            variant="primary"
            label="Save goal"
            disabled={
              (goal.kind === "number" && !(Number(value) >= 0)) ||
              (why.trim() === (goal.why ?? "") && (goal.kind !== "number" || Number(value) === goal.current))
            }
            onPress={() => {
              setOpen(false);
              void update({
                id: goal._id,
                ...(goal.kind === "number" ? { current: Number(value) } : {}),
                ...(why.trim() !== (goal.why ?? "") ? { why: why.trim() || null } : {}),
              }).catch((e: unknown) => showToast(errorText(e)));
            }}
          />
        </View>
        <Button
          variant="quiet"
          label="Archive goal"
          onPress={() => {
            setOpen(false);
            void update({ id: goal._id, archived: true }).catch((e: unknown) => showToast(errorText(e)));
          }}
        />
      </Popover>
    </View>
  );
}
