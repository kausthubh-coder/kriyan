// "Let's do the math" in onboarding: the hours of a week a person gets to choose, from when
// their day starts and ends and how many hours a weekday goes to classes or work. Everyday
// things (meals, getting ready, travel) take a flat two hours a day.

export const EVERYDAY_MINUTES = 120;

export interface WeekMath {
  /** Hours awake across 7 days. */
  awake: number;
  /** Hours of classes or work across 5 weekdays. */
  busy: number;
  everyday: number;
  /** What's left to plan, never below zero. */
  yours: number;
}

export function weekMath(dayStart: number, dayEnd: number, busyHoursPerWeekday: number): WeekMath {
  const awake = Math.round(((dayEnd - dayStart) * 7) / 60);
  const busy = Math.round(busyHoursPerWeekday * 5);
  const everyday = Math.round((EVERYDAY_MINUTES * 7) / 60);
  return { awake, busy, everyday, yours: Math.max(0, awake - busy - everyday) };
}
