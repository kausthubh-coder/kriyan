// v5's small pieces, shared by Today's blocks, rows and sheets (docs/design/v5/prototype.html):
// the type sizes it uses (on the policy's scale), the space-coloured checkbox, the pills, the
// big tiles of a sheet, and the floating card the sheets sit in.

import { useEffect, useRef, type ReactNode } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import Animated, { FadeIn, Keyframe } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check as CheckGlyph, type LucideIcon } from "lucide-react-native";
import type { SpaceColor } from "@kriyan/core/tokens";
import { useIsPhone } from "@/theme/layout";
import { bold, c, family, hex, r, s, shadows, spaceTone } from "@/theme/tokens";
import { useInertOutside } from "@/ui/inert";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt, type Tone } from "@/ui/Txt";

/** v5's sizes on the policy's scale: 54 → 40, 26 → 28, 18 → 16, 15 and 13 → 14 and 12. */
export const ty = {
  day: { ...bold, fontSize: 40, lineHeight: 40, letterSpacing: -1.6 },
  date: { ...family("500"), fontSize: 20, lineHeight: 24 },
  row: { ...family("500"), fontSize: 16, lineHeight: 24 },
  rowMeta: { ...family("400"), fontSize: 14, lineHeight: 20 },
  title: { ...family("600"), fontSize: 16, lineHeight: 22, letterSpacing: -0.16 },
  body: { ...family("500"), fontSize: 14, lineHeight: 20 },
  small: { ...family("500"), fontSize: 12, lineHeight: 16 },
  strong: { ...family("600"), fontSize: 14, lineHeight: 20 },
  h2: { ...family("600"), fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  sub: { ...family("500"), fontSize: 20, lineHeight: 26 },
  sentence: { ...family("600"), fontSize: 28, lineHeight: 36, letterSpacing: -0.56 },
  figure: { ...family("600"), fontSize: 80, lineHeight: 84, letterSpacing: -2.4 },
} satisfies Record<string, TextStyle>;

export function T({
  s: style,
  tone = "ink",
  children,
  lines,
  strike,
  tnum,
  extra,
  label,
}: {
  s: keyof typeof ty;
  tone?: Tone;
  children: ReactNode;
  lines?: number;
  strike?: boolean;
  tnum?: boolean;
  extra?: TextStyle;
  label?: string;
}) {
  return (
    <Txt
      tone={tone}
      numberOfLines={lines}
      strike={strike}
      tnum={tnum}
      accessibilityLabel={label}
      style={[ty[style], extra]}
    >
      {children}
    </Txt>
  );
}

/** A task's checkbox in its space's colour (v5 `.box`), or a habit's dashed one, or a routine's ring. */
export function SpaceBox({
  color,
  done,
  label,
  onPress,
  shape = "box",
  size = 20,
  disabled,
}: {
  color: SpaceColor | null;
  done: boolean;
  label: string;
  onPress?: () => void;
  shape?: "box" | "dash" | "ring";
  size?: number;
  disabled?: boolean;
}) {
  const phone = useIsPhone();
  const target = phone ? 44 : 32;
  const inset = (target - size) / 2;
  const ring = color ? spaceTone(color).dot : c.ink3;
  const mark = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: shape === "ring" ? size / 2 : 6,
        borderWidth: 2,
        borderStyle: shape === "dash" && !done ? "dashed" : "solid",
        borderColor: done ? c.lineStrong : ring,
        backgroundColor: done ? c.lineStrong : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {done ? <CheckGlyph size={size * 0.66} color={hex.bg} strokeWidth={3} /> : null}
    </View>
  );
  if (!onPress) return mark;
  return (
    <Press
      role="checkbox"
      aria-checked={done}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hoverBg={null}
      rippleRadius={target / 2}
      style={{
        width: target,
        height: target,
        margin: -inset,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {mark}
    </Press>
  );
}

/** The now red's light fill, over the page colour its parent paints, so red text keeps 4.5:1. */
function RedWash() {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.nowFill }}
    />
  );
}

/** "● Now" in red, "Suggested" in blue, "19 days" in orange. */
export function Pill({ kind, text }: { kind: "now" | "sug" | "streak"; text: string }) {
  const orange = spaceTone("orange");
  const bg = kind === "now" ? c.bg : kind === "sug" ? c.parseFill : orange.surface;
  const fg = kind === "now" ? c.now : kind === "sug" ? c.parse : orange.dot;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s1,
        paddingHorizontal: s.s2,
        paddingVertical: 2,
        borderRadius: r.card,
        backgroundColor: bg,
      }}
    >
      {kind === "now" ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.now }} />
      ) : null}
      <Txt style={[ty.small, family("600"), { color: fg }]}>{text}</Txt>
    </View>
  );
}

export interface TileSpec {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  tone?: "red" | "primary";
  /** The accessible name when the label alone is ambiguous ("Complete Laundry"). */
  name?: string;
}

