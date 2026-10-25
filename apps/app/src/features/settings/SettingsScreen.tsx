// Settings (docs/design/v5 prototype `page("settings")`): your day (wake up, review, wind down)
// and what Today shows first, as the prototype has them; then what it doesn't picture: how it
// feels, default reminders, capacity and the semester, the command line and its tokens,
// installing it, recently deleted, and the account. Connecting agents lives on Agents.

import { DottedRule } from "@/ui/DottedRule";
import { AllowReminders } from "@/features/notifications/AllowReminders";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import { KeyRound, Play, RotateCcw, Trash2 } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import type { Reminder } from "@kriyan/core/reminders";
import { useClock } from "@/data/time";
import { useAccessTokens, useProfile, type Profile } from "@/data/views";
import { hapticsOn, setHapticsOn, setSoundsOn, soundsOn } from "@/features/feel/setting";
import { playSound } from "@/features/feel/sound";
import { forgetDevice } from "@/features/notifications/register";
import { canVibrate } from "@/features/feel/vibrate";
import { SmallButton } from "@/features/progress/SmallButton";
import { Segmented, StackedSetting, StepperRow, ToggleRow } from "@/features/shell/controls";
import { GroupLabel, Page } from "@/features/shell/Page";
import { errorText } from "@/features/tasks/actions";
import { commitHaptic, toggleHaptic } from "@/features/tasks/haptics";
import { DayPicker } from "@/features/tasks/pickers";
import { ReminderEditor } from "@/features/tasks/ReminderEditor";
import { c, family, r, s, shadows } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Popover } from "@/ui/Popover";
import { showToast } from "@/ui/toast";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";

import { CLI_LINE, GITHUB_URL } from "./links";
import { saveTodayPrefs, useTodayPrefs, type EarlierWindow, type TodayLayout } from "./todayPrefs";

// Onboarding copies the MCP address from here.
export { MCP_URL } from "./links";

/** The CLI isn't on npm, so its setup starts from a clone. */
const CLI_SETUP = [`git clone ${GITHUB_URL}`, "cd kriyan && bun install", CLI_LINE];

/** The prototype's small round button on a card (b2.html `.btn-sm`). */
const small = { borderRadius: r.pill, backgroundColor: c.hover } as const;

async function copy(text: string, what: string) {
  await Clipboard.setStringAsync(text);
  showToast(`Copied ${what}`);
}

export function SettingsScreen() {
  const profile = useProfile();
  return (
    <Page tabTitle="Settings" barTitle="Settings">
      {profile === undefined ? (
        <View testID="skeleton" style={{ gap: s.s4, paddingTop: s.s6 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={`${70 - i * 10}%`} />
          ))}
        </View>
      ) : (
        <>
          <YourDay profile={profile} />
          <TodayShows />
          <Feel profile={profile} />
          <DefaultReminders profile={profile} />
          <Planning profile={profile} />
          <Semester profile={profile} />
          <CommandLine />
          <Install />
          <Deleted />
          <Account profile={profile} />
        </>
      )}
    </Page>
  );
}

function useUpdateProfile() {
  const update = useMutation(api.account.updateProfile);
  return (patch: Parameters<typeof update>[0]) =>
    update(patch).catch((e: unknown) => showToast(errorText(e)));
}

/** A group: the small uppercase label, then its rows. */
function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <View nativeID={id}>
      <GroupLabel>{title.toUpperCase()}</GroupLabel>
      <View style={{ gap: s.s2, paddingTop: s.s1 }}>{children}</View>
    </View>
  );
}

/** Unset means 20:00, like the backend. */
const DEFAULT_REVIEW = 20 * 60;
/** The shortest day the steppers allow, so Wind down always stays after Wake up. */
const SHORTEST_DAY = 60;

