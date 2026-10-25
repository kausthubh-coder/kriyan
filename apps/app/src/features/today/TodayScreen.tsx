// Today, v5 (docs/design/v5/prototype.html): Joi's white page with the big day and the week, the
// pull-down summary, "To fit in", and the day as time blocks from Wake up to Wind down (or a list,
// one line per item, when Settings says so). Phones float three buttons at the foot: Menu, Add,
// and Month (on another day, back to today); a tap opens Joi's floating card. Desktop puts the
// day in a centre column under quick add and a panel on the right: the summary, the month and
// what's due in the next 7 days, or the selected item with its tiles.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, RefreshControl, ScrollView, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, CalendarDays, ChevronRight, Plus, Settings } from "lucide-react-native";
import { addDays, diffDays, formatClock } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import { dueDayWord, nextGap } from "@kriyan/core/today";
import { createStore } from "@/data/store";
import { useClock } from "@/data/time";
import { useDue } from "@/data/views";
import { quickAddTarget, selection } from "@/features/shell/context";
import { checkHabit, completeTask } from "@/features/tasks/actions";
import { QuickAdd, whenWords, type QuickAddHandle } from "@/features/tasks/QuickAdd";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, scheme, shadows } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Skeleton } from "@/ui/bits";
import { showToast } from "@/ui/toast";
import { Blocks, type BlockHandlers } from "./Blocks";
import { FillCard, HabitCard, ItemCard, RoutineCard, type FillCandidate } from "./Cards";
import { Curtain, Sentence } from "./Curtain";
import { DayList } from "./DayList";
import { MENU_ROUTE, SETTINGS_ROUTE, tickRoutinePart } from "./links";
import { MonthCard } from "./MonthCard";
import { FloatCard, T } from "./parts";
import { FitIn, Top } from "./Top";
import { useDay, type Day } from "./useDay";

/** The day Today shows; null follows today. It outlives a trip to a task and back. */
export const shownDay = createStore<string | null>(null);

type Sheet =
  | { kind: "curtain" }
  | { kind: "month" }
  | { kind: "fill"; from: number; to: number; preselect: string | null }
  | { kind: "habit"; id: string }
  | { kind: "routine"; id: string };

/** The desktop panel's width (v5 `.panel`). */
const PANEL = 360;

export function TodayScreen() {
  const { today } = useClock();
  const phone = useIsPhone();
  const params = useLocalSearchParams<{ day?: string }>();
  const stored = shownDay.useValue((d) => d);
  const day = stored ?? today;
  const data = useDay(day);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const close = useCallback(() => setSheet(null), []);
  const setDay = useCallback((d: string) => shownDay.set(d === today ? null : d), [today]);

  // `/?day=2026-10-28` opens that day (a link from elsewhere).
  useEffect(() => {
    if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) setDay(params.day);
  }, [params.day, setDay]);

  const handlers: BlockHandlers | null = data
    ? {
        open: (id) => {
          const src = data.sources.get(id);
          if (!src) return;
          if (!phone) {
            selection.set({ taskId: id });
            return;
          }
          if (src.type === "task") router.push(`/task/${id}?date=${day}`);
          else setSheet({ kind: src.type, id });
        },
        fill: (from, to) => setSheet({ kind: "fill", from, to, preselect: null }),
        review: () => router.push("/review"),
        anchor: () => router.push(SETTINGS_ROUTE),
        tickRoutinePart: (routine, index, done) => tickRoutinePart(routine, index, day, done),
        tickHabit: (id) => {
          const src = data.sources.get(id);
          if (src?.type === "habit") void checkHabit(src.habit, day, !src.habit.doneToday);
        },
      }
    : null;

  const fitPick = (id: string) => {
    if (!data) return;
    const gap = nextGap(data.busy, data.dayStart, data.dayEnd, data.now);
    if (gap) setSheet({ kind: "fill", from: gap[0], to: gap[1], preselect: id });
    else showToast("No free time left today. Try tomorrow.");
  };

  useDesktopKeys(!phone, day, setDay, data);

  const sheets = data ? (
    <Sheets sheet={sheet} close={close} data={data} today={today} setDay={setDay} center={!phone} />
  ) : null;

  const content =
    data && handlers ? (
      <>
        <FitIn chips={data.chips} onPick={fitPick} />
        {data.settings.todayLayout === "list" ? (
          <View style={{ marginTop: s.s3 }}>
            <DayList day={data} on={handlers} />
          </View>
        ) : (
          <View style={{ marginLeft: phone ? -s.s6 : -s.s8, marginRight: phone ? -s.s4 : -s.s4 }}>
            <Blocks day={data} on={handlers} />
          </View>
        )}
      </>
    ) : (
      <TodaySkeleton />
    );

  if (!phone)
    return (
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: s.s16 }}>
          <View
            style={{
              width: "100%",
              maxWidth: 640,
              alignSelf: "center",
              paddingHorizontal: s.s8,
              paddingTop: s.s8,
            }}
          >
            <Top day={day} today={today} onSummary={() => setSheet({ kind: "curtain" })} onPick={setDay} />
            <DeskAdd day={day} today={today} />
            {content}
          </View>
        </ScrollView>
        <RightPanel data={data} day={day} today={today} setDay={setDay} />
        {sheets}
      </View>
    );

  return (
    <PhoneToday
      day={day}
      today={today}
      onSummary={() => setSheet({ kind: "curtain" })}
      setDay={setDay}
      onMonth={() => setSheet({ kind: "month" })}
      overlay={sheets}
    >
      {content}
    </PhoneToday>
  );
}

