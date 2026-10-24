// Settings (b2.html?screen=settings): who's signed in, then your day, default reminders, agents
// and the command line, access tokens, recently deleted, and deleting your data.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Modal, Platform, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useMutation } from "convex/react";
import {
  BellRing,
  BookOpen,
  KeyRound,
  Link,
  RotateCcw,
  Share,
  SquarePlus,
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
import { ensureNotifications, forgetDevice } from "@/features/notifications/register";
import { canWebPush, currentEndpoint, needsInstall, sendTestReminder } from "@/features/pwa/install";
import { SectionLabel } from "@/features/progress/SectionLabel";
import { errorText } from "@/features/tasks/actions";
import { ReminderEditor } from "@/features/tasks/ReminderEditor";
import { useIsPhone } from "@/theme/layout";
import { c, family, r, s, shadows } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageHead, Screen } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";

export const MCP_URL = "https://kriyan.app/mcp";
// The CLI isn't on npm yet, so it runs from a copy of the code; ship-kriyan step 6 says when this changes.
export const CLI_LINE = "bun run kriyan login";
export const MCP_DOCS = "https://kriyan.app/docs/mcp";
export const CLI_DOCS = "https://kriyan.app/docs/cli";

const MONO = Platform.OS === "web" ? "ui-monospace, Menlo, Consolas, monospace" : "monospace";

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
  return (
    <Screen title="Settings" back>
      <PageHead big title="Settings" />
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
          <YourDay profile={profile} />
          <DefaultReminders profile={profile} />
          {Platform.OS === "web" ? <ThisDevice /> : null}
          <ConnectAI profile={profile} />
          <Tokens />
          <Deleted />
          <DeleteData />
        </>
      )}
    </Screen>
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
    <View nativeID={id} style={{ gap: s.s2 }}>
      <SectionLabel title={title} />
      {children}
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
        borderRadius: r.sheet,
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
      <Button
        label="Sign out"
        onPress={() => void forgetDevice().finally(() => void signOut())}
        style={small}
      />
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
      containerStyle={{ width: 96 }}
    />
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
          {[4, 5, 6, 7, 8].map((h) => (
            <Chip
              key={h}
              label={`${h} h`}
              on={hours === h}
              onPress={() => void update({ dailyCapacity: h * 60 })}
            />
          ))}
        </Row>
      </View>
    </Section>
  );
}

function DefaultReminders({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <Section title="Default reminders">
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

/**
 * The web app's reminders on this device. An iPhone gets them only from the Home Screen web app
 * (iOS 16.4 and later), so Safari shows how to add it there first; other browsers turn them on
 * here and can send themselves a test.
 */
function ThisDevice() {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const install = needsInstall();
  const able = canWebPush();
  useEffect(() => {
    if (!able) return;
    void currentEndpoint().then((endpoint) =>
      setOn(
        Boolean(endpoint) && typeof Notification !== "undefined" && Notification.permission === "granted",
      ),
    );
  }, [able]);
  const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
  return (
    <Section title="Reminders on this device">
      {install ? (
        <View style={{ gap: s.s2 }}>
          <Txt variant="body" tone="ink3">
            On iPhone, reminders come to Kriyan on your Home Screen. It opens full screen, like any app.
          </Txt>
          <Row label="1. Tap Share in Safari's toolbar">
            <Icon icon={Share} />
          </Row>
          <Row label="2. Tap Add to Home Screen">
            <Icon icon={SquarePlus} />
          </Row>
          <Row label="3. Open Kriyan from your Home Screen" hint="Then turn reminders on here.">
            {null}
          </Row>
        </View>
      ) : !able ? (
        <Txt variant="body" tone="ink3">
          {"This browser can't show reminders. The Android app and Chrome, Edge, Firefox or Safari can."}
        </Txt>
      ) : on ? (
        <Row label="On for this browser" hint="Reminders arrive here even when Kriyan is closed.">
          <Button
            icon={BellRing}
            label="Send a test reminder"
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void sendTestReminder()
                .then((sent) => showToast(sent ? "Test reminder sent" : "Turn reminders on first"))
                .catch((e: unknown) => showToast(errorText(e)))
                .finally(() => setBusy(false));
            }}
          />
        </Row>
      ) : (
        <Row
          label="Off for this browser"
          hint={
            denied
              ? "Notifications are blocked for this site. Allow them in the browser's site settings."
              : undefined
          }
        >
          <Button
            variant="primary"
            icon={BellRing}
            label="Turn on reminders"
            disabled={busy || denied}
            onPress={() => {
              setBusy(true);
              void ensureNotifications()
                .then((ok) => {
                  setOn(ok);
                  if (!ok) showToast("Reminders stay off: notifications weren't allowed");
                })
                .finally(() => setBusy(false));
            }}
          />
        </Row>
      )}
    </Section>
  );
}