/** The prototype's three times: when the day starts, when Review today shows up, when it ends. */
function YourDay({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const review = profile.reviewTime ?? DEFAULT_REVIEW;
  return (
    <View>
      <GroupLabel>YOUR DAY</GroupLabel>
      <StepperRow
        label="Wake up"
        value={profile.dayStart}
        text={formatClock(profile.dayStart)}
        max={profile.dayEnd - SHORTEST_DAY}
        onChange={(dayStart) => void update({ dayStart })}
      />
      <StepperRow
        label="Review today"
        value={review}
        text={formatClock(review)}
        onChange={(reviewTime) => void update({ reviewTime })}
      />
      <StepperRow
        label="Wind down"
        value={profile.dayEnd}
        text={formatClock(profile.dayEnd)}
        min={profile.dayStart + SHORTEST_DAY}
        max={1440}
        onChange={(dayEnd) => void update({ dayEnd })}
      />
    </View>
  );
}

const EARLIER: [EarlierWindow, string][] = [
  ["none", "Don't show"],
  ["week", "1 week"],
  ["month", "1 month"],
  ["all", "All"],
];
const LAYOUTS: [TodayLayout, string][] = [
  ["blocks", "Time blocks"],
  ["list", "List"],
];

/** What Today leads with: what's left from earlier, blocks or a list, and three switches. */
function TodayShows() {
  const prefs = useTodayPrefs();
  return (
    <View>
      <GroupLabel>TODAY SHOWS</GroupLabel>
      <StackedSetting label="What's left from earlier">
        <Segmented
          label="What's left from earlier"
          value={prefs.earlierWindow}
          options={EARLIER}
          onChange={(earlierWindow) => saveTodayPrefs({ earlierWindow })}
        />
      </StackedSetting>
      <StackedSetting label="Today shows">
        <Segmented
          label="Today shows"
          value={prefs.todayLayout}
          options={LAYOUTS}
          onChange={(todayLayout) => saveTodayPrefs({ todayLayout })}
        />
      </StackedSetting>
      <ToggleRow
        label="Hide finished items"
        on={prefs.hideDone}
        onChange={(hideDone) => saveTodayPrefs({ hideDone })}
      />
      <ToggleRow
        label="Show each task's space"
        on={prefs.showSpace}
        onChange={(showSpace) => saveTodayPrefs({ showSpace })}
      />
      <ToggleRow
        label={'Show "Now" on what\'s happening'}
        on={prefs.nowBadge}
        onChange={(nowBadge) => saveTodayPrefs({ nowBadge })}
      />
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

/** One setting: its name on the left and the control on the right, over a dotted rule (v5 `.opt`). */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: s.s4, minHeight: 56, paddingVertical: s.s2 }}
    >
      <Txt variant="subhead" style={[family("500"), { flex: 1 }]}>
        {label}
      </Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, alignItems: "center" }}>
        {children}
      </View>
      <DottedRule width={2} />
    </View>
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
        <ToggleRow
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
          <ToggleRow
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

const CAPACITY: [string, string][] = [4, 5, 6, 7, 8].map((h) => [String(h * 60), `${h}h`]);

/** How much planned work a day holds, for the Week's load lines. */
function Planning({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <Section title="Planning">
      <StackedSetting label="Daily capacity">
        <Segmented
          label="Daily capacity"
          value={String(profile.dailyCapacity)}
          options={CAPACITY}
          onChange={(v) => void update({ dailyCapacity: Number(v) })}
        />
      </StackedSetting>
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

/**
 * The command line: how to set it up, and the access tokens that let it and scripts in. MCP and
 * whether agents may edit directly live on Agents.
 */
function CommandLine() {
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
    <Section title="Command line">
      <TerminalBlock lines={[...CLI_SETUP, ...CLI_EXAMPLES]} label="Command line setup and examples" />
      <View style={{ alignSelf: "flex-start" }}>
        <SmallButton
          label="Copy setup"
          accessibilityLabel="Copy the setup commands"
          onPress={() => void copy(CLI_SETUP.join("\n"), "the setup commands")}
        />
      </View>
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
              <DottedRule />
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

/** Who's signed in with Sign out, and the one way to leave for good. */
function Account({ profile }: { profile: Profile }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Section title="Account">
      <AccountCard profile={profile} />
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
