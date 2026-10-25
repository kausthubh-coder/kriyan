// Habits and routines on Goals and habits, in v5's row style: a ring that checks today, the
// name, and this week's count against its target on the right ("1 of 3"). The name opens the
// editor, with Fix a day inside; routines (design v5 contract A) list their parts.

import { useRef, useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { CalendarCheck } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatDate } from "@kriyan/core/format";
import { useSpaces } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { useRowHeight } from "@/features/shell/ListRow";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot, Field, Ring } from "@/ui/bits";
import { DottedRule } from "@/ui/DottedRule";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import type { Habit, Routine } from "./goalData";

export function HabitRow({ habit, today }: { habit: Habit; today: string }) {
  const check = useMutation(api.organize.checkHabit);
  const height = useRowHeight();
  const [open, setOpen] = useState<null | "edit" | "fix">(null);
  const ref = useRef<View>(null);
  const doneOn = new Set(habit.days.filter((d) => d.done).map((d) => d.date));
  const doneToday = doneOn.has(today);
  const tone = spaceTone(habit.color);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: height }}>
      <Press
        role="checkbox"
        aria-checked={doneToday}
        accessibilityLabel={`${habit.title} today`}
        onPress={() => {
          toggleHaptic(!doneToday);
          void check({ id: habit._id as Id<"habits">, done: !doneToday, date: today }).catch((e: unknown) =>
            showToast(errorText(e)),
          );
        }}
        hoverBg={null}
        rippleRadius={22}
        style={{ width: 44, height: 44, margin: -10, alignItems: "center", justifyContent: "center" }}
      >
        <Ring color={habit.color ? tone.dot : c.ink3} done={doneToday} size={22} dashed />
      </Press>
      <Press
        ref={ref}
        role="button"
        accessibilityLabel={`${habit.title}, ${habit.thisWeek} of ${habit.target} this week. Edit or fix a day`}
        onPress={() => setOpen("edit")}
        hoverBg={null}
        scale={false}
        style={{
          flex: 1,
          minWidth: 0,
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
        }}
      >
        {({ hovered }) => (
          <>
            <Txt
              variant="subhead"
              tone={doneToday ? "ink3" : "ink"}
              numberOfLines={1}
              style={[family("500"), { flex: 1 }, hovered ? { textDecorationLine: "underline" } : null]}
            >
              {habit.title}
            </Txt>
            <Txt variant="body" tone="ink3" tnum>
              {habit.target === 7 ? `${habit.thisWeek} of 7` : `${habit.thisWeek} of ${habit.target}`}
            </Txt>
          </>
        )}
      </Press>
      <DottedRule width={2} />
      <Popover
        open={open !== null}
        onClose={() => setOpen(null)}
        anchor={ref}
        side="above"
        title={open === "fix" ? `Fix a day for ${habit.title}` : "Edit habit"}
        width={320}
      >
        {open === "fix" ? (
          <>
            <Txt variant="meta" tone="ink3">
              Pick a day to switch it between done and not done.
            </Txt>
            <DayPicker
              value={null}
              today={today}
              allowNone={false}
              onPick={(date) => {
                if (!date || date > today) return;
                const nowDone = !doneOn.has(date);
                setOpen(null);
                toggleHaptic(nowDone);
                void check({ id: habit._id as Id<"habits">, done: nowDone, date })
                  .then(() =>
                    showToast(
                      `${habit.title}: ${nowDone ? "done" : "not done"} on ${formatDate(date, today)}`,
                    ),
                  )
                  .catch((e: unknown) => showToast(errorText(e)));
              }}
            />
          </>
        ) : (
          <>
            <View style={{ alignItems: "flex-start", marginLeft: -s.s3 }}>
              <Button variant="quiet" icon={CalendarCheck} label="Fix a day" onPress={() => setOpen("fix")} />
            </View>
            <EditHabit habit={habit} onDone={() => setOpen(null)} />
          </>
        )}
      </Popover>
    </View>
  );
}

