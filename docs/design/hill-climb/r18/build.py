# Builds r18/mockup.html from one plan, so every screen tells the same story.
#   python3 docs/design/hill-climb/r18/build.py && node docs/design/hill-climb/mock/shoot.mjs r18
from pathlib import Path

N = {
    "morning": "Wake-up routine", "email": "Email TA", "stamps": "Buy stamps", "bank": "Call bank",
    "prep": "CSC 316 exam prep · session {} of 5", "lab": "CSC 316 lab report · session {} of 2",
    "essay": "ENG 331 essay · session {} of 2", "ps4": "Problem set 4", "ps5": "Problem set 5",
    "ps6": "Problem set 6", "mread": "MA 241 reading", "quiz": "CSC 316 quiz review",
    "notes": "MA 241 notes", "resp": "ENG 331 response", "eread": "ENG 331 reading",
    "aside": "Put aside $90", "gym": "Gym", "mid": "MA 241 midterm prep · session {} of 3",
    "csl": "CSC 316 lecture", "csl_lab": "CSC 316 lab", "mal": "MA 241 lecture", "eng": "ENG 331 seminar",
    "lunch": "Lunch", "dinner": "Dinner with Sam", "home": "Call home", "notes2": "Review CSC 316 notes",
}
SP = {"morning": "hl", "email": "lf", "stamps": "lf", "bank": "lf", "prep": "cs", "lab": "cs", "essay": "me",
      "ps4": "ma", "ps5": "ma", "ps6": "ma", "mread": "ma", "quiz": "cs", "notes": "ma", "resp": "me",
      "eread": "me", "aside": "lf", "gym": "hl", "mid": "ma", "csl": "cs", "csl_lab": "cs", "mal": "ma",
      "eng": "me", "lunch": "lf", "dinner": "lf", "home": "lf", "notes2": "cs"}
ATTEND = {"csl", "csl_lab", "mal", "eng", "lunch", "dinner", "home"}
WORK = {"prep", "lab", "essay", "ps4", "ps5", "ps6", "mread", "quiz", "notes", "resp", "eread", "mid", "notes2"}

def name(key, n=None):
    s = N[key].format(n) if n else N[key]
    return s.replace(" · session ", " · session ").replace(" of ", " of ") if n else s

# The week as it stands on Wed 20:00, after the quiet fixes and Wednesday's sick day.
# (start, end, key, session, state) state: done, todo, in (moved in)
WEEK = {
    "Mon 9": [("08:45", "09:45", "prep", 1, "done"), ("12:45", "14:15", "lab", 1, "done"), ("14:30", "15:45", "mal", None, "att"),
              ("20:30", "21:30", "essay", 1, "done")],
    "Tue 10": [("10:15", "11:30", "csl", None, "att"), ("13:30", "14:45", "eng", None, "att"), ("15:00", "16:00", "eread", None, "done"),
               ("16:00", "17:00", "prep", 2, "done"), ("17:00", "18:00", "ps4", None, "done")],
    "Wed 11": [],
    "Thu 12": [("08:30", "10:00", "mread", None, "todo"), ("10:15", "11:30", "csl", None, "att"), ("13:30", "14:45", "eng", None, "att"),
               ("15:00", "16:00", "quiz", None, "todo"), ("16:00", "17:00", "essay", 2, "in")],
    "Fri 13": [("08:00", "09:30", "lab", 2, "in"), ("10:00", "11:00", "notes", None, "todo"), ("11:00", "11:30", "resp", None, "todo"),
               ("14:30", "15:45", "mal", None, "att")],
    "Sat 14": [("13:00", "14:00", "prep", 3, "todo"), ("14:00", "15:00", "ps5", None, "in")],
    "Sun 15": [("14:00", "15:00", "mid", 1, "todo")],
}
CLASSES = {"Mon 9": "MA 241", "Tue 10": "CSC 316, ENG 331", "Wed 11": "off sick", "Thu 12": "CSC 316, ENG 331",
           "Fri 13": "MA 241", "Sat 14": "", "Sun 15": ""}

