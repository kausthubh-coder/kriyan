// Notion Calendar's "Upcoming in 19 min" with Start focus (b2.html `.up`); while a block runs,
// how long is left. On the phone it sits under the week strip; on desktop it's pinned at the
// foot of the day column, lifted off the hours behind it (b2.html `.cal-up`).

import { useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { Play } from "lucide-react-native";
import { formatClock } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { type } from "@kriyan/core/tokens";
import type { TaskView, TodayView } from "@/data/views";
import { roleStyle } from "@/theme/layout";
import { c, family, r, s, shadows } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

/** The block running now and the next one that isn't over, from today's schedule. */
export function upNextOf(view: TodayView, now: number): { current?: TaskView; next?: TaskView } {
  const live = view.scheduled.filter((t) => !t.done && !t.proposedBy);
  const current = live.find((t) => t.time !== null && t.length && t.time <= now && now < t.time + t.length);
  // Next is the first other block that isn't over: one still running beside the current one
  // comes before one that starts later.
  const next = live.find(
    (t) =>
      t.time !== null &&
      t._id !== current?._id &&
      (t.time > now || (t.length !== null && now < t.time + t.length)),
  );
  return { current, next };
}

export function UpNext({
  current,
  next,
  now,
  floating,
}: {
  current?: TaskView;
  next?: TaskView;
  now: number;
  /** Pinned over the day's hours: the page's tone with an edge, rather than a sunken fill. */
  floating?: boolean;
}) {
  // At large text the button goes under the title, so neither is cut short.
  const stacked = useWindowDimensions().fontScale >= 1.3;
  const lead = current ?? next;
  if (!lead || lead.time === null) return null;
  const end = lead.length ? lead.time + lead.length : null;
  const label = current
    ? end !== null
      ? `Now, ${formatDuration(Math.max(1, end - now))} left`
      : "Now"
    : lead.time - now <= 60
      ? `Upcoming in ${formatDuration(Math.max(1, lead.time - now))}`
      : `Next at ${formatClock(lead.time)}`;
  return (
    <View
      aria-label={current ? "Now" : "Up next"}
      style={{
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        gap: s.s3,
        paddingVertical: s.s3,
        paddingLeft: s.s4,
        paddingRight: s.s3,
        borderRadius: r.box,
        backgroundColor: floating ? c.raised : c.sunken,
        ...(floating ? { borderWidth: 1, borderColor: c.line, boxShadow: shadows.overlay } : null),
      }}
    >
      <View style={stacked ? { alignSelf: "stretch", gap: 2 } : { flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="caption" tone={current ? "now" : "ink3"} style={family("600")}>
          {label}
        </Txt>
        <Txt variant="subhead" numberOfLines={2}>
          {lead.title}
        </Txt>
        <Txt variant="body" tone="ink2" tnum>
          {end !== null ? `${formatClock(lead.time)} → ${formatClock(end)}` : formatClock(lead.time)}
          {end !== null ? (
            <Txt variant="body" tone="ink3" tnum>
              {`  ${formatDuration(lead.length ?? 0)}`}
            </Txt>
          ) : null}
        </Txt>
        {/* With blocks overlapping, the next one may already be running: say until when. */}
        {current && next && next.time !== null ? (
          <Txt variant="meta" tone="ink3" numberOfLines={1} tnum>
            {next.time <= now && next.length !== null
              ? `Then ${next.title}, until ${formatClock(next.time + next.length)}`
              : `Then ${next.title} at ${formatClock(next.time)}`}
          </Txt>
        ) : null}
      </View>
      {lead.event ? null : (
        <StartFocus
          label={current ? "Focus" : "Start focus"}
          onPress={() => router.push(`/focus/${lead._id}`)}
        />
      )}
    </View>
  );
}

/** B2's `.btn-dark`: a solid pill with a solid play mark, 14px semibold on both layouts. */
function StartFocus({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      hoverBg={null}
      style={({ hovered }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: s.s2,
        minHeight: 44,
        paddingHorizontal: s.s4,
        borderRadius: r.pill,
        backgroundColor: c.ink,
        opacity: hovered ? 0.92 : 1,
      })}
    >
      <Icon icon={Play} size={14} tone="onInk" filled />
      <Txt tone="onInk" numberOfLines={1} style={buttonLabel}>
        {label}
      </Txt>
    </Press>
  );
}

/** 14 on both layouts: the phone's label role is 16, which B2's buttons don't grow to. */
const buttonLabel = { ...roleStyle(type.label), ...family("600") };