/** A routine: one block of parts; the count says how many of today's parts are done. */
export function RoutineRow({ routine }: { routine: Routine }) {
  const height = useRowHeight();
  const done = routine.parts.filter((p) => p.done).length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: height }}>
      <View style={{ width: 24, alignItems: "center" }}>
        <Ring color={c.ink3} done={routine.done} size={22} />
      </View>
      <Txt variant="subhead" numberOfLines={1} style={[family("500"), { flex: 1 }]}>
        {routine.title}
      </Txt>
      <Txt variant="body" tone="ink3" tnum>
        {`${done} of ${routine.parts.length}`}
      </Txt>
      <DottedRule width={2} />
    </View>
  );
}

/** Rename, retarget or archive a habit. Archiving takes it off Today's check-ins, with Undo. */
function EditHabit({ habit, onDone }: { habit: Habit; onDone: () => void }) {
  const update = useMutation(api.organize.updateHabit);
  const [title, setTitle] = useState(habit.title);
  const [target, setTarget] = useState(habit.target);
  const id = habit._id as Id<"habits">;
  const changed = title.trim() !== habit.title || target !== habit.target;
  return (
    <View style={{ gap: s.s3 }}>
      <Field label="Habit" value={title} onChangeText={setTitle} autoFocus />
      <Txt variant="caption" tone="ink3">
        Times a week
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Chip
            key={n}
            label={n === 7 ? "Every day" : String(n)}
            on={target === n}
            onPress={() => setTarget(n)}
            accessibilityLabel={`${n} times a week`}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: s.s2 }}>
        <Button
          variant="quiet"
          label="Archive habit"
          onPress={() => {
            onDone();
            void update({ id, archived: true })
              .then(() =>
                showToast(`Archived: ${habit.title}`, {
                  label: "Undo",
                  run: () =>
                    void update({ id, archived: false }).catch((e: unknown) => showToast(errorText(e))),
                }),
              )
              .catch((e: unknown) => showToast(errorText(e)));
          }}
        />
        <Button
          variant="primary"
          label="Save habit"
          disabled={!title.trim() || !changed}
          onPress={() => {
            onDone();
            void update({ id, title: title.trim(), target }).catch((e: unknown) => showToast(errorText(e)));
          }}
        />
      </View>
    </View>
  );
}

export function AddHabit({ onDone }: { onDone: () => void }) {
  const add = useMutation(api.organize.addHabit);
  const spaces = useSpaces();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(3);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  return (
    <View style={{ gap: s.s3, padding: s.s3, borderRadius: r.card, backgroundColor: c.raised }}>
      <Field label="Habit" value={title} onChangeText={setTitle} placeholder="Read 20 min" autoFocus />
      <Txt variant="caption" tone="ink3">
        Times a week
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Chip
            key={n}
            label={n === 7 ? "Every day" : String(n)}
            on={target === n}
            onPress={() => setTarget(n)}
            accessibilityLabel={`${n} times a week`}
          />
        ))}
      </View>
      {spaces && spaces.length ? (
        <>
          <Txt variant="caption" tone="ink3">
            Space (optional)
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {spaces
              .filter((sp) => sp.depth === 0)
              .map((sp) => (
                <Chip
                  key={sp._id}
                  label={sp.name}
                  on={spaceId === sp._id}
                  leading={<Dot color={spaceTone(sp.color).dot} />}
                  onPress={() => setSpaceId(spaceId === sp._id ? null : sp._id)}
                />
              ))}
          </View>
        </>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button label="Cancel" onPress={onDone} />
        <Button
          variant="primary"
          label="Add habit"
          disabled={!title.trim()}
          onPress={() =>
            void add({
              title: title.trim(),
              target,
              ...(spaceId ? { spaceId: spaceId as Id<"spaces"> } : {}),
            })
              .then(onDone)
              .catch((e: unknown) => showToast(errorText(e)))
          }
        />
      </View>
    </View>
  );
}
