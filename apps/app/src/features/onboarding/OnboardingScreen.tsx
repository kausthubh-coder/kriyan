// Onboarding (docs/design/v4/onboarding.html): the first day is built before sign-in, then
// saved to the account in one go. 1 Welcome, 2 what to help with, 3 the day's shape, 4 the
// math, 5 one real thing for today, 6 sign in, 7 reminders (and, on iPhone, the Home Screen),
// 8 connect your AI, 9 done. Every step but sign-in can be skipped.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useMutation } from "convex/react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  Minus,
  Moon,
  Plus,
  Repeat,
  Share,
  Smartphone,
  Sparkles,
  Square,
  SquarePlus,
  Sun,
  Terminal,
  Vibrate,
  Volume2,
  type LucideIcon,
} from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "@kriyan/convex/api";
import { addDays, formatClock, weekday } from "@kriyan/core/dates";
import { formatDuration, MONTH_LONG, WEEKDAY_SHORT } from "@kriyan/core/format";
import { parseTask } from "@kriyan/core/parse";
import { daySummary, summaryText, type SummaryItem, type SummaryPart } from "@kriyan/core/summary";
import { weekMath } from "@kriyan/core/week";
import { deviceTimeZone, useClock } from "@/data/time";
import { ensureNotifications } from "@/features/notifications/register";
import { useIsPhone, useType } from "@/theme/layout";
import { c, family, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { EMPTY_DRAFT, HELP, SUGGESTIONS, type Draft, type HelpKey } from "./model";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const KIND_ICON = { event: CalendarDays, task: Square, habit: Repeat } as const;

/** Which phone the reminders step is for: iPhone web needs the Home Screen first. */
function platform(): "android" | "ios-web" | "web" {
  if (Platform.OS === "android") return "android";
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? "ios-web" : "web";
}

function standalone(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return true;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function OnboardingScreen() {
  const { isSignedIn } = useAuth();
  const { today, now } = useClock();
  const phone = useIsPhone();
  const insets = useSafeAreaInsets();
  const ensureProfile = useMutation(api.account.ensureProfile);
  const updateProfile = useMutation(api.account.updateProfile);
  const addText = useMutation(api.tasks.addText);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed out: start at the welcome. Signed in (back from sign-in, or a new account that
  // never saw it): save what was chosen, then carry on from reminders, or from step 2 when
  // nothing was chosen before signing in.
  useEffect(() => {
    void loadDraft().then((d) => {
      setDraft(d);
      if (!isSignedIn) return;
      const chose = d.text.trim() !== "" || d.help.length > 0;
      if (chose) void finishSetup(d);
      else setStep(2);
    });
    // Only on arrival; later steps move on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (patch: Partial<Draft>) => {
    const next = { ...(draft ?? EMPTY_DRAFT), ...patch };
    setDraft(next);
    void saveDraft(next);
  };

  async function finishSetup(d: Draft) {
    setSaving(true);
    setError(null);
    try {
      await ensureProfile({ timeZone: deviceTimeZone() });
      await updateProfile({ dayStart: d.dayStart, dayEnd: d.dayEnd, onboarded: true });
      if (d.text.trim()) await addText({ text: d.text.trim() });
      await clearDraft();
      setStep(7);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving your plan didn't work. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!draft) return <View style={{ flex: 1, backgroundColor: c.head }} />;

  const next = () => {
    if (step === 5) {
      if (isSignedIn) void finishSetup(draft);
      else setStep(6);
      return;
    }
    if (step === 9) {
      router.replace("/today");
      return;
    }
    setStep((step + 1) as Step);
  };
  const back = () => setStep((step === 7 && isSignedIn ? 5 : Math.max(isSignedIn ? 2 : 1, step - 1)) as Step);
  const canSkip = step !== 1 && step !== 6 && step !== 9;

  const parsed = parseTask(draft.text, today);
  const first: SummaryItem | null =
    draft.text.trim() && (!parsed.date || parsed.date === today)
      ? { time: parsed.time ?? null, length: parsed.length ?? null, done: false, event: false }
      : null;
  const personal = daySummary({ now, dayEnd: draft.dayEnd, items: first ? [first] : [], habitsDue: 0 });

  if (step === 1) return <Welcome onStart={() => setStep(2)} />;

  const body: Record<Exclude<Step, 1>, ReactNode> = {
    2: <HelpStep draft={draft} update={update} />,
    3: <DayStep draft={draft} update={update} />,
    4: <MathStep draft={draft} today={today} />,
    5: <FirstStep draft={draft} update={update} today={today} />,
    6: <SaveStep personal={personal} />,
    7: <RemindersStep personal={personal} />,
    8: <ConnectStep />,
    9: <DoneStep draft={draft} personal={personal} today={today} />,
  };
  const primary: Record<Exclude<Step, 1>, string> = {
    2: "Continue",
    3: "Continue",
    4: "Plan the first one",
    5: draft.text.trim() ? "Add to today" : "Continue",
    6: "Sign in to save",
    7: "Continue",
    8: "Continue",
    9: "Open Today",
  };

  const column = (
    <View style={{ flex: 1, width: "100%", maxWidth: 460, alignSelf: phone ? "stretch" : "flex-start" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s2, minHeight: 48 }}>
        {step > (isSignedIn ? 2 : 1) && step !== 7 ? (
          <Button icon={ChevronLeft} accessibilityLabel="Back" onPress={back} style={{ marginLeft: -s.s3 }} />
        ) : (
          <View style={{ width: 44 }} />
        )}
        <Progress step={step} />
        {canSkip ? <Button variant="quiet" label="Skip" onPress={next} /> : <View style={{ width: 44 }} />}
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: s.s4, paddingBottom: s.s6, gap: s.s6 }}
        keyboardShouldPersistTaps="handled"
      >
        {body[step]}
        {error ? (
          <Txt variant="body" tone="now">
            {error}
          </Txt>
        ) : null}
      </ScrollView>
      <View style={{ gap: s.s2, paddingTop: s.s2 }}>
        <Button
          variant="primary"
          label={saving ? "Saving your plan" : primary[step]}
          disabled={saving}
          onPress={step === 6 ? () => router.push("/sign-in") : next}
          style={{ height: 52, justifyContent: "center" }}
        />
        {step === 6 ? (
          <Txt variant="caption" tone="ink3" style={{ textAlign: "center" }}>
            Google or a code by email. Sign in with Apple is coming.
          </Txt>
        ) : null}
      </View>
    </View>
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top + s.s2,
        paddingBottom: insets.bottom + s.s4,
        paddingHorizontal: phone ? s.s4 : s.s12,
      }}
    >
      {phone ? (
        column
      ) : (
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            gap: s.s12,
            maxWidth: 1080,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {column}
          <View style={{ flex: 1, paddingTop: s.s12 }}>
            <DayPreview draft={draft} personal={personal} today={today} />
          </View>
        </View>
      )}
    </View>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <View
      accessibilityLabel={`Step ${step} of 9`}
      style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 4 }}
    >
      {Array.from({ length: 8 }, (_, i) => (
        <View
          key={i}
          style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: i + 2 <= step ? c.ink : c.line }}
        />
      ))}
    </View>
  );
}

