// How Today shows the day (Settings' "Today shows"), from the profile: the layout, what's left
// from earlier, the space beside each task, hiding finished items and the "Now" badge. Unset
// fields read as their defaults, the same ones the backend uses (model/profile.ts todayPrefs).

import { useMutation } from "convex/react";
import { api } from "@kriyan/convex/api";
import { useProfile, type Profile } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { showToast } from "@/ui/toast";

export type TodayLayout = "blocks" | "list";
export type EarlierWindow = "none" | "week" | "month" | "all";

export interface TodayPrefs {
  todayLayout: TodayLayout;
  earlierWindow: EarlierWindow;
  showSpace: boolean;
  hideDone: boolean;
  nowBadge: boolean;
}

export function todayPrefsOf(p: Profile): TodayPrefs {
  return {
    todayLayout: p.todayLayout ?? "blocks",
    earlierWindow: p.earlierWindow ?? "week",
    showSpace: p.showSpace ?? true,
    hideDone: p.hideDone ?? false,
    nowBadge: p.nowBadge ?? true,
  };
}

/** The prefs, or undefined while the profile loads. */
export function useTodayPrefs(): TodayPrefs | undefined {
  const profile = useProfile();
  return profile ? todayPrefsOf(profile) : undefined;
}

export function useSaveTodayPrefs() {
  const update = useMutation(api.account.updateProfile);
  return (patch: Partial<TodayPrefs>) => void update(patch).catch((e: unknown) => showToast(errorText(e)));
}
