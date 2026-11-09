# Hill climb: kinds of thing, and a day that plans itself

Goal (Kausthubh, 9 Nov 2026): make it easy to plan your day and life, and run on systems and plans, so you don't have to choose what to do each time. Choice is where excuses come from.

Metric: one gut-feel score, 1 to 10, from three judges who each score alone (`judge.md`). Each round is a spec (`rN.md`) in the same shape: kinds of thing, how you add them, Today, seven scenarios, Monday morning, when the day slips.

## Benchmarks (round 0, same question)

| App | Opus | Fable | Sol | Avg |
| --- | --- | --- | --- | --- |
| Sunsama | 6.2 | 6.5 | 7.5 | 6.7 |
| Tiimo | 5.8 | 6.0 | 7.5 | 6.4 |
| Structured | 5.0 | 6.0 | 7.0 | 6.0 |
| TickTick | 5.3 | 5.5 | 6.0 | 5.6 |
| Things 3 | 3.8 | 5.0 | 5.5 | 4.8 |
| Todoist | 4.3 | 4.5 | 5.5 | 4.8 |

## Rounds

| Round | Change | Opus | Fable | Sol | Avg | Kept |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Kriyan as it is (main 18441e7) | 4.8 | 4.5 | 4.5 | 4.6 | baseline |
| 1 | Built-in planner fills the day, Accept plan, Replan the rest | 7.0 | 7.5 | 7.3 | 7.3 | yes |
| 2 | Three kinds (to-do, repeat, goal), one holding place, no kind picker in Add | 7.4 | 7.5 | 7.2 | 7.4 | yes |
| 3 | Length chips at Add, plan bar asks missing lengths, On/By Wed, Not planned | 7.3 | 7.5 | 7.5 | 7.4 | yes (+0.07) |

### Round 0

All three: the morning still ends with the student choosing what goes where and how long, and routines, study sessions and habit-to-goal links need an agent. Biggest fix from all three: a built-in planner that fills the day around classes and replans the rest in one tap.
Confusing (all three): habit vs repeating task vs routine; Inbox vs To fit in vs From earlier. Also: deadline vs date, goal vs habit, proposal vs task.

### Round 1

+2.7. The day laid out on open and one-tap replanning carry it past Sunsama (6.7).
Biggest fix: Opus and Sol both want one "Now / Do this next" card with Start at the top of Today; Fable wants length asked at Add (chips), so less lands in To fit in.
Confusing (all three, again): habit vs repeating task vs routine; To fit in vs From earlier vs Inbox; study vs focus session; suggested vs free dashed shapes.

### Round 2

+0.1, kept but under 0.3. Confusion about kinds mostly gone; what's left is "day vs due date" and the holding place.
Biggest fix (all three): things added without a length sit in Waiting, a second backlog to sort by hand. Fable and Opus: length chips at Add. Sol: surface unscheduled work before accepting the plan and ask for a length there.
Also: "Waiting" reads as GTD's "waiting on someone" (Fable); setup of wake, wind down and capacity is never described (Fable, round 1 Opus).

### Round 3

+0.07 (7.37 to 7.43), kept. Second round in a row under 0.3, so the climb stops here. `r3.md` is the design to build.

What the judges would do next, each naming a different one (none was tried):
- Sol and Fable: when due work can't fit before its date, say so early with one trade-off to accept ("Lab report: 3 h left, 1 h 30 free before Wed").
- Opus: a 3-minute first run: wake and wind down, hours a day, paste or photograph the timetable, next 2 or 3 deadlines, then show a planned day.
- Opus and Sol (round 1): one Now / Next card with Start at the top of Today.

Still confusing after three rounds: On vs By Wed; suggested (dashed) vs accepted blocks; fixed vs flexible repeat until you read the chip; the exam and "study for the exam" as two separate to-dos.

## Second climb: with mockups, until above 8.5

From here every round has phone mockups (`rN/mockup.html`, shot to `rN/*.png` by `mock/shoot.mjs`), and judges score spec plus screenshots. Round 0's screenshots (`r0/`) are the v5 prototype, which is the app's spec.

