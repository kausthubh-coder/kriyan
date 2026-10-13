// The web app's navigation bar below 760px, drawn like Android's Material navigation bar:
// four destinations within thumb reach, and the floating add button above it.

import { View } from "react-native";
import { Link, router, usePathname, type Href } from "expo-router";
import { CalendarDays, Inbox, Layers, Plus, Sun, type LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, s, shadows } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const TABS: { href: Href; match: (p: string) => boolean; icon: LucideIcon; label: string }[] = [
  { href: "/today", match: (p) => p === "/today" || p === "/", icon: Sun, label: "Today" },
  { href: "/upcoming", match: (p) => p === "/upcoming", icon: CalendarDays, label: "Upcoming" },
  { href: "/inbox", match: (p) => p === "/inbox", icon: Inbox, label: "Inbox" },
  {
    href: "/browse",
    match: (p) => p === "/browse" || p.startsWith("/space/") || p === "/progress" || p === "/settings",
    icon: Layers,
    label: "Browse",
  },
];

export const NAVBAR_HEIGHT = 80;

export function NavBar() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  // A sheet (a task, quick add) covers the bar; don't draw it on top of the sheet.
  if (path.startsWith("/task/") || path === "/add") return null;
  return (
    <>
      <View
        role="navigation"
        aria-label="Main"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: NAVBAR_HEIGHT + insets.bottom,
          paddingTop: s.s3,
          paddingBottom: s.s4 + insets.bottom,
          flexDirection: "row",
          backgroundColor: c.sunken,
          zIndex: 6,
        }}
      >
        {TABS.map((tab) => {
          const active = tab.match(path);
          return (
            <Link key={tab.label} href={tab.href} asChild>
              <Press
                role="link"
                aria-current={active ? "page" : undefined}
                hoverBg={null}
                scale={false}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: s.s1 }}
              >
                <View
                  style={{
                    width: 56,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: active ? c.select : "transparent",
                  }}
                >
                  <Icon icon={tab.icon} size={22} tone={active ? "ink" : "ink3"} />
                </View>
                <Txt variant="caption" tone={active ? "ink" : "ink3"}>
                  {tab.label}
                </Txt>
              </Press>
            </Link>
          );
        })}
      </View>
      <Press
        role="button"
        accessibilityLabel="Add task"
        onPress={() => router.push("/add")}
        hoverBg={null}
        style={{
          position: "absolute",
          right: s.s4,
          bottom: NAVBAR_HEIGHT + s.s4 + insets.bottom,
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: c.ink,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: shadows.overlay,
          zIndex: 6,
        }}
      >
        <Icon icon={Plus} size={24} tone="onInk" />
      </Press>
    </>
  );
}
