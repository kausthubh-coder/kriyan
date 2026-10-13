import { forwardRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useControl } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Icon } from "./Icon";
import { Press } from "./Press";
import { Txt } from "./Txt";

type Variant = "default" | "primary" | "quiet";

interface Props {
  label?: string;
  icon?: LucideIcon;
  /** Icon after the label (a chevron on a select). */
  trailing?: LucideIcon;
  onPress?: () => void;
  variant?: Variant;
  /** Icon-only buttons need a name for screen readers and the check. */
  accessibilityLabel?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Shortcut shown after the label, like "N". */
  kbd?: string;
  children?: ReactNode;
  expanded?: boolean;
  testID?: string;
}

export const Button = forwardRef<View, Props>(function Button(
  {
    label,
    icon,
    trailing,
    onPress,
    variant = "default",
    accessibilityLabel,
    disabled,
    style,
    kbd,
    children,
    expanded,
    testID,
  },
  ref,
) {
  const { ctl } = useControl();
  const iconOnly = !label && !children;
  const primary = variant === "primary";
  return (
    <Press
      ref={ref}
      testID={testID}
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-expanded={expanded}
      onPress={onPress}
      disabled={disabled}
      hoverBg={primary ? null : c.hover}
      rippleRadius={iconOnly ? ctl / 2 : undefined}
      style={({ hovered }) => [
        {
          height: ctl,
          minWidth: ctl,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s.s2,
          paddingHorizontal: iconOnly ? 0 : s.s3,
          borderRadius: r.ctl,
          backgroundColor: primary ? c.ink : "transparent",
          overflow: "hidden",
        },
        primary && hovered ? { opacity: 0.92 } : null,
        style,
      ]}
    >
      {({ hovered }: { hovered?: boolean }) => (
        <>
          {icon ? (
            <Icon
              icon={icon}
              tone={
                primary
                  ? "onInk"
                  : hovered
                    ? "ink"
                    : variant === "quiet"
                      ? "ink3"
                      : iconOnly
                        ? "ink3"
                        : "ink2"
              }
            />
          ) : null}
          {label ? (
            <Txt
              variant="label"
              tone={primary ? "onInk" : hovered ? "ink" : variant === "quiet" ? "ink3" : "ink2"}
              numberOfLines={1}
            >
              {label}
            </Txt>
          ) : null}
          {children}
          {kbd ? (
            <Txt variant="caption" tone="ink3">
              {kbd}
            </Txt>
          ) : null}
          {trailing ? <Icon icon={trailing} size={14} tone="ink3" /> : null}
        </>
      )}
    </Press>
  );
});
