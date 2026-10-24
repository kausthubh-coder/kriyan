// The conversation (b2.html `msgHTML`): each request on the right in ink, the reply under it on
// the left. Kriyan's own replies can be undone as a whole; an agent's reply lists every change
// it made in between, each with Undo. Requests Kriyan can't do wait for a connected agent.

import { View } from "react-native";
import { useMutation } from "convex/react";
import { Hourglass, Undo2 } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { AskView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { c, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { ActionRow, small } from "./ActionRow";
import { KRIYAN, openAgentSettings } from "./agents";

/** Replies read as prose, so they keep a comfortable line length (b2.html `max-width:62ch`). */
const READ_WIDTH = 560;

export function Conversation({ asks, noAgent }: { asks: AskView[]; noAgent: boolean | undefined }) {
  // The "no AI of its own" note goes under the newest waiting request only, not under each.
  const lastWaiting = asks.findLast((a) => a.reply === null)?._id;
  return (
    <View role="list" aria-label="Conversation" style={{ gap: s.s4 }}>
      {asks.map((ask) => (
        <Exchange key={ask._id} ask={ask} explain={noAgent === true && ask._id === lastWaiting} />
      ))}
    </View>
  );
}

function Exchange({ ask, explain }: { ask: AskView; explain: boolean }) {
  const undoAsk = useMutation(api.assistant.undoAsk);
  return (
    <View role="listitem" testID={`ask-${ask._id}`} style={{ gap: s.s3 }}>
      <View
        style={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          paddingVertical: s.s2,
          paddingHorizontal: s.s4,
          borderRadius: r.sheet,
          borderBottomRightRadius: r.sm,
          backgroundColor: c.ink,
        }}
      >
        <Txt variant="body" tone="onInk">
          {ask.text}
        </Txt>
      </View>
      {ask.reply === null ? (
        <View style={{ gap: s.s3, maxWidth: READ_WIDTH }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
            <Icon icon={Hourglass} size={16} />
            <Txt variant="meta" tone="ink3">
              Waiting for a connected agent to answer
            </Txt>
          </View>
          {explain ? <NoAgentNote /> : null}
        </View>
      ) : (
        <View style={{ gap: s.s2, maxWidth: READ_WIDTH }}>
          {ask.agent && ask.agent !== KRIYAN ? (
            <Txt variant="caption" tone="ink3">
              {ask.agent}
            </Txt>
          ) : null}
          <Txt variant="body">{ask.reply}</Txt>
          {ask.changes.length ? (
            <View
              style={{
                marginTop: s.s1,
                paddingHorizontal: s.s4,
                borderRadius: r.box,
                backgroundColor: c.sunken,
              }}
            >
              {ask.changes.map((action, i) => (
                <ActionRow key={action._id} action={action} last={i === ask.changes.length - 1} />
              ))}
            </View>
          ) : null}
          {ask.undone ? (
            <Txt variant="meta" tone="ink3">
              Undone
            </Txt>
          ) : ask.undoable ? (
            <View style={{ alignItems: "flex-start" }}>
              <Button
                icon={Undo2}
                label="Undo"
                accessibilityLabel={`Undo: ${ask.reply}`}
                onPress={() => void undoAsk({ id: ask._id }).catch((e: unknown) => showToast(errorText(e)))}
                style={small}
              />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Said plainly, once, to someone who hasn't connected an agent yet. */
export function NoAgentNote({ intro }: { intro?: boolean }) {
  return (
    <View style={{ gap: s.s1, padding: s.s4, borderRadius: r.box, backgroundColor: c.sunken }}>
      <Txt variant="label">Kriyan has no AI of its own</Txt>
      <Txt variant="body" tone="ink2">
        {intro
          ? "It does the suggestions below by itself. Anything else waits for an agent you connect, like Claude, ChatGPT or Codex, which answers here."
          : "Requests like this wait for an agent you connect, like Claude, ChatGPT or Codex. It does what you asked and answers here."}
      </Txt>
      <View style={{ alignItems: "flex-start", marginTop: s.s2 }}>
        <Button
          label="Connect an agent"
          onPress={openAgentSettings}
          style={{ ...small, backgroundColor: c.raised }}
        />
      </View>
    </View>
  );
}
