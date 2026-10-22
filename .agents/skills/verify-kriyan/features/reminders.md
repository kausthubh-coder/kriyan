# Reminders

A task can have any number of reminders: minutes before its start, or a day offset at a time ("the day before at 20:00"). On Android they ring as notifications in the `reminders` channel; tapping one opens its task, once.

## Sub-features

- `remind-edit` add, change and remove reminders in the task panel (`Reminders`, `Custom reminder`).
- `remind-default` a timed task gets the default reminders from Settings when none are given.
- `remind-ring` the notification arrives with the title and when the task is, said from the day it rings: `Starts at HH:MM` on the day, `Tomorrow at HH:MM` or `Tomorrow` the day before, `Fri 16 Oct` further ahead. A repeating event rings before every occurrence.
- `remind-elsewhere` a task added on the web, by the CLI or by an agent still rings the phone.
- `remind-open` tapping the notification opens that task; relaunching the app later does not reopen it.

## How to get to it (user POV)

- Open a task, then `Reminders` in its panel.
- Type it: `... remind 10m before`, `... remind day before at 20:00`.
- The phone rings; tap the notification.

## Driving it with adb

Preconditions: the emulator and dev build are up (see `android.md`), the app opened once since the last seed, and notification permission granted.

- **Arrange a reminder due soon.** Two minutes from now as `HH:MM`: `node apps/app/e2e/api.mjs add_task '{"text":"Reminder probe today HH:MM remind 1 min before"}'`.
- **Wait.** Sleep until a minute before `HH:MM`, plus 30 seconds.
- **See it arrive.** `bash apps/app/e2e/adb.sh shell dumpsys notification --noredact | grep -E "kriyan-reminder|android.title=|android.text="` shows a record tagged `kriyan-reminder-<taskId>-...` with `android.title=String (Reminder probe)` and `android.text=String (Starts at HH:MM)`. Save it to `.artifacts/app/reminders-dumpsys.txt`.
- **Open it.** `bash apps/app/e2e/adb.sh shell cmd statusbar expand-notifications`, `bash apps/app/e2e/adb.sh ui`, tap the `Reminder probe` bounds. The task panel opens on that task.
- **Proof.** The dumpsys file, a shade screenshot (`adb.sh shot reminders-shade`) and the opened task (`adb.sh shot reminders-opened`).

## Gotchas

- Delivery today is local: this build has no Firebase config, so `getExpoPushTokenAsync` fails and the app schedules the coming week's reminders on the device from its live data. A task added elsewhere rings only after the app has synced it (it was open, or opened, after the add). The server path (`packages/convex/convex/reminders.ts`, Expo push) needs an EAS project id and FCM credentials before it can be proven; until then report server push as not verifiable, and don't count a local notification as proof of it.
- `seed.mjs` deletes the account's push tokens with everything else; reopen the app after seeding.
- The emulator's clock is the host's; compute `HH:MM` on the host.
