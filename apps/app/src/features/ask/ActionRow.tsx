// One change an agent made, with Undo (b2.html `.run-i`), and Edit on a task it added so the
// person can fix it rather than undo it. Undone changes stay listed, struck through.

import { DottedRule } from "@/ui/DottedRule";
import { View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import type { ActionView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { actionLine } from "./agents";

/** The prototype's small round button on a card (b2.html `.btn-sm`). */
export const small = { borderRadius: r.pill, backgroundColor: c.hover } as const;

export function ActionRow({
  action,
  last,
  indent = 0,
}: {
  action: ActionView;
  last?: boolean;
  indent?: number;
}) {
  const phone = useIsPhone();
  const undo = useMutation(api.assistant.undoAction);
  const line = actionLine(action);
  return (
    <View
      testID={`action-${action._id}`}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: s.s2,
          minHeight: phone ? sz.phoneRow : sz.touch,
          paddingVertical: s.s1,
          paddingLeft: indent,
        },
      ]}
    >
      <Txt variant="body" tone={action.undone ? "ink3" : "ink2"} strike={action.undone} style={{ flex: 1 }}>
        {line}
      </Txt>
      {action.undone ? (
        <Txt variant="meta" tone="ink3">
          Undone
        </Txt>
      ) : (
        <>
          {action.kind === "add" && action.taskId ? (
            <Button
              label="Edit"
              accessibilityLabel={`Edit ${action.title}`}
              onPress={() => router.push(`/task/${action.taskId}`)}
              style={small}
            />
          ) : null}
          {action.undoable ? (
            <Button
              label="Undo"
              accessibilityLabel={`Undo: ${line}`}
              onPress={() => void undo({ id: action._id }).catch((e: unknown) => showToast(errorText(e)))}
              style={small}
            />
          ) : null}
        </>
      )}
      {last ? null : <DottedRule />}
    </View>
  );
}