function Title({ lead, rest }: { lead: string; rest?: string }) {
  return (
    <Txt variant="headline" heading={1}>
      {lead}
      {rest ? <Text style={{ color: c.ink3 }}> {rest}</Text> : null}
    </Txt>
  );
}

/** The day in Joi's two tones, on the black header. */
function Sentence({ parts, size = 26 }: { parts: SummaryPart[]; size?: number }) {
  return (
    <Txt
      variant="title"
      accessibilityLabel={summaryText(parts)}
      style={{ fontSize: size, lineHeight: Math.round(size * 1.25), color: c.headDim }}
    >
      {parts.map((p, i) => {
        const style = p.strong
          ? { color: c.headInk, ...family("600") }
          : { color: c.headDim, ...family("500") };
        return (
          <Text key={i} style={style}>
            {"kind" in p ? (
              <>
                <Icon
                  icon={KIND_ICON[p.kind]}
                  size={Math.round(size * 0.72)}
                  tone="headInk"
                  strokeWidth={2}
                />{" "}
              </>
            ) : null}
            {p.text}
          </Text>
        );
      })}
    </Txt>
  );
}

const SAMPLE: SummaryItem[] = [
  { time: 9 * 60, length: 90, done: false, event: true },
  { time: 12 * 60 + 30, length: 60, done: false, event: true },
  { time: 17 * 60, length: 45, done: false, event: true },
  { time: 10 * 60 + 45, length: 90, done: false, event: false },
  { time: 14 * 60, length: 90, done: false, event: false },
  { time: 16 * 60, length: null, done: false, event: false },
  { time: null, length: null, done: false, event: false },
  { time: null, length: 15, done: false, event: false },
  { time: null, length: 5, done: false, event: false },
];

