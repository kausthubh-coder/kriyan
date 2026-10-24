// Settings (b2.html?screen=settings): in B2's order, who's signed in, how it feels (sounds and
// haptics), the evening review, agents and the command line, and installing it; then what B2
// doesn't picture: the semester, your day, default reminders, access tokens, recently deleted,
// and deleting your data.

import { AllowReminders } from "@/features/notifications/AllowReminders";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Modal, Platform, useWindowDimensions, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import {
  ChevronLeft,
  KeyRound,
  Link,
  Play,
  RotateCcw,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import { parseClock } from "@kriyan/core/parse";
import type { Reminder } from "@kriyan/core/reminders";
import { useClock } from "@/data/time";
import { useAccessTokens, useProfile, type Profile } from "@/data/views";
import { hapticsOn, setHapticsOn, setSoundsOn, soundsOn } from "@/features/feel/setting";
import { playSound } from "@/features/feel/sound";
import { forgetDevice } from "@/features/notifications/register";
import { canVibrate } from "@/features/feel/vibrate";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { SmallButton } from "@/features/progress/SmallButton";
import { Dock } from "@/features/shell/Dock";
import { errorText } from "@/features/tasks/actions";
import { commitHaptic, toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { ReminderEditor } from "@/features/tasks/ReminderEditor";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s, shadows, sz } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { Press } from "@/ui/Press";
import { goBack, PageHead, Screen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";

export const MCP_URL = "https://kriyan.app/mcp";
// The CLI isn't on npm yet, so it runs from a copy of the code; ship-kriyan step 6 says when this changes.
export const CLI_LINE = "bun run kriyan login";
export const MCP_DOCS = "https://kriyan.app/docs/mcp";
export const CLI_DOCS = "https://kriyan.app/docs/cli";
const GITHUB_URL = "https://github.com/kausthubh-coder/kriyan";

/** The CLI isn't on npm, so its setup starts from a clone. */
const CLI_SETUP = [`git clone ${GITHUB_URL}`, "cd kriyan && bun install", CLI_LINE];

/** The prototype's small round button on a card (b2.html `.btn-sm`). */
const small = { borderRadius: r.pill, backgroundColor: c.hover } as const;
/** The prototype's dotted rule between rows. */
const rule = { borderBottomWidth: 1, borderStyle: "dotted", borderColor: c.lineStrong } as const;

async function copy(text: string, what: string) {
  await Clipboard.setStringAsync(text);
  showToast(`Copied ${what}`);
}

export function SettingsScreen() {
  const profile = useProfile();
  const phone = useIsPhone();
  return (
    <Screen
      title="Settings"
      back
      width="full"
      // B2 keeps the dock on Settings. The web layout draws it on every phone page; on Android
      // Settings is pushed over the tabs, so it draws its own.
      footer={Platform.OS === "web" ? null : <Dock />}
      // B2's desktop page starts 36 from the top, with Back above the title.
      scrollProps={
        phone
          ? undefined
          : { contentContainerStyle: { paddingTop: s.s8, paddingHorizontal: s.s8, paddingBottom: s.s16 } }
      }
    >
      {/* One centred 680 column with B2's short section breaks (the frame's are 32 and 48 and
          hold pages to its left edge). On phones it sits 16 under the title. */}
      <View
        style={{
          width: "100%",
          maxWidth: sz.column,
          alignSelf: "center",
          gap: s.s4,
          ...(phone ? { marginTop: -s.s4 } : null),
        }}
      >
        {phone ? null : (
          <View>
            <DeskBack />
            <PageHead title="Settings" />
          </View>
        )}
        {profile === undefined ? (
          <View testID="skeleton" style={{ gap: s.s4 }}>
            <Skeleton width="100%" height={72} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width={`${70 - i * 10}%`} />
            ))}
          </View>
        ) : (
          <>
            <AccountCard profile={profile} />
            <Feel profile={profile} />
            <EveningReview profile={profile} />
            <ConnectAI />
            <Install />
            <Semester profile={profile} />
            <YourDay profile={profile} />
            <DefaultReminders profile={profile} />
            <AgentAccess profile={profile} />
            <Deleted />
            <DeleteData />
          </>
        )}
      </View>
    </Screen>
  );
}

