# How each round is judged

One question, scored on gut feel, 1 to 10:

> **How easy does this make it for a busy student to plan their day and their life, and to run on a system, so that most days they just do the next thing instead of deciding what to do?**

- 1: a pile of features; they'd decide everything themselves every day and quit in a week.
- 5: a decent to-do app; plans exist, but the person still chooses what to do all day.
- 10: they set things up once in a few minutes; each morning the day is already laid out and each moment says what's next; when the day slips, it heals in one tap.

Each judge reads only the round's spec (`rN.md`), looks at every screenshot in its folder (`rN/*.png`, made from `rN/mockup.html`; round 0's come from the v5 prototype), scores it alone, and returns:

```
SCORE: <1-10, one decimal allowed>
WHY: <two sentences>
BIGGEST FIX: <the one change that would raise the score most>
CONFUSING: <the kinds of thing or words a new person would mix up, or "none">
```

Round 0 also scores Structured, Tiimo, Sunsama, Things 3, TickTick and Todoist the same way, from what the judge knows of them, so the scores have something to sit next to.

Council: Claude Opus 5.5, Claude Fable 5.1, GPT-6.1 Sol. A round is kept if the average goes up; otherwise it's reverted.

Rounds 0 to 3 were scored on the spec alone. From the second climb on (9 Nov 2026), every round has mockups and is scored on spec plus screenshots, and the climb runs until the average is above 8.5. Round 3 was scored again with its screenshots as the baseline for that climb (`r3v`).
