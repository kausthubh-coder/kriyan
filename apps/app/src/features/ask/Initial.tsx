// A round ink badge with someone's first letter: an agent beside its run (b2.html `.av`), or
// the person at the top of Ask, where it leads to Settings (`.avatar`).

import { View } from "react-native";
import { Link } from "expo-router";
import { useUser } from "@clerk/expo";
import { useProfile } from "@/data/views";
import { c, family, r } from "@/theme/tokens";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";

export function Initial({ name, size }: { name: string; size: number }) {
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: r.pill,
        backgroundColor: c.ink,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt variant={size >= 40 ? "subhead" : "caption"} tone="onInk" style={family("600")}>
        {name.trim().charAt(0).toUpperCase() || "K"}
      </Txt>
    </View>
  );
}

/** Settings is rare, so it lives behind your initial (b2.html `asknav`). */
export function SettingsLink() {
  const profile = useProfile();
  const { user } = useUser();
  const name = profile?.name?.trim() || user?.firstName || user?.primaryEmailAddress?.emailAddress || "You";
  return (
    <Link href="/settings" asChild>
      <Press role="link" accessibilityLabel="Settings" hoverBg={null} rippleRadius={22}>
        {({ hovered }) => (
          <View style={{ opacity: hovered ? 0.88 : 1 }}>
            <Initial name={name} size={44} />
          </View>
        )}
      </Press>
    </Link>
  );
}
