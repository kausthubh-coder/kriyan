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
  return (
    <AddSheet
      onClose={() => goBack("/today")}
      initialText={day ? whenWords(day, minutes, today) : undefined}
    />
  );
}
