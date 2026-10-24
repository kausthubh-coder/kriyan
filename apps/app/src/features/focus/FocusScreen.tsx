// Focus (b2.html?screen=focus): one task, a ring that fills as its time passes with a red dot
// at its head, the task's next step, and what comes after. Dark in both schemes, like Tiimo's
// focus. A task with no length counts up instead; Kriyan never invents how long something
// takes. The time spent is recorded (tasks.logFocus) when the session ends: Done, Back,
// leaving the screen, or the app going to the background.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import Svg, { Circle, Path } from "react-native-svg";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTaskDoc, useTodayView } from "@/data/views";
import { completeTask } from "@/features/tasks/actions";
import { commitHaptic } from "@/features/tasks/haptics";
import { nextStep, useSaveSteps } from "@/features/tasks/steps";
import { bold, c, family, hex, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { LightStatusBar } from "@/ui/statusBar";
import { Txt } from "@/ui/Txt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Play } from "lucide-react-native";
import { Icon } from "@/ui/Icon";

const RING = 280;
const STROKE = 14;
/** B2 paints the ring a little inside its 280 box (radius 126, 266 across). */
const RADIUS = 126;
const PLAY = 76;

export function FocusScreen({ id }: { id: Id<"tasks"> }) {
  const task = useTaskDoc(id);
  const day = useTodayView();
  const { now, today } = useClock();
  const insets = useSafeAreaInsets();
  const saveSteps = useSaveSteps(id);
  const session = useFocusSession(id, today);
  const { running, elapsed } = session;
  const [extra, setExtra] = useState(0);

  const total = task?.length ? (task.length + extra) * 60 : null;
  const left = total !== null ? Math.max(0, total - elapsed) : null;
  const shown = left ?? elapsed;
  const progress = total ? Math.min(1, elapsed / total) : 0;
  const step = nextStep(task?.steps);
  // What comes after this task ends (or starts, without a length); an untimed task, after now.
  const endsAt = task?.time != null ? Math.max(now, task.time + (task.length ?? 0)) : now;
  const after = useMemo(
    () =>
      day?.scheduled.find(
        (t) => !t.done && !t.proposedBy && t._id !== id && t.time !== null && t.time >= endsAt,
      ) ?? null,
    [day, id, endsAt],
  );

  if (!task) return <View style={{ flex: 1, backgroundColor: c.night }} />;
  const circumference = 2 * Math.PI * RADIUS;
  // The dot rides the head of the arc, which starts at 12 o'clock.
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const end = task.time != null && task.length ? task.time + task.length : null;
  const hasSteps = Boolean(task.steps?.length);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.night,
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
          accessibilityLabel="Back to Today"
          onPress={() => {
            session.end();
            router.navigate("/today");
          }}
          hoverBg={null}
          style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: 44, paddingRight: s.s2 }}
        >
          <Icon icon={ChevronLeft} size={22} tone="headInk" />
          <Txt variant="label" tone="headInk">
            Today
          </Txt>
        </Press>
        <Txt variant="meta" tone="headDim" style={family("600")}>
          Focus
        </Txt>
      </View>

      <View style={{ alignItems: "center", gap: s.s1, marginTop: s.s2, maxWidth: 480 }}>
        <Txt variant="headline" tone="headInk" heading={1} style={[bold, { textAlign: "center" }]}>
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
            stroke={hex.headLine}
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
          onPress={session.toggle}
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
          {/* B2's marks: a solid play, a pause of two plain strokes. */}
          {running ? (
            <Svg width={28} height={28} viewBox="0 0 24 24" aria-hidden focusable={false}>
              <Path
                d="M8.5 5.5v13M15.5 5.5v13"
                stroke={hex.night}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
              />
            </Svg>
          ) : (
            <Play size={28} color={hex.night} fill={hex.night} aria-hidden focusable={false} />
          )}
        </Press>
        <Press
          role="button"
          accessibilityLabel="Done"
          onPress={() => {
            session.end();
            completeTask(task);
            router.navigate("/today");
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
            accessibilityLabel={`Tick off: ${step.step.title}`}
            onPress={() => {
              commitHaptic();
              saveSteps((task.steps ?? []).map((st, i) => (i === step.index ? { ...st, done: true } : st)));
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
              {step.step.title}
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

/**
 * The session's clock and its record. Only running time counts. Each end point (Done, Back,
 * leaving, the background) records the time since the last record, so a session that comes
 * back from the background and ends later is never counted twice.
 */
function useFocusSession(taskId: Id<"tasks">, today: string) {
  const logFocus = useMutation(api.tasks.logFocus);
  const [running, setRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  /** Seconds from earlier runs, before the last pause. */
  const banked = useRef(0);
  /** When the current run started, or null while paused. */
  const runStart = useRef<number | null>(null);
  /** Seconds already recorded. */
  const logged = useRef(0);
  const day = useRef(today);
  useEffect(() => {
    day.current = today;
  }, [today]);
  // The clock starts when the screen opens.
  useEffect(() => {
    runStart.current = Date.now();
  }, []);

  const seconds = useCallback(
    () => banked.current + (runStart.current === null ? 0 : (Date.now() - runStart.current) / 1000),
    [],
  );

  const record = useCallback(() => {
    const delta = seconds() - logged.current;
    // The server rounds to whole minutes; under half a minute stays for the next record.
    if (delta < 30) return;
    logged.current += delta;
    void logFocus({ taskId, minutes: delta / 60, date: day.current }).catch(() => undefined);
  }, [logFocus, taskId, seconds]);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setElapsed(Math.floor(seconds())), 250);
    return () => clearInterval(tick);
  }, [running, seconds]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") record();
    });
    return () => {
      sub.remove();
      record();
    };
  }, [record]);

  const toggle = () => {
    if (runStart.current === null) runStart.current = Date.now();
    else {
      banked.current += (Date.now() - runStart.current) / 1000;
      runStart.current = null;
    }
    setElapsed(Math.floor(seconds()));
    setRunning(runStart.current !== null);
  };

  /** Stops the clock and records what's left. */
  const end = () => {
    if (runStart.current !== null) banked.current += (Date.now() - runStart.current) / 1000;
    runStart.current = null;
    setRunning(false);
    record();
  };

  return { running, elapsed, toggle, end };
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
  borderRadius: r.box,
  backgroundColor: c.headFill,
  gap: s.s1,
};

const label = { ...family("600"), textTransform: "uppercase" as const, letterSpacing: 0.6 };