function PhoneToday({
  day,
  today,
  onSummary,
  setDay,
  onMonth,
  overlay,
  children,
}: {
  day: string;
  today: string;
  onSummary: () => void;
  setDay: (d: string) => void;
  onMonth: () => void;
  /** The sheets, over the buttons. */
  overlay: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [pulling, setPulling] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + s.s6,
          paddingHorizontal: s.s6,
          paddingBottom: 160 + insets.bottom,
        }}
        {...(Platform.OS === "web"
          ? {}
          : {
              // Pull down at the top for the summary (Joi's curtain).
              refreshControl: (
                <RefreshControl
                  refreshing={pulling}
                  onRefresh={() => {
                    setPulling(true);
                    onSummary();
                    setTimeout(() => setPulling(false), 300);
                  }}
                />
              ),
            })}
      >
        <Top day={day} today={today} onSummary={onSummary} onPick={setDay} />
        {children}
      </ScrollView>
      {/* The page fades out under the buttons (v5 `.fade`). */}
      <View
        pointerEvents="none"
        style={
          {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 140 + insets.bottom,
            experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${c.bg} 62%)`,
          } as object
        }
      />
      <View
        role="navigation"
        aria-label="Main"
        style={{
          position: "absolute",
          left: s.s6,
          right: s.s6,
          bottom: s.s8 + insets.bottom,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <RoundButton label="Menu" icon={Settings} onPress={() => router.push(MENU_ROUTE)} />
        <RoundButton
          label="Add"
          icon={Plus}
          wide
          onPress={() => router.push(day === today ? "/add" : { pathname: "/add", params: { date: day } })}
        />
        {day === today ? (
          <RoundButton label="Month" icon={CalendarDays} onPress={onMonth} />
        ) : (
          <RoundButton label="Back to today" icon={ArrowLeft} onPress={() => setDay(today)} />
        )}
      </View>
      {overlay}
    </View>
  );
}

function RoundButton({
  label,
  icon,
  onPress,
  wide,
}: {
  label: string;
  icon: typeof Plus;
  onPress: () => void;
  wide?: boolean;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      rippleRadius={29}
      style={{
        height: 58,
        width: wide ? 108 : 58,
        borderRadius: 29,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.raised,
        boxShadow: shadows.overlay,
      }}
    >
      <Icon icon={icon} size={wide ? 26 : 24} tone="ink3" strokeWidth={2.25} />
    </Press>
  );
}

/** Desktop's quick add under the week (v5 `.qadd`): N focuses it. */
function DeskAdd({ day, today }: { day: string; today: string }) {
  const ref = useRef<QuickAddHandle>(null);
  useFocusEffect(
    useCallback(() => {
      quickAddTarget.set({ focus: () => ref.current?.focus() });
      return () => quickAddTarget.set(null);
    }, []),
  );
  return (
    <View style={{ marginTop: s.s4 }}>
      <QuickAdd
        ref={ref}
        variant="inline"
        defaultDate={day}
        placeholder={`Add to ${formatDate(day, today)}, like “HW21 due thu 23:59 #school”`}
      />
    </View>
  );
}

