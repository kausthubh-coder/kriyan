// Upcoming: plan the week. Desktop: seven day columns with a load line per day (planned
// against capacity), deadlines and birthdays, and the time grid. Phones: an agenda by day.
// An agent's proposed blocks wait in a banner with Accept all and Discard.

import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { Bot, Cake, ChevronLeft, ChevronRight, Flag } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { addDays, diffDays, formatClock, parts, startOfWeek, weekday } from "@kriyan/core/dates";
import { formatDate, formatDay, MONTH_SHORT, WEEKDAY_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useWeekView, type TaskView, type WeekView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { openTask } from "@/features/tasks/TaskRow";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageHead, Screen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

const hours = (m: number) => {
  const h = Math.round((m / 60) * 10) / 10;
  return Number.isInteger(h) ? `${h}` : h.toFixed(1);
};

function loadText(day: WeekView["days"][number]) {
  const over = day.plannedMinutes - day.capacity;
  return over > 0 ? `${hours(day.plannedMinutes)} h, ${hours(over)} h over` : `${hours(day.plannedMinutes)} of ${hours(day.capacity)} h`;
}

function rangeTitle(start: string) {
  const end = addDays(start, 6);
  const [, sm, sd] = parts(start);
  const [, em, ed] = parts(end);
  return sm === em ? `${sd} to ${ed} ${MONTH_SHORT[em - 1]}` : `${sd} ${MONTH_SHORT[sm - 1]} to ${ed} ${MONTH_SHORT[em - 1]}`;
}

export function UpcomingScreen() {
  const { today } = useClock();
  const phone = useIsPhone();
  const [start, setStart] = useState(() => startOfWeek(today));
  const week = useWeekView(start);
  const next = useWeekView(addDays(start, 7));
  const thisWeek = start === startOfWeek(today);
  const planned = week ? week.days.reduce((sum, d) => sum + d.plannedMinutes, 0) : 0;
  const capacity = week ? week.days.reduce((sum, d) => sum + d.capacity, 0) : 0;
  const proposals = week ? week.days.flatMap((d) => [...d.scheduled, ...d.anytime]).filter((t) => t.proposedBy) : [];

  return (
    <Screen
      title="Upcoming"
      fab
      width={phone ? "column" : "wide"}
      footer={proposals.length ? <ProposalBanner proposals={proposals} phone={phone} /> : null}
    >
      <PageHead
        big
        title={rangeTitle(start)}
        sub={week ? `${hours(planned)} h planned of ${hours(capacity)} h` : " "}
        right={
          <>
            <Button icon={ChevronLeft} accessibilityLabel="Previous week" onPress={() => setStart(addDays(start, -7))} />
            <Button label="This week" onPress={() => setStart(startOfWeek(today))} disabled={thisWeek} />
            <Button icon={ChevronRight} accessibilityLabel="Next week" onPress={() => setStart(addDays(start, 7))} />
          </>
        }
      />
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
        <Agenda days={[...week.days, ...(next?.days ?? [])].filter((d) => d.date > today && diffDays(d.date, today) <= 7)} today={today} />
      ) : (
        <WeekGrid week={week} today={today} />
      )}
    </Screen>
  );
}

function ProposalBanner({ proposals, phone }: { proposals: TaskView[]; phone: boolean }) {
  const settle = useMutation(api.tasks.settleProposals);
  const who = proposals[0]?.proposedBy ?? "An agent";
  const days = [...new Set(proposals.map((t) => t.date).filter((d): d is string => Boolean(d)))].sort().map((d) => WEEKDAY_SHORT[weekday(d)]);
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
          {who} proposed {proposals.length} {proposals.length === 1 ? "block" : "blocks"} for {[...new Set(days)].join(" and ")}
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
      <View style={{ width: `${Math.round(p * 100)}%`, height: "100%", backgroundColor: over ? c.now : c.ink3 }} />
    </View>
  );
}

function Due({ task }: { task: TaskView }) {
  const birthday = task.repeat?.freq === "year";
  return (
    <Press role="button" accessibilityLabel={`Open ${task.title}`} onPress={() => openTask(task._id)} hoverBg={null} scale={false} style={{ flexDirection: "row", alignItems: "center", gap: s.s1, minHeight: 24 }}>
      <Icon icon={birthday ? Cake : Flag} size={14} />
      <Txt variant="meta" tone="ink2" numberOfLines={1} style={{ flexShrink: 1 }}>
        {birthday ? task.title : `${task.title} due`}
      </Txt>
    </Press>
  );
}