/** "Back" above the desktop title (b2.html `.back`), like the phone's. */
function DeskBack() {
  return (
    <Press
      role="button"
      accessibilityLabel="Back"
      onPress={() => goBack()}
      hoverBg={null}
      scale={false}
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        minHeight: sz.touch,
        marginLeft: -s.s1,
        paddingRight: s.s2,
      }}
    >
      {({ hovered }) => (
        <>
          <Icon icon={ChevronLeft} size={20} tone={hovered ? "ink" : "ink2"} />
          <Txt variant="label" tone={hovered ? "ink" : "ink2"}>
            Back
          </Txt>
        </>
      )}
    </Press>
  );
}

function useUpdateProfile() {
  const update = useMutation(api.account.updateProfile);
  return (patch: Parameters<typeof update>[0]) =>
    update(patch).catch((e: unknown) => showToast(errorText(e)));
}

/** A section: the quiet uppercase label, then its rows. */
function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <View nativeID={id} style={{ marginTop: s.s1 }}>
      <SectionLabel title={title} />
      {/* The label's own height leaves 8 under its words, so its rows follow straight on. */}
      <View style={{ gap: s.s2 }}>{children}</View>
    </View>
  );
}

/** Who's signed in (b2.html `.acct`), with Sign out beside them. */
function AccountCard({ profile }: { profile: Profile }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name = profile.name?.trim() || user?.firstName || email || "You";
  const google = user?.externalAccounts.some((a) => a.provider.includes("google"));
  const how = name === email ? (google ? "Signed in with Google" : "Signed in") : (email ?? "Signed in");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        padding: s.s3,
        paddingLeft: s.s4,
        borderRadius: r.box,
        backgroundColor: c.sunken,
      }}
    >
      <View
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: r.pill,
          backgroundColor: c.ink,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt variant="subhead" tone="onInk">
          {name.charAt(0).toUpperCase()}
        </Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="subhead" numberOfLines={1}>
          {name}
        </Txt>
        <Txt variant="meta" tone="ink3" numberOfLines={1}>
          {how}
        </Txt>
      </View>
      <SmallButton label="Sign out" onPress={() => void forgetDevice().finally(() => void signOut())} />
    </View>
  );
}

/**
 * One setting (b2.html `.togrow`): its name and a hint on the left, the control on the right,
 * over a dotted rule. Controls too wide for the right side go under the name instead.
 */
function Row({
  label,
  hint,
  children,
  below,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  below?: boolean;
}) {
  const phone = useIsPhone();
  const stack = below && phone;
  return (
    <View
      style={{
        flexDirection: stack ? "column" : "row",
        alignItems: stack ? "flex-start" : "center",
        gap: stack ? s.s2 : s.s4,
        minHeight: 48,
        paddingVertical: s.s2,
        ...rule,
      }}
    >
      <View style={{ flex: stack ? undefined : 1 }}>
        <Txt variant="label">{label}</Txt>
        {hint ? (
          <Txt variant="meta" tone="ink3">
            {hint}
          </Txt>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, alignItems: "center" }}>
        {children}
      </View>
    </View>
  );
}

function TimeField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (minutes: number) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const [text, setText] = useState(formatClock(value));
  const commit = () => {
    const m = parseClock(text.trim());
    if (m === null) {
      showToast(`Type ${label.toLowerCase()} like 08:00 or 8am.`);
      setText(formatClock(value));
    } else if (m !== value) onSave(m);
    else setText(formatClock(value));
  };
  return (
    <Field
      label={label}
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      // Wide enough for "08:00" at the phone's text size, so large text never clips it.
      containerStyle={{ width: Math.round(96 * Math.max(1, fontScale)) }}
    />
  );
}

/**
 * One of a few values for a setting (b2.html `.chip`, `.chip.on`): the chosen one is filled, the
 * others are outlined, so the current value reads at a glance.
 */
