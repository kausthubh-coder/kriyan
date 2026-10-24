// Inside the signed-in app: a new account that hasn't onboarded (no tasks, no spaces, no
// onboardedAt) goes to /welcome once. Everyone else, including people who used Kriyan before
// onboarding existed, stays where they are.

import { useEffect } from "react";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@kriyan/convex/api";

export function useOnboardingGate() {
  const state = useQuery(api.account.onboarding);
  useEffect(() => {
    if (state?.needed) router.replace("/welcome");
  }, [state?.needed]);
}
