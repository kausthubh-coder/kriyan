// A small select: shows the value with a chevron and opens its options right below, in
// place, so it works inside popovers and sheets without another layer.

import { useState } from "react";
import { View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import { useControl } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { Txt } from "./Txt";

interface Props<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

export function Select<T extends string>({ value, options, onChange, label }: Props<T>) {
  const [open, setOpen] = useState(false);
  const { ctl } = useControl();
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <View style={{ position: "relative" }}>
      <SelectButton
        label={`${label}: ${current}`}
        text={current}
        onPress={() => setOpen(!open)}
        expanded={open}
        chevron
        height={ctl}
      />
      {open ? (
        <View
          role="menu"
          aria-label={label}
          style={{ marginTop: s.s1, padding: s.s1, borderRadius: r.ctl, backgroundColor: c.bg, gap: 2 }}
        >
          {options.map((o) => (
            <Press
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              scale={false}
              style={{
                minHeight: ctl,
                justifyContent: "center",
                paddingHorizontal: s.s2,
                borderRadius: r.sm,
                backgroundColor: o.value === value ? c.select : "transparent",
              }}
            >
              <Txt variant="body" tone={o.value === value ? "ink" : "ink2"}>
                {o.label}
              </Txt>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The bordered value button from task.html (`.select`). */
export function SelectButton({
  text,
  label,
  onPress,
  expanded,
  chevron,
  height,
}: {
  text: string;
  label?: string;
  onPress: () => void;
  expanded?: boolean;
  chevron?: boolean;
  height?: number;
}) {
  const { ctl } = useControl();
  return (
    <Press
      role="button"
      accessibilityLabel={label ?? text}
      aria-expanded={expanded}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: s.s1,
        height: height ?? ctl,
        minWidth: ctl,
        justifyContent: "center",
        paddingLeft: s.s3,
        paddingRight: chevron ? s.s2 : s.s3,
        borderRadius: r.ctl,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: expanded ? c.lineStrong : c.line,
      }}
    >
      <Txt variant="body" tnum>
        {text}
      </Txt>
      {chevron ? <Icon icon={ChevronDown} size={14} /> : null}
    </Press>
  );
}
