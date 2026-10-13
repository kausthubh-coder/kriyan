// Progress: time done this week and this year split by space, a year heatmap, goals against
// pace, and habits by the week ("weeks on target", never a streak that resets).

import { useRef, useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { CalendarCheck, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { addDays, parts, startOfWeek, weekday, type CivilDate } from "@kriyan/core/dates";
import { formatDate, MONTH_SHORT } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useProgressView, useSpaces, type ProgressView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot, Field, Skeleton } from "@/ui/bits";
import { Popover } from "@/ui/Popover";
import { PageHead, Screen, SectionHead } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AddGoal, GoalView } from "./Goals";

function isoWeek(date: CivilDate): number {
  // The Thursday of this week decides the year; weeks start on Monday.
  const thursday = addDays(date, 3 - weekday(date));
  const [y] = parts(thursday);
  const jan4 = `${y}-01-04`;
  return (
    Math.round((Date.parse(startOfWeek(thursday)) - Date.parse(startOfWeek(jan4))) / (7 * 86_400_000)) + 1
  );
}

const hoursText = (m: number) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);

export function ProgressScreen() {
  const view = useProgressView();
  const { today } = useClock();
  return (
    <Screen title="Progress" back>
      <PageHead big title="Progress" sub={`Week ${isoWeek(today)}`} />
      {view === undefined ? (
        <View testID="skeleton" style={{ gap: s.s6 }}>
          <Skeleton width={160} height={28} />
          <Skeleton width="100%" height={6} />
          <Skeleton width="100%" height={84} />
        </View>
      ) : (
        <ProgressBody view={view} today={today} />
      )}
    </Screen>
  );
}