function Welcome({ onStart }: { onStart: () => void }) {
  const { today } = useClock();
  const insets = useSafeAreaInsets();
  const phone = useIsPhone();
  const [, month, day] = today.split("-").map(Number) as [number, number, number];
  const sample = useMemo(
    () => daySummary({ now: 8 * 60, dayEnd: 22 * 60 + 30, items: SAMPLE, habitsDue: 2 }),
    [],
  );
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.head,
        paddingTop: insets.top + s.s4,
        paddingBottom: insets.bottom + s.s6,
        paddingHorizontal: phone ? s.s6 : s.s16,
        alignItems: phone ? "stretch" : "center",
      }}
    >
      <View style={{ flex: 1, width: "100%", maxWidth: 560, gap: s.s8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Txt variant="subhead" tone="headInk">
            Kriyan
          </Txt>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.now }} />
        </View>
        <View style={{ gap: s.s4 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Txt variant="display" tone="headInk">
                {WEEKDAY_SHORT[weekday(today)]}
              </Txt>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: c.now,
                  marginLeft: 3,
                  marginBottom: 10,
                }}
              />
            </View>
            <Txt variant="meta" tone="headDim">
              {`${day} ${MONTH_LONG[month - 1]}`}
            </Txt>
          </View>
          <Sentence parts={sample} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: s.s3 }}>
          <Txt variant="headline" tone="headInk" heading={1}>
            Your whole day, <Text style={{ color: c.headDim }}>in one sentence.</Text>
          </Txt>
          <Txt variant="body" tone="headDim">
            Tasks, events and habits on one calm timeline. Set up takes about a minute.
          </Txt>
        </View>
        <View style={{ gap: s.s2 }}>
          <Press
            role="button"
            accessibilityLabel="Plan my first day"
            onPress={onStart}
            style={{
              height: 52,
              borderRadius: 26,
              backgroundColor: c.headInk,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt variant="label" style={{ color: c.head }}>
              Plan my first day
            </Txt>
          </Press>
          <Press
            role="button"
            accessibilityLabel="I already have an account"
            onPress={() => router.push("/sign-in")}
            style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <Txt variant="label" tone="headInk">
              I already have an account
            </Txt>
          </Press>
        </View>
      </View>
    </View>
  );
}

function HelpStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  const toggle = (k: HelpKey) =>
    update({ help: draft.help.includes(k) ? draft.help.filter((x) => x !== k) : [...draft.help, k] });
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="What should Kriyan help with?" />
        <Txt variant="body" tone="ink3">
          Pick any. It changes what you see first, nothing else.
        </Txt>
      </View>
      <View style={{ gap: s.s2 }}>
        {HELP.map((h) => {
          const on = draft.help.includes(h.key);
          return (
            <Press
              key={h.key}
              role="checkbox"
              aria-checked={on}
              accessibilityLabel={h.title}
              onPress={() => toggle(h.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s3,
                minHeight: 60,
                paddingHorizontal: s.s4,
                paddingVertical: s.s2,
                borderRadius: r.card + 2,
                borderWidth: 1,
                borderColor: on ? c.ink : c.line,
                backgroundColor: on ? c.raised : c.sunken,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{h.title}</Txt>
                <Txt variant="meta" tone="ink3">
                  {h.sub}
                </Txt>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: on ? 0 : 1.5,
                  borderColor: c.lineStrong,
                  backgroundColor: on ? c.ink : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Icon icon={Check} size={14} tone="onInk" strokeWidth={3} /> : null}
              </View>
            </Press>
          );
        })}
      </View>
    </>
  );
}

