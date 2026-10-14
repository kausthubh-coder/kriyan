// The desktop sidebar: wordmark, Inbox, Today, Upcoming, the spaces tree, Progress, then
// Search and Settings at the bottom. One click to anything.

import { ScrollView, View } from "react-native";
import { Link, usePathname, type Href } from "expo-router";
import {
  CalendarDays,
  Inbox,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react-native";
import { useInboxView, useSpaces, useTodayView } from "@/data/views";
import { c, r, s, spaceTone, sz } from "@/theme/tokens";
import { Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Mark } from "@/ui/Mark";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { openCommand } from "./context";

function NavItem({
  href,
  icon,
  label,
  count,
  active,
  kbd,
  onPress,
}: {
  href?: Href;
  icon: LucideIcon;
  label: string;
  count?: number;
  active?: boolean;
  kbd?: string;
  onPress?: () => void;
}) {
  const body = (
    <Press
      role={href ? "link" : "button"}
      aria-current={active ? "page" : undefined}
      onPress={onPress}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        height: sz.row,
        paddingHorizontal: s.s2,
        borderRadius: r.ctl,
        backgroundColor: active ? c.select : "transparent",
      }}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <>
          <Icon icon={icon} tone={active || hovered ? "ink" : "ink3"} />
          <Txt
            variant="label"
            tone={active || hovered ? "ink" : "ink2"}
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {label}
          </Txt>
          {count ? (
            <Txt variant="meta" tone="ink3" tnum>
              {count}
            </Txt>
          ) : null}
          {kbd ? (
            <Txt variant="caption" tone="ink3">
              {kbd}
            </Txt>
          ) : null}
        </>
      )}
    </Press>
  );
  return href ? (
    <Link href={href} asChild>
      {body}
    </Link>
  ) : (
    body
  );
}

function Group({ label }: { label: string }) {
  return (
    <View style={{ paddingTop: s.s6, paddingBottom: s.s1, paddingHorizontal: s.s2 }}>
      <Txt variant="caption" tone="ink3">
        {label}
      </Txt>
    </View>
  );
}

export function Sidebar() {
  const path = usePathname();
  const spaces = useSpaces();
  const inbox = useInboxView();
  const today = useTodayView();
  const todayCount = today
    ? today.anytime.length + today.scheduled.filter((t) => !t.done && !t.event).length
    : 0;
  return (
    <View
      role="navigation"
      aria-label="Main"
      style={{ width: sz.sidebar, height: "100%", padding: s.s3, gap: 2, backgroundColor: c.bg }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          height: 40,
          paddingHorizontal: s.s2,
          marginBottom: s.s2,
        }}
      >
        {/* The wordmark stays quieter than the page title, so the page leads. The mark sits in
            the nav icons' column and the word on their labels' edge. */}
        <Mark size={18} />
        <Txt variant="subhead" tone="ink2">
          kriyan
        </Txt>
      </View>
      <NavItem href="/inbox" icon={Inbox} label="Inbox" count={inbox?.length} active={path === "/inbox"} />
      <NavItem
        href="/today"
        icon={Sun}
        label="Today"
        count={todayCount}
        active={path === "/today" || path === "/"}
      />
      <NavItem href="/upcoming" icon={CalendarDays} label="Upcoming" active={path === "/upcoming"} />
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 2 }}>
        <Group label="Spaces" />
        {spaces === undefined
          ? null
          : spaces.map((sp) => {
              const href = `/space/${sp._id}` as Href;
              const active = path === `/space/${sp._id}`;
              return (
                <Link key={sp._id} href={href} asChild>
                  <Press
                    role="link"
                    aria-current={active ? "page" : undefined}
                    scale={false}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s.s3,
                      height: sz.row,
                      paddingLeft: s.s2 + sp.depth * s.s4,
                      paddingRight: s.s2,
                      borderRadius: r.ctl,
                      backgroundColor: active ? c.select : "transparent",
                    }}
                  >
                    {({ hovered }: { hovered?: boolean }) => (
                      <>
                        <View style={{ width: 18, alignItems: "center" }}>
                          <Dot color={spaceTone(sp.color).dot} />
                        </View>
                        <Txt
                          variant="body"
                          tone={active || hovered ? "ink" : "ink2"}
                          numberOfLines={1}
                          style={{ flex: 1 }}
                        >
                          {sp.name}
                        </Txt>
                      </>
                    )}
                  </Press>
                </Link>
              );
            })}
        {spaces && spaces.length === 0 ? (
          <NavItem href="/browse" icon={LayoutGrid} label="Add a space" active={path === "/browse"} />
        ) : null}
        <Group label="Progress" />
        <NavItem href="/progress" icon={Target} label="Goals and habits" active={path === "/progress"} />
      </ScrollView>
      <View style={{ marginTop: "auto", gap: 2, paddingTop: s.s2 }}>
        <NavItem icon={Search} label="Search" kbd="Ctrl K" onPress={() => openCommand()} />
        <NavItem href="/settings" icon={SlidersHorizontal} label="Settings" active={path === "/settings"} />
      </View>
    </View>
  );
}
