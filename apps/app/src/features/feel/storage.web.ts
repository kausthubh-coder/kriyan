// A few small strings kept in this browser across visits (the haptics switch, the
// onboarding draft, whether someone has signed in here).

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: the draft lives on in memory for this visit.
  }
}
