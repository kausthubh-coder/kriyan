# Builds r13/mockup.html from one plan, so every screen tells the same story.
#   python3 docs/design/hill-climb/r13/build.py && node docs/design/hill-climb/mock/shoot.mjs r13
from pathlib import Path

# One name per thing, used on every screen.
N = {
    "morning": "Wake-up routine", "email": "Email TA", "stamps": "Buy stamps", "bank": "Call bank",
    "prep": "CSC 316 exam prep · session {} of 5", "lab": "Lab report · session {} of 2",
    "essay": "ENG 331 essay · session {} of 3", "ps4": "Problem set 4", "ps5": "Problem set 5",
    "ps6": "Problem set 6", "mread": "MA 241 reading", "quiz": "CSC 316 quiz review",
    "notes": "MA 241 notes", "resp": "ENG 331 response", "eread": "ENG 331 reading",
    "aside": "Put aside $126", "gym": "Gym", "mid": "MA 241 midterm prep · session {} of 3",
    "csl": "CSC 316 lecture", "csl_lab": "CSC 316 lab", "mal": "MA 241 lecture", "eng": "ENG 331 seminar",
    "lunch": "Lunch", "dinner": "Dinner with Sam", "home": "Call home",
}
SP = {"morning": "hl", "email": "lf", "stamps": "lf", "bank": "lf", "prep": "cs", "lab": "cs", "essay": "me",
      "ps4": "ma", "ps5": "ma", "ps6": "ma", "mread": "ma", "quiz": "cs", "notes": "ma", "resp": "me",
      "eread": "me", "aside": "lf", "gym": "hl", "mid": "ma", "csl": "cs", "csl_lab": "cs", "mal": "ma",
      "eng": "me", "lunch": "lf", "dinner": "lf", "home": "lf"}
ATTEND = {"csl", "csl_lab", "mal", "eng", "lunch", "dinner", "home"}

def name(key, n=None):
    # "session 1 of 5" never breaks across lines.
    s = N[key].format(n) if n else N[key]
    return s.replace(" · session ", " · session\u00a0").replace(" of ", "\u00a0of\u00a0") if n else s

# The week of 9 Nov after Monday's 18:06 choice ("Move prep to Sat"). (start, end, key, session)
WEEK = {
    "Mon 9": [("07:00", "07:25", "morning", None), ("07:45", "07:55", "email", None), ("08:45", "09:45", "prep", 1),
              ("12:00", "12:45", "lunch", None), ("12:45", "14:15", "lab", 1), ("14:30", "15:45", "mal", None),
              ("16:00", "16:45", "gym", None), ("16:50", "17:00", "stamps", None), ("17:00", "17:15", "bank", None),
              ("19:00", "20:15", "dinner", None), ("20:30", "22:00", "essay", 1)],
    "Tue 10": [("07:00", "07:25", "morning", None), ("08:00", "09:00", "prep", 2), ("09:00", "10:00", "ps4", None),
               ("10:15", "11:30", "csl", None), ("12:00", "12:45", "lunch", None), ("13:30", "14:45", "eng", None),
               ("15:00", "16:00", "eread", None), ("19:00", "20:00", "essay", 2)],
    "Wed 11": [("07:00", "07:25", "morning", None), ("09:00", "10:50", "csl_lab", None), ("12:00", "12:45", "lunch", None),
               ("12:45", "14:15", "lab", 2), ("14:30", "15:45", "mal", None), ("16:00", "16:45", "gym", None),
               ("16:45", "17:45", "ps5", None), ("20:00", "21:30", "essay", 3)],
    "Thu 12": [("07:00", "07:25", "morning", None), ("08:30", "10:00", "mread", None), ("10:15", "11:30", "csl", None),
               ("12:00", "12:45", "lunch", None), ("13:30", "14:45", "eng", None), ("15:00", "16:00", "quiz", None)],
    "Fri 13": [("07:00", "07:25", "morning", None), ("10:00", "11:00", "notes", None), ("11:00", "11:30", "resp", None),
               ("12:00", "12:45", "lunch", None), ("13:00", "13:10", "aside", None), ("14:30", "15:45", "mal", None),
               ("16:00", "16:45", "gym", None)],
    "Sat 14": [("07:00", "07:25", "morning", None), ("13:00", "14:00", "prep", 3), ("SUG", "14:00", "Review notes, 30m", None)],
    "Sun 15": [("07:00", "07:25", "morning", None)],
}