function Stepper({
  icon,
  label,
  value,
  onChange,
  min,
  max,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 150,
        gap: s.s2,
        padding: s.s4,
        borderRadius: r.card + 2,
        backgroundColor: c.sunken,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon icon={icon} size={15} />
        <Txt variant="meta" tone="ink2">
          {label}
        </Txt>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button
          icon={Minus}
          accessibilityLabel={`${label} 15 minutes earlier`}
          disabled={value - 15 < min}
          onPress={() => onChange(value - 15)}
        />
        <Txt variant="headline" tnum accessibilityLabel={`${label} ${formatClock(value)}`}>
          {formatClock(value)}
        </Txt>
        <Button
          icon={Plus}
          accessibilityLabel={`${label} 15 minutes later`}
          disabled={value + 15 > max}
          onPress={() => onChange(value + 15)}
        />
      </View>
    </View>
  );
}

function DayStep({ draft, update }: { draft: Draft; update: (p: Partial<Draft>) => void }) {
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="When does your" rest="day start and end?" />
        <Txt variant="body" tone="ink3">
          Kriyan only plans inside these hours.
        </Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s3 }}>
        <Stepper
          icon={Sun}
          label="Wake up"
          value={draft.dayStart}
          min={4 * 60}
          max={11 * 60}
          onChange={(v) => update({ dayStart: v })}
        />
        <Stepper
          icon={Moon}
          label="Wind down"
          value={draft.dayEnd}
          min={19 * 60}
          max={24 * 60}
          onChange={(v) => update({ dayEnd: v })}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          padding: s.s4,
          borderRadius: r.card + 2,
          backgroundColor: c.sunken,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">Classes or work on a weekday</Txt>
          <Txt variant="meta" tone="ink3">
            Roughly, hours a day
          </Txt>
        </View>
        <Button
          icon={Minus}
          accessibilityLabel="One hour less"
          disabled={draft.busyHours <= 0}
          onPress={() => update({ busyHours: draft.busyHours - 1 })}
        />
        <Txt variant="title" tnum accessibilityLabel={`${draft.busyHours} hours a weekday`}>
          {`${draft.busyHours}h`}
        </Txt>
        <Button
          icon={Plus}
          accessibilityLabel="One hour more"
          disabled={draft.busyHours >= 12}
          onPress={() => update({ busyHours: draft.busyHours + 1 })}
        />
      </View>
    </>
  );
}

