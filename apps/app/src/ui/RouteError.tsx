// What a screen shows when its data fails to load: what happened and what to do.

import { View } from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { c, s } from "@/theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Txt } from "./Txt";

export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const data = (error as { data?: unknown }).data;
  const detail = typeof data === "string" ? data : null;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        alignItems: "center",
        justifyContent: "center",
        padding: s.s8,
      }}
    >
      <View role="alert" style={{ maxWidth: 420, gap: s.s3, alignItems: "flex-start" }}>
        <Icon icon={CloudOff} size={20} tone="ink2" />
        <Txt variant="subhead" heading={1}>
          This screen didn’t load
        </Txt>
        <Txt variant="body" tone="ink3">
          {detail ?? "Kriyan couldn't reach your plan. Check your connection, then try again."}
        </Txt>
        <Button
          variant="primary"
          label="Try again"
          onPress={() => void retry()}
          style={{ marginTop: s.s2 }}
        />
      </View>
    </View>
  );
}
