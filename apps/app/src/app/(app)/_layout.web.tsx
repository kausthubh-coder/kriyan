// The web app (design v5): no tab bar. Desktop draws the quiet left rail beside the page; phones
// get the pages alone, with Today's floating buttons and the menu as a page. The task and quick
// add are routes drawn over the screen behind them (transparent modals), so the page stays put
// while they're open.

import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { ASK_BAR_HEIGHT } from "@/features/ask/AskBar";
import { useNotifications } from "@/features/notifications/register";
import { CommandMenu } from "@/features/shell/CommandMenu";
import { DOCK_CLEARANCE } from "@/features/shell/Dock";
import { Rail } from "@/features/shell/Rail";
import { useSession } from "@/features/shell/session";
import { useShortcuts } from "@/features/shell/shortcuts";
import { OfflineNotice } from "@/features/shell/OfflineNotice";
import { useIsPhone } from "@/theme/layout";
import { c, s } from "@/theme/tokens";
import { ToastHost } from "@/ui/toast";

export const unstable_settings = { anchor: "today" };

const overlay = {
  presentation: "transparentModal" as const,
  animation: "none" as const,
  contentStyle: { backgroundColor: "transparent" },
};

export default function AppLayout() {
  useSession();
  useShortcuts();
  // Subscribes this browser again if it allowed reminders before (after signing back in, say).
  useNotifications();
  const phone = useIsPhone();
  const path = usePathname();
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg, height: "100%" }}>
      {phone ? null : <Rail />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <OfflineNotice />
        <Stack
          screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: c.bg } }}
        >
          <Stack.Screen name="today" />
          <Stack.Screen name="index" />
          <Stack.Screen name="menu" />
          <Stack.Screen name="inbox" />
          <Stack.Screen name="space/[id]" />
          <Stack.Screen name="goals" />
          <Stack.Screen name="agents" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="upcoming" />
          <Stack.Screen name="ask" />
          <Stack.Screen name="progress" />
          <Stack.Screen name="browse" />
          <Stack.Screen name="review" />
          <Stack.Screen name="focus/[id]" />
          <Stack.Screen name="trash" />
          <Stack.Screen name="task/[id]" options={overlay} />
          <Stack.Screen name="add" options={overlay} />
        </Stack>
      </View>
      {/* On phones above Today's floating buttons (and Ask's box); on desktop in the corner. */}
      <ToastHost bottom={phone ? DOCK_CLEARANCE + (path === "/ask" ? ASK_BAR_HEIGHT : 0) : s.s6} />
      <CommandMenu />
    </View>
  );
}
