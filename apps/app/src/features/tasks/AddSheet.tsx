// Android: the route is a native sheet sized to its content; the field is focused at once
// and the sheet rides above the keyboard.

import { View } from "react-native";
import { c, s } from "@/theme/tokens";
import { Txt } from "@/ui/Txt";
import { QuickAdd } from "./QuickAdd";

export function AddSheet({ onClose }: { onClose: () => void }) {
  return (
    <View style={{ padding: s.s4, paddingTop: s.s3, gap: s.s3, backgroundColor: c.raised }}>
      <View style={{ alignItems: "center" }}>
        <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
      </View>
      <Txt variant="subhead" heading={1}>
        Add a task
      </Txt>
      <QuickAdd variant="sheet" autoFocus onAdded={onClose} placeholder="Call mum fri 6pm #life" />
    </View>
  );
}
