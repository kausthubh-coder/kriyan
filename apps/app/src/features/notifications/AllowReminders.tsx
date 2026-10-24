// Android asks for notification permission the first time a reminder is added (register.ts),
// so Settings has no button for it there. The web's button is AllowReminders.web.tsx.

export function AllowReminders() {
  return null;
}
