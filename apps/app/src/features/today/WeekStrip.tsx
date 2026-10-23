// The week under Today's header, Joi's way: today outlined with its weekday in red, past days
// quiet. Another day opens the week, where that day's plan lives.

import { View } from "react-native";
import { router } from "expo-router";
import { formatDate, WEEKDAY_SHORT } from "@kriyan/core/format";
import { weekday, type CivilDate } from "@kriyan/core/dates";
import { c, r, s } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { weekOf } from "./TodayHeader";

export function WeekStrip({ today }: { today: CivilDate }) {
  return (
    <View accessibilityLabel="This week" style={{ flexDirection: "row", gap: s.s1 }}>
      {weekOf(today).map((date) => {
        const isToday = date === today;
        const past = date < today;
        return (
          <Press
            key={date}
            role="button"
            accessibilityLabel={formatDate(date)}
            aria-current={isToday ? "date" : undefined}
            onPress={() => (isToday ? undefined : router.push("/upcoming"))}
            style={{
              flex: 1,
              minHeight: 56,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              borderRadius: r.card,
              borderWidth: 1,
              borderColor: isToday ? c.lineStrong : "transparent",
            }}
          >
            <Txt variant="subhead" tone={isToday ? "ink" : past ? "ink3" : "ink2"} tnum>
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
