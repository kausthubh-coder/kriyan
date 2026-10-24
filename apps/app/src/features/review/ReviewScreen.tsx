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
import Svg, { Circle, Path } from "react-native-svg";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Inbox,
  Moon,
  Sparkles,
  Square,
  SquareCheck,
  X,
} from "lucide-react-native";
import { addDays, formatClock, startOfWeek } from "@kriyan/core/dates";
import { formatDate, formatDuration } from "@kriyan/core/format";
import { longestFree } from "@kriyan/core/layout";
import { useClock } from "@/data/time";
import { useTodayView, useWeekView, type TaskView, type TodayView } from "@/data/views";
import { useFocusSummary } from "@/features/focus/focusSummary";
import { closeDayOnDevice } from "./closedDay";
import { deleteTask, moveTasks, skipTask } from "@/features/tasks/actions";
import { armHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { useIsPhone, useType } from "@/theme/layout";
import { bold, c, family, hex, r, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { goBack, SplitScreen } from "@/ui/Screen";
import { SPLIT_MIN_WIDTH } from "@kriyan/core/tokens";
import { DayColumn } from "@/features/today/DayColumn";
import { Txt } from "@/ui/Txt";

type Step = "done" | "decide" | "tomorrow" | "feel" | "closed";
const STEPS: Step[] = ["done", "decide", "tomorrow", "feel"];
/** B2's faces (`FACES` in b2.html): the mouth of each, from a frown to an open laugh. */
const FACES = [
  ["Rough", "M8.2 16.6c1-1.5 2.3-2.2 3.8-2.2s2.8.7 3.8 2.2"],
  ["Meh", "M8.6 15.4h6.8"],
  ["Okay", "M8.6 14.8c1 .7 2.1 1.1 3.4 1.1s2.4-.4 3.4-1.1"],
  ["Good", "M8.2 14.2c1 1.6 2.3 2.4 3.8 2.4s2.8-.8 3.8-2.4"],
  ["Great", "M7.8 13.4h8.4c0 2.5-1.9 4.4-4.2 4.4s-4.2-1.9-4.2-4.4z"],
] as const;

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
      <View style={{ gap: s.s4 }}>
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
        {/* Day closed keeps all four filled (b2.html `.rv-steps`). */}
        <View
          accessibilityLabel={step === "closed" ? "All steps done" : `Step ${index + 1} of ${STEPS.length}`}
          style={{ flexDirection: "row", gap: s.s2 }}
        >
          {STEPS.map((st, i) => (
            <View
              key={st}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: step === "closed" || i <= index ? c.ink : c.line,
              }}
            />
          ))}
        </View>
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
        <View style={{ gap: s.s4 }}>
          <View style={{ gap: s.s1 }}>
            <Txt variant="headline" heading={1} style={bold}>
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
        <View>
          <View style={{ gap: s.s1 }}>
            <Txt variant="headline" heading={1} style={bold}>
              Tomorrow
            </Txt>
            <Txt variant="body" tone="ink3" tnum>
              {formatDate(tomorrow)}
            </Txt>
          </View>
          {tomorrowDay ? <TomorrowGlance day={tomorrowDay} /> : null}
          <FullButton label="Looks good" onPress={() => setStep("feel")} />
        </View>
      ) : null}

      {step === "feel" ? (
        <View>
          <View style={{ gap: s.s1 }}>
            <Txt variant="headline" heading={1} style={bold}>
              How did today feel?
            </Txt>
            <Txt variant="body" tone="ink3">
              One tap, or skip it.
            </Txt>
          </View>
          <View
            role="radiogroup"
            aria-label="How did today feel?"
            style={{ flexDirection: "row", justifyContent: "space-between", gap: s.s2, marginTop: s.s6 }}
          >
            {FACES.map(([label, mouth], i) => (
              <Press
                key={label}
                role="radio"
                aria-checked={feel === i}
                accessibilityLabel={label}
                onPress={() => setFeel(i)}
                hoverBg={null}
                style={({ hovered }: { hovered?: boolean }) => ({
                  flex: 1,
                  maxWidth: 64,
                  aspectRatio: 1,
                  minHeight: 52,
                  borderRadius: r.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: feel === i ? c.ink : hovered ? c.select : c.sunken,
                })}
              >
                <Face mouth={mouth} color={feel === i ? hex.onInk : hex.ink2} />
              </Press>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: s.s2 }}>
            <Txt variant="meta" tone="ink3">
              Rough
            </Txt>
            <Txt variant="meta" tone="ink3">
              Great
            </Txt>
          </View>
          <FullButton label="Close the day" onPress={closeDay} />
          <Press
            role="button"
            accessibilityLabel="Skip"
            onPress={closeDay}
            hoverBg={null}
            style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: s.s1 }}
          >
            <Txt variant="label" tone="ink2" style={{ textDecorationLine: "underline" }}>
              Skip
            </Txt>
          </Press>
        </View>
      ) : null}

      {step === "closed" ? (
        // B2's `.closed`: a tenth of the screen down, a 76 moon disc, then the line about tomorrow.
        <View style={{ alignItems: "center", paddingTop: s.s16 }}>
          <View
            style={{
              width: 76,
              height: 76,
              marginTop: s.s6,
              marginBottom: s.s4,
              borderRadius: r.pill,
              backgroundColor: c.sunken,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon icon={Moon} size={32} tone="ink" />
          </View>
          <Txt variant="headline" heading={1} style={bold}>
            Day closed
          </Txt>
          <Txt variant="body" tone="ink3" style={{ textAlign: "center", maxWidth: 320, marginTop: s.s2 }}>
            {tomorrowDay?.scheduled[0]
              ? `Tomorrow starts at ${formatClock(tomorrowDay.scheduled[0].time ?? 0)} with ${tomorrowDay.scheduled[0].title}.`
              : "Nothing planned for tomorrow yet."}{" "}
            The rest of tonight is yours.
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

type WeekDay = NonNullable<ReturnType<typeof useWeekView>>["days"][number];

/** The free-stretch note looks at a waking day's middle, like B2's (09:00 to 21:00). */
const GLANCE_FROM = 9 * 60;
const GLANCE_TO = 21 * 60;

/**
 * Tomorrow at a glance (b2.html review step 2): what's planned in one line, the longest free
 * stretch as a filled note, then the timed things and how many are anytime.
 */
function TomorrowGlance({ day }: { day: WeekDay }) {
  const roles = useType();
  const all = [...day.scheduled, ...day.anytime].filter((t) => !t.done && !t.proposedBy);
  const events = all.filter((t) => t.event).length;
  const tasks = all.length - events;
  const planned = [events ? plural(events, "event") : null, tasks ? plural(tasks, "task") : null]
    .filter(Boolean)
    .join(" and ");
  const timed = day.scheduled.filter((t) => !t.done && !t.proposedBy);
  const stretch = timed.length
    ? longestFree(
        timed.map((t) => ({ id: t._id, start: t.time ?? 0, length: t.length ?? undefined })),
        GLANCE_FROM,
        GLANCE_TO,
      )
    : null;
  const note = !timed.length
    ? "Tomorrow is open. Start with the thing you'd most like done."
    : stretch
      ? `Your longest free stretch tomorrow is ${formatClock(stretch[0])} to ${formatClock(stretch[1])}, good for one deep block.`
      : "Tomorrow has no free half hour between 09:00 and 21:00.";
  const anytime = day.anytime.filter((t) => !t.done && !t.proposedBy).length;
  return (
    <View>
      <Txt variant="title" style={{ marginTop: s.s2 }}>
        <Txt variant="title" tone="ink3">
          You have{" "}
        </Txt>
        {planned || "nothing planned yet"}
        <Txt variant="title" tone="ink3">
          .
        </Txt>
      </Txt>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: s.s3,
          marginTop: s.s3,
          paddingVertical: s.s3,
          paddingHorizontal: s.s4,
          borderRadius: r.box,
          backgroundColor: c.sunken,
        }}
      >
        {/* Centred on the note's first line. */}
        <View style={{ height: roles.body.lineHeight, justifyContent: "center" }}>
          <Icon icon={Sparkles} size={18} tone="ink" />
        </View>
        <Txt variant="body" style={{ flex: 1 }}>
          {note}
        </Txt>
      </View>
      {timed.slice(0, 5).map((t) => (
        <DoneRow
          key={t._id}
          icon={t.event ? CalendarDays : Square}
          title={t.title}
          right={formatClock(t.time ?? 0)}
        />
      ))}
      {anytime ? <DoneRow icon={Clock} title={`${plural(anytime, "thing")} anytime`} right={null} /> : null}
    </View>
  );
}

/** One face in "How did today feel?", drawn like B2's: a ring, two eyes and the mouth. */
function Face({ mouth, color }: { mouth: string; color: string }) {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" aria-hidden focusable={false}>
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} fill="none" />
      <Circle cx={9} cy={10} r={0.9} fill={color} />
      <Circle cx={15} cy={10} r={0.9} fill={color} />
      <Path
        d={mouth}
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

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
        {/* B2's review header sits 40 from the top, a step below the split frame's 24. */}
        <View style={{ gap: s.s4, paddingTop: s.s4 }}>{children}</View>
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
          gap: s.s4,
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
      <Icon icon={icon} size={18} tone="ink2" />
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
        <Tile primary icon={ArrowRight} label="Tomorrow" onPress={toTomorrow} />
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
  { icon: typeof ArrowRight; label: string; onPress: () => void; primary?: boolean }
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
