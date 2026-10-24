// Google, or an email code, with no password: onboarding's sign-in (onboarding.html step 6).
// One email field serves both: a code goes to an existing account, and an address Clerk doesn't
// know gets a new account verified by the same code.

import { useState } from "react";
import { useSignIn, useSignUp, useSSO } from "@clerk/expo";
import { clerkCode, clerkMessage } from "./clerkMessage";

export function useCodeSignIn() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [via, setVia] = useState<"sign-in" | "sign-up">("sign-in");

  /** Each returns null when it worked, or what to tell the person. */
  const google = async (): Promise<string | null> => {
    const result = await startSSOFlow({ strategy: "oauth_google" });
    if (result.createdSessionId && result.setActive)
      await result.setActive({ session: result.createdSessionId });
    return null;
  };

  const sendCode = async (email: string): Promise<string | null> => {
    const res = await signIn.emailCode.sendCode({ emailAddress: email });
    if (clerkCode(res) === "form_identifier_not_found") {
      const created = await signUp.create({ emailAddress: email });
      const err = clerkMessage(
        created,
        "Couldn't start an account for that address. Check it and try again.",
      );
      if (err) return err;
      const sent = await signUp.verifications.sendEmailCode();
      const sendErr = clerkMessage(sent, "Couldn't send the code. Try again.");
      if (sendErr) return sendErr;
      setVia("sign-up");
      return null;
    }
    const err = clerkMessage(res, "Couldn't send a code to that address. Check it and try again.");
    if (err) return err;
    setVia("sign-in");
    return null;
  };

  const verify = async (code: string): Promise<string | null> => {
    if (via === "sign-in") {
      const res = await signIn.emailCode.verifyCode({ code });
      const err = clerkMessage(res, "That code didn't work. Check it or send a new one.");
      if (err) return err;
      return clerkMessage(await signIn.finalize(), "Couldn't finish signing in. Try again.");
    }
    const res = await signUp.verifications.verifyEmailCode({ code });
    const err = clerkMessage(res, "That code didn't work. Check it or send a new one.");
    if (err) return err;
    return clerkMessage(await signUp.finalize(), "Couldn't finish creating your account. Try again.");
  };

  return { google, sendCode, verify };
}
