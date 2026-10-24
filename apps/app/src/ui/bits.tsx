// Small pieces used everywhere: the checkbox ring, the space dot, chips, a field, skeletons.

import { forwardRef, type ReactNode } from "react";
import { Platform, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { Check as CheckGlyph, type LucideIcon } from "lucide-react-native";
import { useControl, useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { Txt } from "./Txt";

/** The round checkbox. Its ring is the space's colour; done fills it. */
export function Check({
  color,
  done,
  onPress,
  label,
  size,
  disabled,
  round,
}: {
  color: string;
  done: boolean;
  onPress?: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
  /**
   * A space-coloured ring, for blocks on the timeline. Without it the check is the prototype's
   * rounded square in ink, faint with a tick once done (b2.html `.tick`).
   */
  round?: boolean;
}) {
  const phone = useIsPhone();
  // B2's list box is a 16px square on both layouts; a round ring on a block is a little larger.
  const d = size ?? (round ? (phone ? 22 : 18) : 16);
  const ring = round ? color : done ? c.ink3 : c.ink2;
  // The visible ring stays small; the target grows to 44 on touch (Hit Areas).
  const target = phone ? 44 : 32;
  const inset = (target - d) / 2;
  return (
    <Press
      role="checkbox"
      aria-checked={done}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hoverBg={null}
      rippleRadius={target / 2}
      style={{
        width: target,
        height: target,
        margin: -inset,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <View
          style={{
            width: d,
            height: d,
            borderRadius: round ? d / 2 : d * 0.28,
            // B2's rings on the timeline are a firmer 2.
            borderWidth: round && done ? 0 : round ? 2 : 1.75,
            borderColor: ring,
            backgroundColor: round && done ? color : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {done ? (
            <CheckGlyph size={d * 0.62} color={round ? hex.bg : hex.ink3} strokeWidth={round ? 3 : 2.25} />
          ) : null}
          {!done && hovered ? (
            <View
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: round ? d / 2 : d * 0.28,
                backgroundColor: ring,
                opacity: 0.14,
              }}
            />
          ) : null}
        </View>
      )}
    </Press>
  );
}

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

export function Chip({
  label,
  icon,
  on,
  onPress,
  onRemove,
  leading,
  accessibilityLabel,
}: {
  label: string;
  icon?: LucideIcon;
  on?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
  leading?: ReactNode;
  accessibilityLabel?: string;
}) {
  const phone = useIsPhone();
  const roles = useType();
  return (
    <Press
      role="button"
      aria-pressed={on}
      accessibilityLabel={accessibilityLabel ?? (onRemove ? `Remove ${label}` : label)}
      onPress={onRemove ?? onPress}
      hoverBg={null}
      style={{ height: phone ? 44 : 28, minWidth: phone ? 44 : undefined, justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s.s2,
            height: phone ? 36 : 28,
            paddingHorizontal: s.s3,
            borderRadius: phone ? 18 : 14,
            // Picked is solid ink, like the calendar's picked day: one selected look in every
            // picker (B2's `.chip.on`, `.pgrid .on`).
            backgroundColor: on ? c.ink : hovered ? c.select : c.hover,
          }}
        >
          {leading}
          {icon ? <Icon icon={icon} size={14} tone={on ? "onInk" : "ink3"} /> : null}
          <Txt
            style={[roles.label, { fontSize: 12, lineHeight: 16 }]}
            tone={on ? "onInk" : "ink2"}
            numberOfLines={1}
          >
            {label}
          </Txt>
          {onRemove ? (
            <Txt variant="caption" tone={on ? "onInk" : "ink3"}>
              ×
            </Txt>
          ) : null}
        </View>
      )}
    </Press>
  );
}

/** A text field on the sunken surface. */
export const Field = forwardRef<
  TextInput,
  TextInputProps & {
    icon?: LucideIcon;
    label: string;
    containerStyle?: StyleProp<ViewStyle>;
    trailing?: ReactNode;
  }
>(function Field({ icon, label, containerStyle, trailing, style, ...rest }, ref) {
  const { ctl } = useControl();
  const roles = useType();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
          height: ctl,
          paddingHorizontal: s.s3,
          borderRadius: r.ctl,
          backgroundColor: c.sunken,
          // The edge is light, not a border, so the input fills the field's full height.
          boxShadow: `inset 0 0 0 1px ${c.line}`,
        },
        containerStyle,
      ]}
    >
      {icon ? <Icon icon={icon} size={16} /> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={hex.ink3}
        style={[
          roles.body,
          // 16px on phones so the browser never zooms in on focus.
          { flex: 1, minWidth: 0, height: "100%", color: c.ink, padding: 0 },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
          style,
        ]}
        {...rest}
      />
      {trailing}
    </View>
  );
});

export function Skeleton({
  width,
  height = 14,
  style,
}: {
  width: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ width, height, borderRadius: r.sm, backgroundColor: c.hover }, style]} />;
}

export function Kbd({ children }: { children: string }) {
  return (
    <Txt variant="caption" tone="ink3">
      {children}
    </Txt>
  );
}

/** The checkbox's look without the control, for rows that are themselves the control. */
/** Picking from a list. Square and ink, so a pick never reads as a task done (the round Ring). */
export function PickBox({ on, size = 18 }: { on: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: r.sm,
        borderWidth: on ? 0 : 1.5,
        borderColor: c.ink3,
        backgroundColor: on ? c.ink : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on ? <CheckGlyph size={size * 0.62} color={hex.onInk} strokeWidth={3} /> : null}
    </View>
  );
}

/** A habit's ring. Dashed while it waits for today's check-in (B2's habit mark). */
export function Ring({
  color,
  done,
  size = 16,
  dashed,
}: {
  color: string;
  done: boolean;
  size?: number;
  dashed?: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: done ? 0 : 1.5,
        borderStyle: dashed && !done ? "dashed" : "solid",
        borderColor: color,
        backgroundColor: done ? color : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done ? <CheckGlyph size={size * 0.62} color={hex.bg} strokeWidth={3} /> : null}
    </View>
  );
}

/** A sheet's handle (B2's `.grab`, 38 by 5): it says the sheet drags. */
export function Grabber() {
  return <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: c.lineStrong }} />;
}
