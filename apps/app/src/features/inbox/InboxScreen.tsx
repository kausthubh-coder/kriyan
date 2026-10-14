// The Inbox: everything captured without a home. Each row offers Today, Pick a day and Move
// to space without opening the task. An empty Inbox is the one place the app celebrates.

import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { CalendarDays, CheckCheck, Layers, Plus, Sun } from "lucide-react-native";
import type { Id } from "@kriyan/convex/dataModel";
import { useClock } from "@/data/time";
import { useInboxView, type TaskView } from "@/data/views";
import { moveTasks, updateTask } from "@/features/tasks/actions";
import { DayPicker, SpacePicker } from "@/features/tasks/pickers";
import { QuickAdd } from "@/features/tasks/QuickAdd";
import { TaskRow } from "@/features/tasks/TaskRow";
import { useIsPhone } from "@/theme/layout";
import { s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { PageHead, Screen } from "@/ui/Screen";
import { Txt } from "@/ui/Txt";

export function InboxScreen() {
  const inbox = useInboxView();
  const { today } = useClock();
  const phone = useIsPhone();
  return (
    <Screen title="Inbox" fab>
      <PageHead
        title="Inbox"
        sub={
          inbox ? (inbox.length ? `${inbox.length} without a day or a space` : "Everything has a home") : " "
        }
      />
      {phone ? null : <QuickAdd variant="inline" placeholder="Capture anything, sort it later" />}
      {inbox === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={`${70 - i * 12}%`} />
          ))}
        </View>
      ) : inbox.length === 0 ? (
        <View style={{ gap: s.s3, paddingVertical: s.s6, alignItems: "flex-start" }}>
          <Icon icon={CheckCheck} size={24} tone="ink2" />
          <Txt variant="title" heading={2}>
            Inbox zero
          </Txt>
          <Txt variant="body" tone="ink3" style={{ maxWidth: 420 }}>
            Everything you’ve captured has a day or a space. New ideas without either land here.
          </Txt>
          {phone ? (
            <Button
              icon={Plus}
              label="Capture a task"
              onPress={() => router.push("/add")}
              style={{ marginLeft: -s.s3 }}
            />
          ) : null}
        </View>
      ) : (
        <View>
          {inbox.map((t) => (
            <InboxRow key={t._id} task={t} today={today} phone={phone} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function InboxRow({ task, today, phone }: { task: TaskView; today: string; phone: boolean }) {
  const [open, setOpen] = useState<"day" | "space" | null>(null);
  const dayRef = useRef<View>(null);
  const spaceRef = useRef<View>(null);
  // Phones show the three as words under the title (icons would push them off a 390px
  // screen); desktop keeps them on the row, with icons for the two that open a picker.
  const actions = (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        gap: s.s1,
        ...(phone ? { marginLeft: 34 - s.s3, marginTop: -s.s2 } : {}),
      }}
    >
      <Button
        icon={phone ? undefined : Sun}
        label="Today"
        onPress={() => void moveTasks([task._id], today)}
      />
      <Button
        ref={dayRef}
        icon={phone ? undefined : CalendarDays}
        label={phone ? "Pick a day" : undefined}
        accessibilityLabel="Pick a day"
        onPress={() => setOpen("day")}
      />
      <Button
        ref={spaceRef}
        icon={phone ? undefined : Layers}
        label={phone ? "Move to space" : undefined}
        accessibilityLabel="Move to space"
        onPress={() => setOpen("space")}
      />
    </View>
  );
  return (
    <View>
      <TaskRow task={task} today={today} trailing={phone ? undefined : actions} />
      {phone ? actions : null}
      <Popover open={open === "day"} onClose={() => setOpen(null)} anchor={dayRef} title="Pick a day">
        <DayPicker
          value={null}
          today={today}
          allowNone={false}
          onPick={(date) => {
            setOpen(null);
            if (date) void moveTasks([task._id], date);
          }}
        />
      </Popover>
      <Popover
        open={open === "space"}
        onClose={() => setOpen(null)}
        anchor={spaceRef}
        title="Move to space"
        width={280}
      >
        <SpacePicker
          value={null}
          allowNone={false}
          onPick={(id) => {
            setOpen(null);
            if (id) void updateTask({ id: task._id, spaceId: id as Id<"spaces"> });
          }}
        />
      </Popover>
    </View>
  );
}
