// Every pressable thing: a ripple on Android, a 0.97 press scale on the web, an instant
// hover tint with a mouse, and the focus ring from the stylesheet.

import { forwardRef, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import { c, easeOut, m } from "@/theme/tokens";

export interface PressState {
  pressed: boolean;
  hovered: boolean;
  focused: boolean;
}

interface Props extends Omit<PressableProps, "style" | "children"> {
  children?: ReactNode | ((state: PressState) => ReactNode);
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  /** Background while hovered with a mouse. Defaults to the hover token; pass null for none. */
  hoverBg?: string | null;
  /** Scale on press (web). Rows and big surfaces turn it off. */
  scale?: boolean;
  /** Android ripple; off for controls that draw their own state. */
  ripple?: boolean;
  /** Rounded ripple for icon buttons. */
  rippleRadius?: number;
}

const webTransition = Platform.select<ViewStyle>({
  web: {
    transitionProperty: "transform",
    transitionDuration: `${m.press}ms`,
    transitionTimingFunction: easeOut,
  } as ViewStyle,
  default: {},
});

export const Press = forwardRef<View, Props>(function Press(
  { style, hoverBg, scale = true, ripple = true, rippleRadius, disabled, children, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      android_ripple={ripple ? { color: c.select, borderless: rippleRadius !== undefined, ...(rippleRadius ? { radius: rippleRadius } : {}) } : undefined}
      style={(state: PressableStateCallbackType) => {
        const st = state as PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
        const ps: PressState = { pressed: st.pressed, hovered: Boolean(st.hovered), focused: Boolean(st.focused) };
        const own = typeof style === "function" ? style(ps) : style;
        const hover = hoverBg === null ? undefined : (hoverBg ?? c.hover);
        return [
          webTransition,
          ps.hovered && !disabled && hover ? { backgroundColor: hover } : null,
          own,
          Platform.OS === "web" && scale && ps.pressed && !disabled ? { transform: [{ scale: m.pressScale }] } : null,
          disabled ? { opacity: 0.45 } : null,
          Platform.OS === "web" ? ({ cursor: disabled ? "default" : "pointer" } as ViewStyle) : null,
        ];
      }}
      {...rest}
    >
      {(state: PressableStateCallbackType) => {
        if (typeof children !== "function") return children;
        const st = state as PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
        return children({ pressed: st.pressed, hovered: Boolean(st.hovered), focused: Boolean(st.focused) });
      }}
    </Pressable>
  );
});
