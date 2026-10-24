// The prototype's quiet section label (b2.html `.h2`): small, uppercase and letter-spaced, with an
// optional count after it and a control on the right. Goals, Settings and Review share it.

import type { ReactNode } from "react";
import { View } from "react-native";
import { family, s } from "@/theme/tokens";
import { Txt } from "@/ui/Txt";

/** 0.05em at 12px: small capitals crowd together without it. The count repeats it, since a
 * nested Txt resets letter spacing to its own role's. */
const LETTER_SPACING = 0.6;

export function SectionLabel({ title, count, right }: { title: string; count?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: s.s8 }}>
      <Txt
        variant="caption"
        tone="ink3"
        heading={2}
        style={{ ...family("600"), textTransform: "uppercase", letterSpacing: LETTER_SPACING, flex: 1 }}
      >
        {title}
        {count ? (
          <Txt variant="caption" tone="ink3" tnum style={{ ...family("600"), letterSpacing: LETTER_SPACING }}>
            {`  ${count}`}
          </Txt>
        ) : null}
      </Txt>
      {/* A quiet button's label, not its padding, lines up with the column's right edge. */}
      {right ? <View style={{ marginRight: -s.s3 }}>{right}</View> : null}
    </View>
  );
}
