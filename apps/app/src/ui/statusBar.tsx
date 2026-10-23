import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";

/**
 * Light status bar icons while this screen has focus. Today's phone header, Focus and the space
 * behind the task sheet are dark in both themes, and the root's "auto" would draw dark icons on
 * them in light mode. Tabs stay mounted, so this renders only while focused; the newest
 * StatusBar wins, and the root's takes over again when this one unmounts.
 */
export function LightStatusBar({ enabled = true }: { enabled?: boolean }) {
  const focused = useIsFocused();
  return enabled && focused ? <StatusBar style="light" /> : null;
}
