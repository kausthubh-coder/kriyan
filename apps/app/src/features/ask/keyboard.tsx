// Android: the ask box rides on top of the keyboard instead of staying under it, and the
// conversation gets the keyboard's height of room so its newest message stays above the box.
// keyboard.web.tsx is the browser's version, where the page itself resizes.

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { KeyboardStickyView, useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";

/**
 * Lifts the box with the keyboard. `rest` is how far the box sits above the screen's bottom
 * while the keyboard is closed (the dock's room); with the keyboard open the box sits `gap`
 * above the keys instead, since the dock is under them.
 */
export function KeyboardLift({
  rest,
  gap,
  style,
  children,
}: {
  rest: number;
  gap: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: rest - gap }} style={style}>
      {children}
    </KeyboardStickyView>
  );
}

/** The keyboard's height as room at the end of the conversation (0 while it's closed). */
export function KeyboardRoom() {
  // `height` runs from 0 to minus the keyboard's height as it opens.
  const { height } = useReanimatedKeyboardAnimation();
  const room = useAnimatedStyle(() => ({ height: -height.value }));
  return <Animated.View style={room} />;
}