def row(start, end, key, n=None, st="todo", tag=""):
    """One Today row. st: todo, done, now, past (attended), new."""
    att = key in ATTEND
    mark = '<span class="cal">◷</span>' if att else f'<span class="box{" on" if st == "done" else ""}"></span>'
    cls = {"done": " done", "now": " now", "past": " past"}.get(st, "")
    t = f'<span class="newtag">NEW</span>' if st == "new" else tag
    return (f'<div class="tlr"><div class="tlt">{start}</div><div><div class="one s-{SP[key]}{cls}">{mark}'
            f'<span class="tx">{name(key, n)}</span>{t}{"" if st == "done" else f'<span class="t2">–{end}</span>'}</div></div></div>')

def earlier(k): return f'<div class="tlr"><div class="tlt"></div><div><div class="gapr">Earlier today · {k} done ✓</div></div></div>'
def free(a, b, extra=""): return f'<div class="tlr"><div class="tlt"></div><div><div class="gapr">{a}–{b} free{extra}</div></div></div>'
NOW = '<div class="tlr"><div class="tlt"></div><div><div class="nowl"></div></div></div>'

def head(day, date, time):
    return (f'<div class="sb"><span>{time}</span><span>●●● ▮</span></div>'
            f'<div class="top"><div class="day">{day}<i></i></div><div class="date">{date}<br>2026</div></div>')

FABS = '<div class="fabs"><span class="fab">☰</span><span class="fab add">+</span><span class="fab">▦</span></div>'

def phone(nm, cap, body, lock=False):
    return f'<div class="wrap" data-name="{nm}"><div class="cap">{cap}</div><div class="phone{" lock" if lock else ""}">\n{body}\n</div></div>\n'

def lockscreen(date, time, card):
    return f'<div class="ld">{date}</div><div class="time">{time}</div><div class="live">{card}</div>'

def btns(*bs, white=True):
    first, *rest = bs
    c = "w" if white else "pri"
    return '<div class="btns">' + f'<span class="btn {c}">{first}</span>' + "".join(f'<span class="btn">{b}</span>' for b in rest) + "</div>"

def opt(button, outcome, primary=False):
    return (f'<div class="opt2"><span class="btn{" pri" if primary else ""}">{button}</span>'
            f'<div class="oc">{outcome}</div></div>')

screens = []

# 1. First run, step 2: when you can work
grid_rows = "".join(
    f'<div class="l">{lbl}<small>{hrs}</small></div>' + "".join(f'<div class="c{" off" if d in off else ""}"></div>' for d in range(7))
    for lbl, hrs, off in [("Morning", "07–12", {5, 6}), ("Afternoon", "12–17", set()), ("Evening", "17–23", {4, 5})])
screens.append(phone("first-run-windows", "First run, step 2 of 5: when you can work", f'''
<div class="sb"><span>21:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px">
  <div class="step">STEP 2 OF 5</div><div class="h1" style="margin-top:8px">When can you work?</div>
  <div class="sub">Kriyan only plans work in the blue times. Tap one to switch it off.</div>
  <div class="grid"><div></div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div>{grid_rows}</div>
  <div class="sec" style="padding-top:22px">How much work a day, at most?</div>
  <div class="seg"><span>2 h</span><span>3 h</span><span class="on">4 h</span><span>6 h</span></div>
  <div class="small" style="margin-top:8px;color:var(--ink2)">Kriyan won't plan more than this. Change it any time.</div>
</div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Next: your classes</div></div>'''))

# 2. First run, step 3: classes from a photo
cls_rows = "".join(
    f'<div class="read"><span class="tick">✓</span><span class="dot d-{sp}"></span>{nm}<span class="m">{days}<br>{t}</span></div>'
    for sp, nm, days, t in [("cs", name("csl"), "Tue Thu", "10:15–11:30"), ("me", name("eng"), "Tue Thu", "13:30–14:45"),
                            ("ma", name("mal"), "Mon Wed Fri", "14:30–15:45"), ("cs", name("csl_lab"), "Wed", "09:00–10:50"),
                            ("lf", "Lunch", "Mon to Fri", "12:00–12:45")])
