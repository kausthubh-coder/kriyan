// Android: the Material navigation bar with four destinations. Add is the floating button
// on each tab, under the thumb.

import { NativeTabs } from "expo-router/unstable-native-tabs";
import { c, hex } from "@/theme/tokens";

export const unstable_settings = { initialRouteName: "today" };

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={c.sunken}
      indicatorColor={hex.select}
      iconColor={{ default: hex.ink3, selected: hex.ink }}
      labelStyle={{ default: { color: hex.ink3 }, selected: { color: hex.ink } }}
      backBehavior="initialRoute"
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon md="light_mode" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="upcoming">
        <NativeTabs.Trigger.Icon md="calendar_month" />
        <NativeTabs.Trigger.Label>Upcoming</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon md="inbox" />
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="browse">
        <NativeTabs.Trigger.Icon md="layers" />
        <NativeTabs.Trigger.Label>Browse</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
