// A multiline text input that grows with its text (titles, note blocks). Starts at one line.

import { forwardRef, useState } from "react";
import { Platform, TextInput, type TextInputProps, type TextStyle } from "react-native";

export const AutoInput = forwardRef<TextInput, TextInputProps & { lineHeight: number; padY?: number }>(function AutoInput(
  { lineHeight, padY = 0, style, onContentSizeChange, ...rest },
  ref,
) {
  const [height, setHeight] = useState<number | null>(null);
  return (
    <TextInput
      ref={ref}
      multiline
      // The web starts a textarea at one row; Android grows on its own.
      {...(Platform.OS === "web" ? { numberOfLines: 1 } : {})}
      scrollEnabled={false}
      onContentSizeChange={(e) => {
        setHeight(e.nativeEvent.contentSize.height);
        onContentSizeChange?.(e);
      }}
      style={[
        style,
        { padding: 0, paddingVertical: padY, height: Math.max(lineHeight + 2 * padY, height ?? 0) } as TextStyle,
        Platform.OS === "web" ? ({ outlineStyle: "none", resize: "none" } as object) : null,
      ]}
      {...rest}
    />
  );
});
