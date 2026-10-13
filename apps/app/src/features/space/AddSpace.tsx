// Name a space and pick its colour. Inside a parent it takes the parent's colour unless
// the person picks another.

import { useState } from "react";
import { View } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { errorText } from "@/features/tasks/actions";
import { c, r, s, SPACE_COLORS, spaceTone, type SpaceColor } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/bits";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

export function ColorPicker({
  value,
  onPick,
}: {
  value: SpaceColor | null;
  onPick: (color: SpaceColor) => void;
}) {
  return (
    <View role="radiogroup" aria-label="Colour" style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s1 }}>
      {SPACE_COLORS.map((name) => (
        <Press
          key={name}
          role="radio"
          aria-checked={value === name}
          accessibilityLabel={name.charAt(0).toUpperCase() + name.slice(1)}
          onPress={() => onPick(name)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: value === name ? 2 : 0,
            borderColor: c.ink2,
          }}
        >
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: spaceTone(name).dot }} />
        </Press>
      ))}
    </View>
  );
}

export function AddSpace({
  parentId,
  parentName,
  onDone,
}: {
  parentId?: Id<"spaces">;
  parentName?: string;
  onDone: (id: Id<"spaces"> | null) => void;
}) {
  const add = useMutation(api.organize.addSpace);
  const [name, setName] = useState("");
  const [color, setColor] = useState<SpaceColor | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await add({
        name: name.trim(),
        ...(color ? { color } : {}),
        ...(parentId ? { parentId } : {}),
      });
      onDone(id);
    } catch (e) {
      showToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: s.s3, padding: s.s3, borderRadius: r.card, backgroundColor: c.raised }}>
      <Field
        label="Space name"
        value={name}
        onChangeText={setName}
        placeholder={parentName ? `A space inside ${parentName}` : "Physics, Clients, Home"}
        autoFocus
        onSubmitEditing={() => void submit()}
      />
      <View style={{ gap: s.s1 }}>
        <Txt variant="caption" tone="ink3">
          {parentName ? `Colour (leave it to use ${parentName}'s)` : "Colour"}
        </Txt>
        <ColorPicker value={color} onPick={setColor} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button label="Cancel" onPress={() => onDone(null)} />
        <Button
          variant="primary"
          label="Add space"
          onPress={() => void submit()}
          disabled={!name.trim() || busy}
        />
      </View>
    </View>
  );
}