/** A value to copy, in monospace, with its Copy button (b2.html `.conn-r code`). */
function CopyLine({ text, what, label = "Copy" }: { text: string; what: string; label?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: s.s2 }}>
      <View
        style={{
          flexShrink: 1,
          paddingHorizontal: s.s3,
          paddingVertical: s.s2,
          borderRadius: r.ctl,
          backgroundColor: c.hover,
        }}
      >
        <Txt variant="body" selectable numberOfLines={1} style={{ fontFamily: MONO }}>
          {text}
        </Txt>
      </View>
      <Button
        label={label}
        accessibilityLabel={`Copy ${what}`}
        onPress={() => void copy(text, what)}
        style={small}
      />
    </View>
  );
}

/** One way to connect (b2.html `.conn-r`): an icon, what it is, and what to do. */
function ConnRow({
  icon,
  title,
  meta,
  children,
  last,
}: {
  icon: typeof Link;
  title: string;
  meta: string;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <View style={{ gap: s.s3, paddingVertical: s.s3, ...(last ? null : rule) }}>
      <View style={{ flexDirection: "row", gap: s.s3 }}>
        <View style={{ paddingTop: 2 }}>
          <Icon icon={icon} size={20} tone="ink2" />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="label" style={family("600")}>
            {title}
          </Txt>
          <Txt variant="meta" tone="ink3">
            {meta}
          </Txt>
        </View>
      </View>
      {children ? <View style={{ gap: s.s2 }}>{children}</View> : null}
    </View>
  );
}

function ConnectAI({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <Section title="Agents and automations" id="connect-ai">
      <View
        style={{
          paddingHorizontal: s.s4,
          paddingVertical: s.s1,
          borderRadius: r.sheet,
          backgroundColor: c.sunken,
        }}
      >
        <ConnRow
          icon={Link}
          title="MCP server"
          meta="For Claude, ChatGPT, Cursor and other assistants. Add Kriyan as an MCP server with this address; you’ll sign in when it connects."
        >
          <CopyLine text={MCP_URL} what="the MCP address" label="Copy URL" />
          <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
            <Button
              icon={BookOpen}
              label="Read the setup guide"
              onPress={() => void Linking.openURL(MCP_DOCS)}
            />
          </View>
        </ConnRow>
        <ConnRow
          icon={Terminal}
          title="Command line"
          meta="For scripts and scheduled runs. In a copy of Kriyan’s code, run this, then paste an access token from below."
          last
        >
          <CopyLine text={CLI_LINE} what="the command" />
          <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
            <Button
              icon={BookOpen}
              label="Read the CLI guide"
              onPress={() => void Linking.openURL(CLI_DOCS)}
            />
          </View>
        </ConnRow>
      </View>
      <Press
        role="switch"
        aria-checked={profile.agentsEditDirectly}
        accessibilityLabel="Let agents edit directly"
        onPress={() => void update({ agentsEditDirectly: !profile.agentsEditDirectly })}
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
          <Txt variant="label">Let agents edit directly</Txt>
          <Txt variant="meta" tone="ink3">
            {profile.agentsEditDirectly
              ? "On: an agent's plans go straight onto your days."
              : "Off: an agent's plans wait for you to accept. Its edits to your tasks apply right away."}
          </Txt>
        </View>
        <Switch on={profile.agentsEditDirectly} />
      </Press>
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

function Tokens() {
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
    <Section title="Access tokens">
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        For the command line and scripts. Each token can read and change your plan, so give it a name you’ll
        recognise and revoke it when you stop using it.
      </Txt>
      {fresh ? (
        <View
          role="alert"
          style={{
            gap: s.s2,
            padding: s.s4,
            borderRadius: r.sheet,
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
              <Button
                label="Revoke"
                accessibilityLabel={`Revoke ${t.name}`}
                style={small}
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
