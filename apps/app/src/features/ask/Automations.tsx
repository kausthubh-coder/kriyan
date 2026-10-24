// What agents did this week (b2.html `autosHTML`): one line per run ("Codex · added 3 and
// changed 1", when it ran), opening to each change with Undo. Agents change the plan directly,
// so the person checks afterwards instead of approving before.

import { DottedRule } from "@/ui/DottedRule";
import { useState } from "react";
import { View } from "react-native";
import { ChevronDown, ChevronRight, Plus } from "lucide-react-native";
import { groupRuns, runSummary, type Run } from "@kriyan/core/activity";
import { zonedParts, type CivilDate } from "@kriyan/core/dates";
import { formatDay, formatTime } from "@kriyan/core/format";
import type { ActionView } from "@/data/views";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { family, r, s, sz } from "@/theme/tokens";
import { Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { ActionRow } from "./ActionRow";
import { openAgentSettings } from "./agents";
import { Initial } from "./Initial";

const AVATAR = 24;

export function Automations({
  activity,
  today,
  timeZone,
}: {
  activity: ActionView[] | undefined;
  today: CivilDate;
  timeZone: string;
}) {
  const runs = activity ? groupRuns(activity) : undefined;
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View testID="automations">
      <SectionLabel title="Automations" count={runs?.length ? String(runs.length) : undefined} />
      {runs === undefined ? (
        <View testID="skeleton" style={{ gap: s.s3, paddingVertical: s.s2 }}>
          <Skeleton width="60%" />
          <Skeleton width="40%" />
        </View>
      ) : runs.length === 0 ? (
        <Txt variant="body" tone="ink3" style={{ paddingVertical: s.s1 }}>
          {
            "Connect an agent like Codex or Claude and it can plan with you or run on a schedule, say every morning, adding what's due from Moodle or Gmail. Everything it changes shows up here with Undo."
          }
        </Txt>
      ) : (
        runs.map((run) => {
          const key = `${run.agent}-${run.at}`;
          return (
            <RunItem
              key={key}
              run={run}
              open={open === key}
              onToggle={() => setOpen(open === key ? null : key)}
              when={when(run.at, today, timeZone)}
            />
          );
        })
      )}
      <AddLine label="Connect an agent" onPress={openAgentSettings} />
    </View>
  );
}

/** "Today, 07:00", "Yesterday, 18:30", "Tue 13 Oct, 09:15". */
function when(at: number, today: CivilDate, timeZone: string): string {
  const { date, minutes } = zonedParts(at, timeZone);
  return `${formatDay(date, today)}, ${formatTime(minutes)}`;
}

function RunItem({
  run,
  open,
  onToggle,
  when,
}: {
  run: Run<ActionView>;
  open: boolean;
  onToggle: () => void;
  when: string;
}) {
  const summary = runSummary(run.actions) || "everything undone";
  return (
    <View>
      <Press
        role="button"
        aria-expanded={open}
        accessibilityLabel={`${run.agent} ${summary}, ${when}`}
        onPress={onToggle}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          minHeight: sz.phoneRow,
          paddingVertical: s.s2,
          paddingHorizontal: s.s2,
          marginHorizontal: -s.s2,
          borderRadius: r.ctl,
        }}
      >
        <Initial name={run.agent} size={AVATAR} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" numberOfLines={2} style={family("600")}>
            {`${run.agent} · ${summary}`}
          </Txt>
          <Txt variant="meta" tone="ink3" tnum>
            {when}
          </Txt>
        </View>
        <Icon icon={open ? ChevronDown : ChevronRight} size={16} />
      </Press>
      {open ? (
        <View style={{ paddingBottom: s.s2 }}>
          {run.actions.map((action, i) => (
            <ActionRow
              key={action._id}
              action={action}
              last={i === run.actions.length - 1}
              indent={AVATAR + s.s3}
            />
          ))}
        </View>
      ) : null}
      <DottedRule />
    </View>
  );
}

/**
 * The one way forward from Automations (b2.html `.addline`): a blue line with a plus, like a
 * link, since it leaves for Settings rather than changing anything here.
 */
function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      role="link"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: s.s2,
        minHeight: sz.touch,
        marginTop: s.s1,
      }}
    >
      {({ hovered }) => (
        <>
          <Icon icon={Plus} size={18} tone="parse" />
          <Txt
            variant="label"
            tone="parse"
            style={[family("600"), hovered ? { textDecorationLine: "underline" } : null]}
          >
            {label}
          </Txt>
        </>
      )}
    </Press>
  );
}
