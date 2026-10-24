// The ask box (b2.html `askBarHTML`): suggestions above a round field with a send button. On
// phones it floats above the dock; on desktop it sits at the bottom of the conversation.

import { forwardRef } from "react";
import { Platform, ScrollView, TextInput, View } from "react-native";
import { ArrowUp } from "lucide-react-native";
import { ASK_SUGGESTIONS } from "@kriyan/core/ask";
import { useType } from "@/theme/layout";
import { c, hex, r, s, shadows, sz } from "@/theme/tokens";
import { Chip } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";

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
  const empty = !value.trim();
  return (
    <View style={{ gap: s.s2 }}>
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
            <Chip key={text} label={text} onPress={() => onSend(text)} />
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
          backgroundColor: c.raised,
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
          placeholder="Ask Kriyan or add a task"
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
        <Press
          role="button"
          accessibilityLabel="Send"
          aria-disabled={empty}
          onPress={() => onSend(value)}
          hoverBg={null}
          rippleRadius={sz.touch / 2}
          style={{
            width: sz.touch,
            height: sz.touch,
            borderRadius: r.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: empty ? c.sunken : c.ink,
          }}
        >
          <Icon icon={ArrowUp} size={18} strokeWidth={2} tone={empty ? "ink3" : "onInk"} />
        </Press>
      </View>
    </View>
  );
});