function WeekGrid({ week, today }: { week: WeekView; today: string }) {
  const H = 44;
  const allTimed = week.days.flatMap((d) => d.scheduled);
  const from = Math.min(8, ...allTimed.map((t) => Math.floor((t.time ?? 480) / 60)));
  const to = Math.max(20, ...allTimed.map((t) => Math.ceil(((t.time ?? 0) + Math.max(t.length ?? 0, 30)) / 60)));
  const y = (m: number) => ((m - from * 60) / 60) * H;
  return (
    <View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 56 }} />
        {week.days.map((d, i) => {
          const over = d.plannedMinutes > d.capacity;
          const allDay = [...d.deadlines, ...d.anytime.filter((t) => t.repeat?.freq === "year")];
          return (
            <View key={d.date} style={{ flex: 1, paddingHorizontal: s.s2, paddingBottom: s.s3, gap: s.s2 }}>
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
                {allDay.slice(0, 2).map((t) => (
                  <Due key={t._id} task={t} />
                ))}
                {d.anytime.filter((t) => t.repeat?.freq !== "year").length ? (
                  <Txt variant="meta" tone="ink3" numberOfLines={1}>
                    {d.anytime.filter((t) => t.repeat?.freq !== "year").length} anytime
                  </Txt>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", height: y(to * 60) }}>
        <View style={{ width: 56 }}>
          {Array.from({ length: to - from }, (_, k) =>
            k ? (
              <Txt key={k} variant="meta" tone="ink3" tnum style={{ position: "absolute", top: k * H, transform: [{ translateY: -8 }] }}>
                {String(from + k).padStart(2, "0")}:00
              </Txt>
            ) : null,
          )}
        </View>
        {week.days.map((d) => (
          <View key={d.date} style={{ flex: 1, position: "relative", borderLeftWidth: 1, borderLeftColor: c.line }}>
            {d.scheduled.map((t) => {
              const tone = spaceTone(t.color);
              const top = y(t.time ?? 0) + 1;
              const h = Math.max(24, (Math.max(t.length ?? 0, 30) / 60) * H - 2);
              const proposed = Boolean(t.proposedBy);
              return (
                <Press
                  key={`${t._id}:${t.date}`}
                  role="button"
                  accessibilityLabel={`Open ${t.title}, ${formatDay(d.date, today)} ${formatClock(t.time ?? 0)}${proposed ? `, proposed by ${t.proposedBy}` : ""}`}
                  onPress={() => openTask(t._id)}
                  hoverBg={null}
                  scale={false}
                  style={({ hovered }) => ({
                    position: "absolute",
                    top,
                    left: 4,
                    right: 4,
                    height: h,
                    flexDirection: "row",
                    gap: s.s1,
                    paddingVertical: s.s1,
                    paddingHorizontal: s.s2,
                    borderRadius: r.ctl,
                    overflow: "hidden",
                    backgroundColor: proposed ? c.bg : t.done ? "transparent" : tone.surface,
                    borderWidth: proposed || t.done || hovered ? 1 : 0,
                    borderColor: proposed ? tone.dot : c.lineStrong,
                  })}
                >
                  {t.event ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.dot, marginTop: 5 }} /> : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="caption" tone={t.done ? "ink3" : "ink"} strike={t.done} numberOfLines={1}>
                      {t.title}
                    </Txt>
                    {h >= 40 ? (
                      <Txt variant="meta" tone="ink2" tnum numberOfLines={1}>
                        {formatClock(t.time ?? 0)}
                      </Txt>
                    ) : null}
                  </View>
                </Press>
              );
            })}
            {d.isToday ? <NowLine y={y} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function NowLine({ y }: { y: (m: number) => number }) {
  const { now } = useClock();
  return <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: y(now), height: 1, backgroundColor: c.now }} />;
}

function Agenda({ days, today }: { days: WeekView["days"]; today: string }) {
  if (days.every((d) => d.scheduled.length + d.anytime.length + d.deadlines.length === 0)) {
    return (
      <View style={{ gap: s.s2 }}>
        <Txt variant="label">Nothing planned for the next 7 days</Txt>
        <Txt variant="body" tone="ink3">
          Add a task with a day, like “essay fri 5pm”, and it shows up here.
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: s.s8 }}>
      {days.map((d) => {
        const over = d.plannedMinutes > d.capacity;
        const label = formatDay(d.date, today);
        const items: { key: string; when: string; task: TaskView; due?: boolean }[] = [
          ...d.deadlines.map((t) => ({ key: `due-${t._id}`, when: "All day", task: t, due: true })),
          ...d.anytime.filter((t) => t.repeat?.freq === "year").map((t) => ({ key: `bd-${t._id}`, when: "All day", task: t })),
          ...d.scheduled.map((t) => ({ key: `${t._id}:${t.date}`, when: formatClock(t.time ?? 0), task: t })),
          ...d.anytime.filter((t) => t.repeat?.freq !== "year").map((t) => ({ key: `any-${t._id}:${t.date}`, when: "Any time", task: t })),
        ];
        return (
          <View key={d.date} style={{ gap: s.s2 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s2 }}>
              <Txt variant="subhead" heading={2}>
                {label === "Tomorrow" ? "Tomorrow" : WEEKDAY_LONG[weekday(d.date)]}
              </Txt>
              <Txt variant="meta" tone="ink3">
                {label === "Tomorrow" ? formatDate(d.date, today) : `${parts(d.date)[2]} ${MONTH_SHORT[parts(d.date)[1] - 1]}`}
              </Txt>
              <Txt variant="meta" tone={over ? "now" : "ink3"} tnum style={{ marginLeft: "auto" }}>
                {loadText(d)}
              </Txt>
            </View>
            <LoadLine day={d} />
            {items.length === 0 ? (
              <Txt variant="body" tone="ink3">
                Free
              </Txt>
            ) : (
              items.map(({ key, when, task, due }) => (
                <Press
                  key={key}
                  role="button"
                  accessibilityLabel={`Open ${task.title}`}
                  onPress={() => openTask(task._id)}
                  style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 48 }}
                >
                  <Txt variant="meta" tone="ink3" tnum style={{ width: 64 }}>
                    {when}
                  </Txt>
                  <View style={{ width: 3, height: 24, borderRadius: 2, backgroundColor: spaceTone(task.color).dot }} />
                  <Txt variant="body" style={{ flex: 1 }} numberOfLines={2}>
                    {due ? `${task.title} due` : task.title}
                  </Txt>
                  {task.proposedBy ? <Icon icon={Bot} size={16} /> : null}
                </Press>
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}