function MathStep({ draft, today }: { draft: Draft; today: string }) {
  const m = weekMath(draft.dayStart, draft.dayEnd, draft.busyHours);
  const year = Number(today.slice(0, 4));
  const daysLeft = Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)))) /
      86400000,
  );
  const bar = (label: string, hours: number, strong = false) => (
    <View key={label} style={{ gap: s.s1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt variant="meta" tone={strong ? "ink" : "ink2"}>
          {label}
        </Txt>
        <Txt variant="meta" tone={strong ? "ink" : "ink2"} tnum>
          {`${hours}h`}
        </Txt>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.sunken, overflow: "hidden" }}>
        <View
          style={{
            width: `${Math.round((hours / Math.max(1, m.awake)) * 100)}%`,
            height: "100%",
            backgroundColor: strong ? c.ink : c.lineStrong,
          }}
        />
      </View>
    </View>
  );
  return (
    <>
      <Title lead="Let's do the math." />
      <View style={{ gap: s.s1 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: s.s2 }}>
          <Txt
            tnum
            style={{ fontSize: 72, lineHeight: 76, letterSpacing: -2, color: c.ink, ...family("600") }}
          >
            {m.yours}
          </Txt>
          <Txt variant="title">hours</Txt>
        </View>
        <Txt variant="body" tone="ink2">
          That’s about how much time you get to choose this week.
        </Txt>
      </View>
      <View style={{ gap: s.s4 }}>
        {bar(`Awake, ${formatClock(draft.dayStart)} to ${formatClock(draft.dayEnd)}`, m.awake)}
        {bar("Classes or work", m.busy)}
        {bar("Meals, getting ready, travel", m.everyday)}
        {bar("Yours to plan", m.yours, true)}
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: s.s3,
          alignItems: "center",
          padding: s.s4,
          borderRadius: r.card + 2,
          backgroundColor: c.sunken,
        }}
      >
        <Icon icon={Sparkles} />
        <Txt variant="body" tone="ink2" style={{ flex: 1 }}>
          <Text style={{ color: c.ink, ...family("600") }}>{daysLeft} days</Text> left in {year}. A good time
          to start.
        </Txt>
      </View>
    </>
  );
}

