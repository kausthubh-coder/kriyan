// What a screen shows when its data fails to load: what happened and what to do.

import { View } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { CloudOff } from "lucide-react-native";
import { c, s } from "@/theme/tokens";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Txt } from "./Txt";

export function RouteError({ error, retry }: ErrorBoundaryProps) {
  const data = (error as { data?: unknown }).data;
  // A link with an id that isn't a real task or space fails validation, not the network.
  const badLink = /ArgumentValidationError|Value does not match validator/.test(error.message);
  const detail = typeof data === "string" ? data : badLink ? "This link doesn't open anything in your plan. It may be mistyped, or from another account." : null;
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
          {badLink ? "Nothing here" : "This screen didn’t load"}
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
