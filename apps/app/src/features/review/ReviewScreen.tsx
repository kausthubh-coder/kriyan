// Review (b2.html?screen=review): a short end-of-day ritual. What got done, then each open
// thing one at a time (Tomorrow, Pick a day, Inbox, Let it go), a glance at tomorrow, and an
// optional "How did today feel?". It ends on "Day closed". Nothing is scored; nothing is
// "overdue". Swipe a card right for Tomorrow, left to let it go; the buttons do the same.

import { forwardRef, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, useWindowDimensions, View } from "react-native";
import Head from "expo-router/head";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Inbox,
  Moon,
  SquareCheck,
  Sunrise,
  X,
} from "lucide-react-native";
import { addDays, formatClock, startOfWeek } from "@kriyan/core/dates";
import { formatDate, formatDuration } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTodayView, useWeekView, type TaskView, type TodayView } from "@/data/views";
import { useFocusSummary } from "@/features/focus/focusSummary";
import { closeDayOnDevice } from "./closedDay";
import { deleteTask, moveTasks, skipTask } from "@/features/tasks/actions";
import { armHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { useIsPhone } from "@/theme/layout";
import { bold, c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { goBack, SplitScreen } from "@/ui/Screen";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { DayColumn } from "@/features/today/DayColumn";
import { Txt } from "@/ui/Txt";

type Step = "done" | "decide" | "tomorrow" | "feel" | "closed";
const STEPS: Step[] = ["done", "decide", "tomorrow", "feel"];
const FACES = ["Rough", "Meh", "Okay", "Good", "Great"] as const;

export function ReviewScreen() {
  const phone = useIsPhone();
  const view = useTodayView();
  const { today } = useClock();
  const tomorrow = addDays(today, 1);
  const week = useWeekView(startOfWeek(tomorrow));
  const [step, setStep] = useState<Step>("done");
  const [handled, setHandled] = useState<string[]>([]);
  const [feel, setFeel] = useState<number | null>(null);

  // The queue is fixed when the review starts, so handling one doesn't reshuffle the rest.
  const [queue, setQueue] = useState<TaskView[] | null>(null);
  if (view && queue === null) {
    setQueue([
      ...view.earlier,
      ...view.scheduled.filter((t) => !t.done && !t.event && !t.proposedBy && !t.projected),
      ...view.anytime,
    ]);
  }
  const open = (queue ?? []).filter((t) => !handled.includes(t._id));
  const done = view ? [...view.scheduled.filter((t) => t.done && !t.event), ...view.done] : [];
  const focus = useFocusSummary();
  const tomorrowDay = week?.days.find((d) => d.date === tomorrow);

  const handle = (t: TaskView) => {
    setHandled((h) => [...h, t._id]);
    if (open.length <= 1) setStep("tomorrow");
  };

  const habitsDone = view ? view.habits.filter((h) => h.doneToday) : [];
  const closeDay = () => {
    closeDayOnDevice(today);
    setStep("closed");
  };
  const index = STEPS.indexOf(step);
  return (
    <ReviewFrame day={view}>
      <View style={{ gap: s.s3 }}>
        {/* Phones lead with "‹ Today" (b2.html `.rvpg`); desktop keeps the sidebar, so the date
            chip stands alone. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
          {phone ? (
            <Press
              role="link"
              accessibilityLabel="Back to Today"
              onPress={() => goBack("/today")}
              hoverBg={null}
              scale={false}
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: 44,
                marginLeft: -s.s1,
                paddingRight: s.s1,
              }}
            >
              <Icon icon={ChevronLeft} size={20} tone="ink2" />
              <Txt variant="label" tone="ink2">
                Today
              </Txt>
            </Press>
          ) : null}
          <View
            style={{
              paddingHorizontal: s.s3,
              paddingVertical: s.s1,
              borderRadius: r.pill,
              backgroundColor: c.sunken,
            }}
          >
            <Txt variant="meta" tnum style={family("600")}>
              {formatDate(today)}
            </Txt>
          </View>
        </View>
        {step !== "closed" ? (
          <View
            accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}
            style={{ flexDirection: "row", gap: s.s2 }}
          >
            {STEPS.map((st, i) => (
              <View
                key={st}
                style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= index ? c.ink : c.line }}
              />
            ))}
          </View>
        ) : null}
      </View>

      {step === "done" ? (
        <View>
          {/* What got done and the time focused, from Focus sessions: no score, no percentage. */}
          <Txt variant="headline" heading={1} tone="ink3" style={[bold, { lineHeight: 36 }]}>
            Today you finished{" "}
            <Txt variant="headline" tnum>
              {plural(done.length, "task")}
            </Txt>
            {habitsDone.length ? (
              <>
                {" and "}
                <Txt variant="headline" tnum>
                  {plural(habitsDone.length, "habit")}
                </Txt>
              </>
            ) : null}
            {", and focused for "}
            <Txt variant="headline" tnum>
              {focus ? formatDuration(focus.today) : "…"}
            </Txt>
            .
          </Txt>
          <View style={{ marginTop: s.s6 }}>
            <SectionLabel title="Done" />
            {done.slice(0, 8).map((t) => (
              <DoneRow
                key={`${t._id}:${t.date}`}
                icon={SquareCheck}
                title={t.title}
                // Not the planned length: beside "focused for", it would read as time spent.
                right={null}
              />
            ))}
            {habitsDone.map((h) => (
              <DoneRow key={h._id} icon={CircleCheck} title={h.title} right={null} />
            ))}
            {done.length || habitsDone.length ? null : (
              <Txt variant="body" tone="ink2" style={{ marginTop: s.s2 }}>
                Nothing ticked off today. That happens; tomorrow is a fresh start.
              </Txt>
            )}
          </View>
          <FullButton
            label={open.length ? `Next: ${plural(open.length, "thing")} still open` : "Next: tomorrow"}
            onPress={() => setStep(open.length ? "decide" : "tomorrow")}
          />
        </View>
      ) : null}

      {step === "decide" ? (
        <View style={{ gap: s.s6 }}>
          <View style={{ gap: s.s2 }}>
            <Txt variant="headline" heading={1}>
              Still open
            </Txt>
            <Txt variant="body" tone="ink2" tnum>
              {(queue?.length ?? 0) - open.length + 1} of {queue?.length ?? 0}. Give each one a place, or let
              it go.
            </Txt>
          </View>
          {open[0] ? (
            <DecideCard
              key={open[0]._id}
              task={open[0]}
              next={open[1]}
              today={today}
              tomorrow={tomorrow}
              onDone={handle}
            />
          ) : null}
        </View>
      ) : null}

      {step === "tomorrow" ? (
        <View style={{ gap: s.s6 }}>
          <Txt variant="headline" heading={1} style={bold}>
            Tomorrow
          </Txt>
          {tomorrowDay ? (
            <View style={{ gap: s.s1 }}>
              <Txt variant="body" tone="ink2" style={{ marginBottom: s.s2 }}>
                {tomorrowDay.scheduled.length + tomorrowDay.anytime.length
                  ? `${tomorrowDay.scheduled.length} with a time, ${tomorrowDay.anytime.length} anytime.`
                  : "Nothing planned yet. A clear start."}
              </Txt>
              {tomorrowDay.scheduled.slice(0, 8).map((t) => (
                <View
                  key={t._id}
                  style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 32 }}
                >
                  <View
                    style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: spaceTone(t.color).dot }}
                  />
                  <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
                    {t.title}
                  </Txt>
                  <Txt variant="meta" tone="ink3" tnum>
                    {formatClock(t.time ?? 0)}
                  </Txt>
                </View>
              ))}
            </View>
          ) : null}
          <FullButton label="Looks good" onPress={() => setStep("feel")} />
        </View>
      ) : null}

      {step === "feel" ? (
        <View style={{ gap: s.s6 }}>
          <Txt variant="headline" heading={1} style={bold}>
            How did today feel?
          </Txt>
          <View role="radiogroup" style={{ flexDirection: "row", gap: s.s2, flexWrap: "wrap" }}>
            {FACES.map((f, i) => (
              <Press
                key={f}
                role="radio"
                aria-checked={feel === i}
                accessibilityLabel={f}
                onPress={() => setFeel(i)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: s.s4,
                  borderRadius: 22,
                  justifyContent: "center",
                  backgroundColor: feel === i ? c.ink : c.sunken,
                }}
              >
                <Txt variant="label" tone={feel === i ? "onInk" : "ink2"}>
                  {f}
                </Txt>
              </Press>
            ))}
          </View>
          <View style={{ gap: s.s2 }}>
            <FullButton label="Close the day" onPress={closeDay} />
            {feel === null ? (
              <Button variant="quiet" label="Skip" onPress={closeDay} style={{ alignSelf: "center" }} />
            ) : null}
          </View>
        </View>
      ) : null}

      {step === "closed" ? (
        <View style={{ alignItems: "center", gap: s.s3, paddingVertical: s.s12 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: c.sunken,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon icon={Moon} size={28} tone="ink2" />
          </View>
          <Txt variant="headline" heading={1} style={bold}>
            Day closed
          </Txt>
          <Txt variant="body" tone="ink2" style={{ textAlign: "center", maxWidth: 320 }}>
            {tomorrowDay?.scheduled[0]
              ? `Tomorrow starts at ${formatClock(tomorrowDay.scheduled[0].time ?? 0)} with ${tomorrowDay.scheduled[0].title}. The rest of tonight is yours.`
              : "The rest of tonight is yours."}
          </Txt>
          <FullButton label="Back to Today" onPress={() => goBack("/today")} />
        </View>
      ) : null}
    </ReviewFrame>
  );
}

