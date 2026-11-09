// "To fit in" (v5, the checklist card): what still needs a time, as a short list above the day.
// Tick one off right there; tap one to fill the next free stretch with it; drag one onto a free
// stretch to put it at that time (Android: hold, then drag; desktop: drag with the mouse).

import { useState } from "react";
import { Platform, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type { FitChip } from "@kriyan/core/today";
import type { Id } from "@kriyan/convex/dataModel";
import { completeTask, ticking } from "@/features/tasks/actions";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { DragSource } from "./DragSource";
import { SpaceBox, T } from "./parts";

/** Rows shown before "Show all": enough to see the day's shape without pushing it off screen. */
const FOLDED = 4;

export function FitIn({
  chips,
  onPick,
  onOpen,
}: {
  chips: FitChip[];
  /** Fill the next free stretch with this one. */
  onPick: (id: string) => void;
  /** Hold without dragging: the task itself. */
  onOpen: (id: string) => void;
}) {
  const phone = useIsPhone();
  const [all, setAll] = useState(false);
  if (!chips.length) return null;
  const shown = all ? chips : chips.slice(0, FOLDED);
  // Phones on the web have no drag (the page scrolls under the finger), so they tap.
  const hint =
    Platform.OS !== "web"
      ? "Hold one, drag it onto a free time"
      : phone
        ? "Tap one to give it a time"
        : "Drag one onto a free time";
  return (
    <View
      aria-label={`To fit in, ${chips.length}`}
      style={{
        marginTop: s.s4,
        borderRadius: r.box,
        backgroundColor: c.sunken,
        paddingTop: s.s3,
        paddingBottom: s.s1,
        paddingHorizontal: s.s4,
      }}
    >
      <View
        style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: s.s2 }}
      >
        <T s="strong">{`To fit in ${chips.length}`}</T>
        <T s="small" tone="ink3" lines={1} extra={{ flexShrink: 1 }}>
          {hint}
        </T>
      </View>
      <View style={{ marginTop: s.s1 }}>
        {shown.map((chip, i) => (
          <FitRow key={chip.item.id} chip={chip} first={i === 0} onPick={onPick} onOpen={onOpen} />
        ))}
        {chips.length > FOLDED ? (
          <MoreRow hidden={chips.length - FOLDED} open={all} onPress={() => setAll((v) => !v)} />
        ) : null}
      </View>
    </View>
  );
}

function FitRow({
  chip: { item, note },
  first,
  onPick,
  onOpen,
}: {
  chip: FitChip;
  first: boolean;
  onPick: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const isTicking = ticking.useValue((t) => Boolean(t[item.id]));
  return (
    <DragSource
      taskId={item.id}
      title={item.title}
      color={item.color ? spaceTone(item.color).dot : c.ink3}
      length={item.length}
      onHold={onOpen}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: c.line,
        }}
      >
        <SpaceBox
          color={item.color}
          done={isTicking}
          label={`Complete: ${item.title}`}
          onPress={() => {
            if (!isTicking) completeTask({ _id: item.id as Id<"tasks">, title: item.title, date: item.date });
          }}
        />
        <Press
          role="button"
          accessibilityLabel={`Fit in ${item.title}, ${note}`}
          onPress={() => onPick(item.id)}
          hoverBg={null}
          scale={false}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: s.s2,
          }}
        >
          <T s="row" lines={1} strike={isTicking} tone={isTicking ? "ink3" : "ink"} extra={{ flex: 1 }}>
            {item.title}
          </T>
          <T s="small" tone="ink3" tnum>
            {note}
          </T>
        </Press>
      </View>
    </DragSource>
  );
}

/**
 * The last row folds and unfolds the list. It sits in the list like a task row, its chevron in
 * the tick's column and its words under the titles, so it reads as part of the list, not a button
 * below it, and it names what it hides ("2 more") rather than a count to work out.
 */
function MoreRow({ hidden, open, onPress }: { hidden: number; open: boolean; onPress: () => void }) {
  const label = open ? "Show fewer" : `${hidden} more`;
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      aria-expanded={open}
      onPress={onPress}
      hoverBg={null}
      scale={false}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        borderTopWidth: 1,
        borderTopColor: c.line,
      }}
    >
      {/* The tick's width: SpaceBox lays out at its 20 and lets its tap target overhang. */}
      <View style={{ width: 20, alignItems: "center" }}>
        <Icon icon={open ? ChevronUp : ChevronDown} size={20} tone="ink2" />
      </View>
      <T s="row" tone="ink2">
        {label}
      </T>
    </Press>
  );
}
