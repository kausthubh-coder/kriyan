// Once signed in: create the profile on first sign-in and keep its time zone current.

import { useEffect } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { deviceTimeZone } from "@/data/time";

export function useSession() {
  const { isAuthenticated } = useConvexAuth();
  const ensureProfile = useMutation(api.account.ensureProfile);
  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureProfile({ timeZone: deviceTimeZone() }).catch(() => undefined);
  }, [isAuthenticated, ensureProfile]);
}