def mins(t): h, m = t.split(":"); return int(h) * 60 + int(m)
def hm(d): return (f"{d // 60} h {d % 60:02d}".replace(" h 00", " h")) if d >= 60 else f"{d}m"

def row(start, end, key, n=None, st="todo", tag=""):
    att = key in ATTEND
    mark = '<span class="cal">◷</span>' if att else f'<span class="box{" on" if st == "done" else ""}"></span>'
    cls = {"done": " done", "past": " past", "off": " past"}.get(st, "")
    t = '<span class="newtag">NEW</span>' if st == "new" else tag
    end_t = "" if st in ("done",) else f'<span class="t2">–{end}</span>'
    return (f'<div class="tlr"><div class="tlt">{start}</div><div><div class="one s-{SP[key]}{cls}">{mark}'
            f'<span class="tx">{name(key, n)}</span>{t}{end_t}</div></div></div>')

def earlier(k): return f'<div class="tlr"><div class="tlt"></div><div><div class="gapr">Earlier today · {k} done ✓</div></div></div>'
def free(a, b): return f'<div class="tlr"><div class="tlt"></div><div><div class="gapr">{a}–{b} free</div></div></div>'
def note(text): return f'<div class="tlr"><div class="tlt"></div><div><div class="agentnote">{text}</div></div></div>'
NOW = '<div class="tlr"><div class="tlt"></div><div><div class="nowl"></div></div></div>'

def head(day, date, time):
    return (f'<div class="sb"><span>{time}</span><span>●●● ▮</span></div>'
            f'<div class="top"><div class="day">{day}<i></i></div><div class="date">{date}<br>2026</div></div>')

FABS = '<div class="fabs"><span class="fab">☰</span><span class="fab add">+</span><span class="fab">▦</span></div>'
def phone(nm, cap, body, lock=False):
    return f'<div class="wrap" data-name="{nm}"><div class="cap">{cap}</div><div class="phone{" lock" if lock else ""}">\n{body}\n</div></div>\n'
def lockscreen(date, time, card): return f'<div class="ld">{date}</div><div class="time">{time}</div><div class="live">{card}</div>'
def btns(*bs, dark=True):
    first, *rest = bs
    return '<div class="btns">' + f'<span class="btn {"w" if dark else "pri"}">{first}</span>' + "".join(f'<span class="btn">{b}</span>' for b in rest) + "</div>"
def nextline(text): return f'<div class="nextline">{text}</div>'

def ask(sentence, default, buttons, more=None, lock=False):
    """The one asking card: a sentence, what happens by default and when, two buttons, details behind a tap."""
    m = f'<div class="more">{more} ›</div>' if more else ""
    if lock:
        return (f'<div class="lk">KRIYAN <span class="state">ASK</span></div><div class="lh">{sentence}</div>'
                f'<div class="lp">{default}</div>{btns(*buttons)}{m}')
    return (f'<div class="card ask"><div class="k"><span class="state">ASK</span></div><div class="h">{sentence}</div>'
            f'<div class="p">{default}</div>{btns(*buttons, dark=False)}{m}</div>')

def toast(text, *links):
    l = "".join(f"<b>{x}</b>" for x in links)
    return f'<div class="toast t2l"><span>{text}</span><span class="tl2">{l}</span></div>'

def spare(text): return f'<div class="line2">{text}</div>'

def rowq(start, end, key, n, move):
    """A session that ended untouched: the question stays on the row until answered."""
    return (f'<div class="tlr"><div class="tlt">{start}</div><div><div class="one s-{SP[key]} q"><span class="box"></span>'
            f'<span class="tx">{name(key, n)}<span class="qq">Did this happen? <b>Yes</b> · <b>Some</b> · <b>Move → {move}</b></span></span>'
            f'<span class="t2">–{end}</span></div></div></div>')
def moved(start, key, n, to):
    """A session that ended untouched: greyed where it was, with where it went."""
    return (f'<div class="tlr"><div class="tlt">{start}</div><div><div class="one s-{SP[key]} past"><span class="box"></span>'
            f'<span class="tx">{name(key, n)}</span><span class="t2">moved to {to}</span></div></div></div>')
def held(a, b, what): return f'<div class="tlr"><div class="tlt"></div><div><div class="gapr">{a}–{b} kept free for {what}</div></div></div>'

