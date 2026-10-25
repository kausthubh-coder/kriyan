// Web: quick add as a sheet over a scrim (phones) or a dialog (desktop, when the route is
// opened directly). The field is focused and sits above the keyboard.

import type { Id } from "@kriyan/convex/dataModel";
import { useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { useInertOutside } from "@/ui/inert";
import { QuickAdd } from "./QuickAdd";

const sheetIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);

export function AddSheet({
  onClose,
  initialText,
  defaultDate,
  defaultSpaceId,
}: {
  onClose: () => void;
  initialText?: string;
  /** Tasks with no day typed land here (the day Today shows). */
  defaultDate?: string;
  /** Tasks with no #space land here (a space's Add). */
  defaultSpaceId?: Id<"spaces">;
}) {
  const phone = useIsPhone();
  const layer = useRef<View>(null);
  useInertOutside(layer);
  return (
    // Fixed to the window, so the scrim covers the sidebar and the dialog centres on the whole
    // window, as B2's `.modal` does, not on the area beside the sidebar.
    <View
      ref={layer}
      style={{ position: "fixed" as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 20 }}
    >
      <Animated.View
        entering={FadeIn.duration(150)}
        style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object}
      >
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        entering={phone ? sheetIn : FadeIn.duration(150)}
        role="dialog"
        aria-modal
        aria-label="Add"
        style={
          phone
            ? {
                // v5's add sheet: nearly the whole screen, the field at the top and the chips
                // and Add at the foot, where the thumb and the keyboard are.
                position: "absolute",
                left: 0,
                right: 0,
                top: s.s12,
                bottom: 0,
                paddingHorizontal: s.s6,
                paddingTop: s.s4,
                paddingBottom: s.s6,
                borderTopLeftRadius: r.float,
                borderTopRightRadius: r.float,
                backgroundColor: c.bg,
                boxShadow: shadows.overlay,
              }
            : {
                position: "absolute",
                // B2: 12% down, 640 wide, centred on the window.
                top: "12%",
                alignSelf: "center",
                width: DIALOG_WIDTH,
                maxWidth: "90%",
                paddingTop: s.s4,
                paddingHorizontal: s.s6,
                paddingBottom: s.s6,
                gap: s.s3,
                borderRadius: r.sheet,
                backgroundColor: c.overlay,
                boxShadow: shadows.overlay,
              }
        }
      >
        <QuickAdd
          variant="sheet"
          autoFocus
          initialText={initialText}
          defaultDate={defaultDate}
          defaultSpaceId={defaultSpaceId}
          onAdded={onClose}
          onClose={onClose}
        />
      </Animated.View>
    </View>
  );
}

/** B2's quick add dialog (`.modal`). */
const DIALOG_WIDTH = 640;
