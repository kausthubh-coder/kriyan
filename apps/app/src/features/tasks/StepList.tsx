// The task's steps (b2.html `.tsteps`): "Steps · 1 of 3", a tick circle per step and an
// "Add a step" field under them. A step's title is edited in place; clearing it removes the
// step. Events have no steps: you attend them.

import { useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { Check as CheckGlyph } from "lucide-react-native";
import type { TaskDoc } from "@/data/views";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { toggleHaptic } from "./haptics";
import { STEP_MAX, useSaveSteps, type Step } from "./steps";

/** The visible circle; its target grows to 44 on touch. */
const CIRCLE = 22;

export function StepList({ task }: { task: TaskDoc }) {
  const steps = task.steps ?? [];
  const save = useSaveSteps(task._id);
  const roles = useType();
  const [draft, setDraft] = useState("");
  const input = useRef<TextInput>(null);
  const done = steps.filter((st) => st.done).length;

  const add = () => {
    const title = draft.trim().slice(0, STEP_MAX);
    if (!title) return;
    save([...steps, { title, done: false }]);
    setDraft("");
    // Keep the field, so a list of steps is typed one after another.
    input.current?.focus();
  };

  return (
    <View accessibilityLabel="Steps" style={{ marginTop: s.s4 }}>
      <SectionLabel title={steps.length ? `Steps · ${done} of ${steps.length}` : "Steps"} />
      {steps.map((step, i) => (
        <StepRow
          // Keyed by place and title, so a removed or renamed step remounts the rows after it.
          key={`${i}:${step.title}`}
          step={step}
          onTick={() => {
            toggleHaptic(!step.done);
            save(steps.map((st, j) => (j === i ? { ...st, done: !st.done } : st)));
          }}
          onRename={(title) => save(steps.map((st, j) => (j === i ? { ...st, title } : st)))}
          onRemove={() => save(steps.filter((_, j) => j !== i))}
        />
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 44 }}>
        <View
          style={{
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: r.pill,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: c.ink3,
          }}
        />
        <TextInput
          ref={input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          returnKeyType="done"
          maxLength={STEP_MAX}
          placeholder="Add a step"
          placeholderTextColor={hex.ink3}
          accessibilityLabel="Add a step"
          style={[
            roles.body,
            { flex: 1, minWidth: 0, color: c.ink, minHeight: 44 },
            Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
          ]}
        />
      </View>
    </View>
  );
}

function StepRow({
  step,
  onTick,
  onRename,
  onRemove,
}: {
  step: Step;
  onTick: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const phone = useIsPhone();
  const roles = useType();
  const [title, setTitle] = useState(step.title);
  // Removing a focused step can also blur it; it must go only once.
  const gone = useRef(false);
  const target = phone ? 44 : 32;
  const remove = () => {
    if (gone.current) return;
    gone.current = true;
    onRemove();
  };

  const commit = () => {
    const next = title.trim().slice(0, STEP_MAX);
    if (!next) remove();
    else if (next !== step.title) onRename(next);
    else setTitle(step.title);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 44 }}>
      <Press
        role="checkbox"
        aria-checked={step.done}
        accessibilityLabel={step.title}
        onPress={onTick}
        hoverBg={null}
        rippleRadius={target / 2}
        style={{
          width: target,
          height: target,
          margin: -(target - CIRCLE) / 2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: CIRCLE,
            height: CIRCLE,
            borderRadius: r.pill,
            borderWidth: step.done ? 0 : 1.5,
            borderColor: c.ink3,
            backgroundColor: step.done ? c.ink : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {step.done ? <Icon icon={CheckGlyph} size={13} color={hex.bg} strokeWidth={2.6} /> : null}
        </View>
      </Press>
      <TextInput
        value={title}
        onChangeText={setTitle}
        onBlur={commit}
        onSubmitEditing={commit}
        submitBehavior="blurAndSubmit"
        maxLength={STEP_MAX}
        accessibilityLabel={`Step: ${step.title}`}
        onKeyPress={(e) => {
          // Backspace in an empty step removes it, as in a notes app's checklist.
          if (e.nativeEvent.key === "Backspace" && title === "") remove();
        }}
        style={[
          roles.body,
          {
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            color: step.done ? c.ink3 : c.ink,
            textDecorationLine: step.done ? "line-through" : "none",
          },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
      />
    </View>
  );
}
