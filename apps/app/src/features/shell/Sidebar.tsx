// The desktop sidebar (b2.html `sideHTML`): wordmark, the New task button, four count tiles
// (Today, Coming up, Inbox, From earlier), then Today, Week, Goals and habits, Close the day and
// Ask Kriyan, the spaces tree with Add a space, and Search, Settings and the date at the foot.
// It sits on its own surface with a rule, so the page leads. One click to anything.

import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Link, router, usePathname, type Href } from "expo-router";
import {
  Inbox,
  LayoutGrid,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Table2,
  Target,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";
import { addDays, formatClock } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useInboxView, useSpaces, useTodayView, useWeekView, type SpaceNode } from "@/data/views";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { AddSpace } from "@/features/space/AddSpace";
import { c, r, s, spaceTone, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Mark } from "@/ui/Mark";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { openCommand, quickAddTarget } from "./context";

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

/** One of the four counts at the top (b2.html `.tile`): what's waiting where, one click away. */
function Tile({
  href,
  icon,
  count,
  label,
  active,
}: {
  href: Href;
  icon: LucideIcon;
  count: number | undefined;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} asChild>
      <Press
        role="link"
        aria-current={active ? "page" : undefined}
        accessibilityLabel={`${label}${count === undefined ? "" : `, ${count}`}`}
        hoverBg={null}
        scale={false}
        // Link's slot takes a plain style; the hover edge is drawn by the child instead.
        style={{ flex: 1, minWidth: 0, borderRadius: r.card }}
      >
        {({ hovered }) => (
          <View
            style={{
              gap: s.s1,
              padding: s.s3,
              borderRadius: r.card,
              backgroundColor: c.overlay,
              borderWidth: 1,
              borderColor: active ? c.ink : hovered ? c.lineStrong : c.line,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View
                style={{
                  width: s.s6,
                  height: s.s6,
                  borderRadius: r.pill,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: c.hover,
                }}
              >
                <Icon icon={icon} size={14} tone="ink2" />
              </View>
              <Txt variant="subhead" tnum>
                {count ?? ""}
              </Txt>
            </View>
            <Txt variant="meta" tone="ink3" numberOfLines={1}>
              {label}
            </Txt>
          </View>
        )}
      </Press>
    </Link>
  );
}

/** N does the same: the Today field when it's on screen, otherwise the add sheet. */
function newTask() {
  const field = quickAddTarget.get();
  if (field) field.focus();
  else router.push("/add");
}

export function Sidebar() {
  const path = usePathname();
  const { today, now } = useClock();
  const spaces = useSpaces();
  const inbox = useInboxView();
  const todayView = useTodayView();
  // The seven days after today, for "Coming up".
  const next = useWeekView(addDays(today, 1));
  const [adding, setAdding] = useState(false);
  const todayCount = todayView
    ? todayView.due.length +
      todayView.anytime.length +
      todayView.scheduled.filter((t) => !t.done && !t.event).length
    : undefined;
  const comingUp = next
    ? next.days.reduce(
        (sum, d) => sum + [...d.scheduled, ...d.anytime].filter((t) => !t.done && !t.proposedBy).length,
        0,
      )
    : undefined;
  return (
    <View
      role="navigation"
      aria-label="Main"
      style={{
        width: sz.sidebar,
        height: "100%",
        padding: s.s3,
        gap: 2,
        backgroundColor: c.sunken,
        borderRightWidth: 1,
        borderRightColor: c.line,
      }}
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
          Kriyan
        </Txt>
      </View>
      <Press
        role="button"
        accessibilityLabel="New task"
        onPress={newTask}
        hoverBg={null}
        style={({ hovered }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
          height: 40,
          paddingHorizontal: s.s3,
          borderRadius: r.card,
          backgroundColor: c.ink,
          opacity: hovered ? 0.92 : 1,
        })}
      >
        <Icon icon={Plus} tone="onInk" />
        <Txt variant="label" tone="onInk" style={{ flex: 1 }}>
          New task
        </Txt>
        <Txt variant="caption" tone="onInk" style={{ opacity: 0.7 }}>
          N
        </Txt>
      </Press>
      <View style={{ gap: s.s2, marginVertical: s.s3 }}>
        <View style={{ flexDirection: "row", gap: s.s2 }}>
          <Tile href="/today" icon={Sun} count={todayCount} label="Today" active={false} />
          <Tile href="/upcoming" icon={Table2} count={comingUp} label="Coming up" active={false} />
        </View>
        <View style={{ flexDirection: "row", gap: s.s2 }}>
          <Tile href="/inbox" icon={Inbox} count={inbox?.length} label="Inbox" active={path === "/inbox"} />
          <Tile
            href="/today"
            icon={Undo2}
            count={todayView?.earlier.length}
            label="From earlier"
            active={false}
          />
        </View>
      </View>
      <NavItem href="/today" icon={Sun} label="Today" active={path === "/today" || path === "/"} />
      <NavItem href="/upcoming" icon={Table2} label="Week" active={path === "/upcoming"} />
      <NavItem href="/progress" icon={Target} label="Goals and habits" active={path === "/progress"} />
      <NavItem href="/review" icon={Moon} label="Close the day" active={path === "/review"} />
      <NavItem href="/ask" icon={Sparkles} label="Ask Kriyan" active={path === "/ask"} />
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 2 }}>
        <View style={{ paddingTop: s.s4, paddingHorizontal: s.s2 }}>
          <SectionLabel
            title="Spaces"
            right={
              <Button
                icon={Plus}
                accessibilityLabel="Add a space"
                onPress={() => setAdding(!adding)}
                expanded={adding}
              />
            }
          />
        </View>
        {adding ? <AddSpace onDone={(id) => (setAdding(false), id && router.push(`/space/${id}`))} /> : null}
        {spaces === undefined
          ? null
          : spaces.map((sp) => <SpaceItem key={sp._id} sp={sp} active={path === `/space/${sp._id}`} />)}
        {spaces && spaces.length === 0 && !adding ? (
          <NavItem icon={LayoutGrid} label="Add a space" onPress={() => setAdding(true)} />
        ) : null}
      </ScrollView>
      <View style={{ marginTop: "auto", gap: 2, paddingTop: s.s2 }}>
        <NavItem icon={Search} label="Search" kbd="Ctrl K" onPress={() => openCommand()} />
        <NavItem href="/settings" icon={SlidersHorizontal} label="Settings" active={path === "/settings"} />
        <Txt variant="meta" tone="ink3" tnum style={{ paddingHorizontal: s.s2, paddingTop: s.s2 }}>
          {`${formatDate(today)}, ${formatClock(now)}`}
        </Txt>
      </View>
    </View>
  );
}

function SpaceItem({ sp, active }: { sp: SpaceNode; active: boolean }) {
  return (
    <Link href={`/space/${sp._id}` as Href} asChild>
      <Press
        role="link"
        aria-current={active ? "page" : undefined}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          height: sz.ctl,
          paddingLeft: s.s2 + sp.depth * s.s4,
          paddingRight: s.s2,
          borderRadius: r.ctl,
          backgroundColor: active ? c.select : "transparent",
        }}
      >
        {({ hovered }: { hovered?: boolean }) => (
          <>
            <View style={{ width: 18, alignItems: "center" }}>
              <Dot color={spaceTone(sp.color).dot} size={7} />
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
}