function FirstStep({
  draft,
  update,
  today,
}: {
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  today: string;
}) {
  const roles = useType();
  const parsed = parseTask(draft.text, today);
  const chips: string[] = [];
  if (parsed.date)
    chips.push(
      parsed.date === today ? "Today" : parsed.date === addDays(today, 1) ? "Tomorrow" : parsed.date,
    );
  if (parsed.time !== undefined) chips.push(formatClock(parsed.time));
  if (parsed.length) chips.push(formatDuration(parsed.length));
  if (parsed.repeat) chips.push("Repeats");
  if (parsed.reminders.length)
    chips.push(`${parsed.reminders.length} reminder${parsed.reminders.length > 1 ? "s" : ""}`);
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="What's one thing" rest="for today?" />
        <Txt variant="body" tone="ink3">
          Type it like you’d say it. Add a time if it has one.
        </Txt>
      </View>
      <View style={{ gap: s.s3, padding: s.s4, borderRadius: r.card + 2, backgroundColor: c.sunken }}>
        <TextInput
          value={draft.text}
          onChangeText={(text) => update({ text })}
          placeholder="Read 20 pages tonight at 21:30"
          placeholderTextColor={c.ink3}
          accessibilityLabel="Your first thing for today"
          multiline
          style={[roles.title, { color: c.ink, minHeight: 56, padding: 0 }]}
        />
        {parsed.spans.length ? (
          <Txt variant="body" accessibilityLabel={`Understood: ${parsed.title}`}>
            {segments(draft.text, parsed.spans).map((seg, i) => (
              <Text key={i} style={{ color: seg.hit ? c.parse : c.ink3, ...family(seg.hit ? "600" : "400") }}>
                {seg.text}
              </Text>
            ))}
          </Txt>
        ) : null}
        {chips.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {chips.map((chip) => (
              <View
                key={chip}
                style={{
                  paddingHorizontal: s.s3,
                  height: 30,
                  justifyContent: "center",
                  borderRadius: 15,
                  backgroundColor: c.raised,
                }}
              >
                <Txt variant="meta" tone="parse" tnum>
                  {chip}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {draft.text ? null : (
        <View style={{ gap: s.s2 }}>
          <Txt variant="caption" tone="ink3">
            Or start from one of these
          </Txt>
          {SUGGESTIONS.map((sg) => (
            <Press
              key={sg}
              role="button"
              accessibilityLabel={`Use: ${sg}`}
              onPress={() => update({ text: sg })}
              style={{
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: s.s3,
                borderRadius: r.ctl,
                borderWidth: 1,
                borderColor: c.line,
              }}
            >
              <Txt variant="body" tone="ink2">
                {sg}
              </Txt>
            </Press>
          ))}
        </View>
      )}
    </>
  );
}

function segments(text: string, spans: { start: number; end: number }[]) {
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const sp of [...spans].sort((a, b) => a.start - b.start)) {
    if (sp.start > at) out.push({ text: text.slice(at, sp.start), hit: false });
    out.push({ text: text.slice(sp.start, sp.end), hit: true });
    at = sp.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}

function DarkCard({ children }: { children: ReactNode }) {
  return (
    <View style={{ padding: s.s4, borderRadius: r.card + 4, backgroundColor: c.head, gap: s.s3 }}>
      {children}
    </View>
  );
}

function SaveStep({ personal }: { personal: SummaryPart[] }) {
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="Save your plan." />
        <Txt variant="body" tone="ink3">
          Sign in so your day follows you to every device, and your AI can help.
        </Txt>
      </View>
      <DarkCard>
        <Sentence parts={personal} size={20} />
      </DarkCard>
    </>
  );
}

const HAPTICS_KEY = "kriyan.haptics";
const SOUNDS_KEY = "kriyan.sounds";

function Toggle({
  icon,
  title,
  sub,
  storeKey,
  initial,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  storeKey: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  return (
    <Press
      role="switch"
      aria-checked={on}
      accessibilityLabel={title}
      onPress={() => {
        setOn(!on);
        void SecureStore.setItemAsync(storeKey, on ? "off" : "on").catch(() => undefined);
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: s.s3, minHeight: 56 }}
    >
      <Icon icon={icon} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{title}</Txt>
        <Txt variant="meta" tone="ink3">
          {sub}
        </Txt>
      </View>
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: on ? c.done : c.lineStrong,
          alignItems: on ? "flex-end" : "flex-start",
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.onInk }} />
      </View>
    </Press>
  );
}

function RemindersStep({ personal }: { personal: SummaryPart[] }) {
  const kind = platform();
  const [installed, setInstalled] = useState(standalone());
  const [asked, setAsked] = useState<"on" | "off" | null>(null);
  if (kind === "ios-web" && !installed) {
    const row = (n: number, icon: LucideIcon, text: ReactNode) => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          padding: s.s4,
          borderRadius: r.card + 2,
          backgroundColor: c.sunken,
        }}
      >
        <Txt variant="label" tnum>
          {n}
        </Txt>
        <Txt variant="body" style={{ flex: 1 }}>
          {text}
        </Txt>
        <Icon icon={icon} tone="parse" />
      </View>
    );
    return (
      <>
        <View style={{ gap: s.s2 }}>
          <Title lead="Add Kriyan to your" rest="Home Screen." />
          <Txt variant="body" tone="ink3">
            It opens full screen like any app, and it’s the only way iPhone lets Kriyan send reminders.
          </Txt>
        </View>
        {row(
          1,
          Share,
          <>
            Tap <Text style={family("600")}>Share</Text> in Safari’s bar
          </>,
        )}
        {row(
          2,
          SquarePlus,
          <>
            Scroll and tap <Text style={family("600")}>Add to Home Screen</Text>
          </>,
        )}
        {row(
          3,
          Smartphone,
          <>
            Open <Text style={family("600")}>Kriyan</Text> from your Home Screen. You’ll land right back here.
          </>,
        )}
        <Txt variant="meta" tone="ink3">
          Your plan is saved to your account, so nothing is lost in between.
        </Txt>
        <Button variant="quiet" label="I've added it" onPress={() => setInstalled(true)} />
      </>
    );
  }
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="Get a nudge" rest="before it starts." />
        <Txt variant="body" tone="ink3">
          A morning summary and only the reminders you set.
        </Txt>
      </View>
      <DarkCard>
        <Txt variant="caption" tone="headDim">
          Kriyan · now
        </Txt>
        <Sentence parts={personal} size={16} />
      </DarkCard>
      {asked ? (
        <Txt variant="body" tone={asked === "on" ? "done" : "ink3"}>
          {asked === "on" ? "Reminders are on." : "No reminders for now. Turn them on any time in Settings."}
        </Txt>
      ) : (
        <Button
          variant="primary"
          icon={Bell}
          label="Turn on reminders"
          onPress={() => void ensureNotifications().then((ok) => setAsked(ok ? "on" : "off"))}
          style={{ alignSelf: "flex-start" }}
        />
      )}
      {kind === "android" ? (
        <View>
          <Toggle
            icon={Vibrate}
            title="Vibrate on actions"
            sub="A light tap when you tick, swipe or snap"
            storeKey={HAPTICS_KEY}
            initial
          />
          <Toggle
            icon={Volume2}
            title="Soft sounds"
            sub="A quiet click when you finish something"
            storeKey={SOUNDS_KEY}
            initial={false}
          />
        </View>
      ) : null}
    </>
  );
}