screens = []

# 1, 2. Setup
grid_rows = "".join(
    f'<div class="l">{lbl}<small>{hrs}</small></div>' + "".join(f'<div class="c{" off" if d in off else ""}"></div>' for d in range(7))
    for lbl, hrs, off in [("Morning", "07–12", {5, 6}), ("Afternoon", "12–17", set()), ("Evening", "17–23", {4, 5})])
screens.append(phone("first-run-windows", "Setup, step 2 of 5: when you can work", f'''
<div class="sb"><span>21:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px"><div class="step">STEP 2 OF 5</div><div class="h1" style="margin-top:8px">When can you work?</div>
<div class="sub">Kriyan only plans coursework in the blue times. Tap one to switch it off.</div>
<div class="grid"><div></div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>{grid_rows}</div>
<div class="sec" style="padding-top:22px">How much coursework a day, at most?</div>
<div class="seg"><span>2 h</span><span>3 h</span><span class="on">4 h</span><span>6 h</span></div>
<div class="small" style="margin-top:8px;color:var(--ink2)">Kriyan plans at most 3 h 30 of it, so there's always space for a slip or a new assignment.</div></div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Next: your classes</div></div>'''))
cls_rows = "".join(
    f'<div class="read"><span class="tick">✓</span><span class="dot d-{sp}"></span>{nm}<span class="m">{days}<br>{t}</span></div>'
    for sp, nm, days, t in [("cs", name("csl"), "Tue Thu", "10:15–11:30"), ("me", name("eng"), "Tue Thu", "13:30–14:45"),
                            ("ma", name("mal"), "Mon Wed Fri", "14:30–15:45"), ("cs", name("csl_lab"), "Wed", "09:00–10:50"),
                            ("lf", "Lunch", "Mon to Fri", "12:00–12:45")])
screens.append(phone("first-run-classes", "Setup, step 3 of 5: classes from a photo", f'''
<div class="sb"><span>21:12</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px"><div class="step">STEP 3 OF 5</div><div class="h1" style="margin-top:8px">Your week's fixed times</div>
<div class="sub">Read from your timetable photo. Untick anything that's wrong.</div><div style="margin-top:12px">{cls_rows}</div></div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Looks right</div></div>'''))

# 3. Lock 07:30, Next
screens.append(phone("lock-next", "Mon 07:30: the card, in Next", lockscreen("Monday 9 November", "7:30", f'''
<div class="lk">KRIYAN <span class="state">NEXT</span> free until 08:45</div>
<div class="lh">Time for {name("email")}</div><div class="lp">Start it; Kriyan times it.</div>
{btns("Start", "Start exam prep early")}<div class="after">Then {name("prep", 1)} at 08:45</div>'''), lock=True))

# 4. Today 07:40
screens.append(phone("today", "Mon 07:40: the card, then the day", head("Mon", "9 November", "07:40") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>free until 08:45</div>
<div class="h">Time for {name("email")}</div>{btns("Start", "Start exam prep early", dark=False)}</div>
{spare("2 h 30 of coursework planned today")}
<div class="tl" style="padding-top:2px">{row("07:00", "07:25", "morning", st="done")}{NOW}{row("08:45", "09:45", "prep", 1)}
{row("10:30", "12:00", "lab", 1)}{row("12:00", "12:45", "lunch")}{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}
{row("19:00", "20:15", "dinner")}<div class="np">2 more waiting · Buy stamps, Call bank ›</div></div>{FABS}'''))

# 5. Lock 08:52, Now
screens.append(phone("lock-now", "08:52: the card, in Now", lockscreen("Monday 9 November", "8:52", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 09:45 · 7 min in</div>
<div class="lh">{name("prep", 1)}</div>
{btns("Done", "+15m", "Move to 12:45")}
<div class="after">Then {name("lab", 1)} at 10:30</div>'''), lock=True))

# 6. Lock 10:40, Now: a session that hasn't started
screens.append(phone("lock-late", "10:40: a session that hasn't started, 10 minutes in", lockscreen("Monday 9 November", "10:40", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> since 10:30</div>
<div class="lh">{name("lab", 1)} hasn't started</div>
{btns("Start", "Move to 12:45")}
<div class="after">If you don't start it, it moves to 12:45, the next free 1 h 30. You never have to go back and answer for it.</div>'''), lock=True))