function Sheets({
  sheet,
  close,
  data,
  today,
  setDay,
  center,
}: {
  sheet: Sheet | null;
  close: () => void;
  data: Day;
  today: string;
  setDay: (d: string) => void;
  center: boolean;
}) {
  const soon = useDue(addDays(data.day, 1), addDays(data.day, 4));
  if (!sheet) return null;
  if (sheet.kind === "curtain") return <Curtain open onClose={close} today={today} parts={data.sentence} />;
  if (sheet.kind === "month")
    return (
      <FloatCard open onClose={close} label="Month" center={center}>
        <MonthCard
          value={data.day}
          today={today}
          onPick={(d) => {
            close();
            setDay(d);
          }}
        />
      </FloatCard>
    );
  if (sheet.kind === "fill") {
    const fromChips: FillCandidate[] = data.chips.map(({ item, note }) => ({
      id: item.id,
      title: item.title,
      note,
      date: item.date,
      time: item.time,
      length: item.length,
    }));
    const seen = new Set(fromChips.map((x) => x.id));
    const dueSoon: FillCandidate[] = (soon?.due ?? [])
      .filter((t) => !seen.has(t._id) && t.time === null && !t.event)
      .map((t) => ({
        id: t._id,
        title: t.title,
        note: `due ${t.deadline ? dueDayWord(t.deadline, data.day) : ""}${t.dueTime !== null ? ` ${formatClock(t.dueTime)}` : ""}`,
        date: t.date,
        time: t.time,
        length: t.length,
      }));
    return (
      <FloatCard open onClose={close} label="Fill free time" center={center}>
        <FillCard
          from={sheet.from}
          to={sheet.to}
          day={data.day}
          candidates={[...fromChips, ...dueSoon]}
          preselect={sheet.preselect}
          onClose={close}
        />
      </FloatCard>
    );
  }
  const src = data.sources.get(sheet.id);
  if (sheet.kind === "habit" && src?.type === "habit")
    return (
      <FloatCard open onClose={close} label={src.habit.title} center={center}>
        <HabitCard habit={src.habit} day={data.day} onClose={close} />
      </FloatCard>
    );
  if (sheet.kind === "routine" && src?.type === "routine")
    return (
      <FloatCard open onClose={close} label={src.routine.title} center={center}>
        <RoutineCard routine={src.routine} habits={data.view.habits} day={data.day} onClose={close} />
      </FloatCard>
    );
  return null;
}

