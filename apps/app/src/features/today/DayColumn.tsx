// The desktop's day column (b2.html `dayCal`), beside Today and the evening review: the date,
// birthdays and other yearly days, the hour grid with the now line, and what's next pinned at
// its foot. It scrolls on its own, so the hours stay in reach however long the list is.

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Cake } from "lucide-react-native";
import { formatDate } from "@kriyan/core/format";
import type { TaskView, TodayView } from "@/data/views";
import { openTask } from "@/features/tasks/TaskRow";
import { bold, c, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { Timeline } from "./Timeline";
import { UpNext, upNextOf } from "./UpNext";

export function DayColumn({ view, today, now }: { view: TodayView; today: string; now: number }) {
  const [showEarlierHours, setShowEarlierHours] = useState(false);
  // Hours before an hour ago fold away, but never over a block that slipped: it stays in
  // sight until it's ticked off or moved.
  const slipped = view.scheduled.filter(
    (t) => !t.done && !t.event && !t.proposedBy && !t.projected && t.time !== null && t.time < now - 60,
  );
  const foldAt = Math.min(now - 60, ...slipped.map((t) => t.time ?? now));
  const fold = !showEarlierHours && foldAt > view.profile.dayStart ? foldAt : null;
  const doneEarlier = view.scheduled.filter((t) => t.done && (t.time ?? 0) < (fold ?? 0)).length;
  const yearly = view.anytime.filter((t) => t.repeat?.freq === "year");
  const { current, next } = upNextOf(view, now);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s.s6, paddingBottom: s.s4, gap: s.s2 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 32 }}>
          <Txt variant="title" heading={2} style={[bold, { flex: 1 }]}>
            {formatDate(today)}
          </Txt>
          {fold !== null || showEarlierHours ? (
            // A quiet button's label, not its padding, lines up with the column's edge.
            <View style={{ marginRight: -s.s3 }}>
              <Button
                variant="quiet"
                label={
                  showEarlierHours
                    ? "Hide earlier hours"
                    : doneEarlier
                      ? `Earlier today, ${doneEarlier} done`
                      : "Earlier today"
                }
                onPress={() => setShowEarlierHours(!showEarlierHours)}
              />
            </View>
          ) : null}
        </View>
        {yearly.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {yearly.map((t) => (
              <AllDayPill key={t._id} task={t} />
            ))}
          </View>
        ) : null}
        <Timeline
          date={today}
          items={view.scheduled}
          now={now}
          dayStart={view.profile.dayStart}
          dayEnd={view.profile.dayEnd}
          foldBefore={fold}
        />
      </ScrollView>
      {current || next ? (
        <View style={{ paddingHorizontal: s.s4, paddingBottom: s.s4, paddingTop: s.s2 }}>
          <UpNext current={current} next={next} now={now} floating />
        </View>
      ) : null}
    </View>
  );
}

/** A birthday or another yearly day, heading the day column (b2.html `.allday`). */
function AllDayPill({ task }: { task: TaskView }) {
  return (
    <Press
      role="button"
      accessibilityLabel={`Open ${task.title}`}
      onPress={() => openTask(task._id)}
      hoverBg={c.hover}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        minHeight: 32,
        paddingHorizontal: s.s3,
        borderRadius: r.ctl,
        backgroundColor: c.sunken,
      }}
    >
      <Icon icon={Cake} size={16} tone="ink2" />
      <Txt variant="label" numberOfLines={1}>
        {task.title}
      </Txt>
    </Press>
  );
}