function Choice({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const phone = useIsPhone();
  return (
    <Press
      role="radio"
      aria-checked={on}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hoverBg={null}
      style={{ height: phone ? sz.touch : sz.ctl, justifyContent: "center" }}
    >
      {({ hovered }) => (
        <View
          style={{
            // B2's chips are compact on phones too (`.chip`, 34 high); the target stays 44.
            height: sz.ctl,
            minWidth: 56,
            paddingHorizontal: s.s3,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: r.ctl,
            backgroundColor: on ? c.ink : hovered ? c.hover : "transparent",
            boxShadow: on ? undefined : `inset 0 0 0 1px ${c.lineStrong}`,
          }}
        >
          <Txt
            variant="label"
            tone={on ? "onInk" : "ink2"}
            tnum
            numberOfLines={1}
            style={{ fontSize: 14, lineHeight: 20 }}
          >
            {label}
          </Txt>
        </View>
      )}
    </Press>
  );
}

/** A setting that is on or off (b2.html `.togrow`): the whole row flips it. */
function SwitchRow({
  label,
  hint,
  on,
  onChange,
}: {
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
      scale={false}
      hoverBg={null}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s4,
        minHeight: 48,
        paddingVertical: s.s2,
        ...rule,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt variant="label">{label}</Txt>
        <Txt variant="meta" tone="ink3">
          {hint}
        </Txt>
      </View>
      <Switch on={on} />
    </Press>
  );
}

/**
 * Sounds and haptics (docs/design/v4: haptics on by default, sounds off). Haptics show where
 * something can vibrate: the Android app, and a phone's browser with the Vibration API. Elsewhere
 * (desktops, iPhone Safari) the switch is left out rather than shown doing nothing.
 */
function Feel({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const on = profile.sounds === true;
  const [haptics, setHaptics] = useState(hapticsOn);
  const [vibrates] = useState(canVibrate);
  return (
    <Section title="Feel">
      <View>
        <SwitchRow
          label="Sounds"
          hint="A soft tick when you finish or move something"
          on={on}
          onChange={(next) => {
            // On at once, so turning it on is the first sound you hear.
            setSoundsOn(next);
            if (next) playSound("done");
            void update({ sounds: next });
          }}
        />
        {vibrates ? (
          <SwitchRow
            label="Haptics"
            hint="A light tap when you tick, move or drop something"
            on={haptics}
            onChange={(next) => {
              setHapticsOn(next);
              setHaptics(next);
              toggleHaptic(next);
            }}
          />
        ) : null}
      </View>
      <View>
        <SmallButton
          icon={Play}
          filled
          label="Try it"
          onPress={() => {
            commitHaptic();
            if (soundsOn()) playSound("done");
            else showToast("Sounds are off. Turn them on to hear one.");
          }}
        />
      </View>
    </Section>
  );
}

/** The prototype's four review times. Unset means 20:00, like the backend. */
const REVIEW_TIMES = [19 * 60, 20 * 60, 21 * 60, 22 * 60];
const DEFAULT_REVIEW = 20 * 60;

function EveningReview({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const phone = useIsPhone();
  const current = profile.reviewTime ?? DEFAULT_REVIEW;
  return (
    <Section title="Evening review">
      {/* 14 on phones too, so it stays one line like B2's. */}
      <Txt variant={phone ? "meta" : "body"} tone="ink3">
        When “Review today” shows up in your evening.
      </Txt>
      <View
        role="radiogroup"
        aria-label="Review time"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}
      >
        {REVIEW_TIMES.map((m) => (
          <Choice
            key={m}
            label={formatClock(m)}
            on={current === m}
            accessibilityLabel={`Review at ${formatClock(m)}`}
            onPress={() => void update({ reviewTime: m })}
          />
        ))}
      </View>
    </Section>
  );
}

/** One end of the semester: the date as a button that opens the app's day picker. */
function SemesterDay({
  label,
  value,
  today,
  onPick,
}: {
  label: string;
  value: string | undefined;
  today: string;
  onPick: (date: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<View>(null);
  return (
    <Row label={label}>
      <View ref={ref} collapsable={false}>
        <Button
          label={value ? formatDate(value, today) : "Pick a day"}
          accessibilityLabel={`${label}: ${value ? formatDate(value, today) : "not set"}`}
          onPress={() => setOpen(true)}
          expanded={open}
          style={small}
        />
      </View>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} title={label}>
        <DayPicker
          value={value ?? null}
          today={today}
          onPick={(date) => {
            setOpen(false);
            onPick(date);
          }}
        />
      </Popover>
    </Row>
  );
}

/** The semester's first and last days, for the weeks-left card on Goals. */
function Semester({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const { today } = useClock();
  const set = Boolean(profile.semesterStart || profile.semesterEnd);
  return (
    <Section title="Semester" id="semester">
      <Txt variant="body" tone="ink3">
        Goals shows the weeks left between these days.
      </Txt>
      <View>
        <SemesterDay
          label="First day"
          value={profile.semesterStart}
          today={today}
          onPick={(semesterStart) => void update({ semesterStart })}
        />
        <SemesterDay
          label="Last day"
          value={profile.semesterEnd}
          today={today}
          onPick={(semesterEnd) => void update({ semesterEnd })}
        />
      </View>
      {set ? (
        <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
          <Button
            label="Clear semester"
            onPress={() => void update({ semesterStart: null, semesterEnd: null })}
          />
        </View>
      ) : null}
    </Section>
  );
}

function YourDay({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const hours = profile.dailyCapacity / 60;
  return (
    <Section title="Your day">
      <View>
        <Row label="Day starts" hint="The schedule starts here">
          <TimeField
            key={profile.dayStart}
            label="Day starts"
            value={profile.dayStart}
            onSave={(dayStart) => void update({ dayStart })}
          />
        </Row>
        <Row label="Day ends" hint="Free time is counted until here">
          <TimeField
            key={profile.dayEnd}
            label="Day ends"
            value={profile.dayEnd}
            onSave={(dayEnd) => void update({ dayEnd })}
          />
        </Row>
        <Row label="Daily capacity" hint="Planned work a day can hold, for the load lines" below>
          <View
            role="radiogroup"
            aria-label="Daily capacity"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}
          >
            {[4, 5, 6, 7, 8].map((h) => (
              <Choice
                key={h}
                label={`${h}h`}
                on={hours === h}
                onPress={() => void update({ dailyCapacity: h * 60 })}
              />
            ))}
          </View>
        </Row>
      </View>
    </Section>
  );
}

function DefaultReminders({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <Section title="Default reminders">
      <AllowReminders />
      <Txt variant="body" tone="ink3">
        Added to new tasks that have a time. You can change them on any task.
      </Txt>
      <ReminderEditor
        reminders={profile.defaultReminders as Reminder[]}
        timed
        onChange={(defaultReminders) => void update({ defaultReminders })}
      />
    </Section>
  );
}

/** A value to copy, on a quiet fill, with its Copy button (b2.html `.conn-r code`; Inter, not monospace). */
function CopyLine({ text, what, label = "Copy" }: { text: string; what: string; label?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: s.s2 }}>
      <View
        style={{
          flexShrink: 1,
          paddingHorizontal: s.s2,
          paddingVertical: s.s1,
          borderRadius: r.ctl,
          backgroundColor: c.hover,
        }}
      >
        <Txt variant="body" selectable numberOfLines={1} tnum>
          {text}
        </Txt>
      </View>
      <SmallButton label={label} accessibilityLabel={`Copy ${what}`} onPress={() => void copy(text, what)} />
    </View>
  );
}

/**
 * One way to connect (b2.html `.conn-r`): an icon, what it is in a few words, and what to copy on
 * the right; on a phone what to copy wraps under the words.
 */
function ConnRow({
  icon,
  title,
  meta,
  guide,
  children,
  last,
}: {
  icon: typeof Link;
  title: string;
  meta: string;
  /** The step-by-step guide on kriyan.app, linked after the words. */
  guide?: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: s.s3,
        rowGap: s.s2,
        paddingVertical: s.s3,
        ...(last ? null : rule),
      }}
    >
      <View style={{ flex: 1, minWidth: 180, flexDirection: "row", alignItems: "center", gap: s.s3 }}>
        <Icon icon={icon} size={20} tone="ink2" />
        <View style={{ flex: 1 }}>
          <Txt variant="label" style={family("600")}>
            {title}
          </Txt>
          <Txt variant="meta" tone="ink3">
            {meta}
            {guide ? (
              <>
                {" "}
                <Txt
                  variant="meta"
                  tone="parse"
                  role="link"
                  accessibilityLabel={`${title} guide`}
                  onPress={() => void Linking.openURL(guide)}
                >
                  Guide
                </Txt>
              </>
            ) : null}
          </Txt>
        </View>
      </View>
      {children}
    </View>
  );
}

