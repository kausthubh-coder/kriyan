// A calm sign-in for someone who has signed in before (onboarding.html step 6, B2): Google
// first, then an email code; a password only behind a quiet link. One column, one solid button.
// Errors say what happened and what to do, and go as soon as the input changes.

import { useRef, useState } from "react";
import { Platform, ScrollView, View, type TextInput } from "react-native";
import { useSignIn, useSignUp } from "@clerk/expo";
import { CircleAlert, Lock, Mail } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsPhone } from "@/theme/layout";
import { c, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Mark } from "@/ui/Mark";
import { Txt } from "@/ui/Txt";
import { clerkMessage as message } from "./clerkMessage";
import { GoogleMark } from "./GoogleMark";
import { Legal } from "./Legal";
import { useCodeSignIn } from "./useCodeSignIn";

type Mode = "sign-in" | "sign-up";
type Method = "code" | "password";
type Step = "form" | "code";

export function SignIn() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const auth = useCodeSignIn();
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [method, setMethod] = useState<Method>("code");
  const [step, setStep] = useState<Step>("form");
  // "email": the code from the email-code path, which signs in or makes the account itself.
  const [codeFor, setCodeFor] = useState<"email" | "sign-up" | "trust">("email");
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
      const err = await auth.sendCode(email.trim());
      if (err) return err;
      setCodeFor("email");
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
      if (codeFor === "email") return auth.verify(code.trim());
      const res = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      const err = message(res, "That code didn't work. Check it or send a new one.");
      if (err) return err;
      return message(await signUp.finalize(), "Couldn't finish creating the account. Try again.");
    });

  const google = () => run(auth.google);
  /** A stale error goes the moment the input it was about changes. */
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (error) setError(null);
  };

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
            <Txt variant="title">Kriyan</Txt>
          </View>
          <View style={{ gap: s.s2 }}>
            <Txt variant="headline" heading={1}>
              {step === "code" ? "Check your email" : mode === "sign-in" ? "Sign in" : "Create your account"}
            </Txt>
            <Txt variant="body" tone="ink3">
              {step === "code"
                ? `We sent a 6-digit code to ${email.trim()}.`
                : "Plan the day calmly. Then do it."}
            </Txt>
          </View>
        </View>

        {step === "form" ? (
          <View style={{ gap: s.s6 }}>
            <Button
              variant="outline"
              leading={<GoogleMark />}
              label="Continue with Google"
              onPress={google}
              disabled={busy}
              style={{ height: 44 }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3 }} aria-hidden>
              <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
              <Txt variant="meta" tone="ink3">
                or
              </Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: c.line }} />
            </View>
            <View style={{ gap: s.s3 }}>
              <Field
                label="Email"
                icon={Mail}
                value={email}
                onChangeText={edit(setEmail)}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType={method === "code" ? "go" : "next"}
                onSubmitEditing={() => (method === "code" ? void sendCode() : passwordRef.current?.focus())}
                containerStyle={{ height: 44 }}
              />
              {method === "code" ? (
                <>
                  <Button
                    variant="primary"
                    label={busy ? "One moment" : "Email me a code"}
                    onPress={sendCode}
                    disabled={busy}
                    style={{ height: 44, marginTop: s.s1 }}
                  />
                  <Button
                    variant="quiet"
                    label="Use a password instead"
                    onPress={() => {
                      setMethod("password");
                      setError(null);
                    }}
                    style={{ height: 44 }}
                  />
                </>
              ) : (
                <>
                  <Field
                    ref={passwordRef}
                    label="Password"
                    icon={Lock}
                    value={password}
                    onChangeText={edit(setPassword)}
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
                  <Button
                    variant="quiet"
                    label="Email me a code instead"
                    onPress={() => {
                      setMethod("code");
                      setMode("sign-in");
                      setError(null);
                    }}
                    disabled={busy}
                    style={{ height: 44 }}
                  />
                </>
              )}
            </View>
          </View>
        ) : (
          <View style={{ gap: s.s3 }}>
            <Field
              label="Code from the email"
              value={code}
              onChangeText={edit(setCode)}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              returnKeyType="go"
              onSubmitEditing={verify}
              autoFocus
              containerStyle={{ height: 44 }}
            />
            <Button
              variant="primary"
              label={busy ? "One moment" : "Verify"}
              onPress={verify}
              disabled={busy}
              style={{ height: 44 }}
            />
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

        {step === "form" && method === "password" ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <Txt variant="body" tone="ink3">
              {mode === "sign-in" ? "New to Kriyan?" : "Have an account?"}
            </Txt>
            <Button
              label={mode === "sign-in" ? "Create an account" : "Sign in"}
              onPress={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
              }}
              style={{ height: 44, paddingHorizontal: s.s2 }}
            />
          </View>
        ) : null}
        {step === "form" ? <Legal /> : null}
        {Platform.OS === "web" ? <View nativeID="clerk-captcha" /> : null}
      </View>
    </ScrollView>
  );
}
