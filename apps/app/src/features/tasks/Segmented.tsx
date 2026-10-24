// The prototype's segmented switch (b2.html `.seg`): List / Timeline on Today, Task / Event /
// Habit in quick add. Each option is a radio.

import { View } from "react-native";
import { useIsPhone } from "@/theme/layout";
import { c, r } from "@/theme/tokens";
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
  return (
    <View
      role="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", backgroundColor: c.sunken, borderRadius: r.ctl + 2, padding: 2 }}
    >
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
            style={{
              // 44 on touch (Hit Areas); the pill's 2 of padding makes the group 48.
              minHeight: phone ? 44 : 32,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderRadius: r.ctl,
              backgroundColor: on ? c.raised : "transparent",
              ...(on ? { boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : {}),
            }}
          >
            <Txt variant="label" tone={on ? "ink" : "ink3"}>
              {o.label}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}
