// What someone chose before signing in (steps 1 to 5), kept on this phone until it can be saved
// to their account. Android keeps it in SecureStore; the web build uses draft.web.ts.

import * as SecureStore from "expo-secure-store";
import { EMPTY_DRAFT, type Draft } from "./model";

const KEY = "kriyan.onboarding";

export async function loadDraft(): Promise<Draft> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(draft)).catch(() => undefined);
}

export async function clearDraft(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
