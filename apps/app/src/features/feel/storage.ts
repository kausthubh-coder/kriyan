// A few small strings kept on this device across launches (the haptics switch, the
// onboarding draft, whether someone has signed in here). Android keeps them in the secure
// store Clerk already uses.

import * as SecureStore from "expo-secure-store";

export function readLocal(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) void SecureStore.deleteItemAsync(key);
    else SecureStore.setItem(key, value);
  } catch {
    // Not kept: the draft lives on in memory for this launch.
  }
}