/** B2's review column (`.col-in` at 560). */
const REVIEW_WIDTH = 560;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Phones draw the review without the large title (b2.html `.rvpg`): "‹ Today" and the date lead
 * instead. Desktop keeps the usual column.
 */
function ReviewFrame({ children, day }: { children: ReactNode; day: TodayView | undefined }) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { today, now } = useClock();
  if (!phone) {
    // B2: a 560 column centred beside the day, whose hours and what's next stay in view.
    return (
      <SplitScreen
        title="Close the day"
        columnWidth={REVIEW_WIDTH}
        right={width >= SPLIT_MIN_WIDTH && day ? <DayColumn view={day} today={today} now={now} /> : null}
      >
        <View style={{ gap: s.s6 }}>{children}</View>
      </SplitScreen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.raised }}>
      {Platform.OS === "web" ? (
        <Head>
          <title>Close the day | Kriyan</title>
        </Head>
      ) : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + s.s4,
          paddingHorizontal: s.s4,
          paddingBottom: insets.bottom + s.s16,
          gap: s.s6,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/** One thing done today (b2.html `.rvd`), with its length on the right. */
function DoneRow({ icon, title, right }: { icon: typeof SquareCheck; title: string; right: string | null }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: 48,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <Icon icon={icon} size={20} tone="ink2" />
      <Txt variant="body" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Txt>
      {right ? (
        <Txt variant="body" tone="ink3" tnum>
          {right}
        </Txt>
      ) : null}
    </View>
  );
}