screens.append(phone("first-run-classes", "First run, step 3 of 5: classes from a photo", f'''
<div class="sb"><span>21:12</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:18px">
  <div class="step">STEP 3 OF 5</div><div class="h1" style="margin-top:8px">Your week's fixed times</div>
  <div class="sub">Read from your timetable photo. Untick anything that's wrong.</div>
  <div style="margin-top:12px">{cls_rows}</div>
  <div class="small" style="margin-top:12px;color:var(--ink2)">Next: anything due soon. Then Kriyan plans your week.</div>
</div>
<div style="position:absolute;left:22px;right:22px;bottom:34px"><div class="addb">Looks right</div></div>'''))

# 3. Lock 07:30, Next
screens.append(phone("lock-next", "Mon 07:30: the one card, in Next", lockscreen("Monday 9 November", "7:30", f'''
<div class="lk">KRIYAN <span class="state">NEXT</span> free until 08:45</div>
<div class="lh">{name("email")} fits now</div><div class="lp">Start it; Kriyan times it.</div>
{btns("Start", "Start exam prep early")}
<div class="after">After: {name("prep", 1)} at 08:45</div>'''), lock=True))

# 4. Today 07:40
mon = WEEK["Mon 9"]
screens.append(phone("today", "Mon 07:40: the card, then the day", head("Mon", "9 November", "07:40") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>Free until 08:45</div>
<div class="h">{name("email")} fits now</div>{btns("Start", "Start exam prep early", white=False)}</div>
<div class="tl" style="padding-top:6px">{row("07:00", "07:25", "morning", st="done")}{NOW}{row("08:45", "09:45", "prep", 1)}
{row("10:30", "12:00", "lab", 1)}{row("12:00", "12:45", "lunch")}{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}
{row("19:00", "20:15", "dinner")}<div class="np">3 waiting · Email TA, Buy stamps, Call bank ›</div></div>
<div class="toast">Kriyan planned today around your classes</div>{FABS}'''))

# 5. Lock 08:52, Now
screens.append(phone("lock-now", "08:52: the same card, in Now", lockscreen("Monday 9 November", "8:52", f'''
<div class="lk">KRIYAN <span class="state">NOW</span> until 09:45 · 7 min in</div>
<div class="lh">{name("prep", 1)}</div><div class="lp">Exam Mon 23 Nov, 09:00</div>
{btns("Done with session 1", "Still working +15m", "Move → 12:45")}
<div class="after">After: {name("lab", 1)} at 10:30</div>'''), lock=True))

# 6. Lock 12:05, Check-in
screens.append(phone("lock-checkin", "12:05: it asks, it doesn't assume", lockscreen("Monday 9 November", "12:05", f'''
<div class="lk">KRIYAN <span class="state">CHECK-IN</span></div>
<div class="lh">{name("lab", 1)}</div><div class="lp">10:30–12:00. How did it go?</div>
{btns("Done", "Move → 12:45")}
<div class="lp" style="margin-top:10px">I worked <span class="mini">30m</span><span class="mini">45m</span><span class="mini">1h</span> and the rest goes to 12:45</div>
<div class="after">12:45 is the first free 1 h 30, right after lunch. Nothing else moves.</div>'''), lock=True))

# 7. Today 12:06
screens.append(phone("today-noon", "12:06: moved to the first free slot", head("Mon", "9 November", "12:06") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>at 12:45</div>
<div class="h">{name("lab", 1)}</div><div class="p">12:45–14:15. Lunch until then.</div></div>
<div class="tl" style="padding-top:6px">{earlier(3)}{row("12:00", "12:45", "lunch", st="now")}{NOW}{row("12:45", "14:15", "lab", 1)}
{row("14:30", "15:45", "mal")}{row("16:00", "16:45", "gym")}{free("16:45", "19:00")}{row("19:00", "20:15", "dinner")}
<div class="np">2 waiting · Buy stamps, Call bank ›</div></div>{FABS}'''))

