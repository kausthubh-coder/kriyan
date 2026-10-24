// Goals and habits (b2.html?screen=goals): the time left in the year, the semester and free this
// week, goals with what's left, when they're due and this week's focused time, habits by the week ("weeks on target", never a streak
// that resets), then the last 12 months of time done, split by space.

import { useRef, useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { CalendarCheck, Circle, CircleCheck, Pencil, Plus } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { addDays, diffDays, parts, startOfWeek, weekday, type CivilDate } from "@kriyan/core/dates";
import { formatDate, MONTH_SHORT, WEEKDAY_SHORT } from "@kriyan/core/format";
import { freeMinutes } from "@kriyan/core/layout";
import { useClock } from "@/data/time";
import {
  useProfile,
  useProgressView,
  useSpaces,
  useWeekView,
  type Profile,
  type ProgressView,
} from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot, Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { PageHead, Screen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AddGoal, GoalView } from "./Goals";
import { SectionLabel } from "./SectionLabel";

const TITLE = "Goals and habits";
const SUB = "What you're working towards, and the time you still have.";

const hoursText = (m: number) => (m < 60 ? `${m} min` : `${Math.round(m / 60)} h`);

/**
 * From this window width goals and habits sit side by side under the cards, like B2's desktop.
 * B2 splits from 900, but beside the 248 sidebar that leaves two 270 px columns where a goal's
 * due line wraps; 1100 keeps each column near 380.
 */
const TWO_COLUMNS_MIN_WIDTH = 1100;
/** B2's wide desktop page (`.dpg.wide`). */
const WIDE_PAGE = 1040;

export function ProgressScreen() {
  const view = useProgressView();
  const { today } = useClock();
  const twoColumns = useWindowDimensions().width >= TWO_COLUMNS_MIN_WIDTH;
  return (
    <Screen title={TITLE} sub={SUB} width={twoColumns ? WIDE_PAGE : "column"}>
      <PageHead big title={TITLE} sub={SUB} />
      {view === undefined ? (
        <View testID="skeleton" style={{ gap: s.s6 }}>
          <Skeleton width="100%" height={120} />
          <Skeleton width={160} height={16} />
          <Skeleton width="100%" height={84} />
        </View>
      ) : (
        <ProgressBody view={view} today={today} twoColumns={twoColumns} />
      )}
    </Screen>
  );
}

/** Focused and planned minutes on each goal this week: Focus sessions, and linked tasks' lengths. */
function useGoalWeek(today: CivilDate): Map<string, { focused: number; planned: number }> {
  const authed = useConvexAuth().isAuthenticated;
  const focus = useQuery(api.views.focus, authed ? { today } : "skip");
  const week = useWeekView(startOfWeek(today));
  const out = new Map<string, { focused: number; planned: number }>();
  const at = (id: string) => {
    const row = out.get(id) ?? { focused: 0, planned: 0 };
    out.set(id, row);
    return row;
  };
  for (const g of focus?.byGoal ?? []) at(g.goalId).focused += g.minutes;
  for (const day of week?.days ?? [])
    for (const t of [...day.scheduled, ...day.anytime])
      if (t.goalId && t.length && !t.event && !t.proposedBy) at(t.goalId).planned += t.length;
  return out;
}

function ProgressBody({
  view,
  today,
  twoColumns,
}: {
  view: ProgressView;
  today: string;
  twoColumns: boolean;
}) {
  const goalWeek = useGoalWeek(today);
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);
  const total = view.bySpace.reduce((sum, b) => sum + b.minutes, 0);
  const doneToday = view.habits.filter((h) => h.days.some((d) => d.date === today && d.done)).length;
  return (
    <>
      <TimeLeft today={today} />

      <View
        style={twoColumns ? { flexDirection: "row", alignItems: "flex-start", gap: s.s12 } : { gap: s.s8 }}
      >
        <View style={twoColumns ? { flex: 1, minWidth: 0 } : undefined}>
          <SectionLabel
            title="Goals"
            count={view.goals.length ? String(view.goals.length) : undefined}
            right={
              <Button
                variant="quiet"
                icon={Plus}
                label="Add goal"
                onPress={() => setAddingGoal(!addingGoal)}
                expanded={addingGoal}
              />
            }
          />
          {addingGoal ? <AddGoal today={today} onDone={() => setAddingGoal(false)} /> : null}
          {view.goals.length ? (
            <View>
              {view.goals.map((g) => (
                <GoalView key={g._id} goal={g} color={c.ink} today={today} week={goalWeek.get(g._id)} />
              ))}
            </View>
          ) : addingGoal ? null : (
            <Txt variant="body" tone="ink3">
              A goal is a target with a date: a number of tasks, kilometres or pages. Kriyan shows whether
              you’re on pace.
            </Txt>
          )}
        </View>

        <View style={twoColumns ? { flex: 1, minWidth: 0 } : undefined}>
          <SectionLabel
            title="Habits today"
            count={view.habits.length ? `${doneToday} of ${view.habits.length}` : undefined}
            right={
              <Button
                variant="quiet"
                icon={Plus}
                label="Add habit"
                onPress={() => setAddingHabit(!addingHabit)}
                expanded={addingHabit}
              />
            }
          />
          {addingHabit ? <AddHabit onDone={() => setAddingHabit(false)} /> : null}
          {view.habits.length ? (
            <>
              {view.habits.map((h) => (
                <HabitRow key={h._id} habit={h} today={today} />
              ))}
              <Txt variant="meta" tone="ink3" style={{ marginTop: s.s3 }}>
                Missed days stay quiet. One miss never resets anything.
              </Txt>
            </>
          ) : addingHabit ? null : (
            <Txt variant="body" tone="ink3">
              A habit has a weekly target, like reading 4 times a week. Missing a day never resets anything.
            </Txt>
          )}
        </View>
      </View>

      <View style={{ gap: s.s3 }}>
        <SectionLabel title="The last 12 months" />
        {/* Two big zeros on a new account read as a score; the line below says what comes. */}
        {view.yearDone > 0 ? (
          <View style={{ flexDirection: "row", gap: s.s12 }}>
            <DoneStat done={view.weekDone} minutes={view.weekMinutes} when="this week" />
            <DoneStat done={view.yearDone} minutes={view.yearMinutes} when="in the last 12 months" />
          </View>
        ) : null}
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
            Tick off tasks that have a length and their time shows up here, split by space.
          </Txt>
        )}
        <YearHeat heat={view.heat} />
      </View>
    </>
  );
}

