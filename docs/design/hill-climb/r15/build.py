# Builds r15/mockup.html from one plan, so every screen tells the same story.
#   python3 docs/design/hill-climb/r15/build.py && node docs/design/hill-climb/mock/shoot.mjs r15
from pathlib import Path

N = {
    "morning": "Wake-up routine", "email": "Email TA", "stamps": "Buy stamps", "bank": "Call bank",
    "prep": "CSC 316 exam prep · session {} of 5", "lab": "Lab report · session {} of 2",
    "essay": "ENG 331 essay · session {} of 3", "ps4": "Problem set 4", "ps5": "Problem set 5",
    "ps6": "Problem set 6", "mread": "MA 241 reading", "quiz": "CSC 316 quiz review",
    "notes": "MA 241 notes", "resp": "ENG 331 response", "eread": "ENG 331 reading",
    "aside": "Put aside $126", "gym": "Gym", "mid": "MA 241 midterm prep · session {} of 3",
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

# The week as it stands on Wed 20:00, after Monday's choice and Wednesday's sick day.
# (start, end, key, session, state) state: done, todo, off (attend skipped), moved-in "in"
WEEK = {
    "Mon 9": [("08:45", "09:45", "prep", 1, "done"), ("12:45", "14:15", "lab", 1, "done"), ("20:30", "22:00", "essay", 1, "done")],
    "Tue 10": [("15:00", "16:00", "eread", None, "done"), ("16:00", "17:00", "prep", 2, "done"), ("17:00", "18:00", "ps4", None, "done"),
               ("19:00", "20:00", "essay", 2, "done")],
    "Wed 11": [],
    "Thu 12": [("08:30", "10:00", "mread", None, "todo"), ("15:00", "16:00", "quiz", None, "todo"), ("16:00", "17:30", "essay", 3, "in")],
    "Fri 13": [("08:00", "09:30", "lab", 2, "in"), ("10:00", "11:00", "notes", None, "todo"), ("11:00", "11:30", "resp", None, "todo"),
               ("13:15", "14:15", "ps5", None, "in")],
    "Sat 14": [("13:00", "14:00", "prep", 3, "todo")],
    "Sun 15": [],
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

screens = []

# 1, 2. Setup
grid_rows = "".join(
    f'<div class="l">{lbl}<small>{hrs}</small></div>' + "".join(f'<div class="c{" off" if d in off else ""}"></div>' for d in range(7))
    for lbl, hrs, off in [("Morning", "07–12", {5, 6}), ("Afternoon", "12–17", set()), ("Evening", "17–23", {4, 5})])
screens.append(phone("first-run-windows", "Setup, step 2 of 5: when you can work", f'''
<div class="sb"><span>21:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px"><div class="step">STEP 2 OF 5</div><div class="h1" style="margin-top:8px">When can you work?</div>
<div class="sub">Kriyan only plans work in the blue times. Tap one to switch it off.</div>
<div class="grid"><div></div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>{grid_rows}</div>
<div class="sec" style="padding-top:22px">How much work a day, at most?</div>
<div class="seg"><span>2 h</span><span>3 h</span><span class="on">4 h</span><span>6 h</span></div>
<div class="small" style="margin-top:8px;color:var(--ink2)">Work means coursework. Classes, meals, gym and errands don't count.</div></div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Next: your classes</div></div>'''))
cls_rows = "".join(
    f'<div class="read"><span class="tick">✓</span><span class="dot d-{sp}"></span>{nm}<span class="m">{days}<br>{t}</span></div>'
    for sp, nm, days, t in [("cs", name("csl"), "Tue Thu", "10:15–11:30"), ("me", name("eng"), "Tue Thu", "13:30–14:45"),
                            ("ma", name("mal"), "Mon Wed Fri", "14:30–15:45"), ("cs", name("csl_lab"), "Wed", "09:00–10:50"),
                            ("lf", "Lunch", "Mon to Fri", "12:00–12:45")])
screens.append(phone("first-run-classes", "Setup, step 3 of 5: classes from a photo", f'''
<div class="sb"><span>21:12</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px"><div class="step">STEP 3 OF 5</div><div class="h1" style="margin-top:8px">Your week's fixed times</div>
<div class="sub">Read from your timetable photo. Untick anything that's wrong.</div><div style="margin-top:12px">{cls_rows}</div>
<div class="small" style="margin-top:12px;color:var(--ink2)">Next: anything due soon. Then Kriyan plans your week.</div></div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Looks right</div></div>'''))

# 3. Lock 07:30, Next
screens.append(phone("lock-next", "Mon 07:30: the card, in Next", lockscreen("Monday 9 November", "7:30", f'''
<div class="lk">KRIYAN <span class="state">NEXT</span> free until 08:45</div>
<div class="lh">{name("email")} fits now</div><div class="lp">Start it; Kriyan times it.</div>
{btns("Start", "Start exam prep early")}<div class="after">Then {name("prep", 1)} at 08:45</div>'''), lock=True))

# 4. Today 07:40
screens.append(phone("today", "Mon 07:40: the card, then the day", head("Mon", "9 November", "07:40") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>free until 08:45</div>
<div class="h">{name("email")} fits now</div>{btns("Start", "Start exam prep early", dark=False)}</div>
<div class="tl" style="padding-top:6px">{row("07:00", "07:25", "morning", st="done")}{NOW}{row("08:45", "09:45", "prep", 1)}
{row("10:30", "12:00", "lab", 1)}{row("12:00", "12:45", "lunch")}{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}
{row("19:00", "20:15", "dinner")}<div class="np">3 waiting · Email TA, Buy stamps, Call bank ›</div></div>{FABS}'''))

# 5. Lock 08:52, Now
screens.append(phone("lock-now", "08:52: the card, in Now", lockscreen("Monday 9 November", "8:52", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 09:45 · 7 min in</div>
<div class="lh">{name("prep", 1)}</div>
{btns("Done", "+15m", "Stop, finish at 12:45")}
<div class="after">{name("email")} counted as done when you started this. <u>Not done?</u></div>'''), lock=True))

# 6. Lock 12:05, Ask: a session that didn't start
screens.append(phone("lock-ask-slip", "12:05: a session that never started", lockscreen("Monday 9 November", "12:05", ask(
    f"{name('lab', 1)} didn't start.",
    "At 12:15 Kriyan moves it to 12:45, the first free 1 h 30. Nothing else moves.",
    ["Move it now", "I did it"], more="I did some of it", lock=True)), lock=True))

# 7. Today 12:06
screens.append(phone("today-noon", "12:06: moved; the day below", head("Mon", "9 November", "12:06") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>at 12:45</div>
<div class="h">{name("lab", 1)}</div><div class="p">12:45–14:15. Lunch until then.</div></div>
<div class="tl" style="padding-top:6px">{earlier(3)}{row("12:00", "12:45", "lunch")}{NOW}{row("12:45", "14:15", "lab", 1)}
{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}{free("16:45", "19:00")}{row("19:00", "20:15", "dinner")}
<div class="np">2 waiting · Buy stamps, Call bank ›</div></div>{FABS}'''))

# 8. Gym sheet
screens.append(phone("block-sheet", "15:50: tap one thing to change just that", head("Mon", "9 November", "15:50") + '''
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div style="display:flex;align-items:center;gap:8px"><span class="dot d-hl"></span><span class="small" style="font-weight:600;color:var(--ink2)">Health · helps Weigh 72 kg · 3 left this week</span></div>
<div class="h1" style="font-size:30px;margin-top:6px">Gym</div><div class="sub">16:00–16:45. Only this one moves.</div>
<div class="tiles t3"><div class="tile pri">Done</div><div class="tile">Move<small>→ 16:45 today</small></div><div class="tile">Move<small>→ Tue 16:00</small></div></div>
<div class="small" style="margin-top:14px;color:var(--ink2)"><b>Pin here</b> (Kriyan won't move it) · <b>Edit</b></div></div>'''))

# 9. Today 16:50, waiting things fill a gap
screens.append(phone("gap-errands", "16:50: a free stretch offers what's waiting", head("Mon", "9 November", "16:50") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>free until 19:00</div>
<div class="h">{name("stamps")} fits now</div>{btns("Start", "Not now", dark=False)}<div class="after">Then {name("bank")}, also waiting.</div></div>
<div class="tl" style="padding-top:6px">{earlier(5)}{NOW}{free("16:50", "19:00")}{row("19:00", "20:15", "dinner")}</div>{FABS}'''))

# 10. Today 18:05, Ask with a default
screens.append(phone("ask-essay", "18:05: new work, one sentence and a default", head("Mon", "9 November", "18:05") + f'''
{nextline(f"Next · {name('dinner')} at 19:00")}
{ask("New from Moodle: ENG 331 essay, 4 h, by Thu.", "At 19:00 Kriyan fits it in by moving one exam prep session from Wed to Sat.", ["Do that now", "Keep Wed, work 1 h longer"], more="See what moves")}
<div class="tl" style="padding-top:6px">{earlier(7)}{NOW}{row("19:00", "20:15", "dinner")}{free("20:15", "23:00")}</div>{FABS}'''))

# 11. Today 18:06
screens.append(phone("decided", "18:06: the new session in the day", head("Mon", "9 November", "18:06") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>free until 19:00</div>
<div class="h">Nothing waiting. Free time is free.</div><div class="after">Then {name("dinner")} at 19:00</div></div>
<div class="tl" style="padding-top:6px">{earlier(7)}{NOW}{row("19:00", "20:15", "dinner")}{row("20:30", "22:00", "essay", 1, st="new")}{free("22:00", "23:00")}</div>
<div class="toast">Prep session 3 moved Wed → Sat <b>Undo</b></div>{FABS}'''))

# 12. Tue 13:10, two sessions didn't start
screens.append(phone("lock-ask-morning", "Tue 13:10: a lost morning, one tap", lockscreen("Tuesday 10 November", "13:10", ask(
    f"2 sessions this morning didn't start.",
    f"At 13:30 Kriyan moves {name('prep', 2)} to 16:00 and {name('ps4')} to 17:00. Reading and essay stay.",
    ["Move them now", "I did them"], more="I did some", lock=True)), lock=True))

# 13. Wed 07:20, sick
screens.append(phone("sick-day", "Wed 07:20: \"I'm sick\" from the menu", head("Wed", "11 November", "07:20") + f'''
{nextline("Today · rest. Nothing planned.")}
{ask("Sick today. Kriyan cleared it.", "At 08:00 it moves today's 4 h of work to Thu and Fri, and drafts an extension email for Lab report, which can't be on time. You read the email before it goes.", ["Do that now", "Just clear today"], more="See what moves")}
<div class="tl" style="padding-top:6px">{row("09:00", "10:50", "csl_lab", st="off", tag='<span class="newtag" style="color:var(--ink2)">OFF TODAY</span>')}{row("14:30", "15:45", "mal", st="off", tag='<span class="newtag" style="color:var(--ink2)">OFF TODAY</span>')}</div>{FABS}'''))

# 14. Wed 15:10, the TA's reply lands
screens.append(phone("ta-reply", "Wed 15:10: the TA's reply, seen landing", head("Wed", "11 November", "15:10") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>rest day</div>
<div class="h">Nothing planned today.</div><div class="p">Tomorrow starts with {name("mread")} at 08:30.</div></div>
<div class="tl" style="padding-top:6px">{note("✉ Your TA replied: “Friday is fine, feel better.” Claude (your agent, with Gmail) moved Lab report's due date to Fri 23:59. <b>Undo</b>")}
{note("Sent 08:02: extension email for Lab report, after you read it.")}</div>{FABS}'''))

# 15. The week, Wed 20:00, one screen
def wday(day):
    items = WEEK[day]
    work = sum(mins(e) - mins(s) for s, e, k, n, st in items if k in WORK)
    if day == "Wed 11":
        body = '<div class="wl">Sick · 4 h moved to Thu and Fri</div>'
    else:
        parts = []
        for s, e, k, n, st in items:
            cls = " dn" if st == "done" else (" in" if st == "in" else "")
            parts.append(f'<span class="wi{cls}"><span class="dot d-{SP[k]}"></span>{s} {name(k, n)}</span>')
        body = '<div class="wl">' + " ".join(parts) + "</div>" if parts else '<div class="wl muted">Nothing planned</div>'
    cl = CLASSES[day]
    bar = f'<span class="lbar"><i style="width:{min(100, work / 240 * 100):.0f}%"></i></span>'
    return (f'<div class="wd2"><div class="hd">{day}{bar}<span>{hm(work) if work else "—"} of 4 h</span></div>{body}'
            + (f'<div class="wc">◷ {cl}</div>' if cl and day != "Wed 11" else "") + "</div>")
LEG = ('<div class="legend"><span><span class="dot d-cs"></span>CSC 316</span><span><span class="dot d-ma"></span>MA 241</span>'
       '<span><span class="dot d-me"></span>ENG 331</span><span>✓ done</span><span>↘ moved in</span></div>')
screens.append(phone("week", "Wed 20:00: the week on one screen, after the sick day", f'''<div class="sb"><span>20:00</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:8px"><div class="h1" style="font-size:28px">This week</div><div class="sub" style="margin-top:2px">Coursework, against your 4 h a day</div>{LEG}
<div style="margin-top:6px">{"".join(wday(d) for d in WEEK)}</div>
<div class="sug2">Claude suggests {name("notes2")}, 30m, Sat 14:00 <span class="btn blue" style="height:28px;padding:0 11px;font-size:12.5px">Add</span><span class="btn" style="height:28px;padding:0 11px;font-size:12.5px">No</span></div></div>'''))

# 16. Thu 08:00, new work into a full week
thu = [("08:30", "10:00", "mread", None), ("10:15", "11:30", "csl", None), ("15:00", "16:00", "quiz", None), ("16:00", "17:30", "essay", 3)]
screens.append(phone("ask-full-week", "Thu 08:00: new work, and the week is full", head("Thu", "12 November", "08:00") + f'''
{nextline(f"Next · {name('mread')} at 08:30")}
{ask("New from Moodle: Problem set 6, 4 h, by Mon. Practice exam, 2 h, optional.", "Thu and Fri are full. At 10:00 Kriyan skips Practice exam and puts Problem set 6 on Sat and Sun afternoons.", ["Do that now", "Keep Practice exam too"], more="See what moves")}
<div class="tl" style="padding-top:6px">{"".join(row(s, e, k, n) for s, e, k, n in thu)}</div>
<div style="height:90px"></div>{FABS}'''))

# 17. Fri 09:25, the last session: done, finished or need more
screens.append(phone("lock-last", "Fri 09:25: the last session asks nothing extra", lockscreen("Friday 13 November", "9:25", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 09:30 · last session</div>
<div class="lh">{name("lab", 2)}</div><div class="lp">Due today 23:59 (your TA moved it).</div>
{btns("Done, finished", "Done, need more")}
<div class="after">Need more adds 30m at 11:30 today.</div>'''), lock=True))

# 18. Sun 19:00, one card for the week
screens.append(phone("sunday", "Sun 19:00: the week, one card", head("Sun", "15 November", "19:00") + f'''
<div class="card dark" style="margin-top:14px"><div class="k">Your week · 9 to 15 Nov</div>
<div class="h">A sick day cost one deadline, and your TA extended it.</div>
<div class="p" style="margin-top:6px">Everything else on time. Next week is planned: CSC 316 exam Mon 23, MA 241 midterm Fri 20.</div>
<div class="p" style="margin-top:6px">Exam prep ran about 15 min long, so Kriyan plans the last 2 sessions at 1 h 15. <u>Keep 1 h</u></div>
{btns("Looks good", "Show next week", dark=False)}</div>
<div class="tl" style="padding-top:6px">{earlier(2)}{NOW}{row("20:00", "20:30", "home")}</div>{FABS}'''))

# 19. Goals
screens.append(phone("goals", "Goals: each one says what feeds it", '''<div class="sb"><span>20:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:16px"><div class="h1">Goals</div>
<div class="gl"><b>Weigh 72 kg</b><span>by 1 Mar · 75.2 kg · on pace</span><div class="bar"><i class="d-hl" style="width:20%"></i></div><small>Fed by Gym, 3 a week</small></div>
<div class="gl"><b>Save $1000</b><span>by 31 Dec · $380 · on pace</span><div class="bar"><i class="d-lf" style="width:38%"></i></div><small>Fed by Put aside $126, Fridays</small></div>
<div class="sec">New goal</div>
<div class="gl" style="border:0"><b>Read 3 books</b><span>by 31 Dec · 7 weeks</span></div>
<div class="card" style="margin:6px 0 0"><div class="k">What gets you there?</div>
<div class="p" style="color:var(--ink);margin-top:4px">Read 40m, 5 evenings a week: about a book every 2 weeks, 3 by mid-December.</div>
<div class="btns"><span class="btn pri">Add it</span><span class="btn">Change</span></div></div></div>'''))

# 20. Add an exam
screens.append(phone("add-exam", "Add: an exam carries its own prep", head("Mon", "9 November", "21:30") + f'''
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div class="big">MA 241 midterm <em>nov 20 2:30pm</em> <em>prep 3h</em><span class="caret"></span></div>
<div style="margin-top:14px"><span class="chip blue">At Fri 20 Nov, 14:30</span><span class="chip blue">Prep 3 h</span><span class="chip blue"><span class="dot d-ma"></span>MA 241</span></div>
<div class="small" style="color:var(--ink2)">3 sessions of 1 h: Sun 15, Tue 17, Thu 19.</div><div class="addb">Add exam</div></div>'''))

css = '''<style>
.tiles.t3 { grid-template-columns:repeat(3,1fr); } .tlr > div { min-width:0; }
.one .t2 { flex:none; font-size:12px; } .one { font-size:14px; gap:8px; padding:9px 11px; height:auto; min-height:40px; } .one .tx { white-space:normal; line-height:1.25; }
.tl { padding-right:16px; } .tlr { grid-template-columns:50px 1fr; }
.card.ask { background:#fff6e8; margin-top:8px; } .card.ask .k { color:#9a6a12; } .card.ask .h { font-size:17px; line-height:1.3; } .card.ask .p { color:#6b5222; }
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
html = ('<!doctype html><html><head><meta charset="utf-8"><title>Round 15 mockups</title>'
        '<link rel="stylesheet" href="../mock/kriyan.css"><link rel="stylesheet" href="../mock/card.css">' + css +
        '</head><body>\n' + "\n".join(screens) + '\n</body></html>\n')
Path(__file__).with_name("mockup.html").write_text(html)
print(len(screens), "screens")
