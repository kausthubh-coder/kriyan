// Android: a native stack over native tabs. The task opens as a sheet with two heights,
// quick add as a sheet that fits its content above the keyboard.

import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotifications } from "@/features/notifications/register";
import { ASK_BAR_HEIGHT } from "@/features/ask/AskBar";
import { CommandMenu } from "@/features/shell/CommandMenu";
import { DOCK_CLEARANCE } from "@/features/shell/Dock";
import { TASK_SHEET_DETENTS } from "@/features/tasks/TaskPanel";
import { OfflineNotice } from "@/features/shell/OfflineNotice";
import { useSession } from "@/features/shell/session";
import { c, r } from "@/theme/tokens";
import { ToastHost } from "@/ui/toast";

export const unstable_settings = { anchor: "(tabs)" };

export default function AppLayout() {
  useSession();
  useNotifications();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{ paddingTop: insets.top, position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 }}
        pointerEvents="none"
      >
        <OfflineNotice />
      </View>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="index" />
        <Stack.Screen name="space/[id]" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="review" />
        <Stack.Screen
          name="focus/[id]"
          options={{ presentation: "fullScreenModal", animation: "fade_from_bottom" }}
        />
        <Stack.Screen name="trash" />
        <Stack.Screen
          name="task/[id]"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: TASK_SHEET_DETENTS,
            sheetGrabberVisible: true,
            sheetCornerRadius: r.sheet,
            contentStyle: { backgroundColor: c.raised },
          }}
        />
        <Stack.Screen
          name="add"
          options={{
            presentation: "formSheet",
            sheetAllowedDetents: "fitToContents",
            sheetGrabberVisible: true,
            sheetCornerRadius: r.sheet,
            contentStyle: { backgroundColor: c.raised },
          }}
        />
      </Stack>
      {/* Above the floating dock, and on Ask above the ask box too. */}
      <ToastHost bottom={insets.bottom + DOCK_CLEARANCE + (path === "/ask" ? ASK_BAR_HEIGHT : 0)} />
      <CommandMenu />
    </View>
  );
}