/**
 * Tasks done, and the time of those that had a length. Time is only what tasks said they'd take:
 * a task without a length counts as done, never as minutes.
 */
function DoneStat({ done, minutes, when }: { done: number; minutes: number; when: string }) {
  return (
    <View style={{ gap: s.s1 }}>
      <Txt variant="title" tnum>
        {`${done} ${done === 1 ? "task" : "tasks"}`}
      </Txt>
      <Txt variant="meta" tone="ink3">
        {minutes > 0 ? `done ${when}, ${hoursText(minutes)} of them timed` : `done ${when}`}
      </Txt>
    </View>
  );
}

/** One square per week (b2.html `.weeks`): weeks gone are grey, this one is red. */
function WeekDots({ count, current }: { count: number; current: number }) {
  return (
    <View aria-hidden style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s1, marginTop: s.s3 }}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{
            width: 12,
            height: 12,
            borderRadius: 3,
            backgroundColor: i < current ? c.ink3 : i === current ? c.now : c.line,
          }}
        />
      ))}
    </View>
  );
}

function Card({ children, flex, wide }: { children: ReactNode; flex?: number; wide?: boolean }) {
  return (
    <View
      style={{
        flex,
        flexBasis: wide ? "100%" : undefined,
        minWidth: 0,
        gap: 2,
        padding: s.s4,
        borderRadius: r.sheet,
        backgroundColor: c.sunken,
      }}
    >
      {children}
    </View>
  );
}

