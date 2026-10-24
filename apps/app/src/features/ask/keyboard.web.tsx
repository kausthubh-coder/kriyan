// The browser resizes the page for its keyboard, so the ask box needs no lift there
// (keyboard.tsx is Android's).

import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function KeyboardLift({
  style,
  children,
}: {
  rest: number;
  gap: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return <View style={style}>{children}</View>;
}

export function KeyboardRoom() {
  return null;
}
