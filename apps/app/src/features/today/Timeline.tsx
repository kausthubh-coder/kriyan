// Today's schedule: hours down the side, blocks in their space's surface colour, the now
// line in vermilion. Blocks move and resize in 15-minute steps; tasks dragged from the list
// land here.

import { useCallback, useRef, useState } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";
import { useFocusEffect } from "expo-router";
import { formatClock } from "@kriyan/core/dates";
import { formatTimeRange } from "@kriyan/core/format";
import { layoutDay } from "@kriyan/core/layout";
import type { TaskView } from "@/data/views";
import { completeTask, placeTasks, reopenTask, ticking, updateTask } from "@/features/tasks/actions";
import { openTask } from "@/features/tasks/TaskRow";
import { useIsPhone, useType } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Check, Dot } from "@/ui/bits";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { BlockDrag } from "./BlockDrag";
import { externalDrag, registerDropZone, type Drop } from "./drag";

const GUTTER = 56;
const PAD = 8;

interface Props {
  date: string;
  items: TaskView[];
  /** Minutes now, when the timeline is today's. */
  now: number | null;
  dayStart: number;
  dayEnd: number;
  /** Hide hours before this (the "Earlier today" fold). */
  foldBefore?: number | null;
}

export function Timeline({ date, items, now, dayStart, dayEnd, foldBefore }: Props) {
  const phone = useIsPhone();
  const roles = useType();
  // On touch a 30-minute block must be a 44px target, so an hour is 96px.
  const hourPx = phone ? 96 : 56;
  // A block shows its time under the title only when both lines fit inside its padding.
  const twoLines = Number(roles.label.lineHeight) + Number(roles.meta.lineHeight) + 2 * s.s2;
  const ref = useRef<View>(null);
  const [width, setWidth] = useState(0);
  const ticked = ticking.useValue((t) => t);
  const drag = externalDrag.useValue((d) => d);

  const earliest = Math.min(dayStart, ...items.map((t) => t.time ?? dayStart));
  const latest = Math.max(dayEnd, ...items.map((t) => (t.time ?? 0) + Math.max(t.length ?? 0, 30)));
  let fromH = Math.floor(earliest / 60);
  if (foldBefore !== null && foldBefore !== undefined) fromH = Math.max(fromH, Math.floor(foldBefore / 60));
  const toH = Math.min(24, Math.ceil(latest / 60));
  const y = (minutes: number) => ((minutes - fromH * 60) / 60) * hourPx + PAD;
  const height = y(toH * 60) + PAD;

  const onDrop = useCallback(
    (taskId: string, drop: Drop) => {
      if (drop.minutes !== null) void placeTasks([taskId as TaskView["_id"]], date, drop.minutes);
    },
    [date],
  );

  // Tabs stay mounted, so the zone follows the focused screen.
  useFocusEffect(
    useCallback(
      () =>
        registerDropZone({
          measure: () =>
            new Promise((resolve) => {
              if (!ref.current) return resolve(null);
              ref.current.measureInWindow((x, yy, w, h) =>
                resolve({ x: x + GUTTER, y: yy, width: w - GUTTER, height: h }),
              );
            }),
          startMinutes: fromH * 60,
          hourPx,
          topPad: PAD,
          onDrop,
        }),
      [fromH, hourPx, onDrop],
    ),
  );

  const visible = items.filter(
    (t) => t.time !== null && (t.time ?? 0) + Math.max(t.length ?? 0, 30) > fromH * 60,
  );
  const placed = layoutDay(
    visible.map((t) => ({ id: `${t._id}:${t.date}`, start: t.time ?? 0, length: t.length ?? undefined })),
  );
  const byId = new Map(visible.map((t) => [`${t._id}:${t.date}`, t]));
  const laneWidth = Math.max(0, width - GUTTER);

  const hours = [];
  for (let h = fromH; h <= toH; h++) {
    const near = now !== null && Math.abs(h * 60 - now) <= 20;
    hours.push(
      <View
        key={h}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: y(h * 60),
          flexDirection: "row",
          alignItems: "flex-start",
        }}
      >
        <Txt variant="meta" tone="ink3" tnum style={{ width: GUTTER, transform: [{ translateY: -8 }] }}>
          {near ? "" : `${String(h).padStart(2, "0")}:00`}
        </Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
      </View>,
    );
  }

  return (
    <View
      ref={ref}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ position: "relative", height }}
      aria-label="Schedule"
    >
      {hours}
      {laneWidth > 0
        ? placed.map((p) => {
            const t = byId.get(p.id);
            if (!t) return null;
            const done = t.done || Boolean(ticked[t._id]);
            const tone = spaceTone(t.color);
            // Each level a block sits on top of moves it right, so the one below keeps its title.
            const indent = Math.min(p.depth, 3) * s.s6;
            const colW = (laneWidth - indent) / p.columns;
            // A block that began above the "Earlier today" fold starts at the fold's edge.
            const shown = Math.max(p.start, fromH * 60);
            const top = y(shown) + 1;
            const h = y(p.end) - y(shown) - 2;
            const tall = h >= twoLines;
            return (
              <BlockDrag
                key={p.id}
                top={top}
                height={h}
                left={GUTTER + indent + p.column * colW + (p.column ? 2 : 0)}
                width={colW - (p.columns > 1 ? 2 : 0)}
                start={p.start}
                length={t.length}
                hourPx={hourPx}
                disabled={t.projected}
                onMove={(start) => void placeTasks([t._id], date, start)}
                onResize={(length) => void updateTask({ id: t._id, length })}
              >
                <View
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: s.s2,
                    paddingHorizontal: s.s3,
                    borderRadius: r.ctl,
                    overflow: "hidden",
                    backgroundColor: done ? "transparent" : tone.surface,
                    // A block on top of another gets a page-coloured edge, so the two read as two.
                    borderWidth: done || p.depth ? 1 : 0,
                    borderColor: done ? c.lineStrong : c.bg,
                    ...(t.proposedBy ? { backgroundColor: c.bg, borderWidth: 1, borderColor: tone.dot } : {}),
                  }}
                >
                  {t.event ? (
                    <View style={{ marginTop: h < 28 ? 8 : 14, marginHorizontal: s.s1 }}>
                      <Dot color={tone.dot} />
                    </View>
                  ) : (
                    <View style={{ marginTop: h < 28 ? 4 : 10 }}>
                      <Check
                        round
                        size={16}
                        color={tone.dot}
                        done={done}
                        disabled={t.projected}
                        label={`${done ? "Mark not done" : "Complete"}: ${t.title}`}
                        onPress={() =>
                          t.done ? !t.repeat && reopenTask(t._id) : !ticked[t._id] && completeTask(t)
                        }
                      />
                    </View>
                  )}
                  <Press
                    role="button"
                    accessibilityLabel={`Open ${t.title}, ${formatTimeRange(p.start, t.length ?? undefined)}`}
                    onPress={() => openTask(t._id)}
                    hoverBg={null}
                    scale={false}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      alignSelf: "stretch",
                      paddingVertical: h < 28 ? s.s1 : s.s2,
                    }}
                  >
                    <Txt variant="label" tone={done ? "ink3" : "ink"} strike={done} numberOfLines={1}>
                      {t.title}
                    </Txt>
                    {tall ? (
                      <Txt variant="meta" tone="ink2" tnum numberOfLines={1}>
                        {t.repeatText && !t.length
                          ? t.repeatText
                          : formatTimeRange(p.start, t.length ?? undefined)}
                      </Txt>
                    ) : null}
                  </Press>
                </View>
              </BlockDrag>
            );
          })
        : null}
      {drag?.over && drag.over.minutes !== null ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: GUTTER,
            right: 0,
            top: y(drag.over.minutes) + 1,
            height: Math.max(((drag.length ?? 30) / 60) * hourPx - 2, 20),
            borderRadius: r.ctl,
            borderWidth: 1,
            borderColor: c.lineStrong,
            backgroundColor: c.hover,
          }}
        >
          <View
            style={{
              position: "absolute",
              right: s.s3,
              top: -30,
              paddingHorizontal: s.s2,
              paddingVertical: 2,
              borderRadius: r.sm,
              backgroundColor: c.overlay,
            }}
          >
            <Txt variant="caption" tnum>
              {formatTimeRange(drag.over.minutes, drag.length ?? undefined)}
            </Txt>
          </View>
        </View>
      ) : null}
      {now !== null && now >= fromH * 60 && now <= toH * 60 ? (
        <>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: GUTTER - 6,
              right: 0,
              top: y(now),
              height: 1,
              backgroundColor: c.now,
              zIndex: 2,
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: -3,
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: c.now,
              }}
            />
          </View>
          <Txt
            variant="caption"
            tone="now"
            tnum
            style={{ position: "absolute", left: 0, top: y(now), transform: [{ translateY: -8 }] }}
            {...(Platform.OS === "web" ? { "aria-label": `Now, ${formatClock(now)}` } : {})}
          >
            {formatClock(now)}
          </Txt>
        </>
      ) : null}
    </View>
  );
}
