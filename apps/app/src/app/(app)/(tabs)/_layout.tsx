// Android: four tabs under the floating dock (the prototype's pill and round add button),
// not a Material navigation bar. Back from another tab returns to Today; Back on Today leaves.

import { Tabs } from "expo-router";
import { Dock } from "@/features/shell/Dock";
import { c } from "@/theme/tokens";

export const unstable_settings = { initialRouteName: "today" };

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      tabBar={() => <Dock />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}
    >
      <Tabs.Screen name="today" />
      <Tabs.Screen name="upcoming" />
      <Tabs.Screen name="progress" />
      <Tabs.Screen name="ask" />
      {/* Only redirects old links to Ask. */}
      <Tabs.Screen name="browse" />
    </Tabs>
  );
}