/** The prototype's small round button on a card (b2.html `.btn-sm`). */
const small = { borderRadius: r.pill, backgroundColor: c.hover, alignSelf: "flex-start" } as const;

/**
 * The time you still have (b2.html `.tlc`): days left in the year, weeks left in the semester,
 * and the free time left this week. On the phone the year spans the top and the other two
 * share a row; on desktop the three sit in one row.
 */
function TimeLeft({ today }: { today: CivilDate }) {
  const phone = useIsPhone();
  const profile = useProfile();
  const [year] = parts(today);
  const daysLeft = diffDays(`${year}-12-31`, today) + 1;
  const week = Math.min(51, Math.floor(diffDays(today, `${year}-01-01`) / 7));
  const free = useFreeThisWeek(today);
  return (
    <View style={{ flexDirection: "row", flexWrap: phone ? "wrap" : "nowrap", gap: s.s3 }}>
      <Card flex={phone ? undefined : 1.6} wide={phone}>
        <Txt variant="headline" tnum>
          {daysLeft}
        </Txt>
        <Txt variant="meta" tone="ink3">
          {daysLeft === 1 ? "day" : "days"} left in {year}
        </Txt>
        <WeekDots count={52} current={week} />
      </Card>
      <Card flex={1}>
        <SemesterLeft profile={profile} today={today} />
      </Card>
      <Card flex={1}>
        <Txt variant="headline" tnum>
          {free === null ? "–" : `${Math.round(free.minutes / 6) / 10} h`}
        </Txt>
        <Txt variant="meta" tone="ink3">
          {free === null ? "free this week" : `free this week, ${free.range}`}
        </Txt>
        <View style={{ flex: 1, minHeight: s.s3 }} />
        <Button label="Plan it" onPress={() => router.push("/upcoming")} style={small} />
      </Card>
    </View>
  );
}

/** Weeks left in the semester, from the dates in Settings; until they're set, a way to set them. */
function SemesterLeft({ profile, today }: { profile: Profile | undefined; today: CivilDate }) {
  if (profile === undefined) return <Skeleton width="60%" height={32} />;
  const start = profile.semesterStart;
  const end = profile.semesterEnd;
  if (!start || !end)
    return (
      <>
        <Txt variant="subhead">Semester</Txt>
        <Txt variant="meta" tone="ink3">
          Add its first and last days to count the weeks left.
        </Txt>
        <View style={{ flex: 1, minHeight: s.s3 }} />
        <Button label="Set dates" onPress={() => router.push("/settings")} style={small} />
      </>
    );
  const total = Math.max(1, Math.ceil((diffDays(end, start) + 1) / 7));
  if (today > end)
    return (
      <>
        <Txt variant="subhead">Semester over</Txt>
        <Txt variant="meta" tone="ink3">
          It ended {formatDate(end, today)}.
        </Txt>
        <View style={{ flex: 1, minHeight: s.s3 }} />
        <Button label="Set the next one" onPress={() => router.push("/settings")} style={small} />
      </>
    );
  if (today < start)
    return (
      <>
        <Txt variant="headline" tnum>
          {total} wks
        </Txt>
        <Txt variant="meta" tone="ink3">
          in the semester, from {formatDate(start, today)}
        </Txt>
        <WeekDots count={total} current={-1} />
      </>
    );
  const current = Math.min(total - 1, Math.floor(diffDays(today, start) / 7));
  // The current week counts as left: it isn't over yet.
  const left = total - current;
  return (
    <>
      <Txt variant="headline" tnum>
        {left} {left === 1 ? "wk" : "wks"}
      </Txt>
      <Txt variant="meta" tone="ink3">
        left in the semester
      </Txt>
      <WeekDots count={total} current={current} />
    </>
  );
}

