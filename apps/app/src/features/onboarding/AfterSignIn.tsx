// Steps 7 to 9 of onboarding.html, once signed in: on an iPhone in Safari, Add to Home Screen;
// in the Android app, reminders and sounds; in a browser with Web Push, reminders; then bringing
// in your AI; then three small next steps and your day.

import { useContext, useEffect, useState, type ReactNode } from "react";
import { Platform, ScrollView, View } from "react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@kriyan/convex/api";
import { addDays, formatClock, startOfWeek, type CivilDate } from "@kriyan/core/dates";
import { formatDuration } from "@kriyan/core/format";
import { type } from "@kriyan/core/tokens";
import { useAccessTokens, useProfile, useWeekView } from "@/data/views";
import { hapticsOn, setHapticsOn, setSoundsOn } from "@/features/feel/setting";
import { playSound } from "@/features/feel/sound";
import type { WebReminders } from "@/features/notifications/AllowReminders";
import { ensureNotifications } from "@/features/notifications/register";
import { MCP_URL } from "@/features/settings/SettingsScreen";
import { errorText } from "@/features/tasks/actions";
import { commitHaptic, toggleHaptic } from "@/features/tasks/haptics";
import { roleStyle } from "@/theme/layout";
import { bold, c, family, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import { DayName, DayRows, firstTask, PersonalSentence } from "./Day";
import { standalone, surface, type Draft } from "./draft";
import { DesktopCard, FullButton, Lead, LinkButton, MiniLabel, Question, StepFrame } from "./Frame";

/** A numbered instruction with Safari's own icon beside it (`.st`). */
function Instruction({ n, children, glyph }: { n: number; children: ReactNode; glyph: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        padding: s.s4,
        borderRadius: r.box,
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

const strong = (t: string) => (
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
          Tap {strong("Share")} {"in Safari's bar"}
        </Instruction>
        <Instruction n={2} glyph={<Icon icon={SquarePlus} size={20} tone="ink" />}>
          Scroll and tap {strong("Add to Home Screen")}
        </Instruction>
        <Instruction n={3} glyph={<Txt variant="subhead">K</Txt>}>
          Open {strong("Kriyan")} from your Home Screen and sign in again.
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
    // The prototype's `--fill` ground (`.preview`), the same tint as the Set up buttons; in dark
    // the sunken fill would all but vanish against the card.
    <View style={{ marginTop: s.s6, padding: s.s3, borderRadius: r.sheet, backgroundColor: c.hover }}>
      <View
        style={{
          flexDirection: "row",
          gap: s.s3,
          padding: s.s3,
          // A round notification like the prototype's `.notif`, concentric with the 24 around it.
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
          {/* The app icon's red dot, as on the Home Screen. */}
          <View
            style={{
              position: "absolute",
              top: s.s2,
              right: s.s2,
              width: 5,
              height: 5,
              borderRadius: r.pill,
              backgroundColor: c.now,
            }}
          />
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
          {/* The notification's own small size on phones too (`.notif .nm` is 14). */}
          <Txt tone="ink2" style={roleStyle(type.body)}>
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

/**
 * Step 7's reminders ask (`step7`, not on an iPhone in Safari): a preview of a real reminder,
 * Turn on reminders or Not now, and once they're on, Continue. `children` sit under the preview.
 */
function NudgeStep({
  d,
  today,
  next,
  on,
  waiting,
  turnOn,
  children,
}: {
  d: Draft;
  today: CivilDate;
  next: () => void;
  on: boolean;
  /** The ask can't run yet (still checking, or the browser's prompt is open). */
  waiting?: boolean;
  turnOn: () => void;
  children?: ReactNode;
}) {
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
              icon={<Icon icon={Bell} size={20} tone={waiting ? "ink3" : "onInk"} />}
              disabled={waiting}
              onPress={turnOn}
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
      {children}
    </StepFrame>
  );
}

/** Step 7 in the Android app: reminders, and the feel switches to try right away (`.sw`). */
export function Reminders({ d, today, next }: { d: Draft; today: CivilDate; next: () => void }) {
  const profile = useProfile();
  const update = useMutation(api.account.updateProfile);
  const [on, setOn] = useState(false);
  const sounds = profile?.sounds === true;
  const [haptics, setHaptics] = useState(hapticsOn);
  return (
    <NudgeStep
      d={d}
      today={today}
      next={next}
      on={on}
      turnOn={() =>
        void ensureNotifications().then((granted) => {
          if (granted) {
            commitHaptic();
            setOn(true);
          } else showToast("Reminders are off. You can allow them in Android's settings.");
        })
      }
    >
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
    </NudgeStep>
  );
}

/**
 * Step 7 in a browser with Web Push, and in the iPhone Home Screen app: the same ask, through
 * the browser's own prompt. A browser that turns out unable to (no keys on the server) moves on.
 */
function BrowserReminders({
  d,
  today,
  next,
  reminders,
}: {
  d: Draft;
  today: CivilDate;
  next: () => void;
  reminders: WebReminders;
}) {
  const { available, state, allow } = reminders;
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (available === false) next();
  }, [available, next]);
  useEffect(() => {
    if (asked && state === "blocked")
      showToast("Notifications are blocked. Allow them in this browser's site settings.");
  }, [asked, state]);
  return (
    <NudgeStep
      d={d}
      today={today}
      next={next}
      on={state === "on"}
      waiting={available !== true || state === "checking" || state === "busy"}
      turnOn={() => {
        setAsked(true);
        allow();
      }}
    />
  );
}

function ConnectRow({
  logo,
  tint,
  title,
  sub,
  open,
  done,
  onOpen,
  children,
}: {
  /** The service's own tile (`.cn .lg`): white on its colour, so each connection reads apart. */
  logo: ReactNode;
  tint: string;
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
        {/* A logo beside the name it stands for: decorative, so screen readers skip it. */}
        <View
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: r.card,
            backgroundColor: tint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {logo}
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
          logo={
            <Txt variant="label" tone="headInk" style={family("600")}>
              AI
            </Txt>
          }
          tint={spaceTone("orange").dot}
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
          logo={<Icon icon={Terminal} size={20} tone="headInk" />}
          tint={c.head}
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

/** The Get started carousel's snapping on the web (`.cards`, `.gc`); Android uses snapToInterval. */
const snapRail = Platform.OS === "web" ? ({ scrollSnapType: "x mandatory" } as object) : null;
const snapStart = Platform.OS === "web" ? ({ scrollSnapAlign: "start" } as object) : {};

/** One "Get started" card (`.gc`): a next step of a minute or two, ticked once it's done. */
function StartCard({
  icon,
  title,
  sub,
  minutes,
  done,
  onPress,
  width,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  minutes: number;
  done: boolean;
  onPress: () => void;
  width: number;
}) {
  return (
    <Press
      role="button"
      accessibilityLabel={done ? `${title}, done` : title}
      onPress={onPress}
      hoverBg={null}
      style={{
        ...snapStart,
        width,
        minHeight: 150,
        gap: s.s1,
        padding: s.s4,
        borderRadius: r.box,
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
      {/* The card's small line at the desktop size on phones too (`.gc span` is 13). */}
      <Txt tone="ink3" style={roleStyle(type.meta)}>
        {sub}
      </Txt>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: s.s1 }}>
        <Icon icon={done ? Check : Clock} size={14} tone={done ? "done" : "ink2"} />
        <Txt variant="caption" tone="ink2" style={family("600")}>
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
  const [rail, setRail] = useState(340);
  const card = useContext(DesktopCard);
  const insets = useSafeAreaInsets();
  // The card's own gutters: 32 on the desktop card, 24 on a phone, as on every other step.
  const gutter = card ? s.s8 : s.s6;
  const cardWidth = Math.round((rail - 2 * gutter) * 0.72);
  return (
    <StepFrame step={9} bare foot={<FullButton label="Open Today" onPress={finish} />}>
      <View
        style={{
          backgroundColor: c.head,
          paddingVertical: s.s6,
          paddingHorizontal: gutter,
          // The black head runs up under the phone's status bar; the day starts below it.
          paddingTop: (card ? 0 : insets.top) + s.s6,
          paddingBottom: s.s12,
          gap: s.s4,
        }}
      >
        <DayName today={today} big />
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
            paddingHorizontal: gutter,
          }}
        >
          <Txt variant="title" heading={1} style={bold}>
            Get started
          </Txt>
          <Txt variant="meta" tone="ink3" tnum>
            {`${done} of ${cards.length}`}
          </Txt>
        </View>
        <ScrollView
          horizontal
          // Each card snaps flush to the left edge with the next one peeking in, as the prototype's
          // `.cards` scroll-snap does; the trailing gutter lets the last one end inset. The web
          // snaps with CSS, Android with snapToInterval (react-native-web ignores it).
          style={[{ flexGrow: 0 }, snapRail]}
          snapToInterval={cardWidth + s.s3}
          snapToAlignment="start"
          decelerationRate="fast"
          onLayout={(e) => setRail(e.nativeEvent.layout.width)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: s.s3, paddingRight: gutter, paddingTop: s.s3 }}
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
              // Most of the rail inside the gutters, so the next card peeks in (`.gc` is 72%).
              width={cardWidth}
            />
          ))}
        </ScrollView>
        <View style={{ paddingHorizontal: gutter, marginTop: s.s4 }}>
          <MiniLabel text="Today" />
          <DayRows d={d} today={today} />
        </View>
      </View>
    </StepFrame>
  );
}

/** Which step 7 this surface gets: reminders in the app, Add to Home Screen or reminders on the web. */
export function Step7({
  d,
  today,
  next,
  reminders,
}: {
  d: Draft;
  today: CivilDate;
  next: () => void;
  reminders: WebReminders;
}) {
  const where = surface();
  if (where === "android") return <Reminders d={d} today={today} next={next} />;
  if (where === "iphone" && !standalone()) return <AddToHomeScreen next={next} />;
  return <BrowserReminders d={d} today={today} next={next} reminders={reminders} />;
}
