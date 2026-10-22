// Settings: your day, default reminders, agents, connecting an AI, access tokens, account.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Modal, View } from "react-native";
import { useClerk, useUser } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { useMutation } from "convex/react";
import { BookOpen, Bot, Copy, KeyRound, LogOut, Terminal, Trash2 } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import type { Id } from "@kriyan/convex/dataModel";
import { formatClock } from "@kriyan/core/dates";
import { formatDate } from "@kriyan/core/format";
import { parseClock } from "@kriyan/core/parse";
import type { Reminder } from "@kriyan/core/reminders";
import { useClock } from "@/data/time";
import { useAccessTokens, useProfile, type Profile } from "@/data/views";
import { forgetDevice } from "@/features/notifications/register";
import { errorText } from "@/features/tasks/actions";
import { ReminderEditor } from "@/features/tasks/ReminderEditor";
import { useControl, useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { Chip, Field, Skeleton } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { PageHead, Screen, SectionHead } from "@/ui/Screen";
import { showToast } from "@/ui/toast";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";

export const MCP_URL = "https://kriyan.app/mcp";
// The CLI isn't on npm yet, so it runs from a copy of the code; ship-kriyan step 6 says when this changes.
export const CLI_LINE = "bun run kriyan login";
export const MCP_DOCS = "https://kriyan.app/docs/mcp";
export const CLI_DOCS = "https://kriyan.app/docs/cli";

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
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width={`${70 - i * 10}%`} />
          ))}
        </View>
      ) : (
        <>
          <YourDay profile={profile} />
          <DefaultReminders profile={profile} />
          <ConnectAI profile={profile} />
          <Tokens />
          <Account />
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

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const phone = useIsPhone();
  return (
    <View
      style={{
        flexDirection: phone ? "column" : "row",
        alignItems: phone ? "flex-start" : "center",
        gap: phone ? s.s2 : s.s6,
        paddingVertical: s.s2,
      }}
    >
      <View style={{ width: phone ? undefined : 200, gap: 2 }}>
        <Txt variant="label">{label}</Txt>
        {hint ? (
          <Txt variant="meta" tone="ink3">
            {hint}
          </Txt>
        ) : null}
      </View>
      <View
        style={{
          flex: phone ? undefined : 1,
          flexDirection: "row",
          flexWrap: "wrap",
          gap: s.s2,
          alignItems: "center",
        }}
      >
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
      containerStyle={{ width: 120 }}
    />
  );
}

function YourDay({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  const hours = profile.dailyCapacity / 60;
  return (
    <View style={{ gap: s.s2 }}>
      <SectionHead title="Your day" />
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
      <Row label="Daily capacity" hint="Planned work a day can hold, for the load lines">
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
  );
}

function DefaultReminders({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <View style={{ gap: s.s2 }}>
      <SectionHead title="Default reminders" />
      <Txt variant="body" tone="ink3">
        Added to new tasks that have a time. You can change them on any task.
      </Txt>
      <ReminderEditor
        reminders={profile.defaultReminders as Reminder[]}
        timed
        onChange={(defaultReminders) => void update({ defaultReminders })}
      />
    </View>
  );
}

function CopyLine({ icon, text, what }: { icon: typeof Bot; text: string; what: string }) {
  const { ctl } = useControl();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s.s3,
        minHeight: ctl,
        paddingLeft: s.s3,
        borderRadius: r.ctl,
        backgroundColor: c.sunken,
      }}
    >
      <Icon icon={icon} size={16} />
      <Txt variant="body" style={{ flex: 1 }} selectable numberOfLines={1}>
        {text}
      </Txt>
      <Button
        icon={Copy}
        label="Copy"
        accessibilityLabel={`Copy ${what}`}
        onPress={() => void copy(text, what)}
      />
    </View>
  );
}