| Round | Change | Opus | Fable | Sol | Avg | Kept |
| --- | --- | --- | --- | --- | --- | --- |
| 3v | Round 3 again, with 5 screens (baseline) | 7.1 | 7.3 | 7.5 | 7.3 | baseline |
| 4 | First run, plan placed directly (no Accept), Now card and lock screen, heads-up, one kind of date, prep on the exam | 7.6 | 7.9 | 8.1 | 7.9 | yes |
| 5 | Work windows, limit and reasons on screen, fix one block, week view, at/by | 7.6 | 7.7 | 8.1 | 7.8 | no (-0.07) |
| 6 | Round 5 with checkable numbers: study-only limit, every move shows where, one Now card, whole-fix heads-up, replan the rest of today, labelled week | 8.1 | 7.9 | 8.2 | 8.1 | yes |
| 7 | Now card always has an action, healing from lock-screen notifications, overload with one recommendation, two markers | 7.9 | 7.8 | 8.2 | 8.0 | no (-0.1) |
| 8 | One card, four states (Next, Now, Check-in, Decide), on Today and as one live lock-screen card; asks instead of assuming | 7.6 | 7.9 | 8.1 | 7.9 | no (-0.2) |
| 9 | Round 8 with plain choices: first free slot, undated to-dos fill gaps, two-line Decide, one move verb, N of M, limit counts planned work | 7.9 | 7.7 | 8.3 | 8.0 | no (-0.1) |
| 10 | No limit maths on screen, two marks everywhere, week as a timeline, Decide names its subject, overload offers working longer | 7.9 | 7.9 | 8.3 | 8.0 | no (-0.04) |
| 11 | Every card closes in one tap (Start, Did 45m, Rebuild the rest), session N of M, Pin here, Sunday look back and ahead, Kriyan noticed | 7.7 | 7.7 | 8.2 | 7.9 | no (-0.2) |
| 12 | Every screen generated from one plan; Still working; each Decide outcome printed; session as the one word; earlier folds; prep spread; setup shown | 8.2 | 8.1 | 8.2 | 8.2 | yes |
| 13 | Decide has a default with Undo; "Is it finished?" after the last session; one-tap rebuild of a lost morning; shorter cards | 8.1 | 7.8 | 8.3 | 8.1 | no (-0.1) |
| 14 | A sick Wednesday and new work into a full week, an honest Sunday, starting the next thing ticks the last, what's next above Decide, load in the week | 8.1 | 8.1 | 8.2 | 8.1 | no (-0.03) |
| 15 | Three card kinds (Next, Now, Ask), one-sentence asks with timed defaults, sick-day default drafts the email, TA reply seen landing, one-screen week | 7.9 | 8.0 | 8.3 | 8.1 | no (-0.1) |
| 16 | Plans ~3 of 4 h; slips and new work fit quietly with toasts; nothing counts as done until ticked; ten-minute nudge; one question all week | 8.1 | 7.4 | 8.2 | 7.9 | no (-0.3) |
| 17 | Every day keeps 30m of room; an untouched session asks "Did this happen?" on its own row; one card question a week | 8.0 | 7.8 | 7.9 | 7.9 | no (-0.3) |
| 18 | Missed sessions move forward visibly; when they come round: Start · I already did it · Skip today; no backward questions; plain words | 8.2 | 8.2 | 8.2 | 8.2 | yes (+0.03) |
| 19 | One limit number; NOT STARTED with a stated move time; misses fold into one line; setup step 4; one finishing verb family | 8.1 | 7.8 | 8.3 | 8.1 | no (-0.1) |

### Round 3v

With screens the score holds at 7.3. All three: nothing says "do this now", and the morning still asks for Accept (Fable: drop it). Screens caught: struck-through Morning with an empty box, checkboxes on classes you attend, "Add to Not planned" after picking a length, "By" chip cryptic, dashed blocks read as disabled, goal money with "Fed by: nothing".

### Round 4

