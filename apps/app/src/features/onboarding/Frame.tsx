// The onboarding shell (onboarding.html `.ob`): a progress bar with Back and Skip, the question,
// a quiet line under it, the step's content, and its buttons at the bottom. On the phone it
// fills the screen; on desktop it is a card beside the live preview of the day.

import { createContext, useContext, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { c, family, r, s, shadows } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

/** Steps 2 to 9 fill the bar; 1 is the welcome. */
const TOTAL = 8;

/** True when the step is drawn as the desktop card. */
export const DesktopCard = createContext(false);

/** The step's one solid button (b2.html `.btn-full`); `inverse` sits on the black welcome. */
export function FullButton({
  label,
  onPress,
  disabled,
  inverse,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  inverse?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hoverBg={null}
      style={({ hovered }) => ({
        height: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s.s2,
        borderRadius: r.card,
        backgroundColor: disabled ? c.hover : inverse ? c.headInk : c.ink,
        opacity: hovered && !disabled ? 0.92 : 1,
      })}
    >
      {icon}
      <Txt
        variant="subhead"
        tone={disabled ? "ink3" : inverse ? undefined : "onInk"}
        style={inverse ? { color: c.head } : undefined}
      >
        {label}
      </Txt>
    </Press>
  );
}

/** A quiet text button under the solid one ("Not now", "Change it"). */
export function LinkButton({
  label,
  onPress,
  onDark,
}: {
  label: string;
  onPress: () => void;
  onDark?: boolean;
}) {
  return (
    <View style={{ alignSelf: "center" }}>
      <Press
        role="button"
        accessibilityLabel={label}
        onPress={onPress}
        hoverBg={onDark ? c.headFill : c.hover}
        style={{
          minHeight: 44,
          minWidth: 44,
          justifyContent: "center",
          paddingHorizontal: s.s3,
          borderRadius: r.ctl,
        }}
      >
        <Txt variant="label" tone={onDark ? "headInk" : "ink2"}>
          {label}
        </Txt>
      </Press>
    </View>
  );
}

function TopBar({ step, onBack, onSkip }: { step: number; onBack?: () => void; onSkip?: () => void }) {
  const filled = step - 1;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 48 }}>
      <View style={{ width: 44 }}>
        {onBack ? <Button icon={ChevronLeft} accessibilityLabel="Back" onPress={onBack} /> : null}
      </View>
      <View style={{ flex: 1, alignItems: "center" }}>
        <View
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={filled}
          style={{ flexDirection: "row", gap: s.s1, width: "100%", maxWidth: 200 }}
        >
          {Array.from({ length: TOTAL }, (_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < filled ? c.ink : c.select }}
            />
          ))}
        </View>
      </View>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>
        {onSkip ? <Button label="Skip" onPress={onSkip} /> : null}
      </View>
    </View>
  );
}

/** The step's question: two tones, like the Today sentence (`.q` and `.q .d`). */
export function Question({ text, dim }: { text: string; dim?: string }) {
  return (
    <Txt variant="headline" heading={1} style={{ marginTop: s.s4 }}>
      {text}
      {dim ? <Txt variant="headline" tone="ink3">{` ${dim}`}</Txt> : null}
    </Txt>
  );
}

export function Lead({ children }: { children: ReactNode }) {
  return (
    <Txt variant="body" tone="ink3" style={{ marginTop: s.s2, maxWidth: 400 }}>
      {children}
    </Txt>
  );
}

/** A small uppercase label over a group (`.mini .lbl`, `.sec`). */
export function MiniLabel({ text }: { text: string }) {
  return (
    <Txt
      variant="caption"
      tone="ink3"
      style={{ ...family("600"), textTransform: "uppercase", letterSpacing: 0.6, marginBottom: s.s1 }}
    >
      {text}
    </Txt>
  );
}

/**
 * One step: the bar, its content, and its buttons kept at the bottom. `dark` is the black
 * welcome; `bare` leaves out the bar (the last step draws its own header).
 */
export function StepFrame({
  step,
  onBack,
  onSkip,
  foot,
  children,
  dark,
  bare,
}: {
  step: number;
  onBack?: () => void;
  onSkip?: () => void;
  foot?: ReactNode;
  children: ReactNode;
  dark?: boolean;
  bare?: boolean;
}) {
  const card = useContext(DesktopCard);
  const insets = useSafeAreaInsets();
  // The last step draws its own 24 px gutters; the button lines up with them.
  const pad = card && !bare ? s.s8 : s.s6;
  return (
    <View
      style={{
        flex: card ? undefined : 1,
        width: "100%",
        maxWidth: card ? 480 : 560,
        height: card ? 800 : undefined,
        maxHeight: card ? "100%" : undefined,
        alignSelf: "center",
        backgroundColor: dark ? c.head : c.raised,
        borderRadius: card ? r.sheet : 0,
        boxShadow: card && !dark ? shadows.overlay : undefined,
        overflow: "hidden",
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: bare ? 0 : card ? s.s4 : insets.top + s.s2,
          paddingHorizontal: bare ? 0 : pad,
          paddingBottom: s.s4,
        }}
      >
        {bare || step === 1 ? null : <TopBar step={step} onBack={onBack} onSkip={onSkip} />}
        {children}
      </ScrollView>
      {foot ? (
        <View
          style={{
            gap: s.s1,
            paddingTop: s.s2,
            paddingHorizontal: pad,
            paddingBottom: card ? s.s6 : insets.bottom + s.s4,
            backgroundColor: dark ? c.head : c.raised,
          }}
        >
          {foot}
        </View>
      ) : null}
    </View>
  );
}
