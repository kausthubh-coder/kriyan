// v5's setting controls (docs/design/v5 prototype `.opt`, `.tog`, `.seg`): a row with a switch,
// a segmented choice, and a time with − and + on either side. Settings and Agents use them.

import type { ReactNode } from "react";
import { View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s, shadows, sz } from "@/theme/tokens";
import { DottedRule } from "@/ui/DottedRule";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

const ROW = 56;

/** The prototype's switch: green when on, a white knob that slides. */
export function Toggle({ on }: { on: boolean }) {
  return (
    <View
      aria-hidden
      style={{
        width: 48,
        height: 28,
        borderRadius: r.pill,
        padding: 2,
        backgroundColor: on ? c.done : c.lineStrong,
        alignItems: on ? "flex-end" : "flex-start",
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: r.pill,
          backgroundColor: c.headInk,
          boxShadow: shadows.raised,
        }}
      />
    </View>
  );
}

/** A setting that is on or off: the whole row flips it. */
export function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Press
      role="switch"
      aria-checked={on}
      accessibilityLabel={label}
      onPress={() => onChange(!on)}
      scale={false}
      hoverBg={null}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: ROW, paddingVertical: s.s2 }}
    >
      <View style={{ flex: 1 }}>
        <Txt variant="subhead" style={family("500")}>
          {label}
        </Txt>
        {hint ? (
          <Txt variant="meta" tone="ink3">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Toggle on={on} />
      <DottedRule width={2} />
    </Press>
  );
}

/** One of a few values, as a segmented control; the chosen one is lifted. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  const phone = useIsPhone();
  return (
    <View
      role="radiogroup"
      aria-label={label}
      style={{ flexDirection: "row", gap: 2, padding: s.s1, borderRadius: r.card, backgroundColor: c.sunken }}
    >
      {options.map(([key, text]) => {
        const on = key === value;
        return (
          <Press
            key={key}
            role="radio"
            aria-checked={on}
            accessibilityLabel={text}
            onPress={() => onChange(key)}
            hoverBg={null}
            scale={false}
            style={({ hovered }) => ({
              flex: 1,
              height: phone ? sz.touch : 36,
              borderRadius: r.ctl,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? c.bg : hovered ? c.hover : "transparent",
              boxShadow: on ? shadows.raised : undefined,
            })}
          >
            <Txt
              variant="label"
              tone={on ? "ink" : "ink2"}
              numberOfLines={1}
              style={{ fontSize: 14, lineHeight: 20 }}
            >
              {text}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** A setting with its control under the name (a segmented choice). */
export function StackedSetting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: s.s2, paddingVertical: s.s3 }}>
      <Txt variant="subhead" style={family("500")}>
        {label}
      </Txt>
      {children}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: typeof Plus;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hoverBg={null}
      rippleRadius={sz.touch / 2}
      style={{ width: sz.touch, height: sz.touch, alignItems: "center", justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: r.pill,
            backgroundColor: hovered ? c.select : c.sunken,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={icon} size={16} tone="ink" strokeWidth={2.25} />
        </View>
      )}
    </Press>
  );
}

/** A time of day with − and + a quarter of an hour at a time ("Wake up − 07:00 +"). */
export function StepperRow({
  label,
  value,
  text,
  onChange,
  step = 15,
  min = 0,
  max = 1439,
}: {
  label: string;
  value: number;
  /** The value as shown ("07:00"). */
  text: string;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: ROW }}>
      <Txt variant="subhead" style={[family("500"), { flex: 1 }]}>
        {label}
      </Txt>
      <RoundButton
        icon={Minus}
        label={`${label} earlier`}
        onPress={() => onChange(value - step)}
        disabled={value - step < min}
      />
      <Txt
        variant="subhead"
        tnum
        accessibilityLabel={`${label}: ${text}`}
        style={[family("600"), { width: 48, textAlign: "center" }]}
      >
        {text}
      </Txt>
      {/* The circle, not its 44 target, ends on the row's right edge. */}
      <View style={{ marginRight: -6 }}>
        <RoundButton
          icon={Plus}
          label={`${label} later`}
          onPress={() => onChange(value + step)}
          disabled={value + step > max}
        />
      </View>
      <DottedRule width={2} />
    </View>
  );
}
