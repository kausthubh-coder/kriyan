// "Allow reminders on this device" for the web app and the iPhone Home Screen app: Settings' row
// and onboarding's step 7, the only places the web asks for notification permission. Neither
// shows when the server has no VAPID keys (it couldn't send) or the browser has no Web Push.

import { useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useConvexAuth, useQuery } from "convex/react";
import { Bell, BellOff } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { useIsPhone } from "@/theme/layout";
import { c, r, s } from "@/theme/tokens";
import { Button } from "@/ui/Button";
import { showToast } from "@/ui/toast";
import { Txt } from "@/ui/Txt";
import type { ReminderState, WebReminders } from "./AllowReminders";
import { allowReminders, isSubscribed, stopReminders, syncReminders, webPushSupport } from "./register.web";

/**
 * Whether this browser can get reminders, and the one way to turn them on. `available` is
 * undefined while the server's key loads, false without Web Push here or keys on the server.
 * Onboarding's step 7 and Settings both use it.
 */
export function useWebReminders(): WebReminders {
  const authed = useConvexAuth().isAuthenticated;
  const key = useQuery(api.account.webPushKey, authed ? {} : "skip");
  const support = webPushSupport();
  const [state, setState] = useState<ReminderState>("checking");

  useEffect(() => {
    if (!key || support !== "supported") return;
    let live = true;
    void (async () => {
      if (Notification.permission === "denied") return live && setState("blocked");
      // Allowed before: keep the server's copy of this browser's subscription current.
      const on = Notification.permission === "granted" && (await syncReminders(key).catch(() => false));
      if (live) setState(on || (await isSubscribed()) ? "on" : "off");
    })();
    return () => {
      live = false;
    };
  }, [key, support]);

  const allow = () => {
    if (!key) return;
    setState("busy");
    // Straight from the click: Safari asks only when the request follows a tap.
    void allowReminders(key)
      .then((permission) => {
        setState(permission === "granted" ? "on" : permission === "denied" ? "blocked" : "off");
        if (permission === "granted") showToast("Reminders will ring on this device");
      })
      .catch(() => {
        setState("off");
        showToast("This browser couldn't turn on reminders. Try again.");
      });
  };
  const stop = () => {
    setState("busy");
    void stopReminders().finally(() => setState("off"));
  };

  return {
    available: support !== "supported" || key === null ? false : key === undefined ? undefined : true,
    needsHomeScreen: support === "add-to-home-screen" && Boolean(key),
    state,
    allow,
    stop,
  };
}

export function AllowReminders() {
  const { available, needsHomeScreen, state, allow, stop } = useWebReminders();

  if (needsHomeScreen)
    return (
      <Shell
        title="Reminders on this iPhone"
        hint="Add Kriyan to your Home Screen (Share, then Add to Home Screen), open it from there, and allow reminders in its Settings."
      />
    );
  if (!available) return null;

  return (
    <Shell
      title="Reminders on this device"
      hint={
        state === "on"
          ? "Reminders ring here, even with Kriyan closed."
          : state === "blocked"
            ? "This browser blocks notifications from Kriyan. Allow them in the site settings, then come back."
            : "Get a notification when a reminder is due, even with Kriyan closed."
      }
    >
      {state === "on" ? (
        <Button icon={BellOff} label="Stop reminders here" onPress={stop} style={small} />
      ) : state === "blocked" ? null : (
        <Button
          icon={Bell}
          label="Allow reminders on this device"
          onPress={allow}
          disabled={state === "busy" || state === "checking"}
          style={small}
        />
      )}
    </Shell>
  );
}

const small = { borderRadius: r.pill, backgroundColor: c.hover } as const;

/** Settings' row (b2.html `.togrow`): the name and a hint, the button on the right, a dotted rule. */
function Shell({ title, hint, children }: { title: string; hint: string; children?: ReactNode }) {
  const phone = useIsPhone();
  return (
    <View
      style={{
        flexDirection: phone ? "column" : "row",
        alignItems: phone ? "flex-start" : "center",
        gap: phone ? s.s2 : s.s4,
        minHeight: 48,
        paddingVertical: s.s2,
        borderBottomWidth: 1,
        borderStyle: "dotted",
        borderColor: c.lineStrong,
      }}
    >
      <View style={{ flex: phone ? undefined : 1 }}>
        <Txt variant="label">{title}</Txt>
        <Txt variant="meta" tone="ink3">
          {hint}
        </Txt>
      </View>
      {children}
    </View>
  );
}
