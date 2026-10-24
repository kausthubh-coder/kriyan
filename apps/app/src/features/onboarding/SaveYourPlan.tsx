// Step 6 (onboarding.html step6): sign-in framed as saving the plan you already made. Google,
// or an email and a 6-digit code; Clerk does both. Signing in moves onboarding on by itself:
// the screen sees the session and saves the draft to the account. Errors stay ink: red means
// the current time and nothing else.

import { useRef, useState } from "react";
import { Linking, Platform, TextInput, View } from "react-native";
import { ArrowRight, CircleAlert } from "lucide-react-native";
import type { CivilDate } from "@kriyan/core/dates";
import { GoogleMark } from "@/features/auth/GoogleMark";
import { useCodeSignIn } from "@/features/auth/useCodeSignIn";
import { useType } from "@/theme/layout";
import { c, family, hex, r, s } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { PersonalSentence } from "./Day";
import type { Draft } from "./draft";
import { Lead, LinkButton, Question, StepFrame } from "./Frame";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SITE = "https://kriyan.app";

export function SaveYourPlan({ d, today, back }: { d: Draft; today: CivilDate; back: () => void }) {
  const auth = useCodeSignIn();
  const roles = useType();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"choose" | "code">("choose");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = EMAIL.test(email.trim());

  const run = async (work: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setError(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      if (!valid) return "Enter your email address.";
      const err = await auth.sendCode(email.trim());
      if (!err) {
        setCode("");
        setStage("code");
      }
      return err;
    });

  const verify = (value: string) =>
    run(async () => {
      const err = await auth.verify(value);
      if (err) setCode("");
      return err;
    });

  const errorLine = error ? (
    <View role="alert" style={{ flexDirection: "row", gap: s.s2, alignItems: "flex-start", marginTop: s.s3 }}>
      <View style={{ paddingTop: 2 }}>
        <Icon icon={CircleAlert} size={16} tone="ink2" />
      </View>
      <Txt variant="body" tone="ink2" style={{ flex: 1 }}>
        {error}
      </Txt>
    </View>
  ) : null;

  if (stage === "code")
    return (
      <StepFrame
        step={6}
        onBack={() => {
          setStage("choose");
          setError(null);
        }}
      >
        <Question text="Check your email." />
        <Lead>
          We sent a 6-digit code to{" "}
          <Txt variant="body" style={family("600")}>
            {email.trim()}
          </Txt>
          .
        </Lead>
        <CodeBoxes
          value={code}
          disabled={busy}
          onChange={(next) => {
            setCode(next);
            if (next.length === 6) void verify(next);
          }}
        />
        {errorLine}
        <View style={{ marginTop: s.s4 }}>
          <LinkButton label="Send a new code" onPress={() => void send()} />
          <LinkButton
            label="Use a different email"
            onPress={() => {
              setStage("choose");
              setError(null);
            }}
          />
        </View>
        {Platform.OS === "web" ? <View nativeID="clerk-captcha" /> : null}
      </StepFrame>
    );

  return (
    <StepFrame step={6} onBack={back}>
      <Question text="Save your plan." />
      <Lead>Sign in so your day follows you to every device, and your AI can help.</Lead>
      {d.task ? (
        <View style={{ marginTop: s.s6, padding: s.s4, borderRadius: r.sheet, backgroundColor: c.head }}>
          <PersonalSentence d={d} today={today} />
        </View>
      ) : null}
      <View style={{ gap: s.s3, marginTop: s.s6 }}>
        <Press
          role="button"
          accessibilityLabel="Continue with Google"
          disabled={busy}
          onPress={() => void run(auth.google)}
          style={{
            height: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: s.s3,
            borderRadius: r.card,
            boxShadow: `inset 0 0 0 1px ${c.lineStrong}`,
          }}
        >
          <GoogleMark size={20} />
          <Txt variant="subhead">Continue with Google</Txt>
        </Press>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }} aria-hidden>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
          <Txt variant="meta" tone="ink3">
            or
          </Txt>
          <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s.s2,
            height: 48,
            paddingLeft: s.s4,
            paddingRight: s.s1,
            borderRadius: r.card,
            boxShadow: `inset 0 0 0 1px ${c.lineStrong}`,
          }}
        >
          <TextInput
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => void send()}
            placeholder="Your email"
            placeholderTextColor={hex.ink3}
            accessibilityLabel="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="go"
            style={[
              roles.body,
              { flex: 1, minWidth: 0, height: "100%", color: c.ink, padding: 0 },
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
          <Press
            role="button"
            accessibilityLabel="Send code"
            disabled={!valid || busy}
            onPress={() => void send()}
            hoverBg={null}
            style={{
              width: 40,
              height: 40,
              borderRadius: r.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: valid && !busy ? c.ink : c.hover,
            }}
          >
            <Icon icon={ArrowRight} size={20} tone={valid && !busy ? "onInk" : "ink3"} />
          </Press>
        </View>
      </View>
      {errorLine}
      <View style={{ flex: 1, minHeight: s.s8 }} />
      <Txt variant="meta" tone="ink3" style={{ textAlign: "center" }}>
        By continuing you agree to the{" "}
        <Txt variant="meta" tone="ink2" role="link" onPress={() => void Linking.openURL(`${SITE}/terms`)}>
          Terms
        </Txt>{" "}
        and{" "}
        <Txt variant="meta" tone="ink2" role="link" onPress={() => void Linking.openURL(`${SITE}/privacy`)}>
          Privacy policy
        </Txt>
        .
      </Txt>
      {Platform.OS === "web" ? <View nativeID="clerk-captcha" /> : null}
    </StepFrame>
  );
}

/**
 * Six boxes for the code (`.code`), with one real field over them so one-time-code autofill and
 * pasting fill all six at once.
 */
function CodeBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  return (
    <View style={{ marginTop: s.s6 }}>
      <View style={{ flexDirection: "row", gap: s.s2 }} aria-hidden>
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <View
              key={i}
              style={{
                flex: 1,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: r.card,
                backgroundColor: c.raised,
                boxShadow: `inset 0 0 0 ${active ? 2 : 1}px ${active ? c.ink : c.lineStrong}`,
              }}
            >
              <Txt variant="headline" tnum>
                {value[i] ?? ""}
              </Txt>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        editable={!disabled}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 6))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        accessibilityLabel="6-digit code"
        caretHidden
        style={[
          { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, color: "transparent", opacity: 0.01 },
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
      />
    </View>
  );
}
