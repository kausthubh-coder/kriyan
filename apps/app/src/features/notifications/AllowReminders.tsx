// Android asks for notification permission the first time a reminder is added (register.ts),
// so Settings has no button for it there, and onboarding's step 7 asks through register.ts
// itself. The web's button and hook are in AllowReminders.web.tsx.

export type ReminderState = "checking" | "off" | "on" | "blocked" | "busy";

/** What onboarding and Settings need to offer reminders in a browser (see the web file). */
export interface WebReminders {
  available: boolean | undefined;
  needsHomeScreen: boolean;
  state: ReminderState;
  allow: () => void;
  stop: () => void;
}

export function useWebReminders(): WebReminders {
  return {
    available: false,
    needsHomeScreen: false,
    state: "off",
    allow: () => undefined,
    stop: () => undefined,
  };
}

export function AllowReminders() {
  return null;
}