/**
 * Free minutes from now to the end of this week, between each day's start and end, less what's
 * planned with a length: Today's count of free time, over the days left in the week.
 */
function useFreeThisWeek(today: CivilDate): { minutes: number; range: string } | null {
  const { now } = useClock();
  const profile = useProfile();
  const week = useWeekView(startOfWeek(today));
  if (!profile || !week) return null;
  let minutes = 0;
  for (const day of week.days) {
    if (day.date < today) continue;
    const busy = day.scheduled
      .filter((t) => !t.done && t.length && !t.proposedBy)
      .map((t) => ({ id: t._id, start: t.time ?? 0, length: t.length ?? undefined }));
    const from = day.date === today ? Math.max(now, profile.dayStart) : profile.dayStart;
    minutes += freeMinutes(busy, from, profile.dayEnd);
  }
  const end = addDays(startOfWeek(today), 6);
  const range =
    today === end ? "today" : `${WEEKDAY_SHORT[weekday(today)]} to ${WEEKDAY_SHORT[weekday(end)]}`;
  return { minutes, range };
}

/** The faintest cell: a day with something done but no time to show. */
const LEAST = 0.18;

/** Four steps of opacity, from a little to a lot. */
function level(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const f = value / max;
  return f < 0.25 ? LEAST : f < 0.5 ? 0.36 : f < 0.8 ? 0.6 : 0.88;
}

const CELL = 8;
const PITCH = CELL + s.s1;

