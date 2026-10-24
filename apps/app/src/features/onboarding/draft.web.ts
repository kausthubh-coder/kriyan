// The web build keeps the onboarding draft in localStorage.

import { EMPTY_DRAFT, type Draft } from "./model";

const KEY = "kriyan.onboarding";

export async function loadDraft(): Promise<Draft> {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private browsing can refuse storage; onboarding still works for this visit.
  }
}

export async function clearDraft(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
