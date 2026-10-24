// One line saying what the person's agents did today (b2.html `.autonote`): "Codex added 3
// and changed 1 at 07:00", from the newest run of agent changes. Tapping it opens Ask, which
// lists each change with Undo. Hidden when agents did nothing today.

import { View } from "react-native";
import { router, type Href } from "expo-router";
import { useConvexAuth, useQuery } from "convex/react";
import { ChevronRight, Sparkles } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { groupRuns, runSummary } from "@kriyan/core/activity";
import { formatClock, zonedParts } from "@kriyan/core/dates";
import { useClock } from "@/data/time";
import { c, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

export function AgentNote() {
  const { today, timeZone } = useClock();
  const actions = useQuery(
    api.assistant.activity,
    useConvexAuth().isAuthenticated ? { today, days: 1 } : "skip",
  );
  const run = actions
    ? groupRuns(actions)
        .map((r) => ({ ...r, summary: runSummary(r.actions) }))
        .find((r) => r.summary)
    : undefined;
  if (!run) return null;
  const at = formatClock(zonedParts(run.at, timeZone).minutes);
  return (
    <Press
      role="link"
      accessibilityLabel={`${run.agent} ${run.summary} at ${at}. Open Ask`}
      onPress={() => router.push("/ask" as Href)}
      hoverBg={null}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        minHeight: 44,
        paddingVertical: s.s2,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <Icon icon={Sparkles} size={16} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="body" tone="ink2" tnum>
          <Txt variant="body" style={{ fontWeight: "600" }}>
            {run.agent}
          </Txt>
          {` ${run.summary} at ${at}`}
        </Txt>
      </View>
      <Icon icon={ChevronRight} size={16} />
    </Press>
  );
}
