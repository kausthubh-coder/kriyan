// Goals against pace: how much is left, when it is due, and where a steady pace would put you.

import { useRef, useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { diffDays } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import type { ProgressView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { DayPicker } from "@/features/tasks/pickers";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field } from "@/ui/bits";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

type Goal = ProgressView["goals"][number];

function amount(goal: Goal, n: number) {
  const v = Math.round(n * 10) / 10;
  return goal.kind === "tasks"
    ? `${v} ${v === 1 ? "task" : "tasks"}`
    : `${v}${goal.unit ? ` ${goal.unit}` : ""}`;
}

/** Where the goal stands against a steady pace, in words; null when done or without a due date. */
function paceText(goal: Goal): string | null {
  if (goal.current >= goal.target || goal.pace === null) return null;
  const diff = goal.current - goal.pace * goal.target;
  if (Math.abs(diff) < goal.target * 0.04) return "On pace";
  return diff > 0 ? `${amount(goal, diff)} ahead of pace` : `${amount(goal, -diff)} behind pace`;
}

/** "Due Fri 20 Nov · 30 days left". A date that has passed only says when it was due. */
function dueText(goal: Goal, today: string): string | null {
  if (!goal.dueDate) return null;
  const left = diffDays(goal.dueDate, today);
  if (left === 0) return "Due today";
  const due = `Due ${formatDate(goal.dueDate, today)}`;
  if (left < 0) return due;
  return `${due} · ${left} ${left === 1 ? "day" : "days"} left`;
}

function daysLeftText(goal: Goal, today: string): string | null {
  if (!goal.dueDate) return null;
  const left = diffDays(goal.dueDate, today);
  if (left <= 0) return dueText(goal, today);
  return `${left} ${left === 1 ? "day" : "days"} left`;
}

/** Up to this many steps, a count goal draws one segment per step, like the prototype. */
const MAX_SEGMENTS = 12;

/**
 * One goal as the prototype draws it (b2.html `.goal`): the title, a segmented bar (or a plain one
 * for big numbers), what's left beside the due date, and where a steady pace would put you.
 */
export function GoalView({ goal, color, today }: { goal: Goal; color: string; today: string }) {
  const update = useMutation(api.organize.updateGoal);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(goal.current));
  const ref = useRef<View>(null);
  const unit = goal.kind === "tasks" ? (goal.target === 1 ? "task" : "tasks") : (goal.unit ?? "");
  const of = `${goal.current} of ${goal.target}${unit ? ` ${unit}` : ""}`;
  const left = Math.max(0, Math.round((goal.target - goal.current) * 10) / 10);
  const segments =
    goal.kind === "tasks" && Number.isInteger(goal.target) && goal.target > 1 && goal.target <= MAX_SEGMENTS
      ? goal.target
      : null;
  // Beside a plain bar the prototype keeps the right side short: just the days left.
  const due = segments ? dueText(goal, today) : daysLeftText(goal, today);
  const pace = paceText(goal);
  return (
    <View style={{ borderBottomWidth: 1, borderStyle: "dotted", borderColor: c.lineStrong }}>
      <Press
        ref={ref}
        role="button"
        accessibilityLabel={`${goal.title}, ${of}. Update progress`}
        onPress={() => setOpen(true)}
        hoverBg={null}
        scale={false}
        style={{ gap: s.s2, paddingVertical: s.s4 }}
      >
        <Txt variant="subhead">{goal.title}</Txt>
        {segments ? (
          <View style={{ flexDirection: "row", gap: s.s1 }} aria-hidden>
            {Array.from({ length: segments }, (_, k) => (
              <View
                key={k}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: k < goal.current ? color : c.line,
                }}
              />
            ))}
          </View>
        ) : (
          <View
            style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: "hidden" }}
            aria-hidden
          >
            <View
              style={{
                width: `${Math.round(goal.progress * 100)}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor: color,
              }}
            />
          </View>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: s.s3 }}>
          <Txt variant="meta" tone="ink3" tnum style={{ flex: 1 }}>
            {left > 0 ? (
              <>
                <Txt variant="meta" tnum style={family("600")}>
                  {left} to go
                </Txt>
                {segments ? ` of ${goal.target} ${unit}` : ` · ${of}`}
              </>
            ) : (
              <>
                <Txt variant="meta" tnum style={family("600")}>
                  Done
                </Txt>
                {` · ${of}`}
              </>
            )}
          </Txt>
          {due ? (
            <Txt variant="meta" tone="ink3" tnum>
              {due}
            </Txt>
          ) : null}
        </View>
        {pace ? (
          <Txt variant="meta" tone="ink2">
            {pace}
          </Txt>
        ) : null}
      </Press>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} title={goal.title} width={300}>
        {goal.kind === "number" ? (
          <View style={{ gap: s.s3 }}>
            <Field
              label={`Progress${goal.unit ? ` in ${goal.unit}` : ""}`}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Button
              variant="primary"
              label="Save progress"
              disabled={!(Number(value) >= 0)}
              onPress={() => {
                setOpen(false);
                void update({ id: goal._id, current: Number(value) }).catch((e: unknown) =>
                  showToast(errorText(e)),
                );
              }}
            />
          </View>
        ) : (
          <Txt variant="body" tone="ink3">
            This goal counts linked tasks as you finish them. Link a task from its Goal field.
          </Txt>
        )}
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

export function AddGoal({ today, onDone }: { today: string; onDone: () => void }) {
  const add = useMutation(api.organize.addGoal);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"tasks" | "number">("tasks");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [due, setDue] = useState<string | null>(null);
  const [pickDue, setPickDue] = useState(false);
  const valid = title.trim() && Number(target) > 0;
  return (
    <View style={{ gap: s.s3, padding: s.s3, borderRadius: r.card, backgroundColor: c.raised }}>
      <Field
        label="Goal"
        value={title}
        onChangeText={setTitle}
        placeholder="Run 100 km this term"
        autoFocus
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        <Chip label="Count tasks done" on={kind === "tasks"} onPress={() => setKind("tasks")} />
        <Chip label="Track a number" on={kind === "number"} onPress={() => setKind("number")} />
      </View>
      <View style={{ flexDirection: "row", gap: s.s2 }}>
        <Field
          label="Target"
          value={target}
          onChangeText={setTarget}
          placeholder={kind === "tasks" ? "14" : "100"}
          keyboardType="decimal-pad"
          containerStyle={{ flex: 1 }}
        />
        {kind === "number" ? (
          <Field
            label="Unit"
            value={unit}
            onChangeText={setUnit}
            placeholder="km"
            containerStyle={{ flex: 1 }}
          />
        ) : null}
      </View>
      <Chip
        label={due ? `Due ${formatDate(due, today)}` : "Add a due date"}
        on={Boolean(due)}
        onPress={() => setPickDue(!pickDue)}
      />
      {pickDue ? (
        <DayPicker
          value={due}
          today={today}
          onPick={(d) => {
            setDue(d);
            setPickDue(false);
          }}
        />
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button label="Cancel" onPress={onDone} />
        <Button
          variant="primary"
          label="Add goal"
          disabled={!valid}
          onPress={() =>
            void add({
              title: title.trim(),
              kind,
              target: Number(target),
              ...(kind === "number" && unit.trim() ? { unit: unit.trim() } : {}),
              ...(due ? { dueDate: due } : {}),
            })
              .then(onDone)
              .catch((e: unknown) => showToast(errorText(e)))
          }
        />
      </View>
    </View>
  );
}

export const goalColor = (spaceColor: Parameters<typeof spaceTone>[0]) => spaceTone(spaceColor ?? null).dot;
