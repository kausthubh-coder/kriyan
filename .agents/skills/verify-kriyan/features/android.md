# Android

The Android app is the same Expo app as the web, with native navigation, gestures, haptics and notifications. Verification drives a debug dev build on the `kriyan` emulator, loading JavaScript from this checkout's Metro.

## Sub-features

- `android-open` the dev build opens signed in on Today with the seeded plan.
- `android-nav` the Today, Week, Goals and Ask tabs in the dock (Inbox, spaces and Settings are reached from Ask); Back from Today leaves the app.
- `android-gestures` long-press an anytime row and drag it onto the timeline; drag and resize blocks.
- `android-sheets` the task panel opens as a native sheet (two heights, swipe down to close); quick add opens from the `Add task` button.

## How to get to it (user POV)

- The Kriyan icon on the home screen; a reminder notification.

## Driving it with adb

Preconditions: emulator booted (SKILL.md Launch), `bun run dev` serving Metro on `PORT_APP`.

- **Install the dev build** when `doctor.mjs` warns it's missing or native dependencies changed: `cd apps/app && bunx expo run:android` (it generates `android/`, builds and installs `app.kriyan`; the first build takes 10 to 20 minutes).
- **Open on this Metro.** `bash apps/app/e2e/adb.sh reverse tcp:<PORT_APP> tcp:<PORT_APP>` and `reverse tcp:<PORT_CONVEX> tcp:<PORT_CONVEX>` (the app reaches this checkout's backend at `127.0.0.1:<PORT_CONVEX>`). The app has no `expo-dev-client`; the plain debug build loads from the host in its `debug_http_host` preference (`localhost:8081` when unset). Write `<map><string name="debug_http_host">localhost:<PORT_APP></string></map>` to a local file, `adb push` it to `/data/local/tmp/prefs.xml`, then `adb shell "cat /data/local/tmp/prefs.xml | run-as app.kriyan sh -c 'cat > /data/data/app.kriyan/shared_prefs/app.kriyan_preferences.xml'"` (create `shared_prefs` with `run-as app.kriyan mkdir -p` first). Then `am force-stop app.kriyan` and `am start -n app.kriyan/.MainActivity`. `.artifacts/dev.log` prints `Android Bundled`; allow another 30 to 60 seconds on the software-rendered emulator.
- **Deep links.** `MSYS_NO_PATHCONV=1 bash apps/app/e2e/adb.sh shell am start -a android.intent.action.VIEW -d "kriyan://<path>" app.kriyan`. Google sign-in comes back on `kriyan://sso-callback`; `src/app/+native-intent.tsx` keeps the router away from it.
- **Read the screen.** `bash apps/app/e2e/adb.sh ui` prints visible labels with bounds, e.g. `text="Today" @ [42,183][674,257]`. A first screen showing `Today`, `Anytime today`, `Schedule` and the seeded titles is signed in.
- **Act.** Tap the centre of a label's bounds with `adb.sh tap x y`; type with `adb.sh text "..."`; Back is `adb.sh key 4`.
- **Proof.** `adb.sh shot <feature>-<step>` before and after, plus `adb.sh ui` output saved beside it.

## Gotchas

- A black screen right after launch is the bundle still loading; wait and read `ui` again before calling it broken.
- Signing in on Android: the session persists in the dev build. If it shows the sign-in screen, sign in with the test account and code `424242` by tapping the fields from `ui`.
- `Open debugger to view warnings.` at the bottom is the dev LogBox; it isn't shown in release builds, but read the warnings in Metro's log when it appears after your change.
- The emulator is shared by every checkout on the machine; check `adb devices` and who launched the app before driving it.