function ConnectAI() {
  return (
    <Section title="Agents and automations" id="connect-ai">
      <View
        style={{
          paddingHorizontal: s.s4,
          paddingVertical: s.s1,
          borderRadius: r.box,
          backgroundColor: c.sunken,
        }}
      >
        <ConnRow icon={Link} title="MCP server" meta="For Claude, ChatGPT and Codex." guide={MCP_DOCS}>
          <CopyLine text={MCP_URL} what="the MCP address" label="Copy URL" />
        </ConnRow>
        {/* Not on npm yet, so the setup is a clone (shown below the card) rather than one line. */}
        <ConnRow
          icon={Terminal}
          title="Command line"
          meta="For scripts and scheduled runs. Clone it, install, then sign in with a token."
          guide={CLI_DOCS}
        >
          <SmallButton
            label="Copy setup"
            accessibilityLabel="Copy the setup commands"
            onPress={() => void copy(CLI_SETUP.join("\n"), "the setup commands")}
          />
        </ConnRow>
        <ConnRow
          icon={Sparkles}
          title="Codex"
          meta={`Add the MCP URL, then schedule: “Every day at 07:00, read Moodle and Gmail and add what's due to Kriyan.”`}
        />
        <ConnRow
          icon={Sparkles}
          title="Claude and ChatGPT"
          meta="Settings, Connectors, Add custom connector, then paste the URL. Ask “plan my week” from there."
          last
        />
      </View>
      {/* B2 goes straight from the card to the terminal; what agents may do lives with the
          tokens that let them in, after Install. */}
      <TerminalBlock lines={[...CLI_SETUP, ...CLI_EXAMPLES]} label="Command line setup and examples" />
    </Section>
  );
}

