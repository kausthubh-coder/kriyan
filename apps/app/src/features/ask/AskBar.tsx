// The ask box (b2.html `askBarHTML`): starter chips above a round field with a microphone and a
// solid send button. On phones it floats above the dock; on desktop it follows the page and
// stays at the bottom of the window once the page is taller (`.askd`), on Ask and on Goals.

import { forwardRef, useRef, useState } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { ArrowUp, Mic } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { ASK_SUGGESTIONS } from "@kriyan/core/ask";
import { errorText } from "@/features/tasks/actions";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, isWeb, r, s, shadows, sz } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { useDictation } from "./dictation";

/** The box's tallest height (suggestions and field), so toasts on Ask can sit above it. */
export const ASK_BAR_HEIGHT = sz.touch + s.s2 + sz.touch + 2 * s.s1 + 2;

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  /** Starter requests, for an empty conversation: each is something Kriyan does by itself. */
  suggestions: boolean;
}

export const AskBar = forwardRef<TextInput, Props>(function AskBar(
  { value, onChange, onSend, suggestions },
  ref,
) {
  const roles = useType();
  const phone = useIsPhone();
  const dictation = useDictation(onChange);
  return (
    <View style={{ gap: phone ? s.s2 : s.s3 }}>
      {suggestions ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          role="group"
          aria-label="Suggestions"
          contentContainerStyle={{ gap: s.s2 }}
        >
          {ASK_SUGGESTIONS.map((text) => (
            <Starter key={text} label={text} phone={phone} onPress={() => onSend(text)} />
          ))}
        </ScrollView>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s1,
          paddingVertical: s.s1,
          paddingRight: s.s1,
          paddingLeft: s.s4,
          borderRadius: r.sheet,
          borderWidth: 1,
          borderColor: c.line,
          // B2's `--bar`: white in light, a step above the raised surface in dark.
          backgroundColor: c.overlay,
          boxShadow: shadows.overlay,
        }}
      >
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChange}
          onSubmitEditing={() => onSend(value)}
          submitBehavior="submit"
          enterKeyHint="send"
          autoComplete="off"
          placeholder={dictation.listening ? "Listening…" : "Ask Kriyan or add a task"}
          placeholderTextColor={hex.ink3}
          accessibilityLabel="Ask Kriyan"
          maxLength={1000}
          style={[
            roles.body,
            // 16px everywhere, so a phone's browser never zooms in on focus.
            { flex: 1, minWidth: 0, minHeight: sz.touch, fontSize: 16, color: c.ink, padding: 0 },
            Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
          ]}
        />
        {/* Ctrl K reaches the command menu, which asks or adds the same way, from anywhere. */}
        {isWeb && !phone ? (
          <View
            aria-hidden
            style={{
              paddingHorizontal: s.s1,
              borderRadius: r.sm,
              borderWidth: 1,
              borderColor: c.line,
              marginRight: s.s1,
            }}
          >
            <Txt variant="caption" tone="ink3">
              Ctrl K
            </Txt>
          </View>
        ) : null}
        {dictation.supported ? (
          <Press
            role="button"
            accessibilityLabel={dictation.listening ? "Stop dictating" : "Dictate"}
            aria-pressed={dictation.listening}
            onPress={() => dictation.toggle(value)}
            rippleRadius={sz.touch / 2}
            style={{
              width: sz.touch,
              height: sz.touch,
              borderRadius: r.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: dictation.listening ? c.select : "transparent",
            }}
          >
            <Icon icon={Mic} size={20} tone={dictation.listening ? "ink" : "ink2"} />
          </Press>
        ) : null}
        {/* Solid even when empty: the box's one action stays its anchor (b2.html `.send`). */}
        <Press
          role="button"
          accessibilityLabel="Send"
          onPress={() => onSend(value)}
          hoverBg={null}
          rippleRadius={sz.touch / 2}
          style={{
            width: sz.touch,
            height: sz.touch,
            borderRadius: r.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.ink,
          }}
        >
          <Icon icon={ArrowUp} size={18} strokeWidth={2} tone="onInk" />
        </Press>
      </View>
    </View>
  );
});

/** A starter request (b2.html `.starters .chip`): a small outlined label, not a filled pill. */
function Starter({ label, phone, onPress }: { label: string; phone: boolean; onPress: () => void }) {
  const roles = useType();
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      // The visible chip stays small; the target is 44 high on touch (Hit Areas).
      style={{ height: phone ? sz.touch : sz.ctl, justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            height: phone ? sz.row : sz.ctl,
            justifyContent: "center",
            paddingHorizontal: s.s3,
            borderRadius: r.ctl,
            backgroundColor: hovered ? c.hover : "transparent",
            boxShadow: `inset 0 0 0 1px ${c.lineStrong}`,
          }}
        >
          <Txt style={[roles.label, { fontSize: 12, lineHeight: 16 }]} numberOfLines={1}>
            {label}
          </Txt>
        </View>
      )}
    </Press>
  );
}

/**
 * Sends a request to Ask. The field empties at once and gets the words back if sending fails;
 * a second press while one is on its way does nothing.
 */
export function useSendAsk(setText: (text: string) => void): (raw: string) => void {
  const sendAsk = useMutation(api.assistant.send);
  const sending = useRef(false);
  return (raw: string) => {
    const words = raw.trim();
    if (!words || sending.current) return;
    sending.current = true;
    setText("");
    sendAsk({ text: words })
      .catch((e: unknown) => {
        setText(words);
        showToast(errorText(e));
      })
      .finally(() => {
        sending.current = false;
      });
  };
}

/**
 * The box on a page other than Ask (desktop Goals and Today): it keeps its own text, and a
 * request opens Ask, where the answer appears (b2.html `askSubmit`).
 */
export function AskBox() {
  const [text, setText] = useState("");
  const router = useRouter();
  const send = useSendAsk(setText);
  return (
    <AskBar
      value={text}
      onChange={setText}
      onSend={(raw) => {
        if (!raw.trim()) return;
        send(raw);
        router.navigate("/ask");
      }}
      suggestions={false}
    />
  );
}
