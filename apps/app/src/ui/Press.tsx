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

/** react-native-web presses on Space only for buttons; these roles toggle on it too. */
const SPACE_TOGGLES = new Set(["checkbox", "switch", "radio", "menuitemcheckbox", "menuitemradio"]);

export const Press = forwardRef<View, Props>(function Press(
  { style, hoverBg, scale = true, ripple = true, rippleRadius, disabled, children, ...rest },
  ref,
) {
  const { onPress, role } = rest;
  const space =
    Platform.OS === "web" && role && SPACE_TOGGLES.has(role) && onPress && !disabled
      ? {
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            if (e.key !== " ") return;
            e.preventDefault();
            onPress(e as never);
          },
        }
      : {};
  // react-native-web's Pressable makes itself a tab stop and ignores `focusable`; a press
  // target that isn't a control (a row's surface, a swipe action out of sight) asks for -1, so
  // a row is two tab stops (its checkbox and its title), not four (A35).
  const unfocusable = Platform.OS === "web" && rest.focusable === false ? { tabIndex: -1 } : {};
  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      {...(space as object)}
      {...(unfocusable as object)}
      android_ripple={
        ripple
          ? {
              color: c.select,
              borderless: rippleRadius !== undefined,
              ...(rippleRadius ? { radius: rippleRadius } : {}),
            }
          : undefined
      }
      style={(state: PressableStateCallbackType) => {
        const st = state as PressableStateCallbackType & { hovered?: boolean; focused?: boolean };
        const ps: PressState = {
          pressed: st.pressed,
          hovered: Boolean(st.hovered),
          focused: Boolean(st.focused),
        };
        const own = typeof style === "function" ? style(ps) : style;
        const hover = hoverBg === null ? undefined : (hoverBg ?? c.hover);
        return [
          webTransition,
          ps.hovered && !disabled && hover ? { backgroundColor: hover } : null,
          own,
          Platform.OS === "web" && scale && ps.pressed && !disabled
            ? { transform: [{ scale: m.pressScale }] }
            : null,
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
