// Android: the route is already a native sheet (two heights, swipe down to close); this
// draws its handle and room for the note toolbar.

import type { ReactNode } from "react";
import { View } from "react-native";
import { NoteToolbarHost } from "@/features/notes/NoteEditor";
import { c, s } from "@/theme/tokens";

export function TaskPanel({ children, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <View aria-label={label} style={{ flex: 1, backgroundColor: c.raised }}>
      <View style={{ alignItems: "center", paddingTop: s.s3 }}>
        <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: c.lineStrong }} />
      </View>
      {children}
      <NoteToolbarHost />
    </View>
  );
}
