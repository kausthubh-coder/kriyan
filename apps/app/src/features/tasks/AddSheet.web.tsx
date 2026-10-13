// Web: quick add as a sheet over a scrim (phones) or a dialog (desktop, when the route is
// opened directly). The field is focused and sits above the keyboard.

import { Pressable, View } from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { Txt } from "@/ui/Txt";
import { QuickAdd } from "./QuickAdd";

const sheetIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(220);

export function AddSheet({ onClose }: { onClose: () => void }) {
  const phone = useIsPhone();
  return (
    <View style={{ flex: 1 }}>
      <Animated.View entering={FadeIn.duration(150)} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        entering={phone ? sheetIn : FadeIn.duration(150)}
        role="dialog"
        aria-modal
        aria-label="Add a task"
        style={
          phone
            ? { position: "absolute", left: 0, right: 0, bottom: 0, padding: s.s4, paddingTop: s.s3, gap: s.s3, borderTopLeftRadius: r.sheet, borderTopRightRadius: r.sheet, backgroundColor: c.raised, boxShadow: shadows.overlay }
            : { position: "absolute", top: "15%", alignSelf: "center", width: 560, padding: s.s4, gap: s.s3, borderRadius: r.card, backgroundColor: c.overlay, boxShadow: shadows.overlay }
        }
      >
        {phone ? (
          <View style={{ alignItems: "center" }}>
            <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
          </View>
        ) : null}
        <Txt variant="subhead" heading={1}>
          Add a task
        </Txt>
        <QuickAdd variant="sheet" autoFocus onAdded={onClose} placeholder="Call mum fri 6pm #life" />
      </Animated.View>
    </View>
  );
}
