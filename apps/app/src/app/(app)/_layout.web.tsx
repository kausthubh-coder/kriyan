// The web app: the sidebar on desktop, the navigation bar and add button below 760px.
// The task and quick add are routes drawn over the screen behind them (transparent modals),
// so the column stays put while the panel is open.

import { Stack, usePathname } from "expo-router";
import { View } from "react-native";
import { CommandMenu } from "@/features/shell/CommandMenu";
import { Dock, DOCK_CLEARANCE } from "@/features/shell/Dock";
import { useOnboardingGate } from "@/features/onboarding/gate";
import { useSession } from "@/features/shell/session";
import { useShortcuts } from "@/features/shell/shortcuts";
import { Sidebar } from "@/features/shell/Sidebar";
import { OfflineNotice } from "@/features/shell/OfflineNotice";
import { useIsPhone } from "@/theme/layout";
import { c, s } from "@/theme/tokens";
import { ToastHost } from "@/ui/toast";

export const unstable_settings = { anchor: "(tabs)" };

const overlay = {
  presentation: "transparentModal" as const,
  animation: "none" as const,
  contentStyle: { backgroundColor: "transparent" },
};

export default function AppLayout() {
  useSession();
  useOnboardingGate();
  useShortcuts();
  const phone = useIsPhone();
  const path = usePathname();
  // Focus takes the whole window: no sidebar, no navigation bar, one task.
  const immersive = path.startsWith("/focus/");
  // Like the prototype, the dock leaves for a sheet (a task, quick add) and the evening review.
  const dock = phone && !immersive && !path.startsWith("/task/") && path !== "/add" && path !== "/review";
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg, height: "100%" }}>
      {phone || immersive ? null : <Sidebar />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <OfflineNotice />
        <Stack
          screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: c.bg } }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
          <Stack.Screen name="space/[id]" />
          <Stack.Screen name="inbox" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="review" />
          <Stack.Screen name="focus/[id]" />
          <Stack.Screen name="trash" />
          <Stack.Screen name="task/[id]" options={overlay} />
          <Stack.Screen name="add" options={overlay} />
        </Stack>
      </View>
      {dock ? <Dock /> : null}
      <ToastHost bottom={phone ? DOCK_CLEARANCE : s.s6} />
      <CommandMenu />
    </View>
  );
}
