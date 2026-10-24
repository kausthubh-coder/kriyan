// Android: the route is a native sheet sized to its content; the field is focused at once
// and the sheet rides above the keyboard.

import { View } from "react-native";
import { c, s } from "@/theme/tokens";
import { QuickAdd } from "./QuickAdd";

export function AddSheet({ onClose, initialText }: { onClose: () => void; initialText?: string }) {
  return (
    <View style={{ padding: s.s4, paddingTop: s.s3, gap: s.s3, backgroundColor: c.raised }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
      </View>
      <QuickAdd variant="sheet" autoFocus initialText={initialText} onAdded={onClose} onClose={onClose} />
    </View>
  );
}