# 7. Today 12:06, a missed session moves forward, visibly
screens.append(phone("today-noon", "12:06: the missed session moved forward, on the list", head("Mon", "9 November", "12:06") + f'''
{nextline(f"Lunch until 12:45 · then {name('lab', 1)}")}
<div class="tl" style="padding-top:6px">{earlier(3)}{moved("10:30", "lab", 1, "12:45")}{row("12:00", "12:45", "lunch")}{NOW}{row("12:45", "14:15", "lab", 1, tag='<span class="newtag" style="color:var(--ink2)">FROM 10:30</span>')}
{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}{free("16:45", "19:00")}{row("19:00", "20:15", "dinner")}
<div class="np">2 waiting · Buy stamps, Call bank ›</div></div>{FABS}'''))

# 7b. Lock 12:45, the moved session comes round
screens.append(phone("lock-moved", "12:45: the moved session comes round; no looking back", lockscreen("Monday 9 November", "12:45", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 14:15 · moved from 10:30</div>
<div class="lh">{name("lab", 1)}</div>
{btns("Start", "I already did it", "Skip today")}
<div class="after">Skip today puts it in tomorrow's free time. Due Wed.</div>'''), lock=True))

# 8. Gym sheet
screens.append(phone("block-sheet", "15:50: tap one thing to change just that", head("Mon", "9 November", "15:50") + f'''
<div class="tl" style="padding-top:10px">{earlier(4)}{row("14:30", "15:45", "mal", st="past")}{NOW}{row("16:00", "16:45", "gym")}{row("19:00", "20:15", "dinner")}</div>
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div style="display:flex;align-items:center;gap:8px"><span class="dot d-hl"></span><span class="small" style="font-weight:600;color:var(--ink2)">Health · helps Weigh 72 kg · 3 left this week</span></div>
<div class="h1" style="font-size:30px;margin-top:6px">Gym</div><div class="sub">16:00–16:45. Only this one moves.</div>
<div class="tiles t3"><div class="tile pri">Done</div><div class="tile">Move<small>→ 16:45 today</small></div><div class="tile">Move<small>→ Tue 16:00</small></div></div>
<div class="small" style="margin-top:14px;color:var(--ink2)"><b>Pin here</b> (Kriyan won't move it) · <b>Edit</b></div></div>'''))

# 9. Today 18:05, new work fits quietly
screens.append(phone("quiet-essay", "18:05: new work fits in the spare time, no question", head("Mon", "9 November", "18:05") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>free until 19:00</div>
<div class="h">Time for {name("stamps")}</div>{btns("Start", "Not now", dark=False)}<div class="after">Then {name("dinner")} at 19:00</div></div>
<div class="tl" style="padding-top:6px">{earlier(5)}{NOW}{row("19:00", "20:15", "dinner")}{row("20:30", "21:30", "essay", 1, st="new")}{free("21:30", "23:00")}</div>
{toast("New from Moodle: ENG 331 essay, 2 h, by Thu. Planned tonight 20:30 and Wed 20:00. No day goes past 3 h 30.", "See", "Undo")}{FABS}'''))

# 10. Tue 08:10, a session that hasn't started
screens.append(phone("lock-late-tue", "Tue 08:10: overslept", lockscreen("Tuesday 10 November", "8:10", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> since 08:00</div>
<div class="lh">{name("prep", 2)} hasn't started</div>
{btns("Start", "Move to 16:00")}
<div class="after">If you don't start it, it moves to 16:00. When 16:00 comes you can say you already did it.</div>'''), lock=True))

