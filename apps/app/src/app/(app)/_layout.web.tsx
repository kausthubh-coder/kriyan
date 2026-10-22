// The web app: the sidebar on desktop, the navigation bar and add button below 760px.
// The task and quick add are routes drawn over the screen behind them (transparent modals),
// so the column stays put while the panel is open.

import { Stack } from "expo-router";
import { View } from "react-native";
import { CommandMenu } from "@/features/shell/CommandMenu";
import { NavBar, NAVBAR_HEIGHT } from "@/features/shell/NavBar";
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
  useShortcuts();
  const phone = useIsPhone();
  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.bg, height: "100%" }}>
      {phone ? null : <Sidebar />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <OfflineNotice />
        <Stack
          screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: c.bg } }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="index" />
          <Stack.Screen name="space/[id]" />
          <Stack.Screen name="progress" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="trash" />
          <Stack.Screen name="task/[id]" options={overlay} />
          <Stack.Screen name="add" options={overlay} />
        </Stack>
      </View>
      {phone ? <NavBar /> : null}
      <ToastHost bottom={phone ? NAVBAR_HEIGHT + 56 + s.s8 : s.s6} />
      <CommandMenu />
    </View>
  );
}
