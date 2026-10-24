// Web: quick add as a sheet over a scrim (phones) or a dialog (desktop, when the route is
// opened directly). The field is focused and sits above the keyboard.

import { useRef } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { useInertOutside } from "@/ui/inert";
import { QuickAdd } from "./QuickAdd";
import { Grabber } from "@/ui/bits";

const sheetIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);

export function AddSheet({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
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
        aria-label="Add a task"
        style={
          phone
            ? {
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: s.s4,
                paddingTop: s.s2,
                gap: s.s3,
                borderTopLeftRadius: r.sheet,
                borderTopRightRadius: r.sheet,
                backgroundColor: c.raised,
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
        {phone ? (
          <View style={{ alignItems: "center" }}>
            <Grabber />
          </View>
        ) : null}
        <QuickAdd variant="sheet" autoFocus initialText={initialText} onAdded={onClose} onClose={onClose} />
      </Animated.View>
    </View>
  );
}

/** B2's quick add dialog (`.modal`). */
const DIALOG_WIDTH = 640;
