// The phone's navigation on Android and the web (docs/design/v4, b2.html `.dock`): a pill of
// four tabs floating 14 above the bottom edge, at most 528 wide, with the round add button
// beside it. The same component on both, so the app looks like the prototype rather than a
// Material navigation bar.

import { View } from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { Columns3, Plus, Sparkles, Sun, Target, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, s, shadows } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

/** The pill's height, its gap above the bottom edge, and the room content leaves under it. */
export const DOCK_HEIGHT = 60;
// On the spacing scale: the prototype's 14, 10 and 5 round to 12, 8 and 4.
export const DOCK_GAP = s.s3;
export const DOCK_CLEARANCE = DOCK_HEIGHT + DOCK_GAP + s.s4;

const FAB = 58;
const MAX_WIDTH = 528;

// Ask is the fourth tab (b2.html `asknav`). The places reached from it on a phone (the Inbox,
// spaces, Settings, Recently deleted) keep it lit, so the dock still says where you are.
const TABS: { href: Href; match: (p: string) => boolean; icon: LucideIcon; label: string }[] = [
  { href: "/today", match: (p) => p === "/today" || p === "/", icon: Sun, label: "Today" },
  { href: "/upcoming", match: (p) => p === "/upcoming", icon: Columns3, label: "Week" },
  { href: "/progress", match: (p) => p === "/progress", icon: Target, label: "Goals" },
  {
    href: "/ask",
    match: (p) =>
      p === "/ask" || p === "/inbox" || p.startsWith("/space/") || p === "/settings" || p === "/trash",
    icon: Sparkles,
    label: "Ask",
  },
];

export function Dock() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: DOCK_GAP + insets.bottom,
        alignItems: "center",
        zIndex: 6,
      }}
    >
      <View
        pointerEvents="box-none"
        style={{
          width: "100%",
          maxWidth: MAX_WIDTH + 2 * DOCK_GAP,
          paddingHorizontal: DOCK_GAP,
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
        }}
      >
        <View
          role="navigation"
          aria-label="Main"
          style={{
            flex: 1,
            height: DOCK_HEIGHT,
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            padding: s.s1,
            borderRadius: DOCK_HEIGHT / 2,
            borderWidth: 1,
            borderColor: c.line,
            // B2's --bar: white in light, a step above the sheet in dark.
            backgroundColor: c.overlay,
            boxShadow: shadows.overlay,
          }}
        >
          {TABS.map((tab) => {
            const active = tab.match(path);
            return (
              <Press
                key={tab.label}
                role="link"
                aria-current={active ? "page" : undefined}
                accessibilityLabel={tab.label}
                onPress={() => {
                  if (!active) router.navigate(tab.href);
                }}
                hoverBg={null}
                scale={false}
                ripple={false}
                style={{
                  minWidth: 58,
                  height: 48,
                  paddingHorizontal: s.s2,
                  borderRadius: 24,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? c.sunken : "transparent",
                }}
              >
                <Icon icon={tab.icon} size={18} tone={active ? "ink" : "ink3"} />
                <Txt variant="caption" tone={active ? "ink" : "ink3"} style={{ fontWeight: "600" }}>
                  {tab.label}
                </Txt>
              </Press>
            );
          })}
        </View>
        <Press
          role="button"
          accessibilityLabel="Add a task"
          onPress={() => router.push("/add")}
          hoverBg={null}
          style={{
            width: FAB,
            height: FAB,
            borderRadius: FAB / 2,
            backgroundColor: c.ink,
            alignItems: "center",
            justifyContent: "center",
            boxShadow: shadows.overlay,
          }}
        >
          <Icon icon={Plus} size={24} tone="onInk" />
        </Press>
      </View>
    </View>
  );
}
