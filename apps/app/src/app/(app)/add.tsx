import { useLocalSearchParams } from "expo-router";
import { isCivilDate } from "@kriyan/core/dates";
import { parseTask } from "@kriyan/core/parse";
import { useClock } from "@/data/time";
import { AddSheet } from "@/features/tasks/AddSheet";
import { whenWords } from "@/features/tasks/QuickAdd";
import { goBack } from "@/ui/Screen";

/** `/add?date=2026-10-24&time=13:30` (a free stretch's "+ 13:30") starts with those words. */
export default function AddRoute() {
  const { date, time } = useLocalSearchParams<{ date?: string; time?: string }>();
  const { today } = useClock();
  const minutes = time ? (parseTask(`x at ${time}`, today).time ?? null) : null;
  const day = date && isCivilDate(date) ? date : minutes !== null ? today : null;
  // From Today the sheet adds to the day on screen; a time from a free stretch is typed in.
  return (
    <AddSheet
      onClose={() => goBack("/today")}
      defaultDate={day ?? today}
      initialText={minutes !== null && day ? whenWords(day, minutes, today) : undefined}
    />
  );
}