# 11. Tue 13:10, two missed sessions already moved forward
screens.append(phone("tue-moved", "Tue 13:10: a lost morning, already moved forward", head("Tue", "10 November", "13:10") + f'''
{nextline(f"Next · {name('eng')} at 13:30")}
<div class="tl" style="padding-top:6px">{moved("08:00", "prep", 2, "16:00")}{moved("09:00", "ps4", None, "17:00")}
{row("10:15", "11:30", "csl", st="past")}{row("12:00", "12:45", "lunch", st="past")}{NOW}
{row("13:30", "14:45", "eng")}{row("15:00", "16:00", "eread")}{row("16:00", "17:00", "prep", 2, tag='<span class="newtag" style="color:var(--ink2)">FROM 08:00</span>')}{row("17:00", "18:00", "ps4", tag='<span class="newtag" style="color:var(--ink2)">FROM 09:00</span>')}</div>{FABS}'''))

# 12. Wed 07:20, sick: the one question of the week
screens.append(phone("sick-ask", "Wed 07:20: the one question this week", head("Wed", "11 November", "07:20") + f'''
<div class="card ask" style="margin-top:14px"><div class="k"><span class="state">ASK</span>you tapped “I'm sick” in the menu</div>
<div class="h">Kriyan clears today at 08:00.</div>
<div class="p">Its work moves to free time later this week and stays on time, except the lab report. You get an extension email for it to read and send.</div>
{btns("OK", "Other options", dark=False)}<div class="more">See what moves ›</div></div>
<div class="tl" style="padding-top:6px">{row("09:00", "10:50", "csl_lab")}{row("12:45", "14:15", "lab", 2)}{row("14:30", "15:45", "mal")}{row("16:45", "17:45", "ps5")}{row("20:00", "21:00", "essay", 2)}</div>{FABS}'''))

# 13. Wed 15:10, the TA's reply lands
screens.append(phone("ta-reply", "Wed 15:10: the TA's reply, seen landing", head("Wed", "11 November", "15:10") + f'''
{nextline("Sick day · nothing planned · tomorrow starts 08:30")}
<div class="tl" style="padding-top:6px">{note("✉ Your TA replied: “Friday is fine, feel better.” Claude (your agent, with Gmail) moved Lab report's due date to Fri 23:59. <b>Undo</b>")}
{note("Moved at 08:00: " + name("essay", 2) + " → Thu 16:00, " + name("lab", 2) + " → Fri 08:00, " + name("ps5") + " → Sat 14:00 (due Sun).")}
{note("Sent at 08:04, after you read it: extension email for Lab report.")}</div>{FABS}'''))

# 14. The week on one screen
def wday(day):
    items = WEEK[day]
    work = sum(mins(e) - mins(s0) for s0, e, k, n, st in items if k in WORK)
    if day == "Wed 11":
        lines = '<div class="wln">Sick day. 3 h 30 moved to Thu, Fri and Sat.</div>'
        sp = "sick"
    else:
        lines = "".join(
            (f'<div class="wln att"><span class="tm2">{s0}</span>◷ {name(k, n)}</div>' if st == "att" else
             f'<div class="wln{" dn" if st == "done" else ""}"><span class="tm2">{s0}</span><span class="dot d-{SP[k]}"></span>{name(k, n)}'
             f'{" ✓" if st == "done" else ""}{" (from Wed)" if st == "in" else ""}</div>')
            for s0, e, k, n, st in items) or '<div class="wln muted">Nothing planned</div>'
        sp = f"{hm(work)} of 4 h" if work else "nothing planned"
    bar = f'<span class="lbar"><i style="width:{min(100, work / 240 * 100):.0f}%"></i></span>'
    return f'<div class="wd2"><div class="hd">{day}{bar}<span>{sp}</span></div>{lines}</div>'
screens.append(phone("week", "Wed 20:00: the week on one screen", f'''<div class="sb"><span>20:00</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:6px"><div class="h1" style="font-size:26px">This week</div><div class="sub" style="margin-top:2px;font-size:13px">Coursework each day, out of your 4 h. ◷ classes.</div>
<div style="margin-top:4px">{"".join(wday(d) for d in WEEK)}</div></div>'''))

