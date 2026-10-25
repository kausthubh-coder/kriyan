// Adding a goal: what it is, why it matters, whether it counts tasks or tracks a number, and when
// it is due. GoalCard draws one.

import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { formatDate } from "@kriyan/core/format";
import { errorText } from "@/features/tasks/actions";
import { DayPicker } from "@/features/tasks/pickers";
import { c, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field } from "@/ui/bits";
import { showToast } from "@/ui/toast";

export function AddGoal({ today, onDone }: { today: string; onDone: () => void }) {
  const add = useMutation(api.organize.addGoal);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
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
      <Field
        label="Why it matters (optional)"
        value={why}
        onChangeText={setWhy}
        placeholder="Training for the half marathon in March"
        maxLength={300}
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
              ...(why.trim() ? { why: why.trim() } : {}),
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