# 8. Gym sheet
screens.append(phone("block-sheet", "15:50: tap one session to fix just that one", head("Mon", "9 November", "15:50") + '''
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div style="display:flex;align-items:center;gap:8px"><span class="dot d-hl"></span><span class="small" style="font-weight:600;color:var(--ink2)">Health · Kriyan planned it at 06:00</span></div>
<div class="h1" style="font-size:30px;margin-top:6px">Gym</div><div class="sub">16:00–16:45 · 3 left this week · feeds Weigh 72 kg</div>
<div class="tiles t2"><div class="tile pri">Start</div><div class="tile">Done</div><div class="tile">Later today<small>→ 16:45</small></div><div class="tile">Tomorrow<small>→ Tue 16:00</small></div></div>
<div class="small" style="margin-top:12px;color:var(--ink2)">Only Gym moves. · <b>Pin here</b> (Kriyan won't move it) · <b>Edit</b></div></div>'''))

# 9. Today 16:50, waiting things fill the gap
screens.append(phone("gap-errands", "16:50: a free stretch offers what's waiting", head("Mon", "9 November", "16:50") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>Free until 19:00</div>
<div class="h">{name("stamps")} fits now</div><div class="p">Then {name("bank")}, also waiting.</div>
{btns("Start", "Skip for now", white=False)}<div class="after">After: {name("dinner")} at 19:00</div></div>
<div class="tl" style="padding-top:6px">{earlier(5)}{NOW}{free("16:50", "19:00")}{row("19:00", "20:15", "dinner")}</div>{FABS}'''))

# 10. Today 18:05, Decide with each outcome printed
screens.append(phone("decide", "18:05: a decision, each outcome printed", head("Mon", "9 November", "18:05") + f'''
<div class="card dec" style="background:#fff6e8;margin-top:14px"><div class="k" style="color:#9a6a12"><span class="state">DECIDE</span>New from Moodle</div>
<div class="h">ENG 331 essay, 4 h, by Thu</div>
<div class="p">At 19:00 Kriyan moves one exam prep session from Wed to Sat to fit it, unless you choose.</div>
{opt("Move prep to Sat", "Essay tonight, Tue and Wed evenings.", True)}
{opt("Keep Wed as it is", "Same essay times; Wed becomes a 5 h day.")}
<div class="after">After this: free until 19:00, then {name("dinner")}</div></div>
<div class="tl" style="padding-top:6px">{earlier(7)}{NOW}{row("19:00", "20:15", "dinner")}{free("20:15", "23:00")}</div>{FABS}'''))

# 11. Today 18:06, after choosing
screens.append(phone("decided", "18:06: the new session in the day", head("Mon", "9 November", "18:06") + f'''
<div class="card dark" style="margin-top:14px"><div class="k"><span class="state">NEXT</span>Free until 19:00</div>
<div class="h">Nothing waiting. Free time is free.</div><div class="after">After: {name("dinner")} at 19:00</div></div>
<div class="tl" style="padding-top:6px">{earlier(7)}{NOW}{row("19:00", "20:15", "dinner")}{row("20:30", "22:00", "essay", 1, st="new")}
{free("22:00", "23:00")}</div>
<div class="toast">Prep session 3 moved Wed → Sat <b>Undo</b></div>{FABS}'''))

# 12 to 14. The week, from the same plan, at Mon 20:40
def wrow(start, end, key, n, st):
    if start == "SUG":
        return f'<div class="wr"><span class="tm">{end}</span><span class="c"></span><span class="nm sgx">Claude suggests: {key}</span></div>'
    att = key in ATTEND
    mark = '<span class="c">◷</span>' if att else f'<span class="b{" on" if st == "done" else ""}"></span>'
    cls = " att" + (" pa" if st == "past" else "") if att else (" dn" if st == "done" else "")
    sp = "" if att else f" s-{SP[key]}"
    return f'<div class="wr{cls}"><span class="tm">{start}</span>{mark}<span class="nm{sp}">{name(key, n)}</span></div>'

def wday(day, sub=""):
    rows = []
    for start, end, key, n in WEEK[day]:
        st = "todo"
        if day == "Mon 9" and start != "SUG":
            st = "past" if key in ATTEND else ("done" if start < "20:30" else "todo")
        rows.append(wrow(start, end, key, n, st))
    return f'<div class="wd"><div class="hd">{day}<span>{sub}</span></div>{"".join(rows)}</div>'

LEG = ('<div class="legend"><span><span class="dot d-cs"></span>CSC 316</span><span><span class="dot d-ma"></span>MA 241</span>'
       '<span><span class="dot d-me"></span>ENG 331</span><span><span class="dot d-hl"></span>Health</span><span><span class="dot d-lf"></span>Life</span></div>')
for i, (days, cap) in enumerate([(["Mon 9", "Tue 10"], "Mon 20:40: the week, same plan, same marks"),
                                 (["Wed 11", "Thu 12"], "The week, scrolled: Wed and Thu"),
                                 (["Fri 13", "Sat 14", "Sun 15"], "The week, scrolled: Fri to Sun")]):
    body = "".join(wday(d, "today" if d == "Mon 9" else "") for d in days)
    screens.append(phone(f"week-{i+1}", cap, f'''<div class="sb"><span>20:40</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:8px"><div class="h1" style="font-size:28px">This week{"" if i == 0 else ", cont."}</div>{LEG}<div style="margin-top:4px">{body}</div></div>'''))

# 15. Add the midterm at 21:30
screens.append(phone("add-exam", "Mon 21:30: an exam carries its own prep", head("Mon", "9 November", "21:30") + f'''
<div class="scrim"></div><div class="sheet"><div class="grab"></div>
<div class="big">MA 241 midterm <em>nov 20 2:30pm</em> <em>prep 3h</em><span class="caret"></span></div>
<div style="margin-top:14px"><span class="chip blue">At Fri 20 Nov, 14:30</span><span class="chip blue">Prep 3 h</span><span class="chip blue"><span class="dot d-ma"></span>MA 241</span></div>
<div class="small" style="color:var(--ink2)">{name("mid", 1)}: Sun 15, 14:00. Sessions 2 and 3: Tue 17 and Thu 19.</div>
<div class="addb">Add exam</div></div>'''))

# 16. Tue 13:10, one tap for a lost morning
screens.append(phone("lock-morning", "Tue 13:10: a lost morning, healed in one tap", lockscreen("Tuesday 10 November", "13:10", f'''
<div class="lk">KRIYAN <span class="state">CHECK-IN</span></div><div class="lh">2 sessions had no check-in</div>
<div class="lp">{name("prep", 2)} at 08:00, {name("ps4")} at 09:00.</div>
{btns("Neither happened: rebuild")}
<div class="lp" style="margin-top:8px;text-decoration:underline">I did some of it</div>
<div class="after">Rebuild moves prep session 2 to 16:00 and Problem set 4 to 17:00. Reading at 15:00 and essay at 19:00 stay.</div>'''), lock=True))

# 16b. Wed 14:20, the last session asks if the task is finished
screens.append(phone("lock-finished", "Wed 14:20: a session done is not the task done", lockscreen("Wednesday 11 November", "14:20", f'''
<div class="lk">KRIYAN <span class="state">CHECK-IN</span></div><div class="lh">{name("lab", 2)} ended</div>
<div class="lp">That was the last planned session. Is Lab report finished?</div>
{btns("Yes, finished", "Need more → +1 h today 17:45")}
<div class="after">Due today 23:59. Another hour tonight makes Wed a 5 h day.</div>'''), lock=True))

# 17. Thu 08:00, overload with each outcome printed
thu = WEEK["Thu 12"]
screens.append(phone("overload", "Thu 08:00: it really can't all fit", head("Thu", "12 November", "08:00") + f'''
<div class="card dec" style="background:#fff6e8;margin-top:14px"><div class="k" style="color:#9a6a12"><span class="state">DECIDE</span>New from Moodle</div>
<div class="h">Problem set 6 (4 h, by Fri) and Practice exam (2 h, optional)</div>
<div class="p">Thu and Fri have 4 h free. At 10:00 Kriyan skips Practice exam, unless you choose.</div>
{opt("Skip Practice exam", "Problem set 6 Thu 16:00, Fri 08:00 and 11:30. On time.", True)}
{opt("Keep both", "Thu and Fri become 5 h days. Both on time.")}
<div class="after">After this: free until 08:30, then {name("mread")}</div></div>
<div class="tl" style="padding-top:6px">{"".join(row(s, e, k, n) for s, e, k, n in thu[1:])}</div>{FABS}'''))

# 18. Sun 19:00, the week behind and ahead
screens.append(phone("sunday", "Sun 19:00: the week behind, the week ahead", head("Sun", "15 November", "19:00") + f'''
<div class="card dark" style="margin-top:14px"><div class="k">Your week · 9 to 15 Nov</div>
<div class="h">All 19 sessions done. None late.</div>
<div class="p" style="margin-top:8px">Next week is planned. CSC 316 exam Mon 23: 2 sessions left. MA 241 midterm Fri 20: 2 sessions left.</div>
{btns("Looks good", "Show me next week", white=False)}</div>
<div class="card" style="margin-top:10px"><div class="k">Kriyan noticed</div>
<div class="p" style="color:var(--ink);margin-top:4px">Your exam prep sessions ran about 15 min long. Plan the last 2 at 1 h 15?</div>
{btns("Yes", "No, stay at 1 h", white=False)}</div>
<div class="tl" style="padding-top:6px">{row("14:00", "15:00", "mid", 1, st="done")}{NOW}{row("20:00", "20:30", "home")}</div>{FABS}'''))

# 19. A goal asks what gets you there
screens.append(phone("goal", "A new goal asks \"What gets you there?\"", '''<div class="sb"><span>20:10</span><span>●●● ▮</span></div>
<div class="pad" style="padding-top:20px"><div class="h1">Read 3 books</div><div class="sub">by Thu 31 Dec · 7 weeks left</div>
<div class="bar"><i class="d-lf" style="width:0%"></i></div></div>
<div class="card"><div class="k">What gets you there?</div>
<div class="row" style="border:0"><span class="plus">+</span>Read 40m, 5 evenings a week</div>
<div class="p">About a book every 2 weeks: 3 books by mid-December. Kriyan finds the evenings.</div>
<div class="btns"><span class="btn pri">Add it</span><span class="btn">Change</span><span class="btn">Not now</span></div></div>'''))

css = '''<style>
.opt2 { margin-top:9px; } .opt2 .oc { font-size:13px; color:#6b5222; margin:5px 2px 0; line-height:1.35; }
.mini { display:inline-block; padding:2px 8px; border-radius:8px; background:rgba(255,255,255,.18); font-weight:600; margin:0 2px; }
.read { display:flex; gap:10px; align-items:center; min-height:54px; border-bottom:1px solid var(--rule); font-size:15px; font-weight:500; }
.read .m { margin-left:auto; color:var(--ink2); font-size:12.5px; text-align:right; }
.tick { width:20px; height:20px; border-radius:6px; background:var(--ink); color:#fff; display:grid; place-items:center; font-size:12px; flex:none; }
.wr { height:23px; } .wd .hd { padding-top:6px; }
.mr b { font-size:13.5px; }
.tiles.t2 { grid-template-columns:repeat(2,1fr); } .tlr > div { min-width:0; } .one .t2 { flex:none; font-size:12px; } .one { font-size:14px; gap:8px; padding:9px 11px; height:auto; min-height:40px; } .one .tx { white-space:normal; line-height:1.25; } .tl { padding-right:16px; } .tlr { grid-template-columns:50px 1fr; } .mr .lp { font-weight:500; }
</style>'''
html = ('<!doctype html><html><head><meta charset="utf-8"><title>Round 13 mockups</title>'
        '<link rel="stylesheet" href="../mock/kriyan.css"><link rel="stylesheet" href="../mock/card.css">' + css +
        '</head><body>\n' + "\n".join(screens) + '\n</body></html>\n')
Path(__file__).with_name("mockup.html").write_text(html)
print(len(screens), "screens")