# 15. Thu 08:05, new work into the weekend's spare time
thu = [("08:30", "10:00", "mread", None), ("10:15", "11:30", "csl", None), ("12:00", "12:45", "lunch", None), ("13:30", "14:45", "eng", None), ("15:00", "16:00", "quiz", None), ("16:00", "17:00", "essay", 2)]
screens.append(phone("quiet-weekend", "Thu 08:05: new work fits, and what doesn't fit says so", head("Thu", "12 November", "08:05") + f'''
{nextline(f"Next · {name('mread')} at 08:30")}
<div class="tl" style="padding-top:6px">{"".join(row(s, e, k, n) for s, e, k, n in thu)}</div>
{toast("New from Moodle: Problem set 6, 4 h, by Mon: planned Sat 15:00 and Sun 15:00. Practice exam (2 h, optional) doesn't fit without going past 3 h 30 a day; it's waiting.", "See", "Plan it anyway")}{FABS}'''))

# 16. Fri 09:25, the last session
screens.append(phone("lock-last", "Fri 09:25: the last session, no extra question", lockscreen("Friday 13 November", "9:25", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 09:30 · last session</div>
<div class="lh">{name("lab", 2)}</div><div class="lp">Due today 23:59, after your TA's extension.</div>
{btns("Finished Lab report", "Need more time")}
<div class="after">Need more time adds 30m at 11:30 today.</div>'''), lock=True))

# 17. Sunday
screens.append(phone("sunday", "Sun 19:00: the week, one card", head("Sun", "15 November", "19:00") + f'''
<div class="card dark" style="margin-top:14px"><div class="k">Your week · 9 to 15 Nov</div>
<div class="h">Kriyan asked you one thing all week. One deadline slipped: sick on Wed, extended by your TA.</div>
<div class="p" style="margin-top:6px">Everything else on time. Practice exam is still waiting. Next week is planned, and no day goes past 3 h 30.</div>
<div class="p" style="margin-top:6px">Exam prep ran about 15 min long, so the last 2 sessions are 1 h 15. <u>Keep 1 h</u></div>
{btns("Looks good", "Show next week", dark=False)}</div>
<div class="tl" style="padding-top:6px">{earlier(2)}{NOW}{row("20:00", "20:30", "home")}</div>{FABS}'''))

# 18. Goals
screens.append(phone("goals", "Goals: each one says what feeds it", '''<div class="sb"><span>20:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:10px"><div class="back">‹ Today</div><div class="h1" style="margin-top:6px">Goals</div>
<div class="gl"><b>Weigh 72 kg</b><span>by 1 Mar · 75.2 kg · on pace</span><div class="bar"><i class="d-hl" style="width:20%"></i></div><small>Fed by Gym, 3 a week</small></div>
<div class="gl"><b>Save $1000</b><span>by 31 Dec · $380 · on pace</span><div class="bar"><i class="d-lf" style="width:38%"></i></div><small>Fed by Put aside $90, Fridays (7 left)</small></div>
<div class="sec">New goal</div>
<div class="gl" style="border:0"><b>Read 3 books</b><span>by 31 Dec · 7 weeks</span></div>
<div class="card" style="margin:6px 0 0"><div class="k">What gets you there?</div>
<div class="p" style="color:var(--ink);margin-top:4px">Read 40m, 5 evenings a week: about a book every 2 weeks, 3 by mid-December.</div>
<div class="btns"><span class="btn pri">Add it</span><span class="btn">Change</span></div></div></div>'''))

# 19. Add an exam
screens.append(phone("add-exam", "Add: an exam carries its own prep", head("Mon", "9 November", "21:30") + f'''
<div class="tl" style="padding-top:10px">{earlier(8)}{row("20:30", "21:30", "essay", 1, st="done")}{NOW}</div>
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div class="big">MA 241 midterm <em>nov 20 2:30pm</em> <em>prep 3h</em><span class="caret"></span></div>
<div style="margin-top:14px"><span class="chip blue">At Fri 20 Nov, 14:30</span><span class="chip blue">Prep 3 h</span><span class="chip blue"><span class="dot d-ma"></span>MA 241</span></div>
<div class="small" style="color:var(--ink2)">3 sessions of 1 h in free time: Sun 15, Tue 17, Thu 19.</div><div class="addb">Add exam</div></div>'''))

css = '''<style>
.tiles.t3 { grid-template-columns:repeat(3,1fr); } .tlr > div { min-width:0; }
.one .t2 { flex:none; font-size:12px; } .one { font-size:14px; gap:8px; padding:9px 11px; height:auto; min-height:40px; } .one .tx { white-space:normal; line-height:1.25; }
.tl { padding-right:16px; } .tlr { grid-template-columns:50px 1fr; }
.card.ask { background:#fff6e8; margin-top:8px; } .card.ask .k { color:#9a6a12; } .card.ask .h { font-size:17px; line-height:1.3; } .card.ask .p { color:#6b5222; }
.toast.t2l { display:block; bottom:100px; line-height:1.35; font-size:13.5px; } .toast .tl2 { display:flex; gap:14px; margin-top:6px; } .toast .tl2 b { margin:0; }
.one.q { align-items:flex-start; box-shadow:0 0 0 1.5px #e0b562 inset; } .qq { display:block; font-weight:500; font-size:12.5px; color:#7a5a1e; margin-top:3px; } .qq b { font-weight:700; color:#5a4210; }
.wln { font-size:12px; line-height:1.5; } .wln .tm2 { display:inline-block; width:38px; color:var(--ink2); } .wln .dot { width:6px; height:6px; margin-right:4px; vertical-align:1px; } .wln.att { color:var(--meta); } .wln.dn { color:var(--ink2); } .wln.muted { color:var(--meta); }
.line2 { font-size:13px; color:var(--ink2); padding:10px 22px 0; } .back { font-size:15px; font-weight:600; color:var(--ink2); }
.more { font-size:13px; font-weight:600; color:var(--ink2); margin-top:10px; } .live .more { color:rgba(255,255,255,.7); }
.nextline { margin:14px 20px 0; padding:8px 14px; border-radius:12px; background:var(--tile); color:var(--ink2); font-size:13.5px; font-weight:600; }
.agentnote { font-size:13px; line-height:1.4; color:var(--ink); background:var(--tile); border-radius:12px; padding:10px 12px; margin:4px 0; }
.read { display:flex; gap:10px; align-items:center; min-height:54px; border-bottom:1px solid var(--rule); font-size:15px; font-weight:500; }
.read .m { margin-left:auto; color:var(--ink2); font-size:12.5px; text-align:right; }
.tick { width:20px; height:20px; border-radius:6px; background:var(--ink); color:#fff; display:grid; place-items:center; font-size:12px; flex:none; }
.wd2 { padding:7px 0; border-bottom:1px solid var(--rule); }
.wd2 .hd { display:flex; align-items:center; gap:8px; font-weight:700; font-size:14px; } .wd2 .hd span:last-child { margin-left:auto; font-weight:500; font-size:12px; color:var(--ink2); }
.lbar { width:70px; height:6px; border-radius:3px; background:var(--tile); overflow:hidden; } .lbar i { display:block; height:100%; background:#8e8e93; border-radius:3px; }
.wl { font-size:12px; line-height:1.55; margin-top:3px; } .wl.muted { color:var(--meta); }
.wi { margin-right:8px; white-space:nowrap; } .wi .dot { width:6px; height:6px; margin-right:3px; vertical-align:1px; }
.wi.dn { color:var(--ink2); } .wi.dn::after { content:" ✓"; color:var(--green); } .wi.in::before { content:"↘ "; color:var(--blue); }
.wc { font-size:11.5px; color:var(--meta); }
.sug2 { margin-top:10px; border:1.5px dashed rgba(43,111,214,.55); border-radius:12px; padding:8px 10px; font-size:12.5px; color:#2b4a7a; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.gl { padding:12px 0; border-bottom:1px solid var(--rule); } .gl b { display:block; font-size:17px; } .gl span { font-size:13px; color:var(--ink2); } .gl small { display:block; font-size:12px; color:var(--meta); margin-top:6px; }
</style>'''
html = ('<!doctype html><html><head><meta charset="utf-8"><title>Round 18 mockups</title>'
        '<link rel="stylesheet" href="../mock/kriyan.css"><link rel="stylesheet" href="../mock/card.css">' + css +
        '</head><body>\n' + "\n".join(screens) + '\n</body></html>\n')
Path(__file__).with_name("mockup.html").write_text(html)
print(len(screens), "screens")
