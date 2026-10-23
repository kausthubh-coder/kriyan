// Recently deleted: a deleted task waits here for 30 days (maintenance.emptyTrash), so a delete
// is never final once its toast is gone, and the person can take back what an agent or the CLI
// deleted. Grouped by the day each task was deleted, newest first.

import { View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import { RotateCcw, Trash2 } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { formatClock, todayIn } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useTrashView } from "@/data/views";
import { restoreTask } from "@/features/tasks/actions";
import { useControl } from "@/theme/layout";
import { s, spaceTone } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { PageHead, Screen, SectionHead } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";

type Deleted = FunctionReturnType<typeof api.views.trash>[number];

export function TrashScreen() {
  const trash = useTrashView();
  const { today, timeZone } = useClock();
  const days = new Map<string, Deleted[]>();
  for (const task of trash ?? []) {
    const day = todayIn(timeZone, task.deletedAt);
    days.set(day, [...(days.get(day) ?? []), task]);
  }
  return (
    <Screen title="Recently deleted" back>
      <PageHead title="Recently deleted" sub="Deleted tasks wait here for 30 days" />
      {trash === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={`${70 - i * 12}%`} />
          ))}
        </View>
      ) : trash.length === 0 ? (
        <View style={{ gap: s.s3, paddingVertical: s.s6, alignItems: "flex-start" }}>
          <Icon icon={Trash2} size={24} tone="ink2" />
          <Txt variant="label" heading={2}>
            Nothing deleted
          </Txt>
          <Txt variant="body" tone="ink3" style={{ maxWidth: 420 }}>
            A task you delete waits here for 30 days, so you can bring it back.
          </Txt>
        </View>
      ) : (
        <View style={{ gap: s.s6 }}>
          {[...days].map(([day, tasks]) => (
            <View key={day}>
              <SectionHead title={deletedOn(day, today)} />
              {tasks.map((task) => (
                <DeletedRow key={task._id} task={task} today={today} />
              ))}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function deletedOn(day: string, today: string): string {
  const said = formatDay(day, today);
  return said === "Today" || said === "Yesterday" ? `Deleted ${said.toLowerCase()}` : `Deleted ${said}`;
}

function DeletedRow({ task, today }: { task: Deleted; today: string }) {
  const { row } = useControl();
  const when = task.date
    ? `${formatDay(task.date, today)}${task.time !== null ? `, ${formatClock(task.time)}` : ""}`
    : null;
  // The Inbox holds what has neither a day nor a space; that's where Restore puts it back.
  const where = task.spacePath ?? (task.date ? null : "Inbox");
  const meta = [when, task.repeatText, where].filter(Boolean).join(" · ");
  return (
    <View
      testID={`deleted-${task._id}`}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: row, paddingVertical: s.s1 }}
    >
      <Dot color={spaceTone(task.color).dot} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="body" numberOfLines={2}>
          {task.title}
        </Txt>
        <Txt variant="meta" tone="ink3" numberOfLines={1}>
          {meta}
        </Txt>
      </View>
      <Button
        icon={RotateCcw}
        label="Restore"
        accessibilityLabel={`Restore ${task.title}`}
        onPress={() => restoreTask(task)}
        style={{ marginRight: -s.s3 }}
      />
    </View>
  );
}
