// Android: the route is already a native sheet (two heights, swipe down to close); this
// draws its handle and room for the note toolbar.

import { useEffect, useState, type ReactNode } from "react";
import { useWindowDimensions, View } from "react-native";
import { useNavigation } from "expo-router";
import { NoteToolbarHost } from "@/features/notes/NoteEditor";
import { c, s } from "@/theme/tokens";
import { LightStatusBar } from "@/ui/statusBar";
import { Grabber } from "@/ui/bits";

/** The task sheet's heights, as parts of the screen: it opens at the first. */
export const TASK_SHEET_DETENTS = [0.6, 1];

export function TaskPanel({ children, label }: { children: ReactNode; onClose: () => void; label: string }) {
  // The sheet lays its content out at full height whatever height it shows, so at the lower
  // height the thumb bar would sit below the screen. Fit the content to the height it settled at.
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const [detent, setDetent] = useState(0);
  useEffect(
    () =>
      navigation.addListener(
        "sheetDetentChange" as never,
        (e: { data: { index: number; stable: boolean } }) => {
          if (e.data.stable) setDetent(e.data.index);
        },
      ),
    [navigation],
  );
  const ratio = TASK_SHEET_DETENTS[detent] ?? 1;
  return (
    <View
      aria-label={label}
      style={{
        flex: ratio < 1 ? undefined : 1,
        height: ratio < 1 ? height * ratio : undefined,
        backgroundColor: c.raised,
      }}
    >
      {/* At either height the status bar sits over the dimmed screen behind the sheet. */}
      <LightStatusBar />
      <View style={{ alignItems: "center", paddingTop: s.s3 }}>
        <Grabber />
      </View>
      {children}
      <NoteToolbarHost />
    </View>
  );
}
