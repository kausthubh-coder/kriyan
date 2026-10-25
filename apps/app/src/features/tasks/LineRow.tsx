// v5's one-line row (docs/design/v5, `.r`): an icon (the checkbox in the space's colour), the
// title with the space's name in grey after it, and one fact on the right with the repeat and
// reminder glyphs before it. The space name shows whole or not at all: when it doesn't fit it
// wraps onto a second line that's cut off. Phones swipe right to finish, left for tomorrow.

import { type ReactNode } from "react";
import { View } from "react-native";
import { Bell, Repeat2 } from "lucide-react-native";
import { DottedRule } from "@/ui/DottedRule";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { SwipeRow } from "./SwipeRow";

export interface LineRowProps {
  title: string;
  /** The grey name after the title; null when the title already says it or inside that space. */
  spaceName: string | null;
  icon: ReactNode;
  /** The one fact on the right. */
  fact: { text: string; now?: boolean } | null;
  /** A pill in place of the fact ("Suggested", "19 days"). */
  pill?: ReactNode;
  repeats?: boolean;
  reminds?: boolean;
  done?: boolean;
  past?: boolean;
  proposed?: boolean;
  selected?: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
  /** Phones: swipe right to finish, left to move. */
  swipe?: { color: string; onComplete?: () => void; moveLabel: string; onMove: () => void; onPick: () => void };
}

export function LineRow(p: LineRowProps) {
  const phone = useIsPhone();
  const quiet = p.done || p.past;
  const row = (
    <Press
      testID={p.testID}
      role="button"
      accessibilityLabel={p.label}
      onPress={p.onPress}
      scale={false}
      hoverBg={null}
      style={({ hovered }) => ({
        height: phone ? 64 : 56,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s4,
        paddingHorizontal: p.selected ? s.s3 : 0,
        marginHorizontal: p.selected ? -s.s3 : 0,
        borderRadius: p.selected ? r.card : 0,
        backgroundColor: p.selected ? c.select : hovered && !phone ? c.hover : c.bg,
      })}
    >
      <View style={{ width: 24, alignItems: "center" }}>{p.icon}</View>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          height: 24,
          overflow: "hidden",
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: s.s2,
          rowGap: s.s8,
        }}
      >
        <Txt
          numberOfLines={1}
          style={{
            ...family("500"),
            fontSize: 16,
            lineHeight: 24,
            maxWidth: "100%",
            flexShrink: 1,
            color: quiet ? c.ink3 : p.proposed ? c.ink2 : c.ink,
          }}
        >
          {p.title}
        </Txt>
        {p.spaceName ? (
          <Txt style={{ ...family("500"), fontSize: 14, lineHeight: 24, color: c.ink3, opacity: quiet ? 0.7 : 1 }}>
            {p.spaceName}
          </Txt>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
        {p.repeats || p.reminds ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
            {p.repeats ? <Icon icon={Repeat2} size={14} tone="ink3" strokeWidth={2.25} /> : null}
            {p.reminds ? <Icon icon={Bell} size={14} tone="ink3" strokeWidth={2.25} /> : null}
          </View>
        ) : null}
        {p.pill ??
          (p.fact ? (
            p.fact.now ? (
              <NowPill />
            ) : (
              <Txt tnum style={{ ...family("400"), fontSize: 14, lineHeight: 20, color: c.ink3 }}>
                {p.fact.text}
              </Txt>
            )
          ) : null)}
      </View>
      <DottedRule width={2} />
    </Press>
  );
  if (!phone || !p.swipe) return row;
  return (
    <SwipeRow
      color={p.swipe.color}
      onComplete={p.swipe.onComplete}
      moveLabel={p.swipe.moveLabel}
      onMove={p.swipe.onMove}
      onPick={p.swipe.onPick}
    >
      {row}
    </SwipeRow>
  );
}

function NowPill() {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s1,
        paddingHorizontal: s.s2,
        paddingVertical: 2,
        borderRadius: r.card,
        backgroundColor: c.nowFill,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.now }} />
      <Txt style={{ ...family("600"), fontSize: 12, lineHeight: 16, color: c.now }}>Now</Txt>
    </View>
  );
}
