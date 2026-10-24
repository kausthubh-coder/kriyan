// Today's black header (Joi's top card): the day with the red "now" dot, the date, and the
// day in one sentence with the counts and the free time set strong. On the phone it replaces
// the app bar; on desktop it's a card at the top of the column.

import { Text, View } from "react-native";
import { useUser } from "@clerk/expo";
import { Calendar, Hourglass, Repeat, Square, Sun, Timer } from "lucide-react-native";
import { addDays, diffDays, weekday, type CivilDate } from "@kriyan/core/dates";
import { formatDuration, MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import { daySummary, summaryText, type SummaryPart } from "@kriyan/core/summary";
import { useIsPhone } from "@/theme/layout";
import { bold, c, family, r, s, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Txt } from "@/ui/Txt";
import type { TodayView } from "@/data/views";

const KIND_ICON = { event: Calendar, task: Square, habit: Repeat } as const;

export function TodayHeader({
  view,
  today,
  now,
  free,
}: {
  view: TodayView;
  today: CivilDate;
  now: number;
  /** Free minutes left today, or null while unknown. */
  free: number | null;
}) {
  const phone = useIsPhone();
  const { user } = useUser();
  const parts = daySummary({
    name: user?.firstName,
    now,
    dayEnd: view.profile.dayEnd,
    // A task due today counts, but any time it has is on its own (later) day, not today's.
    items: [
      ...view.scheduled.filter((t) => !t.proposedBy),
      ...view.anytime,
      ...view.due.map((t) => ({ ...t, time: null })),
    ],
    habitsDue: view.habits.filter((h) => !h.doneToday).length,
  });
  const planned = view.scheduled
    .filter((t) => !t.done && !t.proposedBy && t.length && (t.time ?? 0) + (t.length ?? 0) > now)
    .reduce((sum, t) => sum + (t.length ?? 0), 0);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const daysLeft = diffDays(`${year + 1}-01-01`, today);

  return (
    <View
      style={{
        backgroundColor: c.head,
        // B2's 22 and 26/28, on the 4px scale.
        paddingHorizontal: phone ? s.s6 : s.s8,
        paddingTop: s.s6,
        paddingBottom: phone ? s.s8 : s.s6,
        borderRadius: phone ? 0 : r.sheet,
        gap: s.s4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View
          style={{ flexDirection: "row", alignItems: "flex-end" }}
          accessibilityLabel={WEEKDAY_SHORT[weekday(today)]}
        >
          <Txt variant="display" tone="headInk" heading={1} style={bold}>
            {WEEKDAY_SHORT[weekday(today)]}
          </Txt>
          {/* The one red: now. */}
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.now,
              marginLeft: 3,
              marginBottom: 10,
            }}
          />
        </View>
        <Txt variant="meta" tone="headDim" style={{ textAlign: "right" }}>
          {`${day} ${MONTH_LONG[month - 1]}\n${year}`}
        </Txt>
      </View>

      <Txt
        variant="title"
        tone="headDim"
        accessibilityLabel={summaryText(parts)}
        style={{ marginTop: s.s2 }}
        // B2's 22 is between the scale's 20 and 28; 20 keeps the sentence under the day, as B2
        // means it, on both layouts.
      >
        {parts.map((part, i) => (
          <SentencePart key={i} part={part} />
        ))}
      </Txt>

      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: s.s4, rowGap: s.s1 }}>
        {/* The prototype colours each stat's icon: planned blue, free green, the year purple. */}
        <Stat icon={Timer} color={spaceTone("blue").dot} text={`${formatDuration(planned)} planned`} />
        {free !== null ? (
          <Stat icon={Sun} color={spaceTone("green").dot} text={`${formatDuration(free)} free`} />
        ) : null}
        <Stat icon={Hourglass} color={spaceTone("purple").dot} text={`${daysLeft} days left in ${year}`} />
      </View>
      {/* On the phone the sheet below overlaps the header's bottom edge by its radius. */}
      {phone ? <View style={{ height: r.sheet - s.s4 }} /> : null}
    </View>
  );
}

/** A run inside the sentence: only its colour changes, so it keeps the sentence's size. */
function SentencePart({ part }: { part: SummaryPart }) {
  // One weight throughout, as B2's sentence: only the colour says what's strong.
  const style = { color: part.strong ? c.headInk : c.headDim, ...family("600") };
  if ("kind" in part) {
    return (
      <Text style={style}>
        {/* Icon, count and noun stay on one line: "3 events" never splits. */}
        <Icon icon={KIND_ICON[part.kind]} size={18} tone="headInk" strokeWidth={2} />
        {`\u00a0${part.text.replace(/ /g, "\u00a0")}`}
      </Text>
    );
  }
  return <Text style={style}>{part.text}</Text>;
}

function Stat({
  icon,
  color,
  text,
}: {
  icon: Parameters<typeof Icon>[0]["icon"];
  color: string;
  text: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
      <Icon icon={icon} size={14} color={color} strokeWidth={2} />
      <Txt variant="caption" tone="headInk" tnum style={family("600")}>
        {text}
      </Txt>
    </View>
  );
}

/** Monday to Sunday of the week that holds `today`. */
export function weekOf(today: CivilDate): CivilDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, i - weekday(today)));
}
