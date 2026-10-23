// The week under Today's header and on the phone's Week, Joi's way: the selected day outlined,
// today's weekday in red, past days quiet. On Today another day opens the Week on that day.

import { View } from "react-native";
import { router } from "expo-router";
import { formatDate, WEEKDAY_SHORT } from "@kriyan/core/format";
import { weekday, type CivilDate } from "@kriyan/core/dates";
import { c, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { weekOf } from "./TodayHeader";

export function WeekStrip({
  today,
  selected = today,
  onSelect,
}: {
  today: CivilDate;
  /** The outlined day, and the week shown. Defaults to today. */
  selected?: CivilDate;
  /** Without it, picking another day opens the Week on that day. */
  onSelect?: (date: CivilDate) => void;
}) {
  return (
    <View
      accessibilityLabel={selected === today ? "This week" : "Week"}
      style={{
        flexDirection: "row",
        gap: s.s1,
        paddingBottom: s.s2,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      {weekOf(selected).map((date) => {
        const isToday = date === today;
        const isSelected = date === selected;
        const past = date < today;
        return (
          <Press
            key={date}
            role="button"
            accessibilityLabel={formatDate(date)}
            aria-current={isToday ? "date" : undefined}
            aria-pressed={onSelect ? isSelected : undefined}
            onPress={() =>
              onSelect
                ? onSelect(date)
                : isToday
                  ? undefined
                  : router.push({ pathname: "/upcoming", params: { day: date } })
            }
            style={{
              flex: 1,
              minHeight: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              borderRadius: r.card,
              borderWidth: 1,
              borderColor: isSelected ? c.lineStrong : "transparent",
            }}
          >
            <Txt variant="subhead" tone={isSelected ? "ink" : past ? "ink3" : "ink2"} tnum>
              {String(Number(date.slice(8)))}
            </Txt>
            <Txt
              variant="caption"
              tone={isToday ? "now" : "ink3"}
              style={{ textTransform: "uppercase", letterSpacing: 0.6 }}
            >
              {WEEKDAY_SHORT[weekday(date)]}
            </Txt>
          </Press>
        );
      })}
    </View>
  );
}
