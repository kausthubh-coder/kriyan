// Once someone signs in from onboarding, what they built on the device goes to their account:
// their day's hours, their first task, and the mark that they're onboarded. An account that
// was onboarded before keeps its plan as it was, so signing in on a new device never adds the
// first task twice.

import { useEffect } from "react";
import { useUser } from "@clerk/expo";
import { useConvexAuth } from "convex/react";
import { api } from "@kriyan/convex/api";
import { parseTask } from "@kriyan/core/parse";
import { convex } from "@/data/convex";
import { deviceTimeZone } from "@/data/time";
import { errorText } from "@/features/tasks/actions";
import { showToast } from "@/ui/toast";
import { draft, updateDraft } from "./draft";

/** One save at a time, across re-renders and remounts. */
let saving = false;

async function save(name: string | null) {
  const d = draft.get();
  // The profile row has to exist before it can be updated; this is the call the app makes on
  // every sign-in anyway, and it does nothing when the row is there.
  await convex.mutation(api.account.ensureProfile, {
    timeZone: deviceTimeZone(),
    ...(name ? { name } : {}),
  });
  const profile = await convex.query(api.account.profile, {});
  if (profile.onboardedAt !== undefined) {
    if (d.task || d.hours)
      showToast("Welcome back. Your plan is as you left it, so nothing was added twice.");
    updateDraft({ saved: true });
    return;
  }
  if (d.task) {
    const dated = parseTask(d.task.text, d.task.date).date;
    await convex.mutation(api.tasks.addText, { text: d.task.text, ...(dated ? {} : { date: d.task.date }) });
  }
  await convex.mutation(api.account.updateProfile, {
    ...(d.hours ? { dayStart: d.wake, dayEnd: d.wind } : {}),
    onboarded: true,
  });
  updateDraft({ saved: true });
}

export function useSaveDraft(enabled: boolean) {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const saved = draft.useValue((d) => d.saved);
  const name = user?.firstName ?? null;
  useEffect(() => {
    if (!enabled || !isAuthenticated || saved || saving) return;
    saving = true;
    save(name)
      .catch((e: unknown) => showToast(errorText(e)))
      .finally(() => {
        saving = false;
      });
  }, [enabled, isAuthenticated, saved, name]);
}
