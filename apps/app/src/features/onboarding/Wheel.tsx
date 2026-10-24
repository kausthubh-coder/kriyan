// A time wheel (onboarding.html `.wheel`): a short scrolling column of times that settles on
// the one in the middle band. Tapping a time picks it too, so it works with a mouse and with
// a screen reader.

import { useEffect, useRef } from "react";
import { Platform, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { formatClock } from "@kriyan/core/dates";
import { type } from "@kriyan/core/tokens";
import { roleStyle } from "@/theme/layout";
import { c, family, r, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const ITEM = 44;
const HEIGHT = 220;
/** Room above the first time and below the last, so either can sit in the middle band. */
const PAD = (HEIGHT - ITEM) / 2;

/**
 * The wheel's depth: the times two rows from the band fade into the card (`.wheel` mask). On the
 * web a mask follows the scroll; Android dims each time by its distance from the chosen one.
 */
const fade =
  Platform.OS === "web"
    ? ({
        maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
      } as object)
    : null;
const dim = (distance: number) => (Platform.OS === "web" || distance < 2 ? 1 : 0.35);

export function Wheel({
  label,
  icon,
  times,
  value,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  times: number[];
  value: number;
  onChange: (minutes: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(0, times.indexOf(value));

  useEffect(() => {
    // Start with the chosen time in the band.
    const t = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM, animated: false }), 0);
    return () => clearTimeout(t);
    // Only on mount: later changes come from the wheel itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i = Math.min(times.length - 1, Math.max(0, Math.round(y / ITEM)));
      const picked = times[i];
      if (picked !== undefined && picked !== value) onChange(picked);
    }, 90);
  };

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: c.sunken,
        borderRadius: r.box,
        padding: s.s3,
        paddingBottom: s.s2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, paddingHorizontal: s.s1 }}>
        <Icon icon={icon} size={16} tone="ink2" />
        <Txt tone="ink2" style={[roleStyle(type.caption), family("600")]}>
          {label}
        </Txt>
      </View>
      <View style={{ height: HEIGHT, marginTop: s.s2 }}>
        {/* The middle band the chosen time sits in. Corner: the card's 24 less its 12 padding. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: s.s1,
            right: s.s1,
            top: PAD,
            height: ITEM,
            borderRadius: r.card,
            backgroundColor: c.raised,
          }}
        />
        <ScrollView
          ref={ref}
          role="radiogroup"
          aria-label={label}
          showsVerticalScrollIndicator={false}
          style={fade}
          snapToInterval={ITEM}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={32}
        >
          {/* Spacers, not padding: room for the first and last time to reach the band. */}
          <View style={{ height: PAD }} />
          {times.map((t, i) => {
            const on = t === value;
            return (
              <Press
                key={t}
                role="radio"
                aria-checked={on}
                accessibilityLabel={formatClock(t)}
                onPress={() => {
                  onChange(t);
                  ref.current?.scrollTo({ y: i * ITEM, animated: true });
                }}
                hoverBg={null}
                scale={false}
                style={{
                  height: ITEM,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: dim(Math.abs(i - index)),
                }}
              >
                <Txt
                  variant={on ? "headline" : "title"}
                  tone={on ? "ink" : "ink3"}
                  tnum
                  style={on ? undefined : family("500")}
                >
                  {formatClock(t)}
                </Txt>
              </Press>
            );
          })}
          <View style={{ height: PAD }} />
        </ScrollView>
      </View>
    </View>
  );
}
