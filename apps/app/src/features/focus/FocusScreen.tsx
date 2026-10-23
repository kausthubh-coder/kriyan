// Focus (b2.html?screen=focus): one task, a ring that empties as its time runs out, the next
// step from its checklist, and what comes after. Dark in both schemes, like Tiimo's focus.
// A task with no length counts up instead; Kriyan never invents how long something takes.

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
import { c, hex, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { goBack } from "@/ui/Screen";
import { LightStatusBar } from "@/ui/statusBar";
import { Txt } from "@/ui/Txt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, Pause, Play, Plus } from "lucide-react-native";
import { Icon } from "@/ui/Icon";

const RING = 260;
const STROKE = 12;

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
  const circumference = Math.PI * (RING - STROKE);
  const end = task.time != null && task.length ? task.time + task.length : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.head,
        paddingTop: insets.top + s.s2,
        paddingBottom: insets.bottom + s.s6,
        paddingHorizontal: s.s6,
        alignItems: "center",
      }}
    >
      <LightStatusBar />
      <View style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center" }}>
        <Press role="button" accessibilityLabel="Back" onPress={() => goBack("/today")} style={round(44)}>
          <Icon icon={ArrowLeft} tone="headInk" />
        </Press>
      </View>

      <View style={{ alignItems: "center", gap: s.s1, marginTop: s.s4, maxWidth: 480 }}>
        <Txt variant="title" tone="headInk" heading={1} style={{ textAlign: "center" }}>
          {task.title}
        </Txt>
        {task.time != null ? (
          <Txt variant="meta" tone="headDim" tnum>
            {end !== null
              ? `${formatClock(task.time)} → ${formatClock(end)}  ${formatDuration(task.length ?? 0)}`
              : formatClock(task.time)}
          </Txt>
        ) : null}
      </View>

      <View
        style={{ width: RING, height: RING, marginTop: s.s8, alignItems: "center", justifyContent: "center" }}
      >
        <Svg width={RING} height={RING} style={{ position: "absolute" }}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={(RING - STROKE) / 2}
            stroke={hex.headLine}
            strokeWidth={STROKE}
            fill="none"
          />
          {total !== null ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={(RING - STROKE) / 2}
              stroke={hex.headInk}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={circumference * progress}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <Txt
          tone="headInk"
          tnum
          accessibilityRole="timer"
          accessibilityLabel={`${clock(shown)} ${total !== null ? "left" : "so far"}`}
          style={{ fontSize: 56, lineHeight: 64, fontWeight: "600", letterSpacing: -1.5 }}
        >
          {clock(shown)}
        </Txt>
        <Txt variant="meta" tone="headDim">
          {total !== null
            ? `left of ${formatDuration((task.length ?? 0) + extra)}`
            : "No length set, so this counts up"}
        </Txt>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s4, marginTop: s.s8 }}>
        <Press
          role="button"
          accessibilityLabel="Add 5 minutes"
          disabled={total === null}
          onPress={() => setExtra(extra + 5)}
          style={[pill, total === null ? { opacity: 0.4 } : null]}
        >
          <Icon icon={Plus} size={16} tone="headInk" />
          <Txt variant="label" tone="headInk">
            5 min
          </Txt>
        </Press>
        <Press
          role="button"
          accessibilityLabel={running ? "Pause" : "Resume"}
          onPress={() => setRunning(!running)}
          style={[round(72), { backgroundColor: c.headInk }]}
        >
          <Icon icon={running ? Pause : Play} size={28} color={hex.head} strokeWidth={2.25} />
        </Press>
        <Press
          role="button"
          accessibilityLabel="Done"
          onPress={() => {
            completeTask(task);
            goBack("/today");
          }}
          style={pill}
        >
          <Icon icon={Check} size={16} tone="headInk" />
          <Txt variant="label" tone="headInk">
            Done
          </Txt>
        </Press>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ alignSelf: "stretch", maxWidth: 480, width: "100%", gap: s.s2 }}>
        {step ? (
          <View style={panel}>
            <Txt variant="caption" tone="headDim">
              Next step
            </Txt>
            <Press
              role="button"
              accessibilityLabel={`Tick off: ${step.text}`}
              onPress={() => {
                commitHaptic();
                void updateTask({ id: task._id, note: step.tick() });
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 44 }}
            >
              <View
                style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.headDim }}
              />
              <Txt variant="body" tone="headInk" style={{ flex: 1 }}>
                {step.text}
              </Txt>
            </Press>
          </View>
        ) : null}
        {after && after.time !== null ? (
          <Txt variant="meta" tone="headDim" tnum style={{ textAlign: "center" }}>
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

const round = (size: number) => ({
  width: size,
  height: size,
  borderRadius: size / 2,
  alignItems: "center" as const,
  justifyContent: "center" as const,
});

const pill = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 6,
  minHeight: 44,
  paddingHorizontal: s.s4,
  borderRadius: 22,
  backgroundColor: c.headFill,
};

const panel = {
  padding: s.s4,
  borderRadius: r.card + 4,
  backgroundColor: c.headFill,
  gap: s.s1,
};
