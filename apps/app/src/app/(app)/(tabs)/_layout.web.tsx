// On the web the shell draws the navigation (sidebar or bar), so the tabs are a plain slot.

import { Slot } from "expo-router";

export const unstable_settings = { initialRouteName: "today" };

export default function TabsLayout() {
  return <Slot />;
}
