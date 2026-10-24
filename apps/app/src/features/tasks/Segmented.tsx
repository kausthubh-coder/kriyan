// The prototype's segmented switch (b2.html `.seg`): List / Timeline on Today, Task / Event /
// Habit in quick add. Each option is a radio.

import { View } from "react-native";
import { type } from "@kriyan/core/tokens";
import { roleStyle, useIsPhone } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** What the group switches, for screen readers. */
  label: string;
}) {
  const phone = useIsPhone();
  // B2's compact group: 32 segments in a 36 track on both layouts. On touch each segment is a
  // 44 target, taller than the track it draws (Hit Areas), so the track is drawn behind them.
  const target = phone ? 44 : 32;
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", paddingHorizontal: 2 }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: (target - TRACK) / 2,
          height: TRACK,
          borderRadius: r.ctl + 2,
          backgroundColor: c.sunken,
        }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            role="radio"
            aria-checked={on}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            hoverBg={null}
            style={{ minHeight: target, justifyContent: "center" }}
          >
            <View
              style={{
                height: 32,
                paddingHorizontal: s.s3,
                justifyContent: "center",
                borderRadius: r.ctl,
                backgroundColor: on ? c.raised : "transparent",
                ...(on ? { boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : {}),
              }}
            >
              <Txt tone={on ? "ink" : "ink3"} style={segmentText}>
                {o.label}
              </Txt>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

/** The grey track behind the segments: 2 around a 32 segment. */
const TRACK = 36;

/** 14 on both layouts, like B2's segments; the phone's label role is 16. */
const segmentText = roleStyle(type.label);