/** What the command line looks like in use: real commands from `kriyan --help`. */
const CLI_EXAMPLES = [
  "bun run kriyan today",
  'bun run kriyan add "Gym tomorrow 7:00 for 45m every Mon Wed Fri remind 10m before #health"',
];

/** The prototype's terminal (b2.html `.term`): dark in both schemes, like the Today header. */
function TerminalBlock({ lines, label }: { lines: string[]; label: string }) {
  return (
    <View
      style={{
        padding: s.s4,
        borderRadius: r.box,
        backgroundColor: c.head,
        gap: s.s1,
      }}
      aria-label={label}
    >
      {lines.map((line) => (
        <Txt key={line} variant="body" tone="headInk" selectable tnum>
          <Txt variant="body" tone="headDim" tnum>
            ${" "}
          </Txt>
          {line}
        </Txt>
      ))}
    </View>
  );
}

/** Getting Kriyan onto a phone (b2.html Install). */
function Install() {
  return (
    <Section title="Install">
      <View style={{ gap: s.s2 }}>
        <View style={{ gap: s.s2, padding: s.s4, borderRadius: r.box, backgroundColor: c.sunken }}>
          <Txt variant="label" style={family("600")}>
            On iPhone
          </Txt>
          {[
            "Open app.kriyan.app in Safari.",
            "Tap Share, then Add to Home Screen.",
            "Open Kriyan from your Home Screen.",
          ].map((line, i) => (
            <Txt key={line} variant="body" tone="ink2">
              {i + 1}. {line}
            </Txt>
          ))}
        </View>
        <View style={{ gap: s.s1, padding: s.s4, borderRadius: r.box, backgroundColor: c.sunken }}>
          <Txt variant="label" style={family("600")}>
            On Android
          </Txt>
          <Txt variant="body" tone="ink2">
            Install the Kriyan app for haptics and reminders that ring on your phone.
          </Txt>
        </View>
      </View>
    </Section>
  );
}

/** The prototype's switch (b2.html `.switch`): green when on, a white knob that slides. */
function Switch({ on }: { on: boolean }) {
  return (
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
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: r.pill,
          backgroundColor: c.headInk,
          boxShadow: shadows.raised,
        }}
      />
    </View>
  );
}

