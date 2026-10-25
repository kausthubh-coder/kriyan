// Joi's Today header (v5 `.top` and `.strip`): the big day with the red dot (today only), the
// date on the right, then the week. Tapping the day pulls the summary down. A dot over a day
// says something is due on it.

import { ScrollView, View } from "react-native";
import { addDays, weekday } from "@kriyan/core/dates";
import { formatDate, MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import { weekDays, type FitChip } from "@kriyan/core/today";
import { useDue } from "@/data/views";
import { c, family, r, s, spaceTone } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { T, ty } from "./parts";

export function Top({
  day,
  today,
  onSummary,
  onPick,
}: {
  day: string;
  today: string;
  onSummary: () => void;
  onPick: (date: string) => void;
}) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const name = day === addDays(today, 1) ? "Tmrw" : WEEKDAY_SHORT[weekday(day)];
  const week = weekDays(day);
  const due = useDue(week[0]!, week[6]!);
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Press
          role="button"
          accessibilityLabel="Show the summary"
          onPress={onSummary}
          hoverBg={null}
          style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}
        >
          <Txt heading={1} style={[ty.day, { color: c.ink }]}>
            {name}
          </Txt>
          {day === today ? (
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.now, marginTop: s.s2 }} />
          ) : null}
        </Press>
        <T s="date" tone="ink3" extra={{ textAlign: "right" }}>
          {`${d} ${MONTH_LONG[m - 1]}\n${y}`}
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: s.s1, marginTop: s.s6 }} accessibilityLabel="Week">
        {week.map((date, i) => {
          const on = date === day;
          const isToday = date === today;
          const hasDue = (due?.days.find((x) => x.date === date)?.due ?? 0) > 0;
          return (
            <Press
              key={date}
              role="button"
              accessibilityLabel={formatDate(date)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={on}
              onPress={() => onPick(date)}
              hoverBg={c.hover}
              style={{
                flex: 1,
                alignItems: "center",
                paddingTop: s.s2,
                paddingBottom: s.s2,
                borderRadius: r.box,
                backgroundColor: on ? c.sunken : "transparent",
              }}
            >
              {hasDue ? (
                <View
                  style={{
                    position: "absolute",
                    top: -3,
                    width: 5,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: c.ink2,
                  }}
                />
              ) : null}
              <Txt
                tnum
                maxFontSizeMultiplier={1.4}
                style={{ ...family("500"), fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: on || isToday ? c.ink : c.ink3 }}
              >
                {String(Number(date.slice(8)))}
              </Txt>
              <Txt
                maxFontSizeMultiplier={1.2}
                style={{
                  ...family("600"),
                  fontSize: 12,
                  lineHeight: 16,
                  marginTop: s.s1,
                  letterSpacing: 0.5,
                  color: isToday ? c.now : c.ink3,
                }}
              >
                {WEEKDAY_SHORT[i]!.toUpperCase()}
              </Txt>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/** "To fit in": one row of chips that scrolls sideways; a chip opens Fill for that task. */
export function FitIn({ chips, onPick }: { chips: FitChip[]; onPick: (id: string) => void }) {
  if (!chips.length) return null;
  return (
    <View
      aria-label={`To fit in, ${chips.length}`}
      style={{ marginTop: s.s4, borderRadius: r.box, backgroundColor: c.sunken, paddingTop: s.s2, overflow: "hidden" }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: s.s4,
          gap: s.s2,
        }}
      >
        <T s="strong">{`To fit in ${chips.length}`}</T>
        <T s="small" tone="ink3" lines={1} extra={{ flexShrink: 1 }}>
          Swipe, tap one to give it a time
        </T>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: s.s2, paddingHorizontal: s.s3, paddingTop: s.s2, paddingBottom: s.s3 }}
      >
        {chips.map(({ item, note }) => (
          <Press
            key={item.id}
            role="button"
            accessibilityLabel={`Fit in ${item.title}, ${note}`}
            onPress={() => onPick(item.id)}
            hoverBg={null}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s2,
              height: 32,
              paddingLeft: s.s3,
              paddingRight: s.s3,
              borderRadius: r.pill,
              backgroundColor: c.bg,
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color ? spaceTone(item.color).dot : c.ink3 }} />
            <T s="body">{item.title}</T>
            <T s="small" tone="ink3" tnum>
              {note}
            </T>
          </Press>
        ))}
      </ScrollView>
    </View>
  );
}