/** The review's one way forward at each step (b2.html `.btn-full`): full width, solid ink. */
function FullButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={({ hovered }: { hovered?: boolean }) => ({
        alignSelf: "stretch",
        minHeight: 52,
        marginTop: s.s4,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: s.s4,
        borderRadius: r.card,
        backgroundColor: c.ink,
        opacity: hovered ? 0.92 : 1,
      })}
    >
      <Txt variant="subhead" tone="onInk">
        {label}
      </Txt>
    </Press>
  );
}

const COMMIT = 110;

/** One open thing, with four places to put it. Swipe right for Tomorrow, left to let it go. */
function DecideCard({
  task,
  next,
  today,
  tomorrow,
  onDone,
}: {
  task: TaskView;
  /** The one after it, which peeks out under the card. */
  next?: TaskView;
  today: string;
  tomorrow: string;
  onDone: (t: TaskView) => void;
}) {
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<View>(null);
  const x = useSharedValue(0);
  const armed = useSharedValue(0);

  const toTomorrow = () => {
    void moveTasks([task], tomorrow);
    onDone(task);
  };
  const letGo = () => {
    // A repeat skips this one occurrence; deleting it would end the whole series.
    if (task.repeat) void skipTask(task);
    else deleteTask(task);
    onDone(task);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      x.value = e.translationX;
      const side = e.translationX > COMMIT ? 1 : e.translationX < -COMMIT ? -1 : 0;
      if (side !== armed.value) {
        armed.value = side;
        if (side !== 0) scheduleOnRN(armHaptic);
      }
    })
    .onEnd(() => {
      if (armed.value === 1) {
        x.value = withTiming(500, { duration: 180 });
        scheduleOnRN(toTomorrow);
      } else if (armed.value === -1) {
        x.value = withTiming(-500, { duration: 180 });
        scheduleOnRN(letGo);
      } else x.value = withSpring(0, { damping: 22, stiffness: 300 });
      armed.value = 0;
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 40}deg` }],
  }));

  const when =
    task.date && task.date < today
      ? `From ${task.date === addDays(today, -1) ? "yesterday" : formatDate(task.date, today)}`
      : task.time !== null
        ? formatClock(task.time)
        : "Anytime";
  return (
    <View>
      {/* B2's card stack: the open thing on a tall filled card, the next one peeking under it. */}
      <View style={{ height: CARD_HEIGHT }}>
        {next ? (
          <View
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: r.sheet,
              backgroundColor: c.select,
              transform: [{ translateY: 14 }, { scale: 0.94 }],
            }}
          />
        ) : null}
        <GestureDetector gesture={pan}>
          <Animated.View
            accessibilityLabel={`${task.title}. Swipe right for tomorrow, left to let it go.`}
            style={[
              {
                position: "absolute",
                inset: 0,
                padding: s.s6,
                gap: s.s2,
                borderRadius: r.sheet,
                backgroundColor: c.sunken,
              },
              style,
            ]}
          >
            <Txt variant="body" tone="ink3" tnum>
              {[when, task.length ? formatDuration(task.length) : null, task.repeatText]
                .filter(Boolean)
                .join(" · ")}
            </Txt>
            <Txt variant="title" style={bold} numberOfLines={3}>
              {task.title}
            </Txt>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Icon icon={ChevronLeft} size={16} />
                <Txt variant="meta" tone="ink3">
                  Let it go
                </Txt>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <Txt variant="meta" tone="ink3">
                  Tomorrow
                </Txt>
                <Icon icon={ChevronRight} size={16} />
              </View>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
      {/* Four equal places to put it, two by two (b2.html `.rv-acts`). */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s3, marginTop: s.s4 }}>
        <Tile primary icon={Sunrise} label="Tomorrow" onPress={toTomorrow} />
        <Tile ref={pickRef} icon={CalendarDays} label="Pick a day" onPress={() => setPicking(true)} />
        <Tile
          icon={Inbox}
          label="Inbox"
          onPress={() => {
            void moveTasks([task], null);
            onDone(task);
          }}
        />
        <Tile icon={X} label={task.repeat ? "Skip this one" : "Let it go"} onPress={letGo} />
      </View>
      {/* Leaves this one where it is and moves on to the next. */}
      <Press
        role="button"
        accessibilityLabel="Keep it on today"
        onPress={() => onDone(task)}
        hoverBg={null}
        style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: s.s2 }}
      >
        <Txt variant="label" tone="ink2" style={{ textDecorationLine: "underline" }}>
          Keep it on today
        </Txt>
      </Press>
      <Popover open={picking} onClose={() => setPicking(false)} anchor={pickRef} title="Move to a day">
        <DayPicker
          value={task.date}
          today={today}
          allowNone={false}
          onPick={(date) => {
            setPicking(false);
            if (date) {
              void moveTasks([task], date);
              onDone(task);
            }
          }}
        />
      </Popover>
    </View>
  );
}

/** B2's tall stack (`.rv-stack`). */
const CARD_HEIGHT = 236;

/** One of the four places for an open thing: half the width, 56 tall, filled. */
const Tile = forwardRef<
  View,
  { icon: typeof Sunrise; label: string; onPress: () => void; primary?: boolean }
>(function Tile({ icon, label, onPress, primary }, ref) {
  return (
    <Press
      ref={ref}
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={({ hovered }) => ({
        // Two to a row: half the row less half the gap.
        flexBasis: "45%",
        flexGrow: 1,
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s.s2,
        paddingHorizontal: s.s3,
        borderRadius: r.box,
        backgroundColor: primary ? c.ink : hovered ? c.select : c.sunken,
        opacity: primary && hovered ? 0.92 : 1,
      })}
    >
      <Icon icon={icon} size={18} tone={primary ? "onInk" : "ink2"} />
      <Txt variant="subhead" tone={primary ? "onInk" : "ink"} numberOfLines={1}>
        {label}
      </Txt>
    </Press>
  );
});
