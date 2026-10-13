// A quiet banner while the connection is down. Edits made now are sent when it's back.

import { useEffect, useState } from "react";
import { View } from "react-native";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react-native";
import { c, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Txt } from "@/ui/Txt";

export function OfflineNotice() {
  const state = useConvexConnectionState();
  const down = state.hasEverConnected && !state.isWebSocketConnected;
  // Brief reconnects shouldn't flash a banner.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!down) return;
    const t = setTimeout(() => setShow(true), 2000);
    return () => {
      clearTimeout(t);
      setShow(false);
    };
  }, [down]);
  if (!show || !down) return null;
  return (
    <View
      role="status"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s.s2, paddingVertical: s.s2, paddingHorizontal: s.s4, backgroundColor: c.raised }}
    >
      <Icon icon={WifiOff} size={16} />
      <Txt variant="meta" tone="ink2">
        You’re offline. Changes you make now will save when you’re back.
      </Txt>
    </View>
  );
}
