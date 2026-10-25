// The desktop rail (docs/design/v5 prototype `deskRail`): the wordmark with its red dot, Today
// and Inbox with their counts, the spaces grouped under their top-level parent, then Goals and
// habits, Agents and Settings, and the keys at the foot. Quiet, so the page beside it leads.

import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Link, router, usePathname, type Href } from "expo-router";
import { Inbox, Plug, Plus, Settings, Sun, Target } from "lucide-react-native";
import { AddSpace } from "@/features/space/AddSpace";
import { bold, c, family, r, s, spaceTone, sz } from "@/theme/tokens";
import { Dot } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { useNav } from "./nav";

const RAIL_WIDTH = 240;
const ITEM = sz.row;

export function Rail() {
  const path = usePathname();
  const { groups, inbox, today } = useNav();
  const [adding, setAdding] = useState(false);
  return (
    <View
      role="navigation"
      aria-label="Main"
      style={{
        width: RAIL_WIDTH,
        height: "100%",
        borderRightWidth: 1,
        borderRightColor: c.line,
        backgroundColor: c.bg,
      }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: s.s3, paddingTop: s.s4, gap: 2 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s.s2,
            paddingHorizontal: s.s2,
            paddingBottom: s.s3,
          }}
        >
          <Txt variant="subhead" style={bold}>
            Kriyan
          </Txt>
          <Dot color={c.now} size={8} />
        </View>
        <Item href="/today" label="Today" active={path === "/today" || path === "/"} count={today}>
          <Icon icon={Sun} size={18} tone="ink2" />
        </Item>
        <Item href="/inbox" label="Inbox" active={path === "/inbox"} count={inbox}>
          <Icon icon={Inbox} size={18} tone="ink2" />
        </Item>
        {(groups ?? []).map((g) => (
          <View key={g.parent?._id ?? "loose"} style={{ gap: 2 }}>
            <Heading label={g.label} href={g.parent ? (`/space/${g.parent._id}` as Href) : undefined} />
            {g.spaces.map(({ space, count, indent }) => (
              <Item
                key={space._id}
                href={`/space/${space._id}` as Href}
                label={space.name}
                active={path === `/space/${space._id}`}
                count={count}
                indent={indent}
              >
                <View style={{ width: 18, alignItems: "center" }}>
                  <Dot color={spaceTone(space.color).dot} size={10} />
                </View>
              </Item>
            ))}
          </View>
        ))}
        {adding ? (
          <View style={{ paddingTop: s.s2 }}>
            <AddSpace onDone={(id) => (setAdding(false), id && router.push(`/space/${id}`))} />
          </View>
        ) : (
          <Press
            role="button"
            onPress={() => setAdding(true)}
            scale={false}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s3,
              height: ITEM,
              paddingHorizontal: s.s2,
              borderRadius: r.ctl,
            }}
          >
            <View style={{ width: 18, alignItems: "center" }}>
              <Icon icon={Plus} size={16} tone="ink3" />
            </View>
            <Txt variant="label" tone="ink3">
              Add a space
            </Txt>
          </Press>
        )}
        <Heading label="YOU" />
        <Item href="/goals" label="Goals and habits" active={path === "/goals"}>
          <Icon icon={Target} size={18} tone="ink2" />
        </Item>
        <Item href="/agents" label="Agents" active={path === "/agents"}>
          <Icon icon={Plug} size={18} tone="ink2" />
        </Item>
        <Item href="/settings" label="Settings" active={path === "/settings"}>
          <Icon icon={Settings} size={18} tone="ink2" />
        </Item>
      </ScrollView>
      <Keys />
    </View>
  );
}

function Item({
  href,
  label,
  active,
  count,
  indent = 0,
  children,
}: {
  href: Href;
  label: string;
  active: boolean;
  count?: number;
  indent?: number;
  children: ReactNode;
}) {
  return (
    <Link href={href} asChild>
      <Press
        role="link"
        aria-current={active ? "page" : undefined}
        accessibilityLabel={count ? `${label}, ${count}` : label}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          height: ITEM,
          paddingLeft: s.s2 + indent * s.s4,
          paddingRight: s.s2,
          borderRadius: r.ctl,
          backgroundColor: active ? c.select : "transparent",
        }}
      >
        {children}
        <Txt variant="label" numberOfLines={1} style={[{ flex: 1 }, active ? family("600") : null]}>
          {label}
        </Txt>
        {count ? (
          <Txt variant="caption" tone="ink3" tnum>
            {count}
          </Txt>
        ) : null}
      </Press>
    </Link>
  );
}

/** A group's name; a top-level space's opens its page. */
function Heading({ label, href }: { label: string; href?: Href }) {
  const text = (
    <Txt variant="caption" tone="ink3" style={[family("600"), { letterSpacing: 0.4 }]}>
      {label}
    </Txt>
  );
  const box = { paddingTop: s.s4, paddingBottom: s.s1, paddingHorizontal: s.s2 } as const;
  if (!href) return <View style={box}>{text}</View>;
  return (
    <Link href={href} asChild>
      <Press
        role="link"
        accessibilityLabel={`${label.charAt(0)}${label.slice(1).toLowerCase()}`}
        hoverBg={null}
        scale={false}
        style={{ ...box, alignSelf: "flex-start", borderRadius: r.sm }}
      >
        {text}
      </Press>
    </Link>
  );
}

function Key({ children }: { children: string }) {
  return (
    <View
      style={{
        minWidth: 18,
        paddingHorizontal: s.s1,
        borderWidth: 1,
        borderColor: c.lineStrong,
        borderRadius: r.sm,
        alignItems: "center",
      }}
    >
      <Txt variant="caption" tone="ink2" style={family("600")}>
        {children}
      </Txt>
    </View>
  );
}

function KeyLine({ keys }: { keys: [string, string][] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: s.s1 }}>
      {keys.map(([k, text], i) => (
        <View key={`${k}${i}`} style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
          <Key>{k}</Key>
          {text ? (
            <Txt variant="caption" tone="ink3" style={family("400")}>
              {text}
            </Txt>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** The keys the app answers to, at the rail's foot (Today's own keys: C's contract in v5). */
function Keys() {
  return (
    <View
      aria-label="Keyboard shortcuts"
      style={{ gap: s.s1, paddingHorizontal: s.s4, paddingVertical: s.s3 }}
    >
      <KeyLine keys={[["N", "new task"]]} />
      <KeyLine keys={[["T", "today"]]} />
      <KeyLine
        keys={[
          ["←", ""],
          ["→", "days"],
        ]}
      />
      <KeyLine
        keys={[
          ["J", ""],
          ["K", "move,"],
          ["X", "done,"],
          ["E", "edit"],
        ]}
      />
    </View>
  );
}
