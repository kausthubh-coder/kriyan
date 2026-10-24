// Goals and habits (b2.html?screen=goals): the time left in the year, the semester and free this
// week; goals with why they matter, what's left, when they're due, the next linked task and this
// week's focused time; habits over the last four weeks against their weekly target (never a
// streak that resets); then the last 12 months of time done, split by space.

import { useRef, useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { CalendarCheck, CircleCheck, CircleDashed, Plus } from "lucide-react-native";
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
import { c, family, isWeb, r, s, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Dot, Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { PageHead, Screen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { AskBox } from "@/features/ask/AskBar";
import { AddGoal, GoalView } from "./Goals";
import { SectionLabel } from "./SectionLabel";
import { SmallButton } from "./SmallButton";

const TITLE = "Goals and habits";
const SUB = "What you're working towards, and the time you still have.";

const hoursText = (m: number) => (m < 60 ? `${m}m` : `${Math.round(m / 60)}h`);

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
  const phone = useIsPhone();
  const twoColumns = useWindowDimensions().width >= TWO_COLUMNS_MIN_WIDTH;
  return (
    <Screen
      title={TITLE}
      sub={SUB}
      width="full"
      // B2's desktop page starts 36 from the top (`.dpg`), closer than the frame's 48.
      scrollProps={
        phone
          ? undefined
          : { contentContainerStyle: { paddingTop: s.s8, paddingHorizontal: s.s8, paddingBottom: s.s16 } }
      }
    >
      {/* One block with B2's short gaps (the frame's are 32 and 48), centred in the frame like
          B2's `.dpg` rather than held to its left edge. On phones it sits 16 under the title. */}
      <View
        style={{
          width: "100%",
          maxWidth: twoColumns ? WIDE_PAGE : sz.column,
          alignSelf: "center",
          gap: s.s4,
          ...(phone ? { marginTop: -s.s4 } : null),
        }}
      >
        <PageHead title={TITLE} sub={SUB} />
        {view === undefined ? (
          <View testID="skeleton" style={{ gap: s.s6 }}>
            <Skeleton width="100%" height={120} />
            <Skeleton width={160} height={16} />
            <Skeleton width="100%" height={84} />
          </View>
        ) : (
          <ProgressBody view={view} today={today} twoColumns={twoColumns} />
        )}
        {phone ? null : <DeskAskBox />}
      </View>
    </Screen>
  );
}

/**
 * The ask box at the end of desktop Goals (b2.html `.askd`): it follows the page and stays at the
 * window's bottom while there's more above it to scroll.
 */
function DeskAskBox() {
  return (
    <View style={[{ marginTop: s.s6, bottom: s.s4, zIndex: 1 }, sticky]}>
      <View
        pointerEvents="none"
        style={[{ position: "absolute", left: 0, right: 0, top: -s.s6, bottom: -s.s4 }, backdrop]}
      />
      <AskBox />
    </View>
  );
}

const sticky = isWeb ? ({ position: "sticky" } as object) : null;
/** The page fades into the box's backdrop instead of running under it (b2.html `.askd::before`). */
const backdrop = isWeb
  ? ({ backgroundImage: `linear-gradient(to bottom, transparent, ${c.bg} 40%)` } as object)
  : null;

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
        style={
          twoColumns
            ? { flexDirection: "row", alignItems: "flex-start", gap: s.s12, marginTop: s.s2 }
            : { gap: s.s4, marginTop: s.s1 }
        }
      >
        {/* B2 gives goals a little more room than habits (`.g-cols` 1.1fr 1fr). */}
        <View style={twoColumns ? { flex: 1.1, minWidth: 0 } : undefined}>
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
                Missed days stay quiet. One miss never resets a habit.
              </Txt>
            </>
          ) : addingHabit ? null : (
            <Txt variant="body" tone="ink3">
              A habit has a weekly target, like reading 4 times a week. Missing a day never resets anything.
            </Txt>
          )}
        </View>
      </View>

      <View style={{ gap: s.s3, marginTop: s.s6 }}>
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
            // B2's `.weeks i`: 11 with 4 between fits 28 a row on desktop, so the year is two rows.
            width: 11,
            height: 11,
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
        borderRadius: r.box,
        backgroundColor: c.sunken,
      }}
    >
      {children}
    </View>
  );
}

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
          {free === null ? "–" : `${Math.round(free.minutes / 6) / 10}h`}
        </Txt>
        <Txt variant="meta" tone="ink3">
          {free === null ? "free this week" : `free this week, ${free.range}`}
        </Txt>
        <View style={{ flex: 1, minHeight: s.s3 }} />
        <SmallButton label="Plan it" onPress={() => router.push("/upcoming")} />
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
        <SmallButton label="Set dates" onPress={() => router.push("/settings")} />
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
        <SmallButton label="Set the next one" onPress={() => router.push("/settings")} />
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
  const [open, setOpen] = useState<null | "edit" | "fix">(null);
  const ref = useRef<View>(null);
  const win = useWindowDimensions();
  const [side, setSide] = useState<"below" | "above">("below");
  // Habits sit low on the page; a popover opened in the bottom half grows upward so it stays on screen.
  const openPopover = () => {
    const node = ref.current;
    if (!node) return setOpen("edit");
    node.measureInWindow((_x, y) => {
      setSide(y > win.height / 2 ? "above" : "below");
      setOpen("edit");
    });
  };
  const target =
    habit.target === 7 ? "Every day" : `${habit.target} ${habit.target === 1 ? "time" : "times"} a week`;
  const doneOn = new Set(habit.days.filter((d) => d.done).map((d) => d.date));
  const doneToday = doneOn.has(today);
  const { recent, done, due } = lastFourWeeks(habit, doneOn);
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
          <Icon
            icon={doneToday ? CircleCheck : CircleDashed}
            size={ICON}
            tone={doneToday ? "ink3" : "ink2"}
          />
        </Press>
        {/* The habit itself opens its editor, with Fix a day inside, instead of a row of buttons. */}
        <Press
          ref={ref}
          role="button"
          accessibilityLabel={`${habit.title}, ${done} of ${due} days in the last 4 weeks. Edit or fix a day`}
          onPress={openPopover}
          hoverBg={null}
          scale={false}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: s.s3 }}
        >
          <View style={{ flex: 1 }}>
            <Txt variant="label">{habit.title}</Txt>
            <Txt variant="meta" tone="ink3">
              {target}
            </Txt>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Txt variant="meta" tone="ink3" tnum>
              {done} of {due}
            </Txt>
            <Txt variant="caption" tone="ink3" style={family("400")}>
              last 4 weeks
            </Txt>
          </View>
        </Press>
      </View>
      {/* The last four weeks, one dot a day, spread across the row (b2.html `.dots`): done is
          filled, a miss is a quiet ring, days before the habit's first check are a dash. */}
      <View
        role="img"
        aria-label={`${done} of the last ${recent.length} days done`}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: s.s1,
          marginTop: s.s3,
          marginLeft: INDENT,
        }}
      >
        {recent.map((d) => (
          <View
            key={d.date}
            style={{
              flex: 1,
              // Past this a dot reads as a coin; the row spreads the rest as space.
              maxWidth: s.s4,
              aspectRatio: 1,
              borderRadius: r.pill,
              alignItems: "center",
              justifyContent: "center",
              ...(d.state === "done"
                ? { backgroundColor: c.ink2 }
                : d.state === "miss"
                  ? { borderWidth: 1.5, borderColor: c.ink3 }
                  : null),
            }}
          >
            {d.state === "off" ? (
              <View style={{ width: "40%", height: 1.5, backgroundColor: c.lineStrong }} />
            ) : null}
          </View>
        ))}
      </View>
      <Popover
        open={open !== null}
        onClose={() => setOpen(null)}
        anchor={ref}
        side={side}
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

/**
 * The last four weeks of a habit, and how many of its weekly target's days were done in them.
 * Days before its first check count as not started, so a new habit isn't behind from day one.
 */
function lastFourWeeks(habit: ProgressView["habits"][number], doneOn: Set<string>) {
  const days = habit.days.slice(-RECENT_DAYS);
  const first = habit.days.find((d) => d.done)?.date;
  const recent = days.map((d, i) => ({
    date: d.date,
    state: (doneOn.has(d.date)
      ? "done"
      : (first !== undefined && d.date > first) || (first === undefined && i === days.length - 1)
        ? "miss"
        : "off") as "done" | "miss" | "off",
  }));
  const active = recent.filter((d) => d.state !== "off").length;
  return {
    recent,
    done: recent.filter((d) => d.state === "done").length,
    due: Math.ceil((habit.target * Math.max(1, active)) / 7),
  };
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