function ProgressBody({ view, today }: { view: ProgressView; today: string }) {
  const spaces = useSpaces();
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);
  const total = view.bySpace.reduce((sum, b) => sum + b.minutes, 0);
  const colorOf = (spaceId: string | null) =>
    spaceTone(spaces?.find((sp) => sp._id === spaceId)?.color ?? null).dot;
  return (
    <>
      <View style={{ gap: s.s4 }}>
        <View style={{ flexDirection: "row", gap: s.s12 }}>
          <View style={{ gap: s.s1 }}>
            <Txt variant="headline" tnum>
              {hoursText(view.weekMinutes)}
            </Txt>
            <Txt variant="meta" tone="ink3">
              done this week
            </Txt>
          </View>
          <View style={{ gap: s.s1 }}>
            <Txt variant="headline" tnum>
              {hoursText(view.yearMinutes)}
            </Txt>
            <Txt variant="meta" tone="ink3">
              in the last 12 months
            </Txt>
          </View>
        </View>
        {total > 0 ? (
          <>
            <View
              style={{ flexDirection: "row", gap: 2, height: 6, borderRadius: 3, overflow: "hidden" }}
              aria-label="Time by space"
            >
              {view.bySpace.map((b) => (
                <View
                  key={b.spaceId ?? "none"}
                  style={{ flex: b.minutes, backgroundColor: spaceTone(b.color).dot }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s4 }}>
              {view.bySpace.map((b) => (
                <View
                  key={b.spaceId ?? "none"}
                  style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}
                >
                  <Dot color={spaceTone(b.color).dot} />
                  <Txt variant="meta" tone="ink2" tnum>
                    {b.name} {Math.round((b.minutes / total) * 100)}%
                  </Txt>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Txt variant="body" tone="ink3">
            Tick tasks off and the time they take shows up here, split by space.
          </Txt>
        )}
      </View>

      <View style={{ gap: s.s3 }}>
        <SectionHead title="The last 12 months" />
        <YearHeat heat={view.heat} />
      </View>

      <View style={{ gap: s.s3 }}>
        <SectionHead
          title="Goals"
          right={
            <Button
              icon={Plus}
              label="Add goal"
              onPress={() => setAddingGoal(!addingGoal)}
              expanded={addingGoal}
            />
          }
        />
        {addingGoal ? <AddGoal today={today} onDone={() => setAddingGoal(false)} /> : null}
        {view.goals.length ? (
          <View style={{ gap: s.s6 }}>
            {view.goals.map((g) => (
              <GoalView key={g._id} goal={g} color={colorOf(g.spaceId)} today={today} />
            ))}
          </View>
        ) : addingGoal ? null : (
          <Txt variant="body" tone="ink3">
            A goal is a target with a date: a number of tasks, kilometres or pages. Kriyan shows whether
            you’re on pace.
          </Txt>
        )}
      </View>

      <View style={{ gap: s.s3 }}>
        <SectionHead
          title="Habits"
          meta="This week"
          right={
            <Button
              icon={Plus}
              label="Add habit"
              onPress={() => setAddingHabit(!addingHabit)}
              expanded={addingHabit}
            />
          }
        />
        {addingHabit ? <AddHabit onDone={() => setAddingHabit(false)} /> : null}
        {view.habits.length ? (
          <View style={{ gap: s.s8 }}>
            {view.habits.map((h) => (
              <HabitRow key={h._id} habit={h} today={today} />
            ))}
          </View>
        ) : addingHabit ? null : (
          <Txt variant="body" tone="ink3">
            A habit has a weekly target, like reading 4 times a week. Missing a day never resets anything.
          </Txt>
        )}
      </View>
    </>
  );
}

/** Four steps of opacity, from a little to a lot. */
function level(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const f = value / max;
  return f < 0.25 ? 0.18 : f < 0.5 ? 0.36 : f < 0.8 ? 0.6 : 0.88;
}

function Heat({
  days,
  color,
  label,
}: {
  days: { date: string; value: number }[];
  color: string;
  label: string;
}) {
  const max = Math.max(...days.map((d) => d.value));
  const first = days[0]?.date;
  const lead = first ? weekday(first) : 0;
  const cells: ({ date: string; value: number } | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  const columns = Math.ceil(cells.length / 7);
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", overflow: "hidden" }}>
      <View role="img" aria-label={label} style={{ flexDirection: "row", gap: s.s1 }}>
        {Array.from({ length: columns }, (_, col) => (
          <View key={col} style={{ gap: s.s1 }}>
            {cells.slice(col * 7, col * 7 + 7).map((d, i) =>
              d === null ? (
                <View key={i} style={{ width: 8, height: 8 }} />
              ) : (
                <View
                  key={d.date}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: d.value > 0 ? color : c.hover,
                    opacity: d.value > 0 ? level(d.value, max) : 1,
                  }}
                />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function YearHeat({ heat }: { heat: ProgressView["heat"] }) {
  const phone = useIsPhone();
  const months: string[] = [];
  for (const d of heat) {
    const [, m, day] = parts(d.date);
    if (day === 1 && (m - 1) % 2 === 0) months.push(MONTH_SHORT[m - 1] ?? "");
  }
  const total = heat.reduce((sum, d) => sum + d.minutes, 0);
  return (
    <View style={{ gap: s.s2 }}>
      {phone ? null : (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {months.map((m, i) => (
            <Txt key={i} variant="meta" tone="ink3">
              {m}
            </Txt>
          ))}
        </View>
      )}
      <Heat
        days={heat.map((d) => ({ date: d.date, value: d.minutes }))}
        color={c.ink}
        label={`Time done each day, ${hoursText(total)} in total`}
      />
    </View>
  );
}

function HabitRow({ habit, today }: { habit: ProgressView["habits"][number]; today: string }) {
  const check = useMutation(api.organize.checkHabit);
  const [fixing, setFixing] = useState(false);
  const ref = useRef<View>(null);
  const color = spaceTone(habit.color ?? "green").dot;
  // Weeks on target among the finished weeks shown (the current week is still going).
  const weekStart = startOfWeek(today);
  const weeks = new Map<string, number>();
  for (const d of habit.days) {
    if (d.date >= weekStart) continue;
    const w = startOfWeek(d.date);
    weeks.set(w, (weeks.get(w) ?? 0) + (d.done ? 1 : 0));
  }
  const onTarget = [...weeks.values()].filter((n) => n >= habit.target).length;
  const target =
    habit.target === 7 ? "Every day" : `${habit.target} ${habit.target === 1 ? "time" : "times"} a week`;
  const doneOn = new Set(habit.days.filter((d) => d.done).map((d) => d.date));
  return (
    <View style={{ gap: s.s3 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s6 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">{habit.title}</Txt>
          <Txt variant="meta" tone="ink3">
            {target}, {onTarget} {onTarget === 1 ? "week" : "weeks"} on target
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end", gap: s.s1 }}>
          <Txt variant="meta" tone="ink2" tnum>
            {habit.thisWeek} of {habit.target}
          </Txt>
          <View
            style={{ flexDirection: "row", gap: s.s1 }}
            aria-label={`${habit.thisWeek} of ${habit.target} this week`}
          >
            {Array.from({ length: habit.target }, (_, k) => (
              <View
                key={k}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: k < habit.thisWeek ? color : "transparent",
                  borderWidth: k < habit.thisWeek ? 0 : 1.5,
                  borderColor: c.lineStrong,
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <Heat
        days={habit.days.map((d) => ({ date: d.date, value: d.done ? 1 : 0 }))}
        color={color}
        label={`${habit.title}, the last 26 weeks`}
      />
      <View ref={ref} collapsable={false} style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
        <Button variant="quiet" icon={CalendarCheck} label="Fix a day" onPress={() => setFixing(true)} />
      </View>
      <Popover
        open={fixing}
        onClose={() => setFixing(false)}
        anchor={ref}
        title={`Fix a day for ${habit.title}`}
      >
        <Txt variant="meta" tone="ink3">
          Pick a day to switch it between done and not done.
        </Txt>
        <DayPicker
          value={null}
          today={today}
          allowNone={false}
          onPick={(date) => {
            if (!date || date > today) return;
            const done = !doneOn.has(date);
            setFixing(false);
            toggleHaptic(done);
            void check({ id: habit._id as Id<"habits">, done, date })
              .then(() =>
                showToast(`${habit.title}: ${done ? "done" : "not done"} on ${formatDate(date, today)}`),
              )
              .catch((e: unknown) => showToast(errorText(e)));
          }}
        />
      </Popover>
    </View>
  );
}

function AddHabit({ onDone }: { onDone: () => void }) {
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
