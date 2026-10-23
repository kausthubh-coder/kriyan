// Focus (b2.html?screen=focus): one task, a ring that fills as its time passes with a red dot
// at its head, the next step from its checklist, and what comes after. Dark in both schemes,
// like Tiimo's focus. A task with no length counts up instead; Kriyan never invents how long
// something takes.

import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTaskDoc, useTodayView } from "@/data/views";
import { completeTask, updateTask } from "@/features/tasks/actions";
import { commitHaptic } from "@/features/tasks/haptics";
import { c, family, hex, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { goBack } from "@/ui/Screen";
import { LightStatusBar } from "@/ui/statusBar";
import { Txt } from "@/ui/Txt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Pause, Play } from "lucide-react-native";
import { Icon } from "@/ui/Icon";

const RING = 280;
const STROKE = 14;
const RADIUS = (RING - STROKE) / 2;
const PLAY = 76;

/** The first unticked "- [ ] step" in a Markdown note, and the note with it ticked. */
export function nextStep(note: string | null): { text: string; tick: () => string } | null {
  if (!note) return null;
  const lines = note.split("\n");
  const i = lines.findIndex((l) => /^\s*- \[ \] /.test(l));
  const line = lines[i];
  if (line === undefined) return null;
  const text = line.replace(/^\s*- \[ \] /, "");
  return {
    text,
    tick: () => lines.map((l, j) => (j === i ? l.replace("- [ ] ", "- [x] ") : l)).join("\n"),
  };
}

export function FocusScreen({ id }: { id: Id<"tasks"> }) {
  const task = useTaskDoc(id);
  const day = useTodayView();
  const { now } = useClock();
  const insets = useSafeAreaInsets();
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (!running) return;
    const started = Date.now() - elapsed * 1000;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(tick);
    // Restart the interval only when pausing or resuming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const total = task?.length ? (task.length + extra) * 60 : null;
  const left = total !== null ? Math.max(0, total - elapsed) : null;
  const shown = left ?? elapsed;
  const progress = total ? Math.min(1, elapsed / total) : 0;
  const step = nextStep(task?.note ?? null);
  const after = useMemo(
    () => day?.scheduled.find((t) => !t.done && t._id !== id && t.time !== null && t.time > now) ?? null,
    [day, id, now],
  );

  if (!task) return <View style={{ flex: 1, backgroundColor: c.head }} />;
  const circumference = 2 * Math.PI * RADIUS;
  // The dot rides the head of the arc, which starts at 12 o'clock.
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const end = task.time != null && task.length ? task.time + task.length : null;
  const hasSteps = /^\s*- \[x\] /m.test(task.note ?? "");

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.head,
        paddingTop: insets.top + s.s2,
        paddingBottom: insets.bottom + s.s8,
        paddingHorizontal: s.s6,
        alignItems: "center",
      }}
    >
      <LightStatusBar />
      <View
        style={{
          alignSelf: "stretch",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 52,
          maxWidth: 520,
          width: "100%",
          marginHorizontal: "auto",
        }}
      >
        <Press
          role="button"
          accessibilityLabel="Back"
          onPress={() => goBack("/today")}
          hoverBg={null}
          style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingRight: s.s2 }}
        >
          <Icon icon={ChevronLeft} size={22} tone="headInk" />
          <Txt variant="label" tone="headInk">
            Back
          </Txt>
        </Press>
        <Txt variant="meta" tone="headDim" style={family("600")}>
          Focus
        </Txt>
      </View>

      <View style={{ alignItems: "center", gap: s.s1, marginTop: s.s2, maxWidth: 480 }}>
        <Txt variant="headline" tone="headInk" heading={1} style={{ textAlign: "center" }}>
          {task.title}
        </Txt>
        {task.time != null ? (
          <Txt variant="body" tone="headDim" tnum>
            {end !== null
              ? `${formatClock(task.time)} → ${formatClock(end)} · ${formatDuration(task.length ?? 0)}`
              : formatClock(task.time)}
          </Txt>
        ) : null}
      </View>

      <View
        style={{
          width: RING,
          height: RING,
          marginTop: s.s6,
          marginBottom: s.s6,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={RING} height={RING} style={{ position: "absolute" }}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={hex.headFill}
            strokeWidth={STROKE}
            fill="none"
          />
          {total !== null ? (
            <>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                stroke={hex.headInk}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference * (1 - progress)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
              <Circle
                cx={RING / 2 + RADIUS * Math.cos(angle)}
                cy={RING / 2 + RADIUS * Math.sin(angle)}
                r={6}
                fill={hex.now}
              />
            </>
          ) : null}
        </Svg>
        <Txt
          tone="headInk"
          tnum
          accessibilityRole="timer"
          accessibilityLabel={`${clock(shown)} ${total !== null ? "left" : "so far"}`}
          style={{ fontSize: 56, lineHeight: 64, ...family("600"), letterSpacing: -1.5 }}
        >
          {clock(shown)}
        </Txt>
        <Txt variant="meta" tone="headDim" style={{ marginTop: s.s1 }}>
          {total !== null
            ? `left of ${formatDuration((task.length ?? 0) + extra)}`
            : "No length set, so this counts up"}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s6 }}>
        <Press
          role="button"
          accessibilityLabel="Add 5 minutes"
          disabled={total === null}
          onPress={() => setExtra(extra + 5)}
          hoverBg={null}
          style={[ghost, total === null ? { opacity: 0.4 } : null]}
        >
          <Txt variant="meta" tone="headInk" style={family("600")}>
            +5 min
          </Txt>
        </Press>
        <Press
          role="button"
          accessibilityLabel={running ? "Pause" : "Resume"}
          onPress={() => setRunning(!running)}
          hoverBg={null}
          style={{
            width: PLAY,
            height: PLAY,
            borderRadius: r.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.headInk,
          }}
        >
          {/* Filled marks, like the prototype's play button. */}
          {running ? (
            <Pause size={28} color={hex.head} fill={hex.head} aria-hidden focusable={false} />
          ) : (
            <Play size={28} color={hex.head} fill={hex.head} aria-hidden focusable={false} />
          )}
        </Press>
        <Press
          role="button"
          accessibilityLabel="Done"
          onPress={() => {
            completeTask(task);
            goBack("/today");
          }}
          hoverBg={null}
          style={ghost}
        >
          <Txt variant="meta" tone="headInk" style={family("600")}>
            Done
          </Txt>
        </Press>
      </View>

      <View style={card}>
        <Txt variant="caption" tone="headDim" style={label}>
          Next step
        </Txt>
        {step ? (
          <Press
            role="button"
            accessibilityLabel={`Tick off: ${step.text}`}
            onPress={() => {
              commitHaptic();
              void updateTask({ id: task._id, note: step.tick() });
            }}
            hoverBg={null}
            style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 44 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: r.pill,
                borderWidth: 1.5,
                borderColor: c.headDim,
              }}
            />
            <Txt variant="body" tone="headInk" style={{ flex: 1 }}>
              {step.text}
            </Txt>
          </Press>
        ) : (
          <Txt variant="body" tone="headInk" style={{ marginTop: s.s1 }}>
            {hasSteps ? "All steps done" : "Just this task"}
          </Txt>
        )}
        {after && after.time !== null ? (
          <Txt
            variant="meta"
            tone="headDim"
            tnum
            style={{
              marginTop: s.s2,
              paddingTop: s.s3,
              borderTopWidth: 1,
              borderStyle: "dotted",
              borderColor: c.headLine,
            }}
          >
            After this: {after.title} at {formatClock(after.time)}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

const ghost = {
  minWidth: 84,
  minHeight: 44,
  paddingHorizontal: s.s4,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderRadius: r.pill,
  backgroundColor: c.headFill,
};

const card = {
  alignSelf: "stretch" as const,
  width: "100%" as const,
  maxWidth: 420,
  marginTop: s.s8,
  marginHorizontal: "auto" as const,
  paddingVertical: s.s3,
  paddingHorizontal: s.s4,
  borderRadius: r.card + 4,
  backgroundColor: c.headFill,
  gap: s.s1,
};

const label = { ...family("600"), textTransform: "uppercase" as const, letterSpacing: 0.6 };
