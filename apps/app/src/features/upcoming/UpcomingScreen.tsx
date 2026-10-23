// Upcoming: plan the week. Desktop: a tray of tasks still to plan (Inbox, no date) beside seven
// day columns with a load line per day (planned against capacity), deadlines and birthdays,
// and the time grid; drag from the tray onto a day or a time. Phones: the Week (b2.html
// `weekPhone`), the week strip over the picked day's spine, then what's still to plan.
// An agent's proposed blocks wait in a banner with Accept all and Discard.

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useMutation } from "convex/react";
import { Bot, Cake, ChevronLeft, ChevronRight, Flag, PanelLeft } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import {
  addDays,
  formatClock,
  isCivilDate,
  parts,
  startOfWeek,
  weekday,
  type CivilDate,
} from "@kriyan/core/dates";
import { freeMinutes, layoutDay } from "@kriyan/core/layout";
import {
  formatDay,
  formatDuration,
  formatTimeRange,
  MONTH_SHORT,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
} from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTodayView, useWeekView, type TaskView, type WeekView } from "@/data/views";
import { completeTask, errorText, moveTasks, ticking } from "@/features/tasks/actions";
import { openTask, TaskRow } from "@/features/tasks/TaskRow";
import { useIsPhone } from "@/theme/layout";
import { clampDay, externalDrag, registerDropZone, snap } from "@/features/today/drag";
import { DragGhost } from "@/features/today/DragGhost";
import { DragSource } from "@/features/today/DragSource";
import { Spine } from "@/features/today/Spine";
import { WeekStrip } from "@/features/today/WeekStrip";
import { c, r, s, shadows, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Check, Ring, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageHead, Screen, SectionHead } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

const hours = (m: number) => {
  const h = Math.round((m / 60) * 10) / 10;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
};

function loadText(day: WeekView["days"][number]) {
  const over = day.plannedMinutes - day.capacity;
  return over > 0
    ? `${hours(day.plannedMinutes)} h, ${hours(over)} h over`
    : `${hours(day.plannedMinutes)} of ${hours(day.capacity)} h`;
}