+0.6. First round all three call "close to set up once, then do the next thing".
Biggest fix: trust in the planner. Opus: show the work limit and say why in each heads-up. Sol: a weekly "when can you study" step (meals, travel, study windows). Fable: a one-tap fix per block (later today, tomorrow, keep here) instead of Undo-all.
Screens caught: heads-up says 45 min free over an empty evening; the day's story doesn't add up across screens (13:50 moves lab to 17:00, 18:05 says it doesn't fit); look-alike counters (1 of 5, 1 of 3, 1 h 30 of 3 h); three date words (due, by, at); square vs round boxes; struck Morning with an unticked box; Done/Not today unclear for one session vs the whole exam; no week view, no Needs a length, no agent suggestion shown.

### Round 5

-0.07, not kept as is. The ideas held (all three liked the windows, the block sheet and "only this block moves"); the drop came from numbers a student can't check. Work limit silently counts gym; heads-up blames the limit then goes 45 min over it; 20:45 vs 20:15 free; Now card buttons differ between Today and lock screen; 07:40 leaves out lunch and gym; week pills unlabelled, Claude's suggestion shown twice; AM/PM/EVE with no hours; tick box next to "Add it" on the goal.
Biggest fix: Sol: show the whole recovery plan (where all 4 essay hours go). Opus: one Now card everywhere, and "Replan the rest of today" for a lost afternoon. Fable: the limit counts study only, and every Later shows where it goes.
Round 6 starts from round 5 (its changes were what round 4's judges asked for) and fixes these.

### Round 6

+0.2 over round 4. All three: the numbers now add up across screens, and the loop is mostly Start / Done / Apply.
Biggest fix: Opus: slip and replan cards on the lock screen as one-tap actions, so a lost morning heals without opening the app. Sol: show a week that genuinely can't fit, with one recommended trade-off naming what slips and which deadline it hits. Fable: the Now card always carries an action, even in free time ("Email TA fits here").
Also: placed blocks show a length, not a time range; "Exam prep 1" vs "CSC 316 exam · prep 1 of 5"; "Wed is full" then puts 1 h 30 on Wed; four markers (clock, spark, pin, dashed) to learn; no legend for space dots; "Study" includes emails; "4 h of 4 h" reads as done; what happens when a started block's time runs out.

### Round 7

-0.1, not kept. Liked: lock-screen healing, the overload card naming what slips, arithmetic that holds. Lost points: six-plus pings a day (Opus: real notification buttons hide behind a long press and get muted by day three); "didn't happen" assumed from an untapped Start (Sol, Fable: ask instead); heads-up and overload cards push the Now card and the day off screen (Fable); week names drift from Today's; jargon ("Do the other", "replans skip it", "Undo this morning's plan"); "planned" includes finished work.
The climb has stalled around 8.0 to 8.1 one fix at a time. Round 8 changes the structure: one card with four states, everywhere.

### Round 8

-0.2, not kept, though all three call the one card the closest yet to "each moment says what's next". Lost on content: the mockup's planner made a visible bad call (Opus: "Not yet" sent the lab report to 17:00 with 12:45–14:30 free, and the card said "nothing fits" while two short to-dos waited); Decide cards are paragraphs of time ranges (all three: lead with the outcome, label each button with its outcome, put the hours behind a tap); three move verbs (Later, Not yet, Tomorrow); prep vs part; "of 4 h" reads as a target; prep 3 after prep 4 once moved; "Both done" clipped.

### Round 9

-0.1, not kept; Sol's 8.3 is the highest single score so far. All three call the lock-screen cards and the Tuesday catch-up the best healing in the climb. What holds it at 8: the student must learn the planner's bookkeeping (Fable: a limit that counts some work and not other, "not counted" circles, a status line ending in Undo; let the limit show only inside a Decide card). The week reads as a pile of chips, out of time order (Opus). Overload offers only drop-prep or be-late (Sol: offer a small overrun). Also: "Did part" vs "I did some"; errands drawn two ways; Decide headline starts "It fits" before saying what.
Five rounds between 7.9 and 8.1. Round 10 takes bookkeeping out of sight rather than explaining it better.

### Round 10

-0.04, not kept. Today and the lock screen are "as calm as the spec promises" (Fable); the week breaks "two marks everywhere" (green square vs grey tick, Lunch missing); an outline means three things (now, new, suggested); "1 of 5" reads as a fifth of the work; "Did part" opens a second question (Fable: make it an outcome); a lost morning still needs reconciling (Sol: one compact review, then rebuild in one tap); the Next card still asks "How long?".
Fable named the ceiling: mockups assert the planner's judgement instead of showing it earn trust over a bad week. Round 11 closes every loop in one tap and adds the Sunday look back and ahead.

### Round 11

-0.2, not kept. Liked: outcome buttons, Rebuild the rest, the Sunday card and "Kriyan noticed". Lost on a story that contradicts itself across 17 hand-written screens (Opus: Sunday's day lacks the midterm prep the add sheet put there; all 5 CSC prep sessions done 9 days early reads as bad spacing; goal offers gym that already exists; Today keeps finished items on one screen and drops them on another; Problem set 4 sat over lunch; rows overflow). Fable: print each Decide button's consequence under it. Sol: a "Still working" button. "Block", "session" and "task" all used for one thing; the class and its prep share a name.
Seven rounds at 7.9 to 8.1, mostly lost to inconsistencies I typed by hand. Round 12 generates every screen from one plan (`r12/build.py`), so screens can't disagree.

### Round 12

+0.1 over round 6, kept: first round with all three judges above 8. Generating every screen from one plan removed most contradictions (Opus: "the strongest so far").
Biggest fix: Fable: give Decide a default that applies at the next session boundary with Undo, so the only deciding card stops blocking. Opus: Tuesday's lost morning still isn't one tap. Sol: finishing a session vs finishing the task.
Also: "Morning" is a routine, a work window and a check-in; "Morning only" on Sunday was wrong (my label); the reading goal's pace can't meet its date (my maths); "session" used for Gym; Next card label and headline fight; gym sheet has too many buttons; Decide and Sunday cards are 60-word paragraphs.

### Round 13

-0.1, not kept, but its ideas were praised (defaults with Undo, "is it finished?", one-tap rebuild). Opus and Fable: the demo week is too clean; show a really bad day and an honest Sunday. Fable: zero prompts on a good day (starting the next thing ticks the last). Sol: keep what's next visible above any Decide or Check-in. Also: "Done" at a check-in vs "finished"; Check-in label on three jobs; week view gives no sense of load; "4 h free" unclear; Thu headline two lines.
Round 14 builds on 13 and adds a sick Wednesday.

### Round 14

-0.03, not kept. All three: the system now holds up on a bad week, but the cards for bad moments are walls of text (Fable: one sentence, the default, one alternative, details behind a tap; never stack two cards). Opus: the sick day's default should also draft the extension email, and the TA's reply should be seen landing, not asserted. Sol: starting the next thing must not silently count the last one as done. Too many card labels (six plus two untagged); done, skip and move each have three words; the week takes three pages; Thursday's list hides under the floating buttons; the goal screen is empty.
Round 15 cuts: three card kinds (Next, Now, Ask), one-sentence asks, one-screen week.

### Round 15

-0.1, not kept. Sol (8.3) still distrusts "starting the next thing counts the last as done". Opus: every day is packed to 4 h of 4 h, so every slip or new assignment becomes a question; plan to about 3 h and heal quietly, asking only when a deadline is at risk. Fable: an ask should be tappable without reading (one headline, OK, details behind a tap), and fire 10 minutes after a session should have started, not at lunch. Also: NEXT cards with nothing to do; four words for done; "Rest day" vs sick; the week is a wall of 4 h bars.
Eleven rounds between 7.9 and 8.2. Round 16 changes the planner, not the wording: a buffer, quiet healing, one question all week.

### Round 16

-0.3, not kept. The buffer and quiet fixes were liked, but: fixes filled Tue and Fri to "4 h · full", breaking the promise (Opus); auto-moving untouched work behind a toast that vanishes doubles a student's afternoon if they studied without tapping (Fable 7.4; Sol wants an "Already worked on this" that persists). The judges now pull opposite ways on asking vs assuming. Fable's fix serves both: a persistent "Did this happen?" on the block itself, not a card and not an assumption. Also: "spare" vs "free"; the sick card lost its "you said you're sick" context; Thursday's Today missed Lunch and the seminar; week rows clipped.

### Round 17

-0.3, not kept. Questions on the rows stack into "homework about homework" (Fable) and still need answering one by one (Opus, Sol: one "replan from now"). Fable's fix: the kept slot resolves itself; when it comes, NOW shows that session with Start · Skip, so nothing ever asks you to look backwards. Also: "room" and "kept free" are invented words; "one question all week" while rows ask questions; "Lab report" next to "CSC 316 lab"; Email TA both the Next card and in "waiting".

### Round 18

+0.03 over round 12, kept: all three at 8.2. Rolling misses forward with no backward questions works. Left: two limits on screen (4 h and 3 h 30; Opus: one number, buffer hidden); say when an unstarted session moves and offer "I already did it" at once (Fable, Sol); greyed "moved to" rows with checkboxes clutter the top of Tuesday; NOW used for a session that hasn't started; Done / I already did it / Finished; "Move to 12:45" while you're mid-session; "Kriyan asked you one thing" when you started the sick day; Wed 15:10 reads like a log.

### Round 19

-0.1, not kept. Left for the words: "due at 10:30" for a session's start clashes with deadlines (Opus, Sol); "moved forward" reads as earlier; a moved session still labelled NOW while asking you to Start; three grey strips stacked above the day; Kriyan and Claude as two voices on one plan (Fable: one voice, Kriyan; Claude only in Settings); one-tap partial progress on a missed session (Sol).

## Where the climb stopped (9 Nov 2026)

Best: **round 18, 8.2** (all three judges at 8.2). `r18.md` and `r18/` are the design to build from, with round 19's wording fixes above.
Fifteen rounds with mockups scored between 7.8 and 8.2; each judge moves about ±0.3 between rounds on the same ideas, so the last ten rounds are inside the noise. The judges also pull opposite ways on one real trade-off (Sol: never assume a session happened; Fable: never make the student report), which caps the average. 8.5 wasn't reached.