/** A sheet's big buttons (Joi's tiles): Complete, Tomorrow, Edit, Remove. */
export function Tiles({
  tiles,
  columns,
  height = 80,
}: {
  tiles: TileSpec[];
  columns?: number;
  height?: number;
}) {
  const n = columns ?? tiles.length;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginTop: s.s6 }}>
      {tiles.map((t) => {
        const fg = t.tone === "red" ? c.now : t.tone === "primary" ? c.onInk : c.ink;
        const ink = t.tone === "red" ? "now" : t.tone === "primary" ? "onInk" : "ink";
        return (
          <Press
            key={t.label}
            role="button"
            accessibilityLabel={t.name ?? t.label}
            onPress={t.onPress}
            hoverBg={null}
            style={({ hovered }) => ({
              flexBasis: `${100 / n - 3}%` as `${number}%`,
              flexGrow: 1,
              height,
              borderRadius: r.box,
              alignItems: "center",
              justifyContent: "center",
              gap: s.s2,
              backgroundColor: t.tone === "red" ? c.bg : t.tone === "primary" ? c.ink : c.select,
              overflow: "hidden",
              opacity: hovered ? 0.85 : 1,
            })}
          >
            {t.tone === "red" ? <RedWash /> : null}
            <Icon icon={t.icon} size={22} tone={ink} strokeWidth={2.25} />
            <Txt style={[ty.strong, { color: fg }]}>{t.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** A grey card inside a sheet (v5 `.rvcard`): a countdown, "CSC 316 exam 2 in 7 days". */
export function InfoCard({ children, center }: { children: ReactNode; center?: boolean }) {
  return (
    <View
      style={{
        marginTop: s.s4,
        paddingVertical: s.s3,
        paddingHorizontal: s.s4,
        borderRadius: r.sheet,
        backgroundColor: c.select,
        alignItems: center ? "center" : undefined,
      }}
    >
      {children}
    </View>
  );
}

const cardIn = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 40 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(240);

/**
 * Joi's floating card: on phones it floats 12 from the edges at the bottom over a light scrim;
 * on desktop (`center`) it's a box in the middle of the window. Escape and the scrim close it.
 */
export function FloatCard({
  open,
  onClose,
  label,
  children,
  center,
  width = 460,
  padded = true,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  center?: boolean;
  width?: number;
  padded?: boolean;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layer = useRef<View>(null);
  useInertOutside(layer, open);
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  const card = (
    <Animated.View
      ref={layer}
      entering={cardIn}
      role="dialog"
      aria-modal
      aria-label={label}
      style={
        center
          ? {
              position: "absolute",
              top: "8%",
              alignSelf: "center",
              width,
              maxWidth: "92%",
              maxHeight: height * 0.84,
              borderRadius: r.sheet,
              backgroundColor: c.overlay,
              boxShadow: shadows.overlay,
              overflow: "hidden",
            }
          : {
              position: "absolute",
              left: s.s3,
              right: s.s3,
              bottom: s.s3 + insets.bottom,
              maxHeight: height - insets.top - s.s12,
              borderRadius: r.float,
              backgroundColor: c.sunken,
              boxShadow: shadows.overlay,
              overflow: "hidden",
            }
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={padded ? { padding: s.s6, paddingTop: s.s8 } : undefined}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
  const body = (
    <View style={{ flex: 1 }}>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.scrim }}
      >
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
      </Animated.View>
      {card}
    </View>
  );
  if (Platform.OS === "web")
    return (
      <View style={{ position: "fixed" as "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 30 }}>
        {body}
      </View>
    );
  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {body}
    </Modal>
  );
}

/** A sheet's kind over its title ("Event", "Habit, 4 times a week"). */
export function Kicker({ children, tone = "ink2" }: { children: ReactNode; tone?: Tone }) {
  return (
    <T s="body" tone={tone}>
      {children}
    </T>
  );
}

/** A row of facts under a sheet's title: space, repeat, reminders, place. */
export function Facts({ items }: { items: { icon?: LucideIcon; dot?: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: s.s4, rowGap: s.s1, marginTop: s.s4 }}>
      {items.map((f, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
          {f.dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.dot }} /> : null}
          {f.icon ? <Icon icon={f.icon} size={14} tone="ink2" strokeWidth={2.25} /> : null}
          <T s="body" tone="ink2">
            {f.text}
          </T>
        </View>
      ))}
    </View>
  );
}

/** A choice chip (v5 `.lchips`): a length, a due time. */
export function LenChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const phone = useIsPhone();
  return (
    <Press
      role="radio"
      aria-checked={on}
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={{
        height: phone ? 44 : 40,
        paddingHorizontal: s.s4,
        borderRadius: r.pill,
        justifyContent: "center",
        backgroundColor: on ? c.ink : c.select,
      }}
    >
      <Txt style={[ty.body, { color: on ? c.onInk : c.ink }]}>{label}</Txt>
    </Press>
  );
}

/** A wide button (v5 `.primary` and `.ghost`). */
export function WideButton({
  label,
  onPress,
  kind = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hoverBg={null}
      style={{
        height: 56,
        marginTop: s.s3,
        borderRadius: r.box,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: kind === "primary" ? c.ink : c.select,
      }}
    >
      <Txt style={[ty.title, { color: kind === "primary" ? c.onInk : c.ink }]}>{label}</Txt>
    </Press>
  );
}
