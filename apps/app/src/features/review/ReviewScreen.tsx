// Review (b2.html?screen=review): a short end-of-day ritual. What got done, then each open
// thing one at a time (Tomorrow, Pick a day, Inbox, Let it go), a glance at tomorrow, and an
// optional "How did today feel?". It ends on "Day closed". Nothing is scored; nothing is
// "overdue". Swipe a card right for Tomorrow, left to let it go; the buttons do the same.

import { Fragment, useRef, useState, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
import Head from "expo-router/head";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  CalendarDays,
  ChevronLeft,
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
import { useTodayView, useWeekView, type TaskView } from "@/data/views";
import { deleteTask, moveTasks, skipTask } from "@/features/tasks/actions";
import { armHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { goBack, Screen } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";

type Step = "done" | "decide" | "tomorrow" | "feel" | "closed";
const STEPS: Step[] = ["done", "decide", "tomorrow", "feel"];
const FACES = ["Rough", "Meh", "Okay", "Good", "Great"] as const;

export function ReviewScreen() {
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
  const focused = done.reduce((sum, t) => sum + (t.length ?? 0), 0);
  const tomorrowDay = week?.days.find((d) => d.date === tomorrow);

  const handle = (t: TaskView) => {
    setHandled((h) => [...h, t._id]);
    if (open.length <= 1) setStep("tomorrow");
  };

  const habitsDone = view ? view.habits.filter((h) => h.doneToday) : [];
  const index = STEPS.indexOf(step);
  return (
    <ReviewFrame>
      <View style={{ gap: s.s3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
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
          {done.length || habitsDone.length ? (
            <Txt variant="headline" heading={1} tone="ink3" style={{ lineHeight: 36 }}>
              Today you finished{" "}
              {[
                done.length ? plural(done.length, "task") : null,
                habitsDone.length ? plural(habitsDone.length, "habit") : null,
              ]
                .filter((x): x is string => x !== null)
                .map((x, i) => (
                  <Fragment key={x}>
                    {i ? " and " : null}
                    <Txt variant="headline" tnum>
                      {x}
                    </Txt>
                  </Fragment>
                ))}
              {focused ? (
                <>
                  {", "}
                  <Txt variant="headline" tnum>
                    {formatDuration(focused)}
                  </Txt>
                  {" of planned work"}
                </>
              ) : null}
              .
            </Txt>
          ) : (
            <View style={{ gap: s.s2 }}>
              <Txt variant="headline" heading={1}>
                Today, done
              </Txt>
              <Txt variant="body" tone="ink2">
                Some days are like that. What&apos;s left gets a place next.
              </Txt>
            </View>
          )}
          {done.length || habitsDone.length ? (
            <View style={{ marginTop: s.s6 }}>
              <SectionLabel title="Done" />
              {done.slice(0, 8).map((t) => (
                <DoneRow
                  key={`${t._id}:${t.date}`}
                  icon={SquareCheck}
                  title={t.title}
                  right={t.length ? formatDuration(t.length) : null}
                />
              ))}
              {habitsDone.map((h) => (
                <DoneRow key={h._id} icon={CircleCheck} title={h.title} right={null} />
              ))}
            </View>
          ) : null}
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
            <DecideCard key={open[0]._id} task={open[0]} today={today} tomorrow={tomorrow} onDone={handle} />
          ) : null}
          <Button variant="quiet" label="Keep the rest on today" onPress={() => setStep("tomorrow")} />
        </View>
      ) : null}

      {step === "tomorrow" ? (
        <View style={{ gap: s.s6 }}>
          <Txt variant="headline" heading={1}>
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
          <Txt variant="headline" heading={1}>
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
            <FullButton label="Close the day" onPress={() => setStep("closed")} />
            {feel === null ? (
              <Button
                variant="quiet"
                label="Skip"
                onPress={() => setStep("closed")}
                style={{ alignSelf: "center" }}
              />
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
          <Txt variant="headline" heading={1}>
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Phones draw the review without the large title (b2.html `.rvpg`): "‹ Today" and the date lead
 * instead. Desktop keeps the usual column.
 */
function ReviewFrame({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  if (!phone) return <Screen title="Close the day">{children}</Screen>;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
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
  today,
  tomorrow,
  onDone,
}: {
  task: TaskView;
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
      ? `From ${task.date === addDays(today, -1) ? "yesterday" : task.date}`
      : task.time !== null
        ? formatClock(task.time)
        : "Anytime";
  return (
    <View style={{ gap: s.s3 }}>
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityLabel={`${task.title}. Swipe right for tomorrow, left to let it go.`}
          style={[
            {
              padding: s.s4,
              gap: s.s1,
              minHeight: 120,
              borderRadius: r.card + 4,
              backgroundColor: c.raised,
              boxShadow: "var(--shadow-raised)",
              borderWidth: 1,
              borderColor: c.line,
            },
            style,
          ]}
        >
          <Txt variant="meta" tone="ink3" tnum>
            {[when, task.length ? formatDuration(task.length) : null, task.repeatText]
              .filter(Boolean)
              .join(" · ")}
          </Txt>
          <Txt variant="title">{task.title}</Txt>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt variant="caption" tone="ink3">
              ← Let it go
            </Txt>
            <Txt variant="caption" tone="ink3">
              Tomorrow →
            </Txt>
          </View>
        </Animated.View>
      </GestureDetector>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
        <Button variant="primary" icon={Sunrise} label="Tomorrow" onPress={toTomorrow} />
        <Button ref={pickRef} icon={CalendarDays} label="Pick a day" onPress={() => setPicking(true)} />
        <Button
          icon={Inbox}
          label="Inbox"
          onPress={() => {
            void moveTasks([task], null);
            onDone(task);
          }}
        />
        <Button icon={X} label={task.repeat ? "Skip this one" : "Let it go"} onPress={letGo} />
      </View>
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
