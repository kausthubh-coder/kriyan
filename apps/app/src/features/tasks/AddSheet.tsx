// Android: the route is a native sheet sized to its content, with the field focused at once.
// The native sheet doesn't move for the keyboard, so the content grows by the keyboard's
// height and the field, chips and button ride above it.

import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { c, s } from "@/theme/tokens";
import { QuickAdd } from "./QuickAdd";

export function AddSheet({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
  // `height` runs from 0 to minus the keyboard's height as it opens.
  const { height } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ paddingBottom: s.s4 - height.value }));
  return (
    <Animated.View style={[{ padding: s.s4, paddingTop: s.s3, gap: s.s3, backgroundColor: c.raised }, lift]}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
      </View>
      <QuickAdd variant="sheet" autoFocus initialText={initialText} onAdded={onClose} onClose={onClose} />
    </Animated.View>
  );
}
