# Kriyan design, v3

The approved direction for the rebuild: brand, tokens, components and every main screen, as a static prototype that passes `critly check`. When the rebuild starts, the tokens move to `packages/core` and this folder becomes the visual reference. `../ux.md` says how the app works; this folder says how it looks.

## Open it

```
bunx serve docs/design/v3        # then open /brand.html, /today.html, ...
```

Each screen is responsive: below 760px it is the Android layout (app bar, navigation bar, floating add button, sheets).

| Page | What it shows |
|---|---|
| `brand.html` | Mark, app icon, colour, type, space, motion, elevation, components, voice, principles |
| `today.html` | Home: now and next, habits, anytime tasks, from earlier, schedule with a task being dragged |
| `panel.html` | A task open in the side panel (a sheet on the phone) |
| `task.html` | The repeat editor open on that task |
| `upcoming.html` | The week, with load per day and an agent's proposed blocks; an agenda on the phone |
| `space.html` | A nested space with its tasks, child spaces, goal and Markdown note with the block menu |
| `progress.html` | Time done, split by space, a year heatmap, goals against pace, habits by the week |
| `command.html` | The command menu adding a task from one sentence |
| `explore.html`, `explore2.html` | The typefaces and marks that were compared before choosing |

## Check it

```
cd docs/design/v3 && bunx @kausthubh/critly check http://localhost:3000
```

The policy is `.critly/policy.json`: Figtree only, type scale 12, 14, 16, 20, 28, 40, spacing 4, 8, 12, 16, 24, 32, 48, 64, and the opt-in rules `spacing-scale`, `nested-radius`, `off-token-color` and `focus-ring` turned on. Last run: `critly check: 0 errors · 8 pages × 2 viewports × 1 scheme · exit 0`. Never edit the policy to pass.

The check cannot judge hierarchy or taste. After it passes, screenshot every changed screen at 390 and 1440, blur it, and confirm one thing leads (on Today, the task you are doing now).

## Decisions

- **Feel:** calm, focused, zen. Quiet tone, instant for frequent actions, compact on desktop, comfortable on touch.
- **One theme, dark.** Warm neutrals (hue 70, chroma under 0.01). Lighter means closer: page 17%, raised 20.5%, overlay 24%, sunken 14.5%.
- **No brand accent.** The primary button is ink. Vermilion (`--now`) is the only interface colour and means the current time or late work.
- **Space colours** are muted (74% lightness, 0.085 chroma) and appear only as a dot, a checkbox ring, a chart, or a timeline surface (`--<colour>-surface`). Events show a dot; tasks show a checkbox.
- **Type:** Figtree 400, 500, 600. Six sizes. Body 14 on desktop, 16 on phones.
- **Mark:** an ensō, a day drawn as one stroke that opens where you are now. Built from two circles (R 9.2 centred; r 6.35 shifted 1.25 towards one o'clock), gap from 20° to 78°. Files in `logo/`.
- **Layout:** one calm column (680px) for Today, Space and Progress; the week is the only wide view. From a 1320px window, Today puts its schedule (400px) beside the list, and an open task's panel covers the schedule, never the list. Otherwise the task panel slides in from the right without covering the column.
- **Android:** Material navigation bar with four destinations, a floating add button, top app bar, bottom sheets with a handle, 44px targets everywhere.
- **Icons:** Lucide, 1.75 stroke, 18px beside 14px text.

## Moving this into the app

- Tokens become `packages/core/src/tokens.ts`, generating CSS for the site and a typed theme for Expo. Keep the names.
- Every value in `app.css` maps to a token or a component. Do not copy raw values.
- The Expo app follows Critly's mobile concepts: native stack and tabs, `Pressable` with `android_ripple`, Gesture Handler and Reanimated for drag, FlashList for lists, `@expo/ui` for pickers and switches, and the system font scale.