function rangeTitle(start: string) {
  const end = addDays(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  return sm === em
    ? `${sd} to ${ed} ${MONTH_SHORT[em - 1]}`
    : `${sd} ${MONTH_SHORT[sm - 1]} to ${ed} ${MONTH_SHORT[em - 1]}`;
}

/** "Mon 19 to Sun 25 Oct", the month once when the week stays in one. */
function weekRange(start: CivilDate) {
  const end = addDays(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  const first = `${WEEKDAY_SHORT[weekday(start)]} ${sd}${sm === em ? "" : ` ${MONTH_SHORT[sm - 1]}`}`;
  return `${first} to ${WEEKDAY_SHORT[weekday(end)]} ${ed} ${MONTH_SHORT[em - 1]}`;
}

/** Free time left this week, the way Today's header counts it: from now to each day's end. */
function weekFree(week: WeekView, today: CivilDate, now: number, dayStart: number, dayEnd: number) {
  return week.days
    .filter((d) => d.date >= today)
    .reduce((sum, d) => {
      const busy = d.scheduled
        .filter((t) => !t.done && t.length && !t.proposedBy)
        .map((t) => ({ id: t._id, start: t.time ?? 0, length: t.length ?? undefined }));
      const from = d.date === today ? Math.max(now, dayStart) : dayStart;
      return sum + freeMinutes(busy, from, dayEnd);
    }, 0);
}

export function UpcomingScreen() {
  const { today, now } = useClock();
  const phone = useIsPhone();
  // Today's week strip opens this screen on the day that was tapped.
  const { day: asked } = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState<CivilDate>(() => (asked && isCivilDate(asked) ? asked : today));
  const [start, setStart] = useState(() => startOfWeek(day));
  // A new day from Today's strip moves the week there (adjusting state while rendering, not in an effect).
  const [seen, setSeen] = useState(asked);
  if (asked !== seen) {
    setSeen(asked);
    if (asked && isCivilDate(asked)) {
      setDay(asked);
      setStart(startOfWeek(asked));
    }
  }
  const pickDay = (date: CivilDate) => {
    setDay(date);
    setStart(startOfWeek(date));
  };
  const week = useWeekView(start);
  const profile = useTodayView()?.profile;
  const thisWeek = start === startOfWeek(today);
  const planned = week ? week.days.reduce((sum, d) => sum + d.plannedMinutes, 0) : 0;
  const capacity = week ? week.days.reduce((sum, d) => sum + d.capacity, 0) : 0;
  const proposals = week
    ? week.days.flatMap((d) => [...d.scheduled, ...d.anytime]).filter((t) => t.proposedBy)
    : [];
  const toPlan = week ? week.inbox.length + week.unscheduled.length : 0;
  const [trayOpen, setTrayOpen] = useState(true);
  const tray = !phone && trayOpen && toPlan > 0;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title={phone ? "Week" : "Upcoming"}
        sub={
          phone
            ? week && profile
              ? `${weekRange(start)} · ${hours(weekFree(week, today, now, profile.dayStart, profile.dayEnd))} h free`
              : weekRange(start)
            : undefined
        }
        actions={
          phone ? (
            <>
              <Button
                icon={ChevronLeft}
                accessibilityLabel="Previous week"
                onPress={() => pickDay(addDays(day, -7))}
              />
              <Button
                icon={ChevronRight}
                accessibilityLabel="Next week"
                onPress={() => pickDay(addDays(day, 7))}
              />
            </>
          ) : null
        }
        width={phone ? "column" : "wide"}
        footer={proposals.length ? <ProposalBanner proposals={proposals} phone={phone} /> : null}
      >
        {phone ? null : (
          <PageHead
            big
            title={rangeTitle(start)}
            sub={week ? `${hours(planned)} h planned of ${hours(capacity)} h` : " "}
            right={
              <>
                {!phone && toPlan ? (
                  <Button
                    icon={PanelLeft}
                    label={`To plan ${toPlan}`}
                    accessibilityLabel={trayOpen ? "Hide tasks to plan" : "Show tasks to plan"}
                    expanded={trayOpen}
                    onPress={() => setTrayOpen(!trayOpen)}
                  />
                ) : null}
                <Button
                  icon={ChevronLeft}
                  accessibilityLabel="Previous week"
                  onPress={() => setStart(addDays(start, -7))}
                />
                <Button label="This week" onPress={() => setStart(startOfWeek(today))} disabled={thisWeek} />
                <Button
                  icon={ChevronRight}
                  accessibilityLabel="Next week"
                  onPress={() => setStart(addDays(start, 7))}
                />
              </>
            }
          />
        )}
        {week === undefined ? (
          <View testID="skeleton" style={{ gap: s.s6 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ gap: s.s2 }}>
                <Skeleton width={120} height={16} />
                <Skeleton width="100%" height={2} />
                <Skeleton width="60%" />
              </View>
            ))}
          </View>
        ) : phone ? (
          <PhoneWeek week={week} day={day} today={today} now={now} onPick={pickDay} />
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s6 }}>
            {tray ? <PlanTray inbox={week.inbox} undated={week.unscheduled} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <WeekGrid week={week} today={today} />
            </View>
          </View>
        )}
      </Screen>
      {/* Outside the screen: inside, its offset would move the "fixed" ghost away from the pointer. */}
      {phone ? null : <DragGhost />}
    </View>
  );
}

