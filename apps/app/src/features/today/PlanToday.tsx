// Plan today: a one-minute sheet, never a gate. Bring tasks from earlier days, pull some from
// the Inbox, and see whether they fit the free time left. Nothing moves until "Add".

import { useEffect, useState, type RefObject } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { formatDay, formatDuration } from "@kriyan/core/format";
import type { TaskView } from "@/data/views";
import { moveTasks } from "@/features/tasks/actions";
import { r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { PickBox } from "@/ui/bits";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

interface Props {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<View | null>;
  today: string;
  earlier: TaskView[];
  inbox: TaskView[];
  /** Minutes free from now to the end of the day. */
  free: number;
}

/** The popover's title and the summary and buttons under the list. */
const CHROME = 168;

export function PlanToday({ open, onClose, anchor, today, earlier, inbox, free }: Props) {
  const { height: win } = useWindowDimensions();
  // Opens on the side of the button with more room, and the list scrolls inside, so the
  // summary and "Add to today" always show.
  const [room, setRoom] = useState<{ side: "above" | "below"; height: number }>({
    side: "below",
    height: win,
  });
  useEffect(() => {
    if (!open) return;
    anchor.current?.measureInWindow((_x, y, _w, h) => {
      const below = win - (y + h);
      setRoom(y > below ? { side: "above", height: y } : { side: "below", height: below });
    });
  }, [open, anchor, win]);
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} side={room.side} title="Plan today" width={400}>
      {/* Remounts each time it opens, so the picks start fresh. */}
      {open ? (
        <Picks
          onClose={onClose}
          today={today}
          earlier={earlier}
          inbox={inbox}
          free={free}
          listHeight={Math.max(120, room.height - CHROME)}
        />
      ) : null}
    </Popover>
  );
}

function Picks({
  onClose,
  today,
  earlier,
  inbox,
  free,
  listHeight,
}: Omit<Props, "open" | "anchor"> & { listHeight: number }) {
  // What's left from earlier days is usually meant for today; Inbox ideas are a choice. A
  // repeat's missed day isn't picked for you: its next occurrence is already coming.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(earlier.filter((t) => !t.repeat && !t.event).map((t) => t._id)),
  );
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = [...earlier, ...inbox].filter((t) => picked.has(t._id));
  // Only lengths people gave count; a task without one adds nothing (never invent a length).
  const minutes = chosen.reduce((sum, t) => sum + (t.length ?? 0), 0);
  const fit =
    minutes === 0
      ? `${formatDuration(free)} free today`
      : minutes <= free
        ? `${formatDuration(minutes)} of the ${formatDuration(free)} free`
        : `${formatDuration(minutes)}, ${formatDuration(minutes - free)} more than is free`;

  return (
    <View style={{ gap: s.s4 }}>
      <ScrollView style={{ maxHeight: listHeight }} contentContainerStyle={{ gap: s.s4 }}>
        {earlier.length ? (
          <Group title="From earlier" tasks={earlier} picked={picked} toggle={toggle} today={today} />
        ) : null}
        {inbox.length ? (
          <Group title="From your Inbox" tasks={inbox} picked={picked} toggle={toggle} today={today} />
        ) : null}
      </ScrollView>
      <Txt variant="meta" tone={minutes > free ? "now" : "ink3"} tnum>
        {fit}
      </Txt>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button label="Not now" onPress={onClose} />
        <Button
          variant="primary"
          label={chosen.length ? `Add ${chosen.length} to today` : "Add to today"}
          disabled={!chosen.length}
          onPress={() => {
            onClose();
            void moveTasks(chosen, today);
          }}
        />
      </View>
    </View>
  );
}

function Group({
  title,
  tasks,
  picked,
  toggle,
  today,
}: {
  title: string;
  tasks: TaskView[];
  picked: Set<string>;
  toggle: (id: string) => void;
  today: string;
}) {
  return (
    <View style={{ gap: s.s1 }}>
      <Txt variant="label" tone="ink2">
        {title}
      </Txt>
      {tasks.map((t) => {
        const on = picked.has(t._id);
        const facts = [
          ...(t.date ? [formatDay(t.date, today)] : []),
          ...(t.spacePath ? [t.spacePath] : []),
          ...(t.length ? [formatDuration(t.length)] : []),
        ].join(", ");
        return (
          <Press
            key={t._id}
            role="checkbox"
            aria-checked={on}
            accessibilityLabel={`Bring to today: ${t.title}`}
            onPress={() => toggle(t._id)}
            scale={false}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s3,
              minHeight: 44,
              paddingHorizontal: s.s2,
              marginHorizontal: -s.s2,
              borderRadius: r.ctl,
            }}
          >
            <PickBox on={on} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="body" numberOfLines={1}>
                {t.title}
              </Txt>
              {facts ? (
                <Txt variant="meta" tone="ink3" numberOfLines={1}>
                  {facts}
                </Txt>
              ) : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}
