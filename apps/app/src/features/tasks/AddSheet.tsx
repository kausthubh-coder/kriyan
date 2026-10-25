// Android: the route is a native sheet sized to its content, with the field focused at once.
// The native sheet doesn't move for the keyboard, so the content grows by the keyboard's
// height and the field, chips and button ride above it.

import { View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { c, s } from "@/theme/tokens";
import { QuickAdd } from "./QuickAdd";
import { Grabber } from "@/ui/bits";

export function AddSheet({
  onClose,
  initialText,
  defaultDate,
}: {
  onClose: () => void;
  initialText?: string;
  /** Tasks with no day typed land here (the day Today shows). */
  defaultDate?: string;
}) {
  // `height` runs from 0 to minus the keyboard's height as it opens.
  const { height } = useReanimatedKeyboardAnimation();
  const lift = useAnimatedStyle(() => ({ paddingBottom: s.s4 - height.value }));
  return (
    <Animated.View style={[{ padding: s.s4, paddingTop: s.s3, gap: s.s3, backgroundColor: c.raised }, lift]}>
      <View style={{ alignItems: "center" }}>
        <Grabber />
      </View>
      <QuickAdd
        variant="sheet"
        autoFocus
        initialText={initialText}
        defaultDate={defaultDate}
        onAdded={onClose}
        onClose={onClose}
      />
    </Animated.View>
  );
}