/** Tasks with no day yet: drag one onto a day (no time) or into the grid (at a time). */
function PlanTray({ inbox, undated }: { inbox: TaskView[]; undated: TaskView[] }) {
  return (
    <View aria-label="To plan" style={{ width: sz.tray, gap: s.s6, paddingTop: s.s1 }}>
      <Txt variant="meta" tone="ink3">
        Drag a task onto a day, or onto a time.
      </Txt>
      {inbox.length ? (
        <View>
          <SectionHead title="Inbox" meta={String(inbox.length)} />
          {inbox.map((t) => (
            <TrayRow key={t._id} task={t} />
          ))}
        </View>
      ) : null}
      {undated.length ? (
        <View>
          <SectionHead title="No date" meta={String(undated.length)} />
          {undated.map((t) => (
            <TrayRow key={t._id} task={t} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TrayRow({ task }: { task: TaskView }) {
  const tone = spaceTone(task.color);
  return (
    <DragSource taskId={task._id} title={task.title} color={tone.dot} length={task.length}>
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => openTask(task._id)}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
          minHeight: sz.ctl,
          paddingVertical: s.s1,
          paddingHorizontal: s.s2,
          marginHorizontal: -s.s2,
          borderRadius: r.ctl,
        }}
      >
        <Ring color={task.color ? tone.dot : c.ink3} done={false} size={14} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" numberOfLines={1}>
            {task.title}
          </Txt>
          {task.spacePath ? (
            <Txt variant="meta" tone="ink3" numberOfLines={1}>
              {task.spacePath}
            </Txt>
          ) : null}
        </View>
        {task.length ? (
          <Txt variant="meta" tone="ink3" tnum>
            {formatDuration(task.length)}
          </Txt>
        ) : null}
      </Press>
    </DragSource>
  );
}

function ProposalBanner({ proposals, phone }: { proposals: TaskView[]; phone: boolean }) {
  const settle = useMutation(api.tasks.settleProposals);
  const who = proposals[0]?.proposedBy ?? "An agent";
  const days = [...new Set(proposals.map((t) => t.date).filter((d): d is string => Boolean(d)))]
    .sort()
    .map((d) => WEEKDAY_SHORT[weekday(d)]);
  const run = (accept: boolean) =>
    void settle({ accept, ids: proposals.map((t) => t._id) })
      .then((n) => showToast(accept ? `Added ${n} to your plan` : `Discarded ${n} proposed`))
      .catch((e: unknown) => showToast(errorText(e)));
  return (
    <View
      role="status"
      style={{
        position: "absolute",
        bottom: phone ? 168 : s.s6,
        left: phone ? s.s4 : 0,
        right: phone ? s.s4 : 0,
        alignItems: "center",
        zIndex: 6,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          flexDirection: "row",
          flexWrap: phone ? "wrap" : "nowrap",
          alignItems: "center",
          gap: s.s3,
          paddingVertical: s.s2,
          paddingLeft: s.s4,
          paddingRight: s.s2,
          borderRadius: r.card,
          backgroundColor: c.overlay,
          boxShadow: shadows.overlay,
        }}
      >
        <Icon icon={Bot} />
        <Txt variant="body" style={phone ? { flexBasis: "80%" } : undefined}>
          {who} proposed {proposals.length} {proposals.length === 1 ? "block" : "blocks"} for{" "}
          {[...new Set(days)].join(" and ")}
        </Txt>
        <Button label="Review" onPress={() => proposals[0] && openTask(proposals[0]._id)} />
        <Button label="Discard" onPress={() => run(false)} />
        <Button variant="primary" label="Accept all" onPress={() => run(true)} />
      </View>
    </View>
  );
}

function LoadLine({ day }: { day: WeekView["days"][number] }) {
  const over = day.plannedMinutes > day.capacity;
  const p = day.capacity > 0 ? Math.min(1, day.plannedMinutes / day.capacity) : 0;
  return (
    <View style={{ height: 2, borderRadius: 1, backgroundColor: c.lineStrong, overflow: "hidden" }}>
      <View
        style={{ width: `${Math.round(p * 100)}%`, height: "100%", backgroundColor: over ? c.now : c.ink3 }}
      />
    </View>
  );
}

/** A task for the day with no time: tick it off here, or open it. */
function Anytime({ task }: { task: TaskView }) {
  const ticked = ticking.useValue((t) => Boolean(t[task._id]));
  const tone = spaceTone(task.color);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 24 }}>
      <Check
        size={14}
        color={tone.dot}
        done={task.done || ticked}
        disabled={task.projected}
        label={`Complete: ${task.title}`}
        onPress={() => !task.done && !ticked && completeTask(task)}
      />
      <Press
        role="button"
        accessibilityLabel={`Open ${task.title}`}
        onPress={() => openTask(task._id)}
        hoverBg={null}
        scale={false}
        // The row's full 24px height, not just the line of text, is the target.
        style={{ flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" }}
      >
        <Txt
          variant="meta"
          tone={task.done || ticked ? "ink3" : "ink2"}
          strike={task.done || ticked}
          numberOfLines={1}
        >
          {task.title}
        </Txt>
      </Press>
    </View>
  );
}

function Due({ task }: { task: TaskView }) {
  const birthday = task.repeat?.freq === "year";
  return (
    <Press
      role="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={() => openTask(task._id)}
      hoverBg={null}
      scale={false}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s1, minHeight: 24 }}
    >
      <Icon icon={birthday ? Cake : Flag} size={14} />
      <Txt variant="meta" tone="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>
        {birthday ? task.title : `${task.title} due`}
      </Txt>
    </Press>
  );
}

/** A day's header shows this many deadlines, birthdays and anytime tasks before "N more". */
const HEADER_ITEMS = 3;

/** The hour labels' column, left of the day columns. */
const GUTTER = 56;

function WeekGrid({ week, today }: { week: WeekView; today: string }) {
  const H = 44;
  // One switch for the whole week, so the day columns' headers stay the same height.
  const [allShown, setAllShown] = useState(false);
  const allTimed = week.days.flatMap((d) => d.scheduled);
  const from = Math.min(8, ...allTimed.map((t) => Math.floor((t.time ?? 480) / 60)));
  const to = Math.max(
    20,
    ...allTimed.map((t) => Math.ceil(((t.time ?? 0) + Math.max(t.length ?? 0, 30)) / 60)),
  );
  const y = (m: number) => ((m - from * 60) / 60) * H;

  // The week is a drop zone: over a day's header a task lands on that day, over the grid at a time.
  const grid = useRef<View>(null);
  const [headH, setHeadH] = useState(0);
  const drag = externalDrag.useValue((d) => d);
  const tasks = useMemo(
    () =>
      new Map(
        [...week.inbox, ...week.unscheduled, ...week.days.flatMap((d) => [...d.scheduled, ...d.anytime])].map(
          (t) => [t._id as string, t],
        ),
      ),
    [week],
  );
  useFocusEffect(
    useCallback(
      () =>
        registerDropZone({
          measure: () =>
            new Promise((resolve) => {
              if (!grid.current) return resolve(null);
              grid.current.measureInWindow((x, top, width, height) => resolve({ x, y: top, width, height }));
            }),
          startMinutes: from * 60,
          hourPx: H,
          topPad: headH,
          hit: (rect, x, py) => {
            const colW = (rect.width - GUTTER) / 7;
            const day = week.days[Math.floor((x - rect.x - GUTTER) / colW)];
            if (!day || py < rect.y || py > rect.y + rect.height + 24) return null;
            if (py < rect.y + headH) return { date: day.date, minutes: null };
            return { date: day.date, minutes: clampDay(snap(from * 60 + ((py - rect.y - headH) / H) * 60)) };
          },
          onDrop: (taskId, drop) => {
            const task = tasks.get(taskId);
            if (task && drop.date) void moveTasks([task], drop.date, drop.minutes ?? undefined);
          },
        }),
      [from, headH, week.days, tasks],
    ),
  );

  return (
    <View ref={grid}>
      <View style={{ flexDirection: "row" }} onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>
        <View style={{ width: GUTTER }} />
        {week.days.map((d, i) => {
          const over = d.plannedMinutes > d.capacity;
          const allDay = [...d.deadlines, ...d.anytime.filter((t) => t.repeat?.freq === "year")];
          const anytime = d.anytime.filter((t) => t.repeat?.freq !== "year");
          const items = [
            ...allDay.map((t) => ({ t, anytime: false })),
            ...anytime.map((t) => ({ t, anytime: true })),
          ];
          const shown = allShown ? items : items.slice(0, HEADER_ITEMS);
          const more = items.length - shown.length;
          const target = drag?.over?.date === d.date && drag.over.minutes === null;
          return (
            <View
              key={d.date}
              style={{
                flex: 1,
                paddingHorizontal: s.s2,
                paddingBottom: s.s3,
                gap: s.s2,
                borderRadius: r.ctl,
                backgroundColor: target ? c.hover : "transparent",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s2 }}>
                <Txt variant="label" tone={d.isToday ? "ink" : "ink2"} accessibilityLabel={WEEKDAY_LONG[i]}>
                  {WEEKDAY_SHORT[i]}
                </Txt>
                <Txt variant="meta" tone={d.isToday ? "now" : "ink3"} tnum>
                  {parts(d.date)[2]}
                </Txt>
              </View>
              <LoadLine day={d} />
              <Txt variant="meta" tone={over ? "now" : "ink3"} tnum numberOfLines={1}>
                {loadText(d)}
              </Txt>
              <View style={{ minHeight: 16, gap: 2 }}>
                {shown.map(({ t, anytime }) =>
                  anytime ? <Anytime key={t._id} task={t} /> : <Due key={t._id} task={t} />,
                )}
                {more > 0 || (allShown && items.length > HEADER_ITEMS) ? (
                  <Press
                    role="button"
                    accessibilityLabel={more > 0 ? `Show ${more} more on ${WEEKDAY_LONG[i]}` : "Show fewer"}
                    onPress={() => setAllShown(!allShown)}
                    hoverBg={null}
                    scale={false}
                    style={{ minHeight: 24, justifyContent: "center" }}
                  >
                    <Txt variant="meta" tone="ink3">
                      {more > 0 ? `${more} more` : "Show fewer"}
                    </Txt>
                  </Press>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", height: y(to * 60) }}>
        {/* Hairlines at each hour, behind the blocks, so a time reads across the week. */}
        {Array.from({ length: to - from }, (_, k) =>
          k ? (
            <View
              key={`line-${k}`}
              pointerEvents="none"
              style={{
                position: "absolute",
                left: GUTTER,
                right: 0,
                top: k * H,
                height: 1,
                backgroundColor: c.line,
              }}
            />
          ) : null,
        )}
        <View style={{ width: GUTTER }}>
          {Array.from({ length: to - from }, (_, k) =>
            k ? (
              <Txt
                key={k}
                variant="meta"
                tone="ink3"
                tnum
                style={{ position: "absolute", top: k * H, transform: [{ translateY: -8 }] }}
              >
                {String(from + k).padStart(2, "0")}:00
              </Txt>
            ) : null,
          )}
        </View>
        {week.days.map((d) => (
          <View
            key={d.date}
            style={{ flex: 1, position: "relative", borderLeftWidth: 1, borderLeftColor: c.line }}
          >
            {(() => {
              // Blocks that start together sit side by side; a later one sits on top, indented.
              const placed = new Map(
                layoutDay(
                  d.scheduled.map((t) => ({
                    id: `${t._id}:${t.date}`,
                    start: t.time ?? 0,
                    length: t.length ?? undefined,
                  })),
                ).map((p) => [p.id, p]),
              );
              return d.scheduled.map((t) => {
                const p = placed.get(`${t._id}:${t.date}`);
                const cols = p?.columns ?? 1;
                const col = p?.column ?? 0;
                const depth = Math.min(p?.depth ?? 0, 3);
                const tone = spaceTone(t.color);
                const top = y(t.time ?? 0) + 1;
                const h = Math.max(24, (Math.max(t.length ?? 0, 30) / 60) * H - 2);
                const proposed = Boolean(t.proposedBy);
                return (
                  <View
                    key={`${t._id}:${t.date}`}
                    style={{
                      position: "absolute",
                      top,
                      height: h,
                      left: `${(col / cols) * 100}%`,
                      width: `${100 / cols}%`,
                      // The first block's edge lines up with the day's name above it; a block on
                      // top of another starts further in, so the one below keeps its title.
                      paddingLeft: (col ? 0 : s.s2) + depth * s.s2,
                      paddingRight: s.s1,
                    }}
                  >
                    <Press
                      role="button"
                      accessibilityLabel={`Open ${t.title}, ${formatDay(d.date, today)} ${formatClock(t.time ?? 0)}${proposed ? `, proposed by ${t.proposedBy}` : ""}`}
                      onPress={() => openTask(t._id)}
                      hoverBg={null}
                      scale={false}
                      style={({ hovered }) => ({
                        flex: 1,
                        flexDirection: "row",
                        gap: s.s1,
                        paddingVertical: s.s1,
                        paddingHorizontal: s.s2,
                        borderRadius: r.ctl,
                        overflow: "hidden",
                        backgroundColor: proposed ? c.bg : t.done ? "transparent" : tone.surface,
                        borderWidth: proposed || t.done || hovered || depth ? 1 : 0,
                        borderColor: proposed ? tone.dot : t.done || hovered ? c.lineStrong : c.bg,
                      })}
                    >
                      {t.event ? (
                        <View
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: tone.dot,
                            marginTop: 5,
                          }}
                        />
                      ) : null}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt
                          variant="caption"
                          tone={t.done ? "ink3" : "ink"}
                          strike={t.done}
                          numberOfLines={1}
                        >
                          {t.title}
                        </Txt>
                        {h >= 40 ? (
                          <Txt variant="meta" tone="ink2" tnum numberOfLines={1}>
                            {formatClock(t.time ?? 0)}
                          </Txt>
                        ) : null}
                      </View>
                    </Press>
                  </View>
                );
              });
            })()}
            {drag?.over?.date === d.date && drag.over.minutes !== null ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: s.s2,
                  right: s.s1,
                  top: y(drag.over.minutes) + 1,
                  height: Math.max(24, (Math.max(drag.length ?? 0, 30) / 60) * H - 2),
                  borderRadius: r.ctl,
                  borderWidth: 1,
                  borderColor: c.lineStrong,
                  backgroundColor: c.hover,
                  paddingHorizontal: s.s2,
                  paddingVertical: s.s1,
                }}
              >
                <Txt variant="meta" tone="ink2" tnum numberOfLines={1}>
                  {formatTimeRange(drag.over.minutes, drag.length ?? undefined)}
                </Txt>
              </View>
            ) : null}
            {d.isToday ? <NowLine y={y} from={from} to={to} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function NowLine({ y, from, to }: { y: (m: number) => number; from: number; to: number }) {
  const { now } = useClock();
  // Outside the grid's hours there is no place for it; drawn anyway it floats over the header.
  if (now < from * 60 || now > to * 60) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: 0, right: 0, top: y(now), height: 1, backgroundColor: c.now }}
    >
      {/* The same mark as Today's timeline, so a 1px line in a narrow column still reads as now. */}
      <View
        style={{
          position: "absolute",
          left: -3,
          top: -3,
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: c.now,
        }}
      />
    </View>
  );
}

/** The phone's Week: the strip, the picked day's spine, its anytime tasks, then what has no day. */
function PhoneWeek({
  week,
  day,
  today,
  now,
  onPick,
}: {
  week: WeekView;
  day: CivilDate;
  today: CivilDate;
  now: number;
  onPick: (date: CivilDate) => void;
}) {
  const sel = week.days.find((d) => d.date === day);
  const anytime = sel ? [...sel.deadlines, ...sel.anytime] : [];
  const toPlan = [...week.inbox, ...week.unscheduled];
  return (
    <>
      <View style={{ gap: s.s3 }}>
        <WeekStrip today={today} selected={day} onSelect={onPick} />
        <Spine date={day} items={sel?.scheduled ?? []} now={day === today ? now : null} />
      </View>
      {anytime.length ? (
        <View style={{ gap: s.s1 }}>
          <SectionHead title="Anytime" meta={String(anytime.length)} />
          {anytime.map((t) => (
            <DottedRow key={`${t._id}:${t.date}`}>
              <TaskRow task={t} today={today} />
            </DottedRow>
          ))}
        </View>
      ) : null}
      {toPlan.length ? (
        <View style={{ gap: s.s1 }}>
          <SectionHead title="Not scheduled yet" meta={String(toPlan.length)} />
          {toPlan.map((t) => (
            <DottedRow key={t._id}>
              <TaskRow task={t} today={today} />
            </DottedRow>
          ))}
        </View>
      ) : null}
    </>
  );
}

/** The prototype's dotted rule under each row (b2.html `.row`, `.tray-r`). */
function DottedRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderBottomWidth: 1, borderStyle: "dotted", borderColor: c.lineStrong }}>{children}</View>
  );
}