/** What agents may do, and the tokens that let the command line and scripts in. */
function AgentAccess({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const tokens = useAccessTokens();
  const create = useMutation(api.account.createToken);
  const revoke = useMutation(api.account.revokeToken);
  const { today } = useClock();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const { token } = await create({ name: name.trim() });
      setFresh(token);
      setName("");
    } catch (e) {
      showToast(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const day = (ms: number) => formatDate(new Date(ms).toISOString().slice(0, 10), today);
  return (
    <Section title="Agent access">
      <SwitchRow
        label="Let agents edit directly"
        hint={
          profile.agentsEditDirectly
            ? "On: an agent's plans go straight onto your days."
            : "Off: an agent's plans wait for you to accept. Its edits to your tasks apply right away."
        }
        on={profile.agentsEditDirectly}
        onChange={(agentsEditDirectly) => void update({ agentsEditDirectly })}
      />
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        Access tokens are for the command line and scripts. Each token can read and change your plan, so give
        it a name you’ll recognise and revoke it when you stop using it.
      </Txt>
      {fresh ? (
        <View
          role="alert"
          style={{
            gap: s.s2,
            padding: s.s4,
            borderRadius: r.box,
            backgroundColor: c.sunken,
          }}
        >
          <Txt variant="label">Copy your new token now</Txt>
          <Txt variant="meta" tone="ink3">
            You won’t see it again. Paste it when kriyan login asks.
          </Txt>
          <CopyLine text={fresh} what="the token" />
          <Button label="I've copied it" onPress={() => setFresh(null)} style={{ alignSelf: "flex-end" }} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: s.s2 }}>
        <Field
          label="Token name"
          value={name}
          onChangeText={setName}
          placeholder="Laptop CLI"
          onSubmitEditing={() => void submit()}
          containerStyle={{ flex: 1 }}
        />
        <Button
          variant="primary"
          label="Create token"
          onPress={() => void submit()}
          disabled={!name.trim() || busy}
        />
      </View>
      {tokens === undefined ? (
        <Skeleton width="50%" />
      ) : tokens.length === 0 ? (
        <Txt variant="meta" tone="ink3">
          No tokens yet.
        </Txt>
      ) : (
        <View>
          {tokens.map((t) => (
            <View
              key={t._id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s.s3,
                minHeight: 48,
                paddingVertical: s.s2,
                ...rule,
              }}
            >
              <Icon icon={KeyRound} size={16} />
              <View style={{ flex: 1 }}>
                <Txt variant="label">{t.name}</Txt>
                <Txt variant="meta" tone="ink3">
                  {t.hint}… made {day(t.createdAt)}
                  {t.lastUsedAt ? `, last used ${day(t.lastUsedAt)}` : ", never used"}
                </Txt>
              </View>
              <SmallButton
                label="Revoke"
                accessibilityLabel={`Revoke ${t.name}`}
                onPress={() =>
                  void revoke({ id: t._id as Id<"accessTokens"> })
                    .then(() => showToast(`Revoked ${t.name}. Anything using it is signed out.`))
                    .catch((e: unknown) => showToast(errorText(e)))
                }
              />
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

function Deleted() {
  return (
    <Section title="Recently deleted">
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        A task you delete waits 30 days before it’s gone for good, so you can bring it back.
      </Txt>
      <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
        <Button icon={RotateCcw} label="Open recently deleted" onPress={() => router.push("/trash")} />
      </View>
    </Section>
  );
}

/** Sign out sits in the account card at the top; this is the one way to leave for good. */
function DeleteData() {
  const [confirm, setConfirm] = useState(false);
  return (
    <Section title="Account">
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        Deleting your data removes everything you’ve made in Kriyan, and your account.
      </Txt>
      <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
        <Button icon={Trash2} label="Delete my data" onPress={() => setConfirm(true)} />
      </View>
      {confirm ? <DeleteDialog onClose={() => setConfirm(false)} /> : null}
    </Section>
  );
}

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const deleteData = useMutation(api.account.deleteMyData);
  const { signOut } = useClerk();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<View>(null);
  const layer = useRef<View>(null);
  useInertOutside(layer);
  useEffect(() => {
    // Cancel has focus, so a reflexive Enter keeps everything.
    const t = setTimeout(
      () => (cancelRef.current as unknown as { focus?: () => void } | null)?.focus?.(),
      50,
    );
    return () => clearTimeout(t);
  }, []);
  const run = async () => {
    setBusy(true);
    try {
      await forgetDevice();
      await deleteData({});
      await user?.delete();
      await signOut();
    } catch (e) {
      setBusy(false);
      showToast(errorText(e));
    }
  };
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: s.s4,
          backgroundColor: c.scrim,
        }}
      >
        <View
          ref={layer}
          role="alertdialog"
          aria-modal
          aria-label="Delete all your data?"
          style={{
            width: "100%",
            maxWidth: 440,
            gap: s.s4,
            padding: s.s6,
            borderRadius: r.card,
            backgroundColor: c.overlay,
            boxShadow: shadows.overlay,
          }}
        >
          <Txt variant="title" heading={2}>
            Delete all your data?
          </Txt>
          <Txt variant="body" tone="ink2">
            This deletes your tasks and their notes, your spaces, habits and goals, your history, your access
            tokens and devices, and your Kriyan account. It can’t be undone.
          </Txt>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
            <Button ref={cancelRef} label="Cancel" onPress={onClose} disabled={busy} />
            <Button
              variant="primary"
              label={busy ? "Deleting" : "Delete everything"}
              onPress={() => void run()}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
