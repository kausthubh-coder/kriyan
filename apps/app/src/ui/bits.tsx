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
}: {
  color: string;
  done: boolean;
  onPress?: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  const phone = useIsPhone();
  const d = size ?? (phone ? 22 : 18);
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
            borderRadius: d / 2,
            borderWidth: done ? 0 : 1.5,
            borderColor: color,
            backgroundColor: done ? color : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {done ? <CheckGlyph size={d * 0.62} color={hex.bg} strokeWidth={3} /> : null}
          {!done && hovered ? (
            <View
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: d / 2,
                backgroundColor: color,
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
            // Selected is a raised tone with an edge, not solid ink: a chosen setting is a
            // state, and solid ink belongs to the one action on the screen.
            backgroundColor: on ? c.overlay : hovered ? c.select : c.hover,
            ...(on ? { boxShadow: `inset 0 0 0 1px ${c.lineStrong}` } : null),
          }}
        >
          {leading}
          {icon ? <Icon icon={icon} size={14} tone={on ? "ink" : "ink3"} /> : null}
          <Txt
            style={[roles.label, { fontSize: 12, lineHeight: 16 }]}
            tone={on ? "ink" : "ink2"}
            numberOfLines={1}
          >
            {label}
          </Txt>
          {onRemove ? (
            <Txt variant="caption" tone="ink3">
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
export function Ring({ color, done, size = 16 }: { color: string; done: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: done ? 0 : 1.5,
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
