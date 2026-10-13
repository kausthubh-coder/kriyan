// Reminders on Android. The server sends them through Expo push (channel "reminders"), so a
// task added on the web or by an agent still rings the phone. Permission is asked the first
// time a person adds a reminder, never at launch. Tapping a reminder opens its task.
//
// When this build can't get a push token (no Firebase config), the app schedules the next
// week's reminders on the device instead, so reminders still arrive.

import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useConvexAuth } from "convex/react";
import { api } from "@kriyan/convex/api";
import { addDays, formatClock, startOfWeek } from "@kriyan/core/dates";
import { reminderInstants } from "@kriyan/core/reminders";
import { convex } from "@/data/convex";
import { createStore } from "@/data/store";
import { useClock } from "@/data/time";
import { useWeekView, type TaskView } from "@/data/views";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** "push": the server sends reminders. "local": this device schedules them. */
const delivery = createStore<"unknown" | "push" | "local" | "off">("unknown");

async function channel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Reminders",
    importance: Notifications.AndroidImportance.HIGH,
  });
}

async function registerToken(): Promise<boolean> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await convex.mutation(api.account.registerPush, { token, platform: Platform.OS });
    return true;
  } catch {
    return false;
  }
}

/** Asks for permission (once) and registers this device. Call when a reminder is added. */
export async function ensureNotifications(): Promise<boolean> {
  await channel();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") {
    delivery.set("off");
    return false;
  }
  delivery.set((await registerToken()) ? "push" : "local");
  return true;
}

function openFrom(response: Notifications.NotificationResponse | null | undefined) {
  const taskId = response?.notification.request.content.data?.taskId;
  if (typeof taskId === "string") router.push(`/task/${taskId}`);
}

/** Mount once in the signed-in app. */
export function useNotifications() {
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) return;
    // Already allowed: register quietly. Never prompt here.
    void Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === "granted") void ensureNotifications();
    });
  }, [isAuthenticated]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (last) openFrom(last);
  }, [last]);

  useLocalReminders();
}

const LOCAL_PREFIX = "kriyan-reminder-";

function useLocalReminders() {
  const mode = delivery.useValue((d) => d);
  const { today, timeZone } = useClock();
  const thisWeek = useWeekView(startOfWeek(today));
  const nextWeek = useWeekView(addDays(startOfWeek(today), 7));
  useEffect(() => {
    if (mode !== "local" || !thisWeek || !nextWeek) return;
    const horizon = addDays(today, 7);
    const tasks: TaskView[] = [...thisWeek.days, ...nextWeek.days]
      .filter((d) => d.date >= today && d.date <= horizon)
      .flatMap((d) => [...d.scheduled, ...d.anytime])
      .filter((t) => !t.done && !t.proposedBy && t.reminders.length > 0 && t.date);
    let cancelled = false;
    void (async () => {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const n of scheduled) {
        if (n.identifier.startsWith(LOCAL_PREFIX))
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
      const now = Date.now();
      for (const t of tasks) {
        if (cancelled) return;
        for (const at of reminderInstants(
          { date: t.date as string, time: t.time ?? undefined },
          t.reminders,
          timeZone,
        )) {
          if (at <= now) continue;
          await Notifications.scheduleNotificationAsync({
            identifier: `${LOCAL_PREFIX}${t._id}-${t.date}-${at}`,
            content: {
              title: t.title,
              body: t.time !== null ? `Starts at ${formatClock(t.time)}` : "Today",
              data: { taskId: t._id },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: new Date(at),
              channelId: "reminders",
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, thisWeek, nextWeek, today, timeZone]);
}
