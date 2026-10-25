// Agents (docs/design/v5 prototype `page("agents")`): each agent's runs from the last month, a
// line per kind of change with Undo, then how to connect another over MCP and whether agents
// may edit directly. Agents change the plan through MCP and the CLI; this is where the person
// checks what they did.

import { useState } from "react";
import { Linking, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { groupRuns, runLines, type RunLine } from "@kriyan/core/activity";
import { zonedParts } from "@kriyan/core/dates";
import { formatDay, formatTime } from "@kriyan/core/format";
import { useClock } from "@/data/time";
import { useActivity, useProfile, type ActionView } from "@/data/views";
import { CLI_LINE, MCP_DOCS, MCP_URL } from "@/features/settings/links";
import { ToggleRow } from "@/features/shell/controls";
import { Page, PageEmpty, PageLabel } from "@/features/shell/Page";
import { errorText } from "@/features/tasks/actions";
import { c, family, r, s } from "@/theme/tokens";
import { Skeleton } from "@/ui/bits";
import { DottedRule } from "@/ui/DottedRule";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";

export function AgentsScreen() {
  const activity = useActivity(31);
  const profile = useProfile();
  const { today, timeZone } = useClock();
  const update = useMutation(api.account.updateProfile);
  const runs = activity ? groupRuns(activity) : undefined;
  const when = (at: number) => {
    const { date, minutes } = zonedParts(at, timeZone);
    return `${formatDay(date, today)}, ${formatTime(minutes)}`;
  };
  return (
    <Page tabTitle="Agents" title="Agents" sub="They plan with you over MCP. Every change can be undone.">
      {runs === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4, paddingTop: s.s6 }}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="80%" height={16} />
          <Skeleton width="70%" height={16} />
        </View>
      ) : runs.length === 0 ? (
        <PageEmpty
          title="No agent has changed anything yet"
          body="Connect one below. Everything it adds, moves or ticks off shows up here, with Undo."
        />
      ) : (
        runs.map((run) => (
          <View key={`${run.agent}-${run.at}`}>
            <PageLabel>{`${run.agent}, ${when(run.at)}`}</PageLabel>
            {runLines(run.actions).map((line, i) => (
              <ChangeLine key={i} line={line} />
            ))}
          </View>
        ))
      )}
      <PageLabel>{runs?.length ? "Connect another" : "Connect an agent"}</PageLabel>
      <McpBox />
      <Txt variant="body" tone="ink2" style={{ paddingTop: s.s3 }}>
        {"Add it as a connector in Claude or ChatGPT, or run "}
        <Txt variant="body" style={family("600")}>
          {CLI_LINE}
        </Txt>
        {" for the CLI. Suggestions wait for you to accept them unless you turn on direct edits. "}
        <Txt
          variant="body"
          tone="parse"
          role="link"
          accessibilityLabel="MCP guide"
          onPress={() => void Linking.openURL(MCP_DOCS)}
        >
          Read the guide
        </Txt>
      </Txt>
      <View style={{ paddingTop: s.s3 }}>
        {profile ? (
          <ToggleRow
            label="Let agents edit directly"
            on={profile.agentsEditDirectly}
            onChange={(agentsEditDirectly) =>
              void update({ agentsEditDirectly }).catch((e: unknown) => showToast(errorText(e)))
            }
          />
        ) : (
          <Skeleton width="60%" height={16} />
        )}
      </View>
    </Page>
  );
}

/** One kind of change in a run, with Undo for all of it ("Added HW17, HW18 and 29 more"). */
function ChangeLine({ line }: { line: RunLine<ActionView> }) {
  const undo = useMutation(api.assistant.undoAction);
  const [busy, setBusy] = useState(false);
  const open = line.actions.filter((a) => a.undoable);
  const undone = line.actions.every((a) => a.undone);
  const run = async () => {
    setBusy(true);
    try {
      for (const a of open) await undo({ id: a._id });
      showToast(open.length === 1 ? "Undone" : `Undid ${open.length} changes`);
    } catch (e) {
      showToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 60 }}>
      <Txt
        variant="subhead"
        tone={undone ? "ink3" : "ink"}
        style={[family("500"), { flex: 1 }]}
        numberOfLines={2}
      >
        {line.text}
      </Txt>
      {undone ? (
        <Txt variant="body" tone="ink3">
          Undone
        </Txt>
      ) : open.length ? (
        <Press
          role="button"
          accessibilityLabel={`Undo: ${line.text}`}
          onPress={() => void run()}
          disabled={busy}
          hoverBg={null}
          style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}
        >
          {({ hovered }) => (
            <Txt
              variant="label"
              tone="parse"
              style={[family("600"), hovered ? { textDecorationLine: "underline" } : null]}
            >
              Undo
            </Txt>
          )}
        </Press>
      ) : null}
      <DottedRule width={2} />
    </View>
  );
}

/** The MCP address on a quiet fill, with Copy (the prototype's `.urlbox`). */
function McpBox() {
  return (
    <View
      style={{
        marginTop: s.s3,
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        paddingLeft: s.s4,
        paddingRight: s.s1,
        minHeight: 48,
        borderRadius: r.card,
        backgroundColor: c.sunken,
      }}
    >
      <Txt variant="body" selectable numberOfLines={1} tnum style={{ flex: 1 }}>
        {MCP_URL}
      </Txt>
      <Press
        role="button"
        accessibilityLabel="Copy the MCP address"
        onPress={() => void Clipboard.setStringAsync(MCP_URL).then(() => showToast("Copied the MCP address"))}
        hoverBg={null}
        style={{ minHeight: 44, paddingHorizontal: s.s3, justifyContent: "center" }}
      >
        {({ hovered }) => (
          <Txt
            variant="label"
            tone="parse"
            style={[family("600"), hovered ? { textDecorationLine: "underline" } : null]}
          >
            Copy
          </Txt>
        )}
      </Press>
    </View>
  );
}