function ConnectStep() {
  const row = (icon: LucideIcon, title: string, sub: string, action: ReactNode) => (
    <View
      key={title}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        paddingVertical: s.s3,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: r.ctl + 2,
          backgroundColor: c.sunken,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon icon={icon} tone="ink2" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="label">{title}</Txt>
        <Txt variant="meta" tone="ink3">
          {sub}
        </Txt>
      </View>
      {action}
    </View>
  );
  return (
    <>
      <View style={{ gap: s.s2 }}>
        <Title lead="Bring in what" rest="you already use." />
        <Txt variant="body" tone="ink3">
          All optional. You can do this later in Settings.
        </Txt>
      </View>
      <View>
        {row(
          CalendarDays,
          "Your calendar",
          "Calendar sync is coming; your events stay where they are for now.",
          <Txt variant="meta" tone="ink3">
            Later
          </Txt>,
        )}
        {row(
          Sparkles,
          "Claude or ChatGPT",
          'Plan with you in chat: "move my lab report to Saturday".',
          <Button label="Set up" onPress={() => router.push("/settings")} />,
        )}
        {row(
          Terminal,
          "Codex automation",
          "Each morning, reads Moodle and Gmail and adds what's due. Each change has Undo.",
          <Button label="Set up" onPress={() => router.push("/settings")} />,
        )}
      </View>
    </>
  );
}

function DayPreview({ draft, personal, today }: { draft: Draft; personal: SummaryPart[]; today: string }) {
  const parsed = parseTask(draft.text, today);
  const rows: { time: number; title: string; icon: LucideIcon }[] = [
    { time: draft.dayStart, title: "Wake up", icon: Sun },
    ...(draft.text.trim() && (!parsed.date || parsed.date === today)
      ? [{ time: parsed.time ?? draft.dayStart + 1, title: parsed.title || draft.text, icon: Square }]
      : []),
    { time: draft.dayEnd, title: "Wind down", icon: Moon },
  ].sort((a, b) => a.time - b.time);
  return (
    <View style={{ gap: s.s4 }}>
      <DarkCard>
        <Sentence parts={personal} size={18} />
      </DarkCard>
      <View>
        <Txt variant="caption" tone="ink3" style={{ marginBottom: s.s2 }}>
          Your day so far
        </Txt>
        {rows.map((row) => (
          <View
            key={row.title}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s.s3,
              minHeight: 44,
              borderBottomWidth: 1,
              borderBottomColor: c.line,
            }}
          >
            <Icon icon={row.icon} />
            <Txt variant="body" style={{ flex: 1 }} numberOfLines={1}>
              {row.title}
            </Txt>
            <Txt variant="meta" tone="ink3" tnum>
              {row.title === "Wake up" || row.title === "Wind down" || parsed.time !== undefined
                ? formatClock(row.time)
                : "Anytime"}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

function DoneStep({ draft, personal, today }: { draft: Draft; personal: SummaryPart[]; today: string }) {
  return (
    <>
      <Title lead="That's a plan." rest="Your day is ready." />
      <DayPreview draft={draft} personal={personal} today={today} />
      <Txt variant="body" tone="ink3">
        Add anything else with the + button, or ask in plain words. Close the day in the evening and give
        what’s left a place.
      </Txt>
    </>
  );
}