/** Desktop's right panel: the selected item, or the summary, the month and what's due soon. */
function RightPanel({
  data,
  day,
  today,
  setDay,
}: {
  data: Day | undefined;
  day: string;
  today: string;
  setDay: (d: string) => void;
}) {
  const selected = selection.useValue((st) => st.taskId);
  const src = selected && data ? data.sources.get(selected) : undefined;
  const week = useDue(day, addDays(day, 6));
  const unselect = () => selection.set({ taskId: null });
  return (
    <View
      role="complementary"
      aria-label={src ? "Details" : "This week"}
      style={{ width: PANEL, borderLeftWidth: 1, borderLeftColor: c.line, backgroundColor: c.bg }}
    >
      <ScrollView contentContainerStyle={{ padding: s.s6, paddingBottom: s.s12 }}>
        {src ? (
          <View>
            <Press
              role="button"
              accessibilityLabel="Close details"
              onPress={unselect}
              style={{
                alignSelf: "flex-end",
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.sunken,
                marginBottom: -s.s6,
                zIndex: 1,
              }}
            >
              <Icon icon={ChevronRight} size={16} tone="ink2" />
            </Press>
            {src.type === "task" ? (
              <ItemCard
                key={src.task._id}
                id={src.task._id}
                day={src.task.date ?? day}
                panel
                onClose={unselect}
                onEdit={() => router.push(`/task/${src.task._id}?edit=1`)}
              />
            ) : src.type === "habit" ? (
              <HabitCard habit={src.habit} day={day} onClose={unselect} panel />
            ) : (
              <RoutineCard
                routine={src.routine}
                habits={data?.view.habits ?? []}
                day={day}
                onClose={unselect}
                panel
              />
            )}
          </View>
        ) : (
          <View>
            <View
              // Black on the white page; on dark's black page it lifts to the header's fill.
              style={{
                borderRadius: r.box,
                backgroundColor: scheme === "dark" ? c.headFill : c.head,
                padding: s.s6,
              }}
            >
              {data ? (
                <Sentence
                  parts={data.sentence}
                  style={{ fontSize: 20, lineHeight: 28, letterSpacing: -0.3 }}
                />
              ) : null}
            </View>
            <View style={{ marginTop: s.s6 }}>
              <MonthCard value={day} today={today} onPick={setDay} compact />
            </View>
            <View style={{ marginTop: s.s6 }}>
              <T s="strong">Due in the next 7 days</T>
              {week && !week.due.length ? (
                <T s="row" tone="ink3" extra={{ textAlign: "center", paddingVertical: s.s6 }}>
                  Nothing due.
                </T>
              ) : null}
              {week
                ? Array.from({ length: 7 }, (_, i) => addDays(day, i)).map((d) => {
                    const items = week.due.filter((t) => t.deadline === d);
                    if (!items.length) return null;
                    return (
                      <View key={d} style={{ marginTop: s.s3 }}>
                        <T s="small" tone="ink3" extra={{ marginBottom: s.s1 }}>
                          {d === today ? "Today" : formatDate(d, today)}
                        </T>
                        {items.map((t) => (
                          <Press
                            key={t._id}
                            role="button"
                            accessibilityLabel={`Open ${t.title}`}
                            onPress={() => {
                              if (diffDays(t.date ?? d, day) !== 0) setDay(t.date ?? d);
                              selection.set({ taskId: t._id });
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: s.s3,
                              minHeight: 40,
                              borderRadius: r.ctl,
                            }}
                          >
                            <View
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 6,
                                borderWidth: 2,
                                borderColor: c.lineStrong,
                              }}
                            />
                            <T s="body" lines={1} extra={{ flex: 1 }}>
                              {t.title}
                            </T>
                            {t.dueTime !== null ? (
                              <T s="body" tone="ink3" tnum>
                                {formatClock(t.dueTime)}
                              </T>
                            ) : null}
                          </Press>
                        ))}
                      </View>
                    );
                  })
                : null}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Desktop keys on Today: ← and → change the day, T back to today, E edits, X ticks a habit. */
function useDesktopKeys(active: boolean, day: string, setDay: (d: string) => void, data: Day | undefined) {
  const ref = useRef({ day, data });
  useEffect(() => {
    ref.current = { day, data };
  }, [day, data]);
  useFocusEffect(
    useCallback(() => {
      if (!active || Platform.OS !== "web") return;
      const onKey = (e: KeyboardEvent) => {
        const el = e.target as HTMLElement | null;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        const { day: d, data: now } = ref.current;
        const selected = selection.get().taskId;
        if (e.key === "ArrowLeft") setDay(addDays(d, -1));
        else if (e.key === "ArrowRight") setDay(addDays(d, 1));
        else if (e.key === "t" || e.key === "T") shownDay.set(null);
        else if ((e.key === "e" || e.key === "E") && selected) {
          const src = now?.sources.get(selected);
          if (src?.type === "task") router.push(`/task/${selected}?edit=1`);
        } else if ((e.key === "x" || e.key === "X") && selected) {
          const src = now?.sources.get(selected);
          if (src?.type === "habit") void checkHabit(src.habit, d, !src.habit.doneToday);
          // Tasks: the shell's X ticks the selected row.
          else if (
            src?.type === "task" &&
            !src.task.done &&
            !document.querySelector(`[data-testid="task-${selected}"]`)
          )
            completeTask(src.task);
        } else return;
        e.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [active, setDay]),
  );
}

function TodaySkeleton() {
  return (
    <View testID="skeleton" aria-busy style={{ gap: s.s4, marginTop: s.s6 }}>
      <Skeleton width="100%" height={72} style={{ borderRadius: r.box }} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width="100%" height={58 + i * 24} style={{ borderRadius: r.box }} />
      ))}
    </View>
  );
}

export { whenWords };
