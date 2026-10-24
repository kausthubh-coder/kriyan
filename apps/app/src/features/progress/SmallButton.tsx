// The prototype's small round button (b2.html `.btn-sm`): a compact filled pill for a secondary
// action inside a card or a row, like "Plan it", "Sign out" or "Try it". It stays 32 high on
// phones too; its touch target reaches 44 without making the pill heavier (Hit Areas).

import { View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { useIsPhone } from "@/theme/layout";
import { c, family, hex, r, s, sz } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

export function SmallButton({
  label,
  icon: Glyph,
  filled,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: LucideIcon;
  /** A solid glyph, like B2's filled play triangle on "Try it". */
  filled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const phone = useIsPhone();
  return (
    <Press
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hoverBg={null}
      style={{ alignSelf: "flex-start", height: phone ? sz.touch : sz.ctl, justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            height: sz.ctl,
            flexDirection: "row",
            alignItems: "center",
            gap: s.s2,
            paddingHorizontal: s.s3,
            borderRadius: r.pill,
            backgroundColor: hovered ? c.select : c.hover,
          }}
        >
          {Glyph && filled ? (
            <Glyph size={14} color={hex.ink} fill={hex.ink} aria-hidden focusable={false} />
          ) : Glyph ? (
            <Icon icon={Glyph} size={16} tone="ink" />
          ) : null}
          {/* 14 on phones too: the pill is compact, like B2's 13px label. */}
          <Txt variant="label" numberOfLines={1} style={[family("600"), { fontSize: 14, lineHeight: 20 }]}>
            {label}
          </Txt>
        </View>
      )}
    </Press>
  );
}
