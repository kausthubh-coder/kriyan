// The terms line under every way in (onboarding.html `.legal`): sign-in and onboarding's step 6.

import { Linking } from "react-native";
import { Txt } from "@/ui/Txt";

const SITE = "https://kriyan.app";

/** The terms line under sign-in (`.legal`), its links underlined so they read as links. */
export function Legal() {
  const link = { textDecorationLine: "underline" } as const;
  return (
    <Txt variant="meta" tone="ink3" style={{ textAlign: "center" }}>
      By continuing you agree to the{" "}
      <Txt
        variant="meta"
        tone="ink2"
        role="link"
        style={link}
        onPress={() => void Linking.openURL(`${SITE}/terms`)}
      >
        Terms
      </Txt>{" "}
      and{" "}
      <Txt
        variant="meta"
        tone="ink2"
        role="link"
        style={link}
        onPress={() => void Linking.openURL(`${SITE}/privacy`)}
      >
        Privacy policy
      </Txt>
      . Sign in with Apple is coming.
    </Txt>
  );
}
