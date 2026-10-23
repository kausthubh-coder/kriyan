# Kriyan design, v4 (B2)

The approved look and flows. `b2.html` and `onboarding.html` are working prototypes and the visual spec: when the app and a prototype disagree on how something looks or behaves, the prototype wins unless this file says otherwise. `../ux.md` says how the app works. v3 is the previous dark look, kept for history.

## Open it

```
bunx serve docs/design/v4        # then /b2.html?screen=today and /onboarding.html?step=1
```

- `b2.html?screen=` `today`, `add`, `task`, `focus`, `week`, `goals`, `review`, `assistant`, `settings`. Below 700px it is the phone (Android and the iPhone PWA); from 900px it is the desktop web app. `?theme=dark` forces dark.
- `onboarding.html?step=1..9&platform=ios|android|desktop`.
- `?why=1` on either shows numbered pins: the reference app or study behind each part. Read them before changing that part.
- Both prototypes read `shared/kriyan-data.js`: one real-shaped week (Thu 22 Oct 2026, 10:40) and a quick-add parser that mirrors `packages/core`.

## Decisions

- **Look:** Joi-calm monochrome. Inter 400/500/600. One red, `--now`, means the current time and nothing else. `--parse` (blue) marks words quick add understood. Space colours appear only as a dot, a checkbox ring or a timeline surface.
- **Schemes:** light and dark, from the system. The Today header (`--head`) is black in both, with the day ("Thu" and the red dot) and one sentence that summarises the day. On Android the scheme is read at launch.
- **Contrast:** every text colour holds 4.5:1. `--ink-3` is the faintest text allowed; Joi's lighter grey failed, so don't bring it back.
- **Today:** header sentence, week strip, "Upcoming in N min" card with Start focus, List or Timeline, groups Anytime / Morning / Afternoon / Evening, "2 from earlier" (never "overdue"), and a "Review today" card at the review time.
- **Task:** a sheet with two heights on the phone and the right panel on desktop. Title, then notes, then one wrap of chips for what is set; unset fields are quiet "+ Repeat" chips. Each chip opens one small picker. Thumb bar: Start focus, When, Move, more.
- **Review:** done today (count and focused time, no score), then each open item one at a time (Tomorrow, Pick a day, Inbox, Let it go; swipe right is tomorrow, left is let it go), then tomorrow at a glance, then an optional "How did today feel?", ending on "Day closed".
- **Ask:** replaces the Agents tab. Plain-language requests change the plan at once and come back as cards with Undo. Automations (Codex reading Moodle and Gmail, a weekly plan) list what each run did, with Undo per item, and their tasks say where they came from. One feedback tip at a time. MCP and CLI setup live in Settings.
- **Gestures on the phone:** swipe right to finish, swipe left to move, long-press for the row's menu, double-tap free time to add there, pull down on Today to add. Each has a visible button that does the same. Haptics on by default, sounds off by default.
- **Navigation:** phone tabs Today, Week, Goals, Ask, plus the add button. Desktop: sidebar, the page, the right panel, an ask bar at the bottom of Ask, Ctrl+K anywhere.
- **Onboarding:** builds the first day before sign-in (Clerk: Google or an email code). On iPhone it walks through Add to Home Screen, because a Home Screen web app is the only way an iPhone gets reminders without the App Store.

## Check it

The app's `.critly/policy.json` holds the values: Inter only, type scale 12, 14, 16, 20, 28, 40, spacing 4 to 64, both schemes. `bun run lint:ui` must exit 0. Never edit the policy to pass.
