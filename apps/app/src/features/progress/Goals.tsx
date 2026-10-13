// Goals against pace: where you are, where a steady pace would put you today, and in words.

import { useRef, useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { formatDate } from "@kriyan/core/format";
import type { ProgressView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { DayPicker } from "@/features/tasks/pickers";
import { c, r, s, spaceTone } from "@/theme/tokens";
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

export function paceText(goal: Goal, today: string): string {
  const due = goal.dueDate ? formatDate(goal.dueDate, today) : null;
  if (goal.current >= goal.target) return "Done";
  if (goal.pace === null) return "No due date";
  const expected = goal.pace * goal.target;
  const diff = goal.current - expected;
  if (Math.abs(diff) < goal.target * 0.04) return due ? `On pace, due ${due}` : "On pace";
  if (diff > 0) return `${amount(goal, diff)} ahead of pace`;
  return `${amount(goal, -diff)} behind pace${due ? `, due ${due}` : ""}`;
}

export function GoalView({ goal, color, today }: { goal: Goal; color: string; today: string }) {
  const update = useMutation(api.organize.updateGoal);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(goal.current));
  const ref = useRef<View>(null);
  const meta =
    goal.kind === "tasks"
      ? `${goal.current} of ${goal.target} tasks`
      : `${goal.current} of ${goal.target}${goal.unit ? ` ${goal.unit}` : ""}`;
  return (
    <View style={{ gap: s.s2 }}>
      <Press
        ref={ref}
        role="button"
        accessibilityLabel={`${goal.title}, ${meta}. Update progress`}
        onPress={() => setOpen(true)}
        hoverBg={null}
        scale={false}
        style={{ gap: s.s2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s3 }}>
          <Txt variant="label" style={{ flex: 1 }}>
            {goal.title}
          </Txt>
          <Txt variant="meta" tone="ink3" tnum>
            {meta}
          </Txt>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.lineStrong }}>
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.round(goal.progress * 100)}%`,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
          {goal.pace !== null ? (
            <View
              accessibilityLabel="Where a steady pace would be today"
              style={{
                position: "absolute",
                top: -4,
                bottom: -4,
                left: `${Math.round(goal.pace * 100)}%`,
                width: 2,
                borderRadius: 1,
                backgroundColor: c.ink2,
              }}
            />
          ) : null}
        </View>
        <Txt variant="meta" tone="ink3">
          {paceText(goal, today)}
        </Txt>
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
