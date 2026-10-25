// Goals and habits (docs/design/v5 prototype `page("goals")`): the days left in the year and
// the weeks left in the semester, then each goal as a card (its bar, where it stands, a trend
// line, what feeds it, quick log buttons), then habits and routines in v5 rows.

import { useState } from "react";
import { View } from "react-native";
import { diffDays, parts } from "@kriyan/core/dates";
import { useClock } from "@/data/time";
import { useProfile, useProgressView, useSpaces, type Profile } from "@/data/views";
import { AddLine, Page, PageLabel } from "@/features/shell/Page";
import { s } from "@/theme/tokens";
import { Skeleton } from "@/ui/bits";
import { Txt } from "@/ui/Txt";
import { GoalCard } from "./GoalCard";
import { useRoutines } from "./goalData";
import { AddGoal } from "./Goals";
import { AddHabit, HabitRow, RoutineRow } from "./Habits";

/** "66 days left in 2026, 6 weeks of semester": how much time is left, without a score. */
function timeLeft(today: string, profile: Profile | undefined): string {
  const [year] = parts(today);
  const days = diffDays(`${year}-12-31`, today);
  const out = [`${days} ${days === 1 ? "day" : "days"} left in ${year}`];
  const end = profile?.semesterEnd;
  if (end && end >= today) {
    const weeks = Math.ceil(diffDays(end, today) / 7);
    out.push(`${weeks} ${weeks === 1 ? "week" : "weeks"} of semester`);
  }
  return out.join(", ");
}

export function ProgressScreen() {
  const view = useProgressView();
  const profile = useProfile();
  const spaces = useSpaces();
  const routines = useRoutines();
  const { today } = useClock();
  const [addingGoal, setAddingGoal] = useState(false);
  const [addingHabit, setAddingHabit] = useState(false);
  const colorOf = new Map((spaces ?? []).map((sp) => [sp._id as string, sp.color]));
  return (
    <Page tabTitle="Goals and habits" title="Goals and habits" sub={timeLeft(today, profile)}>
      {view === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4, paddingTop: s.s6 }}>
          <Skeleton width="100%" height={160} />
          <Skeleton width="60%" height={16} />
        </View>
      ) : (
        <>
          <PageLabel>Goals</PageLabel>
          {view.goals.map((g) => (
            <GoalCard
              key={g._id}
              goal={g}
              color={g.spaceId ? (colorOf.get(g.spaceId) ?? null) : null}
              today={today}
            />
          ))}
          {view.goals.length === 0 && !addingGoal ? (
            <Txt variant="body" tone="ink3" style={{ paddingTop: s.s3 }}>
              A goal is a target with a date: money to save, a weight, a number of tasks. Kriyan shows where
              you stand and what feeds it.
            </Txt>
          ) : null}
          {addingGoal ? (
            <View style={{ paddingTop: s.s3 }}>
              <AddGoal today={today} onDone={() => setAddingGoal(false)} />
            </View>
          ) : (
            <AddLine label="Add a goal" onPress={() => setAddingGoal(true)} />
          )}
          <PageLabel>Habits and routines</PageLabel>
          {routines.map((rt) => (
            <RoutineRow key={rt._id} routine={rt} />
          ))}
          {view.habits.map((h) => (
            <HabitRow key={h._id} habit={h} today={today} />
          ))}
          {view.habits.length === 0 && routines.length === 0 && !addingHabit ? (
            <Txt variant="body" tone="ink3" style={{ paddingTop: s.s3 }}>
              A habit has a weekly target, like the gym 3 times a week. Missing a day never resets anything.
            </Txt>
          ) : null}
          {addingHabit ? (
            <View style={{ paddingTop: s.s3 }}>
              <AddHabit onDone={() => setAddingHabit(false)} />
            </View>
          ) : (
            <AddLine label="Add a habit" onPress={() => setAddingHabit(true)} />
          )}
        </>
      )}
    </Page>
  );
}
