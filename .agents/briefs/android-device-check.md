# Android device check for the B2 redesign

Kausthubh runs this on his laptop (Pixel or emulator). The cloud machine can't run Android, and the device hub's first attempt failed before it started: `spawnSync C:\Users\kaust\scoop\apps\nodejs-lts\current\node.exe ETIMEDOUT`. If that error comes back, check that Node runs at all (`node -v` in a fresh terminal) before anything else.

Branch: `redesign/b2-app` (draft PR #5). Report findings on PR #5. Change no code while checking.

## Set up

1. `git fetch origin`, then a worktree for `origin/redesign/b2-app` as `worktree-kriyan` describes, and `bun run setup` in it (ends with `kriyan: ready.` and this worktree's ports).
2. `bun run dev` in the background; wait for `Waiting on http://localhost:<PORT_APP>` and `Convex functions ready`.
3. `node apps/app/e2e/seed.mjs`: the test account `kriyan.app.qa+clerk_test@example.com` (code `424242`) with 7 spaces and 9 tasks for today.
4. Rebuild the dev build: native config changed (the app follows the system light or dark setting; the splash has a dark variant). `cd apps/app && bunx expo run:android` with the device connected; 10 to 20 minutes the first time.
5. Point it at this worktree: `adb reverse tcp:<PORT_APP> tcp:<PORT_APP>` and `adb reverse tcp:<PORT_CONVEX> tcp:<PORT_CONVEX>`, set `debug_http_host` to `localhost:<PORT_APP>` and relaunch, as in `.agents/skills/verify-kriyan/features/android.md`.

## Check, in light and dark (switch the system theme and relaunch between them)

1. **Today header:** black in both modes; the weekday ("Fri") with a small red dot, the date on the right; one sentence in two tones (counts and "mostly free" white, the rest grey, small icons before the counts); "planned", "free" and "days left in 2026" under it; the page below sits on a sheet with rounded top corners; the status bar is readable.
2. **Today body:** the week strip with today outlined and its weekday red; a grey "Upcoming in …" or "Next, at 10:00" card with a black "Start focus"; a List / Timeline switch; List shows "Anytime" then "Morning", "Afternoon", "Evening" with times on the right.
3. **Swipes on task rows (List):** right fills with colour, ticks at a threshold, toasts "Done: …" with Undo, with a haptic. Short left reveals Tomorrow and Pick a day; long left moves to tomorrow with Undo. A partial swipe springs back; vertical scrolling never swipes.
4. **Task sheet** (tap a title): a native sheet with two heights and a grabber, swipe down closes it. Title, "Add a note" under it, then chips: filled for what's set ("Today, 10:00–11:30", "10 min before", "Work / Kriyan"), dashed for what isn't ("+ Repeat", "+ Deadline", "+ Goal"). Each chip opens its picker; Back returns. The bottom bar: "Start focus", "When", "Move", "⋯"; "⋯" offers "Delete task", and Undo brings it back.
5. **Focus** ("Start focus"): full-screen black, the title, a white ring that slowly empties around a big countdown (counting up when the task has no length). Pause and resume work, "+5 min" adds time, "Done" completes the task and returns to Today, system back works.
6. **Review** (`adb shell am start -a android.intent.action.VIEW -d "kriyan://review" app.kriyan`): a 4-part progress bar, "N done today" or "Today, done", "Give N a place", then one card per open task. Swipe right is Tomorrow, left lets it go (a repeating task skips that day); a haptic tick at the commit point; the buttons do the same. Then "Tomorrow", "How did today feel?" (5 choices), "Day closed". Each action has an Undo toast.
7. **Largest text:** Android font size and display size at maximum, relaunch, recheck Today, the task sheet and Focus. Nothing cut off or overlapping; the sentence and chips wrap; the timer stays readable.
8. **Feel:** smooth sheets and swipes, no stutter on the Pixel; haptics only when something commits (tick, move, swipe threshold), never on touch-down; no red error screens and no "Open debugger to view warnings" after these flows (copy any message from Metro's log).

## Report

- Each of the 8 checks: PASS or ISSUE, one line of what you saw, the device (Pixel or emulator), the mode (light or dark, default or largest text).
- Screenshots (`adb exec-out screencap -p > <name>.png`): Today light, Today dark, the task sheet open, Focus running, a Review card mid-swipe if possible, Day closed, Today at the largest text, and every issue.
- Errors from Metro's log or LogBox, as text. What couldn't be checked, and why.
- Stop the `bun run dev` tree and any emulator you started, by PID.
