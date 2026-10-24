// Focused minutes today and this week (views.focus), for Review's "and focused for 1h 20m".

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@kriyan/convex/api";
import { useClock } from "@/data/time";

export function useFocusSummary() {
  const { today } = useClock();
  return useQuery(api.views.focus, useConvexAuth().isAuthenticated ? { today } : "skip");
}