function ConnectAI({ profile }: { profile: Profile }) {
  const update = useUpdateProfile();
  return (
    <View style={{ gap: s.s3 }} nativeID="connect-ai">
      <SectionHead title="Connect an AI" />
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        Claude, ChatGPT, Cursor and other assistants can read your plan and plan with you. Add Kriyan as an
        MCP server with this address; you’ll sign in when it connects.
      </Txt>
      <CopyLine icon={Bot} text={MCP_URL} what="the MCP address" />
      <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
        <Button icon={BookOpen} label="Read the setup guide" onPress={() => void Linking.openURL(MCP_DOCS)} />
      </View>
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        Or use the command line. In a copy of Kriyan’s code, run this, then paste an access token from below.
      </Txt>
      <CopyLine icon={Terminal} text={CLI_LINE} what="the command" />
      <View style={{ alignSelf: "flex-start", marginLeft: -s.s3 }}>
        <Button icon={BookOpen} label="Read the CLI guide" onPress={() => void Linking.openURL(CLI_DOCS)} />
      </View>
      <Press
        role="switch"
        aria-checked={profile.agentsEditDirectly}
        onPress={() => void update({ agentsEditDirectly: !profile.agentsEditDirectly })}
        scale={false}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: s.s3,
          paddingVertical: s.s2,
          paddingHorizontal: s.s2,
          marginHorizontal: -s.s2,
          borderRadius: r.ctl,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label">Let agents edit directly</Txt>
          <Txt variant="meta" tone="ink3">
            {profile.agentsEditDirectly
              ? "On: an agent's plans go straight onto your days."
              : "Off: an agent's plans wait for you to accept. Its edits to your tasks apply right away."}
          </Txt>
        </View>
        <View
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            padding: 4,
            backgroundColor: profile.agentsEditDirectly ? c.ink : c.lineStrong,
            alignItems: profile.agentsEditDirectly ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: profile.agentsEditDirectly ? c.onInk : c.ink2,
            }}
          />
        </View>
      </Press>
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
    <View style={{ gap: s.s3 }}>
      <SectionHead title="Access tokens" />
      <Txt variant="body" tone="ink3" style={{ maxWidth: 560 }}>
        For the command line and scripts. Each token can read and change your plan, so give it a name you’ll
        recognise and revoke it when you stop using it.
      </Txt>
      {fresh ? (
        <View
          role="alert"
          style={{
            gap: s.s2,
            padding: s.s3,
            borderRadius: r.card,
            backgroundColor: c.raised,
            boxShadow: shadows.raised,
          }}
        >
          <Txt variant="label">Copy your new token now</Txt>
          <Txt variant="meta" tone="ink3">
            You won’t see it again. Paste it when kriyan login asks.
          </Txt>
          <CopyLine icon={KeyRound} text={fresh} what="the token" />
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
              style={{ flexDirection: "row", alignItems: "center", gap: s.s3, paddingVertical: s.s2 }}
            >
              <Icon icon={KeyRound} size={16} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label">{t.name}</Txt>
                <Txt variant="meta" tone="ink3">
                  {t.hint}… made {day(t.createdAt)}
                  {t.lastUsedAt ? `, last used ${day(t.lastUsedAt)}` : ", never used"}
                </Txt>
              </View>
              <Button
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
    </View>
  );
}

function Account() {
  const { signOut } = useClerk();
  const { user } = useUser();
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={{ gap: s.s3 }}>
      <SectionHead title="Account" />
      {user ? (
        <Txt variant="body" tone="ink3">
          Signed in as {user.primaryEmailAddress?.emailAddress ?? "you"}
        </Txt>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2, marginLeft: -s.s3 }}>
        <Button
          icon={LogOut}
          label="Sign out"
          onPress={() => void forgetDevice().finally(() => void signOut())}
        />
        <Button icon={Trash2} label="Delete my data" onPress={() => setConfirm(true)} />
      </View>
      {confirm ? <DeleteDialog onClose={() => setConfirm(false)} /> : null}
    </View>
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
