import { Text, type TextProps, type TextStyle } from "react-native";
import { useType, type RoleName } from "@/theme/layout";
import { c } from "@/theme/tokens";

export type Tone = "ink" | "ink2" | "ink3" | "now" | "onInk";

interface Props extends TextProps {
  variant?: RoleName;
  tone?: Tone;
  /** Steady digits for times and counts. */
  tnum?: boolean;
  /** Headings get a role="heading" for screen readers and the browser. */
  heading?: 1 | 2 | 3 | 4;
  strike?: boolean;
}

export function Txt({ variant = "body", tone = "ink", tnum, heading, strike, style, ...rest }: Props) {
  const roles = useType();
  const extra: TextStyle = {};
  if (tnum) extra.fontVariant = ["tabular-nums"];
  if (strike) extra.textDecorationLine = "line-through";
  return (
    <Text
      {...rest}
      {...(heading ? { role: "heading" as const, "aria-level": heading } : {})}
      style={[roles[variant], { color: c[tone] }, extra, style]}
    />
  );
}
