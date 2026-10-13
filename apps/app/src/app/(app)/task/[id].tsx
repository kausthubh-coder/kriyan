import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { Id } from "@kriyan/convex/dataModel";
import { useTaskDoc } from "@/data/views";
import { TaskEditor, TaskEditorSkeleton } from "@/features/tasks/TaskEditor";
import { TaskPanel } from "@/features/tasks/TaskPanel";
import { c, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { goBack } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";

export { RouteError as ErrorBoundary } from "@/ui/RouteError";

export default function TaskRoute() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const initialEdit = edit === "when" || edit === "repeat" || edit === "space" ? edit : undefined;
  const task = useTaskDoc(id as Id<"tasks">);
  const close = () => goBack("/today");
  return (
    <TaskPanel onClose={close} label={task?.title ?? "Task"}>
      {task === undefined ? (
        <TaskEditorSkeleton />
      ) : task === null ? (
        <View style={{ padding: s.s6, gap: s.s3, backgroundColor: c.raised }}>
          <Txt variant="subhead" heading={1}>
            This task isn’t here anymore
          </Txt>
          <Txt variant="body" tone="ink3">
            It was deleted, or it belongs to another account. Your other tasks are unchanged.
          </Txt>
          <Button variant="primary" label="Close" onPress={close} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : (
        <TaskEditor key={task._id} task={task} onClose={close} initialEdit={initialEdit} />
      )}
    </TaskPanel>
  );
}
