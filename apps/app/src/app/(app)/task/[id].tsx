// A task: Joi's floating card with its tiles (phones) or the right panel (desktop), and with
// `?edit=` the Edit page (`when`, `repeat` or `space` open that picker straight away).

import { router, useLocalSearchParams } from "expo-router";
import type { Id } from "@kriyan/convex/dataModel";
import { useTaskDoc } from "@/data/views";
import { EditSheet, type Picker } from "@/features/tasks/EditSheet";
import { TaskPanel } from "@/features/tasks/TaskPanel";
import { ItemCard } from "@/features/today/Cards";
import { goBack } from "@/ui/Screen";

export { RouteError as ErrorBoundary } from "@/ui/RouteError";

const PICK: Record<string, Picker> = { when: "date", repeat: "repeat", space: "space" };

export default function TaskRoute() {
  const { id, edit, date } = useLocalSearchParams<{ id: string; edit?: string; date?: string }>();
  const task = useTaskDoc(id as Id<"tasks">);
  const close = () => goBack("/today");
  if (edit) {
    return (
      <TaskPanel mode="edit" onClose={close} label={task ? `Edit ${task.title}` : "Edit"}>
        {task ? <EditSheet key={task._id} task={task} onClose={close} initial={PICK[edit] ?? null} /> : null}
      </TaskPanel>
    );
  }
  return (
    <TaskPanel mode="card" onClose={close} label={task?.title ?? "Task"}>
      <ItemCard
        id={id}
        day={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined}
        onClose={close}
        onEdit={() => router.replace(`/task/${id}?edit=1`)}
      />
    </TaskPanel>
  );
}
