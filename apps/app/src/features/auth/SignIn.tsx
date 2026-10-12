// A calm sign-in: email and password, or a code by email, and Google. One column, one
// primary button. Errors say what happened and what to do.

import { useRef, useState } from "react";
import { Platform, ScrollView, View, type TextInput } from "react-native";
import { useSignIn, useSignUp, useSSO } from "@clerk/expo";
import { CircleAlert, Mail } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsPhone } from "@/theme/layout";
import { c, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Mark } from "@/ui/Mark";
import { Txt } from "@/ui/Txt";

type Mode = "sign-in" | "sign-up";
type Step = "form" | "code";

interface ClerkResult {
  error: { message?: string; longMessage?: string; errors?: { longMessage?: string; message?: string }[] } | null;
}

function message(result: ClerkResult | unknown, fallback: string): string | null {
  const error = (result as ClerkResult | undefined)?.error ?? (result instanceof Error ? result : null);
  if (!error) return null;
  const first = (error as { errors?: { longMessage?: string; message?: string }[] }).errors?.[0];
  return first?.longMessage ?? first?.message ?? (error as { longMessage?: string }).longMessage ?? error.message ?? fallback;
}

export function SignIn() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState<Step>("form");
  const [codeFor, setCodeFor] = useState<"sign-in" | "sign-up" | "trust">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const run = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    try {
      setError(await work());
    } catch (e) {
      setError(message(e, "Something went wrong. Try again in a moment."));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = () =>
    run(async () => {
      if (!email.trim()) return "Enter your email address.";
      if (!password) return "Enter your password.";
      if (mode === "sign-in") {
        const res = await signIn.password({ emailAddress: email.trim(), password });
        const err = message(res, "That email and password don't match. Try again or use a code.");
        if (err) return err;
        if (signIn.status === "complete") {
          const done = await signIn.finalize();
          return message(done, "Couldn't finish signing in. Try again.");
        }
        if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
          // A new device: confirm it with a code by email (Device Trust).
          const sent = await signIn.mfa.sendEmailCode();
          const sendErr = message(sent, "Couldn't send the code. Try again.");
          if (sendErr) return sendErr;
          setCodeFor("trust");
          setStep("code");
          return null;
        }
        return "This account needs a step Kriyan can't do yet. Sign in with a code instead.";
      }
      const res = await signUp.password({ emailAddress: email.trim(), password });
      const err = message(res, "Couldn't create the account. Check the email and try a longer password.");
      if (err) return err;
      const sent = await signUp.verifications.sendEmailCode();
      const sendErr = message(sent, "Couldn't send the code. Try again.");
      if (sendErr) return sendErr;
      setCodeFor("sign-up");
      setStep("code");
      return null;
    });

  const sendCode = () =>
    run(async () => {
      if (!email.trim()) return "Enter your email address first.";
      const res = await signIn.emailCode.sendCode({ emailAddress: email.trim() });
      const err = message(res, "Couldn't send a code to that address. Check it and try again.");
      if (err) return err;
      setCodeFor("sign-in");
      setStep("code");
      return null;
    });

  const verify = () =>
    run(async () => {
      if (!code.trim()) return "Enter the code from the email.";
      if (codeFor === "trust") {
        const res = await signIn.mfa.verifyEmailCode({ code: code.trim() });
        const err = message(res, "That code didn't work. Check it or send a new one.");
        if (err) return err;
        return message(await signIn.finalize(), "Couldn't finish signing in. Try again.");
      }
      if (codeFor === "sign-in") {
        const res = await signIn.emailCode.verifyCode({ code: code.trim() });
        const err = message(res, "That code didn't work. Check it or send a new one.");
        if (err) return err;
        return message(await signIn.finalize(), "Couldn't finish signing in. Try again.");
      }
      const res = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      const err = message(res, "That code didn't work. Check it or send a new one.");
      if (err) return err;
      return message(await signUp.finalize(), "Couldn't finish creating the account. Try again.");
    });

  const google = () =>
    run(async () => {
      const result = await startSSOFlow({ strategy: "oauth_google" });
      if (result.createdSessionId && result.setActive) await result.setActive({ session: result.createdSessionId });
      return null;
    });

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingTop: insets.top + s.s12,
        paddingBottom: insets.bottom + s.s12,
        paddingHorizontal: s.s4,
      }}
    >
      <View style={{ width: "100%", maxWidth: 360, alignSelf: "center", gap: s.s8 }}>
        <View style={{ gap: s.s6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2 }}>
            <Mark size={28} />
            <Txt variant="title">
              kriyan
            </Txt>
          </View>
          <View style={{ gap: s.s2 }}>
            <Txt variant="headline" heading={1}>
              {step === "code" ? "Check your email" : mode === "sign-in" ? "Sign in" : "Create your account"}
            </Txt>
            <Txt variant="body" tone="ink3">
              {step === "code"
                ? `We sent a 6-digit code to ${email.trim()}.`
                : "Everything you have to do, planned into your time."}
            </Txt>
          </View>
        </View>

        {step === "form" ? (
          <View style={{ gap: s.s3 }}>
            <Field
              label="Email"
              icon={Mail}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              containerStyle={{ height: 44 }}
            />
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              textContentType={mode === "sign-in" ? "password" : "newPassword"}
              returnKeyType="go"
              onSubmitEditing={submitPassword}
              containerStyle={{ height: 44 }}
            />
            <Button
              variant="primary"
              label={busy ? "One moment" : mode === "sign-in" ? "Sign in" : "Create account"}
              onPress={submitPassword}
              disabled={busy}
              style={{ height: 44, marginTop: s.s1 }}
            />
            {mode === "sign-in" ? (
              <Button label="Email me a code instead" onPress={sendCode} disabled={busy} style={{ height: 44 }} />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: s.s3 }}>
            <Field
              label="Code from the email"
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="go"
              onSubmitEditing={verify}
              autoFocus
              containerStyle={{ height: 44 }}
            />
            <Button variant="primary" label={busy ? "One moment" : "Verify"} onPress={verify} disabled={busy} style={{ height: 44 }} />
            <Button
              label="Use a different email"
              onPress={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
              style={{ height: 44 }}
            />
          </View>
        )}

        {error ? (
          <View role="alert" style={{ flexDirection: "row", gap: s.s2, alignItems: "flex-start" }}>
            <View style={{ paddingTop: phone ? 3 : 1 }}>
              <Icon icon={CircleAlert} size={16} tone="ink2" />
            </View>
            <Txt variant="body" tone="ink2" style={{ flex: 1 }}>
              {error}
            </Txt>
          </View>
        ) : null}

        {step === "form" ? (
          <View style={{ gap: s.s3 }}>
            <View style={{ height: 1, backgroundColor: c.line }} />
            <Button label="Continue with Google" onPress={google} disabled={busy} style={{ height: 44 }} />
            <Button
              variant="quiet"
              label={mode === "sign-in" ? "New to Kriyan? Create an account" : "Have an account? Sign in"}
              onPress={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
              }}
              style={{ height: 44 }}
            />
          </View>
        ) : null}
        {Platform.OS === "web" ? <View nativeID="clerk-captcha" /> : null}
      </View>
    </ScrollView>
  );
}
