// Tiimo's evening card (b2.html `.rvc`): "Review today" sits in the day at the review time the
// person chose, so closing the day is part of the plan. It goes once the day is closed.

import { View } from "react-native";
import { router } from "expo-router";
import { Moon } from "lucide-react-native";
import { formatClock } from "@kriyan/core/dates";
import { useIsPhone } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Txt } from "@/ui/Txt";

export function ReviewCard({ at }: { at: number }) {
  const phone = useIsPhone();
  return (
    <View
      aria-label="Review today"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        marginVertical: s.s2,
        paddingVertical: s.s2,
        paddingLeft: s.s4,
        paddingRight: s.s3,
        borderRadius: r.card + 4,
        backgroundColor: c.sunken,
      }}
    >
      <Icon icon={Moon} size={20} tone="ink2" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="subhead">Review today</Txt>
        <Txt variant="meta" tone="ink3" tnum numberOfLines={2}>
          {`${formatClock(at)} · give what's left a place`}
        </Txt>
      </View>
      <Button
        variant="primary"
        label="Review"
        onPress={() => router.push("/review")}
        style={{ borderRadius: r.pill, height: phone ? 44 : 32 }}
      />
    </View>
  );
}