function Heat({
  days,
  color,
  label,
  months,
}: {
  /** `any`: something happened that day without a value to show, like a task with no length. */
  days: { date: string; value: number; any?: boolean }[];
  color: string;
  label: string;
  /** Label every other month above the column its first day falls in. */
  months?: boolean;
}) {
  const max = Math.max(...days.map((d) => d.value));
  const first = days[0]?.date;
  const lead = first ? weekday(first) : 0;
  const cells: ({ date: string; value: number; any?: boolean } | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...days,
  ];
  const [width, setWidth] = useState(0);
  const all = Math.ceil(cells.length / 7);
  // Show the most recent weeks that fit, starting at the text's left edge.
  const fit = width ? Math.floor((width + s.s1) / PITCH) : all;
  const skip = Math.max(0, all - fit);
  const columns = all - skip;
  const monthLabels = months
    ? cells.flatMap((d, i) => {
        if (!d) return [];
        const col = Math.floor(i / 7) - skip;
        const [, m, day] = parts(d.date);
        return col >= 0 && day === 1 && (m - 1) % 2 === 0 ? [{ col, text: MONTH_SHORT[m - 1] ?? "" }] : [];
      })
    : [];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row" }}>
      <View style={{ gap: s.s2, opacity: width ? 1 : 0 }}>
        {monthLabels.length ? (
          <View style={{ height: 16 }}>
            {monthLabels.map((m) => (
              <Txt
                key={m.col}
                variant="meta"
                tone="ink3"
                style={{ position: "absolute", left: m.col * PITCH }}
              >
                {m.text}
              </Txt>
            ))}
          </View>
        ) : null}
        <View role="img" aria-label={label} style={{ flexDirection: "row", gap: s.s1 }}>
          {Array.from({ length: columns }, (_, k) => k + skip).map((col) => (
            <View key={col} style={{ gap: s.s1 }}>
              {cells.slice(col * 7, col * 7 + 7).map((d, i) =>
                d === null ? (
                  <View key={i} style={{ width: CELL, height: CELL }} />
                ) : (
                  <View
                    key={d.date}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      backgroundColor: d.value > 0 || d.any ? color : c.hover,
                      opacity: d.value > 0 ? level(d.value, max) : d.any ? LEAST : 1,
                    }}
                  />
                ),
              )}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function YearHeat({ heat }: { heat: ProgressView["heat"] }) {
  const total = heat.reduce((sum, d) => sum + d.minutes, 0);
  return (
    <Heat
      days={heat.map((d) => ({ date: d.date, value: d.minutes, any: d.done > 0 }))}
      color={c.ink}
      label={`Tasks done each day, ${hoursText(total)} of timed work in total`}
      months
    />
  );
}

/** The last four weeks, one dot a day (b2.html `.dots`). */
const RECENT_DAYS = 28;
const ICON = 24;
/** The tick's hit area reaches past its icon without moving the title. */
const TICK = ICON + 2 * s.s3;
/** The dots and actions line up with the title, past the tick. */
const INDENT = ICON + s.s3;

function HabitRow({ habit, today }: { habit: ProgressView["habits"][number]; today: string }) {
  const check = useMutation(api.organize.checkHabit);
  const [fixing, setFixing] = useState(false);
  const [editing, setEditing] = useState(false);
  const ref = useRef<View>(null);
  const editRef = useRef<View>(null);
  const win = useWindowDimensions();
  const [side, setSide] = useState<"below" | "above">("below");
  // Habits sit low on the page; a popover opened in the bottom half grows upward so it stays on screen.
  const openFrom = (anchor: typeof ref, open: () => void) => {
    const node = anchor.current;
    if (!node) return open();
    node.measureInWindow((_x, y) => {
      setSide(y > win.height / 2 ? "above" : "below");
      open();
    });
  };
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
  const doneToday = doneOn.has(today);
  const recent = habit.days.slice(-RECENT_DAYS);
  const recentDone = recent.filter((d) => d.done).length;
  return (
    <View
      style={{
        paddingVertical: s.s3,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }}>
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
          style={{ width: TICK, height: TICK, alignItems: "center", justifyContent: "center", margin: -s.s3 }}
        >
          <Icon icon={doneToday ? CircleCheck : Circle} size={ICON} tone={doneToday ? "ink3" : "ink2"} />
        </Press>
        <View style={{ flex: 1 }}>
          <Txt variant="label">{habit.title}</Txt>
          <Txt variant="meta" tone="ink3">
            {target}, {onTarget} {onTarget === 1 ? "week" : "weeks"} on target
          </Txt>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Txt variant="meta" tone="ink3" tnum>
            {habit.thisWeek} of {habit.target}
          </Txt>
          <Txt variant="caption" tone="ink3">
            this week
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: s.s3, marginTop: s.s3 }}>
        <View style={{ width: ICON }} />
        <View
          role="img"
          aria-label={`${recentDone} of the last ${recent.length} days done`}
          style={{ flex: 1, flexDirection: "row", gap: s.s1 }}
        >
          {recent.map((d) => (
            <View
              key={d.date}
              style={{
                flex: 1,
                // Wide desktop columns would otherwise blow the dots up to coins.
                maxWidth: 16,
                aspectRatio: 1,
                borderRadius: r.pill,
                backgroundColor: d.done ? c.ink2 : c.line,
              }}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginLeft: INDENT - s.s3, marginTop: s.s1 }}>
        <View ref={ref} collapsable={false}>
          <Button
            variant="quiet"
            icon={CalendarCheck}
            label="Fix a day"
            onPress={() => openFrom(ref, () => setFixing(true))}
          />
        </View>
        <View ref={editRef} collapsable={false}>
          <Button
            variant="quiet"
            icon={Pencil}
            label="Edit habit"
            onPress={() => openFrom(editRef, () => setEditing(true))}
          />
        </View>
      </View>
      <Popover
        open={editing}
        onClose={() => setEditing(false)}
        anchor={editRef}
        side={side}
        title="Edit habit"
        width={320}
      >
        <EditHabit habit={habit} onDone={() => setEditing(false)} />
      </Popover>
      <Popover
        open={fixing}
        onClose={() => setFixing(false)}
        anchor={ref}
        side={side}
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

/** Rename, retarget or archive a habit. Archiving takes it off Today's check-ins, with Undo. */
function EditHabit({ habit, onDone }: { habit: ProgressView["habits"][number]; onDone: () => void }) {
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
