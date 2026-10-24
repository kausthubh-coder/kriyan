// Steps 7 to 9 of onboarding.html, once signed in: on an iPhone in Safari, Add to Home Screen;
// in the Android app, reminders and sounds; then bringing in your AI; then three small next
// steps and your day.

import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import {
  Bell,
  Check,
  Clock,
  Moon,
  Plus,
  Share,
  Sparkles,
  SquarePlus,
  Terminal,
  Vibrate,
  Volume2,
  type LucideIcon,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { addDays, formatClock, startOfWeek, type CivilDate } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { useAccessTokens, useProfile, useWeekView } from "@/data/views";
import { hapticsOn, setHapticsOn, setSoundsOn } from "@/features/feel/setting";
import { playSound } from "@/features/feel/sound";
import { ensureNotifications } from "@/features/notifications/register";
import { MCP_URL } from "@/features/settings/SettingsScreen";
import { errorText } from "@/features/tasks/actions";
import { commitHaptic, toggleHaptic } from "@/features/tasks/haptics";
import { c, family, r, s, shadows } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { DayName, DayRows, firstTask, PersonalSentence } from "./Day";
import { surface, type Draft } from "./draft";
import { FullButton, Lead, LinkButton, MiniLabel, Question, StepFrame } from "./Frame";

/** A numbered instruction with Safari's own icon beside it (`.st`). */
function Instruction({ n, children, glyph }: { n: number; children: ReactNode; glyph: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        padding: s.s4,
        borderRadius: r.card,
        backgroundColor: c.sunken,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: c.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt variant="label" style={family("600")}>
          {n}
        </Txt>
      </View>
      <Txt variant="body" style={{ flex: 1 }}>
        {children}
      </Txt>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: r.ctl,
          backgroundColor: c.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {glyph}
      </View>
    </View>
  );
}

const bold = (t: string) => (
  <Txt variant="body" style={family("600")}>
    {t}
  </Txt>
);

/**
 * Step 7 on an iPhone in Safari: Add to Home Screen, shown with Safari's own icons, so Kriyan
 * opens full screen like any app.
 */
export function AddToHomeScreen({ next }: { next: () => void }) {
  return (
    <StepFrame
      step={7}
      onSkip={next}
      foot={
        <>
          <FullButton label="I've added it" onPress={next} />
          <LinkButton label="Not now" onPress={next} />
        </>
      }
    >
      <Question text="Add Kriyan to your" dim="Home Screen." />
      <Lead>It opens full screen, like any app on your phone.</Lead>
      <View style={{ gap: s.s2, marginTop: s.s6 }}>
        <Instruction n={1} glyph={<Icon icon={Share} size={20} tone="parse" />}>
          Tap {bold("Share")} {"in Safari's bar"}
        </Instruction>
        <Instruction n={2} glyph={<Icon icon={SquarePlus} size={20} tone="ink" />}>
          Scroll and tap {bold("Add to Home Screen")}
        </Instruction>
        <Instruction n={3} glyph={<Txt variant="subhead">K</Txt>}>
          Open {bold("Kriyan")} from your Home Screen and sign in again.
        </Instruction>
      </View>
      <Txt variant="body" tone="ink3" style={{ marginTop: s.s4 }}>
        Your plan is saved to your account, so nothing is lost in between.
      </Txt>
    </StepFrame>
  );
}

/** A reminder as the phone will show it, built from the plan just made (`.notif`). */
function ReminderPreview({ d, today }: { d: Draft; today: CivilDate }) {
  const f = firstTask(d, today);
  const title = f?.parsed.title || "Read 20 pages";
  const at = f?.parsed.time ?? 21 * 60 + 30;
  const length = f?.parsed.length;
  return (
    <View style={{ marginTop: s.s6, padding: s.s4, borderRadius: r.sheet, backgroundColor: c.sunken }}>
      <View
        style={{
          flexDirection: "row",
          gap: s.s3,
          padding: s.s3,
          borderRadius: r.card,
          backgroundColor: c.raised,
          boxShadow: shadows.overlay,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: r.ctl,
            backgroundColor: c.head,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Txt variant="subhead" tone="headInk">
            K
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Txt variant="meta" tone="ink3">
              Kriyan
            </Txt>
            <Txt variant="meta" tone="ink3" tnum>
              {formatClock(at - 10)}
            </Txt>
          </View>
          <Txt variant="label" style={family("600")} numberOfLines={1}>
            {`${title} in 10 min`}
          </Txt>
          <Txt variant="body" tone="ink2">
            {`${formatClock(at)}${length ? `, ${formatDuration(length)}` : ""}. Tap to start.`}
          </Txt>
        </View>
      </View>
    </View>
  );
}

/** One feel switch (`.sw`): an icon, what it does, and the switch. */
function FeelSwitch({
  icon,
  label,
  hint,
  on,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <Press
      role="switch"
      aria-checked={on}
      accessibilityLabel={label}
      onPress={() => onChange(!on)}
      hoverBg={null}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: 64,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <Icon icon={icon} size={20} tone="ink2" />
      <View style={{ flex: 1 }}>
        <Txt variant="subhead">{label}</Txt>
        <Txt variant="meta" tone="ink3">
          {hint}
        </Txt>
      </View>
      <View
        aria-hidden
        style={{
          width: 48,
          height: 28,
          borderRadius: r.pill,
          padding: s.s1,
          backgroundColor: on ? c.done : c.lineStrong,
          alignItems: on ? "flex-end" : "flex-start",
        }}
      >
        <View style={{ width: 20, height: 20, borderRadius: r.pill, backgroundColor: c.headInk }} />
      </View>
    </Press>
  );
}

/** Step 7 in the Android app: reminders, asked with a preview of a real one, and sounds. */
export function Reminders({ d, today, next }: { d: Draft; today: CivilDate; next: () => void }) {
  const profile = useProfile();
  const update = useMutation(api.account.updateProfile);
  const [on, setOn] = useState(false);
  const sounds = profile?.sounds === true;
  const [haptics, setHaptics] = useState(hapticsOn);
  return (
    <StepFrame
      step={7}
      onSkip={next}
      foot={
        on ? (
          <FullButton label="Continue" onPress={next} />
        ) : (
          <>
            <FullButton
              label="Turn on reminders"
              icon={<Icon icon={Bell} size={20} tone="onInk" />}
              onPress={() =>
                void ensureNotifications().then((granted) => {
                  if (granted) {
                    commitHaptic();
                    setOn(true);
                  } else showToast("Reminders are off. You can allow them in Android's settings.");
                })
              }
            />
            <LinkButton label="Not now" onPress={next} />
          </>
        )
      }
    >
      <Question text={on ? "Reminders are on." : "Get a nudge"} dim={on ? undefined : "before it starts."} />
      <Lead>
        {on
          ? "You can change when and how in Settings."
          : "Like this, built from your plan. Only the reminders you set, and nothing else."}
      </Lead>
      <ReminderPreview d={d} today={today} />
      <View style={{ marginTop: s.s4 }}>
        <FeelSwitch
          icon={Vibrate}
          label="Vibrate on actions"
          hint="A light tap when you tick, swipe or snap"
          on={haptics}
          onChange={(next) => {
            setHapticsOn(next);
            setHaptics(next);
            toggleHaptic(next);
          }}
        />
        <FeelSwitch
          icon={Volume2}
          label="Soft sounds"
          hint="A quiet click when you finish something"
          on={sounds}
          onChange={(next) => {
            setSoundsOn(next);
            if (next) playSound("done");
            void update({ sounds: next }).catch((e: unknown) => showToast(errorText(e)));
          }}
        />
      </View>
    </StepFrame>
  );
}

function ConnectRow({
  icon,
  title,
  sub,
  open,
  done,
  onOpen,
  children,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  open: boolean;
  done: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <View style={{ borderBottomWidth: 1, borderStyle: "dotted", borderColor: c.lineStrong }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          minHeight: 72,
          paddingVertical: s.s3,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: r.ctl,
            backgroundColor: c.head,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={icon} size={20} tone="headInk" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="subhead">{title}</Txt>
          <Txt variant="meta" tone="ink3">
            {sub}
          </Txt>
        </View>
        {done ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1, minHeight: 44 }}>
            <Icon icon={Check} size={16} tone="done" strokeWidth={2.4} />
            <Txt variant="label" tone="done">
              Copied
            </Txt>
          </View>
        ) : (
          <Press
            role="button"
            aria-expanded={open}
            accessibilityLabel={`Set up ${title}`}
            onPress={onOpen}
            style={{
              minHeight: 44,
              justifyContent: "center",
              paddingHorizontal: s.s4,
              borderRadius: r.pill,
              backgroundColor: c.hover,
            }}
          >
            <Txt variant="label" style={family("600")}>
              Set up
            </Txt>
          </Press>
        )}
      </View>
      {open && !done ? (
        <View
          style={{
            marginLeft: 52,
            marginBottom: s.s3,
            padding: s.s3,
            gap: s.s2,
            borderRadius: r.card,
            backgroundColor: c.sunken,
          }}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Step 8: bring in your AI, all optional. Anything an agent adds says who added it, with Undo. */
export function ConnectAI({
  next,
  back,
  copied,
  onCopied,
}: {
  next: () => void;
  back?: () => void;
  copied: { claude: boolean; codex: boolean };
  onCopied: (which: "claude" | "codex") => void;
}) {
  const [open, setOpen] = useState<"claude" | "codex" | null>(null);
  const copy = (which: "claude" | "codex") => {
    void Clipboard.setStringAsync(MCP_URL).then(() => {
      commitHaptic();
      onCopied(which);
      setOpen(null);
    });
  };
  const code = (
    <Txt variant="label" tnum selectable style={family("600")}>
      {MCP_URL}
    </Txt>
  );
  const copyButton = (which: "claude" | "codex") => (
    <Press
      role="button"
      accessibilityLabel="Copy the address"
      onPress={() => copy(which)}
      hoverBg={null}
      style={{
        alignSelf: "flex-start",
        minHeight: 44,
        justifyContent: "center",
        paddingHorizontal: s.s4,
        borderRadius: r.pill,
        backgroundColor: c.ink,
      }}
    >
      <Txt variant="label" tone="onInk" style={family("600")}>
        Copy the address
      </Txt>
    </Press>
  );
  return (
    <StepFrame
      step={8}
      onBack={back}
      onSkip={next}
      foot={<FullButton label={copied.claude || copied.codex ? "Continue" : "Set up later"} onPress={next} />}
    >
      <Question text="Bring in what" dim="you already use." />
      <Lead>All optional. You can do this later in Settings.</Lead>
      <View style={{ marginTop: s.s6 }}>
        <MiniLabel text="Your AI" />
        <ConnectRow
          icon={Sparkles}
          title="Claude or ChatGPT"
          sub="Plan with you in chat: “move my lab report to Saturday”"
          open={open === "claude"}
          done={copied.claude}
          onOpen={() => setOpen(open === "claude" ? null : "claude")}
        >
          <Txt variant="body" tone="ink2">
            Add Kriyan as a custom connector with this address, then sign in with this account.
          </Txt>
          {code}
          {copyButton("claude")}
        </ConnectRow>
        <ConnectRow
          icon={Terminal}
          title="Codex automation"
          sub="Each morning, reads Moodle and Gmail and adds what's due"
          open={open === "codex"}
          done={copied.codex}
          onOpen={() => setOpen(open === "codex" ? null : "codex")}
        >
          <Txt variant="body" tone="ink2">
            Add this address to Codex, then schedule a daily run. Things it adds say they came from Codex, and
            each has Undo.
          </Txt>
          {code}
          {copyButton("codex")}
        </ConnectRow>
      </View>
    </StepFrame>
  );
}

/** One "Get started" card (`.gc`): a next step of a minute or two, ticked once it's done. */
function StartCard({
  icon,
  title,
  sub,
  minutes,
  done,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  minutes: number;
  done: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={done ? `${title}, done` : title}
      onPress={onPress}
      hoverBg={null}
      style={{
        width: 240,
        minHeight: 160,
        gap: s.s1,
        padding: s.s4,
        borderRadius: r.sheet,
        backgroundColor: done ? "transparent" : c.sunken,
        boxShadow: done ? `inset 0 0 0 1px ${c.line}` : undefined,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: r.ctl,
          backgroundColor: c.raised,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: s.s2,
        }}
      >
        <Icon icon={icon} size={20} tone="ink2" />
      </View>
      <Txt variant="subhead" tone={done ? "ink3" : "ink"} strike={done}>
        {title}
      </Txt>
      <Txt variant="meta" tone="ink3">
        {sub}
      </Txt>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
        <Icon icon={done ? Check : Clock} size={14} tone={done ? "done" : "ink2"} />
        <Txt variant="caption" tone="ink2">
          {done ? "Done" : `${minutes} min`}
        </Txt>
      </View>
    </Press>
  );
}

/**
 * Step 9: the same one-sentence day, now with your plan in it, three small next steps, and
 * Open Today. Each card is done when the thing itself is: a task tomorrow, a review time
 * chosen, an agent's address copied or a token made.
 */
export function GetStarted({
  d,
  today,
  name,
  agentReady,
  finish,
}: {
  d: Draft;
  today: CivilDate;
  name: string | null;
  agentReady: boolean;
  finish: () => void;
}) {
  const tomorrow = addDays(today, 1);
  const week = useWeekView(startOfWeek(tomorrow));
  const profile = useProfile();
  const tokens = useAccessTokens();
  const day = week?.days.find((x) => x.date === tomorrow);
  const cards = [
    {
      key: "tomorrow",
      icon: Plus,
      title: "Add tomorrow's first thing",
      sub: "One line, with a time if it has one",
      minutes: 1,
      done: Boolean(day && day.scheduled.length + day.anytime.length > 0),
      go: () => router.push("/add"),
    },
    {
      key: "review",
      icon: Moon,
      title: "Pick your evening review time",
      sub: "Close the day so your head can let go",
      minutes: 1,
      done: profile?.reviewTime !== undefined,
      go: () => router.push("/settings"),
    },
    {
      key: "ai",
      icon: Sparkles,
      title: "Connect your AI",
      sub: "Ask “what do I have time for?”",
      minutes: 2,
      done: agentReady || Boolean(tokens?.length),
      go: () => router.push("/settings"),
    },
  ];
  const done = cards.filter((x) => x.done).length;
  return (
    <StepFrame step={9} bare foot={<FullButton label="Open Today" onPress={finish} />}>
      <View style={{ backgroundColor: c.head, padding: s.s6, paddingBottom: s.s12, gap: s.s4 }}>
        <DayName today={today} />
        <PersonalSentence d={d} today={today} name={name} />
      </View>
      <View
        style={{
          flex: 1,
          marginTop: -s.s6,
          paddingTop: s.s6,
          borderTopLeftRadius: r.sheet,
          borderTopRightRadius: r.sheet,
          backgroundColor: c.raised,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            paddingHorizontal: s.s6,
          }}
        >
          <Txt variant="title" heading={1}>
            Get started
          </Txt>
          <Txt variant="meta" tone="ink3" tnum>
            {`${done} of ${cards.length}`}
          </Txt>
        </View>
        <ScrollView
          horizontal
          style={{ flexGrow: 0 }}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: s.s3, paddingHorizontal: s.s6, paddingVertical: s.s3 }}
        >
          {cards.map((card) => (
            <StartCard
              key={card.key}
              icon={card.icon}
              title={card.title}
              sub={card.sub}
              minutes={card.minutes}
              done={card.done}
              onPress={card.go}
            />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: s.s6, marginTop: s.s3 }}>
          <MiniLabel text="Today" />
          <DayRows d={d} today={today} />
        </View>
      </View>
    </StepFrame>
  );
}

/** Which step 7 this surface gets, if any. */
export function Step7({ d, today, next }: { d: Draft; today: CivilDate; next: () => void }) {
  return surface() === "android" ? (
    <Reminders d={d} today={today} next={next} />
  ) : (
    <AddToHomeScreen next={next} />
  );
}
