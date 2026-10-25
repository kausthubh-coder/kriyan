// The month (v5 `monthCard`): a dot under each day with something due, today in red, the
// picked day filled red, and "N with no day yet" under it. The month sheet, the desktop panel's
// mini month and Edit's day and due pickers all use it.

import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { addMonths, daysInMonth, fromParts, parts, weekday } from "@kriyan/core/dates";
import { formatDate, MONTH_SHORT } from "@kriyan/core/format";
import { useDue } from "@/data/views";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s } from "@/theme/tokens";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { T } from "./parts";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthCard({
  value,
  today,
  onPick,
  compact,
  undated = true,
}: {
  value: string | null;
  today: string;
  onPick: (date: string) => void;
  /** The desktop panel's smaller month. */
  compact?: boolean;
  /** "N with no day yet" under the month. */
  undated?: boolean;
}) {
  const [vy, vm] = parts(value ?? today);
  const [month, setMonth] = useState<[number, number]>([vy, vm]);
  const count = daysInMonth(month[0], month[1]);
  const first = fromParts(month[0], month[1], 1);
  const last = fromParts(month[0], month[1], count);
  const due = useDue(first, last);
  const cells: (string | null)[] = [
    ...Array.from({ length: weekday(first) }, () => null),
    ...Array.from({ length: count }, (_, i) => fromParts(month[0], month[1], i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const size = compact ? 32 : 44;
  const phone = useIsPhone();
  const navSize = compact ? 32 : phone ? 44 : 40;
  const nav = (label: string, onPress: () => void, child: React.ReactNode, wide?: boolean) => (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        height: navSize,
        minWidth: navSize,
        paddingHorizontal: wide ? s.s3 : 0,
        borderRadius: navSize / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.select,
      }}
    >
      {child}
    </Press>
  );
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: s.s2,
        }}
      >
        <Txt style={{ ...family("600"), fontSize: 20, lineHeight: 28, color: c.ink }}>
          {MONTH_SHORT[month[1] - 1]}{" "}
          <Txt style={{ ...family("600"), fontSize: 20, lineHeight: 28, color: c.ink3 }}>{month[0]}</Txt>
        </Txt>
        <View style={{ flexDirection: "row", gap: s.s2 }}>
          {nav(
            "Previous month",
            () => setMonth(addMonths(month[0], month[1], -1)),
            <Icon icon={ChevronLeft} size={18} tone="ink" />,
          )}
          {nav(
            "This month",
            () => setMonth([parts(today)[0], parts(today)[1]]),
            <T s="strong">Today</T>,
            true,
          )}
          {nav(
            "Next month",
            () => setMonth(addMonths(month[0], month[1], 1)),
            <Icon icon={ChevronRight} size={18} tone="ink" />,
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        {LETTERS.map((l, i) => (
          <T
            key={i}
            s="small"
            tone="ink3"
            extra={{ flex: 1, textAlign: "center", paddingVertical: s.s2, ...family("600") }}
          >
            {l}
          </T>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <View key={w} style={{ flexDirection: "row", marginTop: s.s1 }}>
          {cells.slice(w * 7, w * 7 + 7).map((date, i) => {
            if (!date) return <View key={i} style={{ flex: 1 }} />;
            const picked = date === value;
            const isToday = date === today;
            const dot = (due?.days.find((d) => d.date === date)?.due ?? 0) > 0;
            return (
              <View key={i} style={{ flex: 1, alignItems: "center" }}>
                <Press
                  role="button"
                  accessibilityLabel={formatDate(date)}
                  aria-selected={picked}
                  onPress={() => onPick(date)}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: picked ? c.now : "transparent",
                  }}
                >
                  <Txt
                    tnum
                    style={{
                      ...family(isToday || picked ? "600" : "500"),
                      fontSize: compact ? 14 : 16,
                      lineHeight: 20,
                      color: picked ? c.onInk : isToday ? c.now : c.ink,
                    }}
                  >
                    {Number(date.slice(8))}
                  </Txt>
                  {dot ? (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 2,
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: picked ? c.onInk : c.ink2,
                      }}
                    />
                  ) : null}
                </Press>
              </View>
            );
          })}
        </View>
      ))}
      {undated && due ? (
        <Press
          role="link"
          accessibilityLabel={`${due.undated} with no day yet`}
          onPress={() => router.push("/inbox")}
          style={{
            height: 56,
            marginTop: s.s3,
            flexDirection: "row",
            alignItems: "center",
            borderRadius: r.ctl,
          }}
          hoverBg={null}
        >
          <DottedRule edge="top" width={2} />
          <T s="row" extra={{ flex: 1 }}>{`${due.undated} with no day yet`}</T>
          <Icon icon={ChevronRight} size={18} tone="ink3" />
        </Press>
      ) : null}
    </View>
  );
}
