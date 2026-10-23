// Toasts: news from somewhere else, with one action (Undo). Five seconds, then gone, but the
// clock stops while the pointer or focus is on a toast, so reaching Undo never races it.
// Ctrl+Z runs the newest Undo from anywhere (features/shell/shortcuts.ts).

import { View } from "react-native";
import { useIsPhone } from "@/theme/layout";
import { c, r, s, shadows } from "@/theme/tokens";
import { createStore } from "@/data/store";
import { Button } from "./Button";
import { Txt } from "./Txt";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

const toasts = createStore<Toast[]>([]);
let nextId = 1;

/** Time each toast has left; `handle` is null while it's held open. */
const clocks = new Map<
  number,
  { left: number; since: number; handle: ReturnType<typeof setTimeout> | null }
>();

function startClock(id: number) {
  const clock = clocks.get(id);
  if (!clock || clock.handle) return;
  clock.since = Date.now();
  clock.handle = setTimeout(() => dismissToast(id), clock.left);
}

function holdClock(id: number) {
  const clock = clocks.get(id);
  if (!clock?.handle) return;
  clearTimeout(clock.handle);
  clock.handle = null;
  // Leaving gives at least a moment to read it again.
  clock.left = Math.max(1500, clock.left - (Date.now() - clock.since));
}

export function showToast(text: string, action?: Toast["action"], ms = 5000): number {
  const id = nextId++;
  toasts.set((list) => [...list.slice(-2), { id, text, ...(action ? { action } : {}) }]);
  clocks.set(id, { left: ms, since: 0, handle: null });
  startClock(id);
  return id;
}

/** Runs the newest toast's action, as its button would. False when no toast has one. */
export function runNewestAction(): boolean {
  const newest = [...toasts.get()].reverse().find((t) => t.action);
  if (!newest?.action) return false;
  newest.action.run();
  dismissToast(newest.id);
  return true;
}

/** Changes a toast's text in place (e.g. once the server says when a repeat comes next). */
export function updateToast(id: number, text: string) {
  toasts.set((list) => list.map((t) => (t.id === id ? { ...t, text } : t)));
}

export function dismissToast(id: number) {
  const clock = clocks.get(id);
  if (clock?.handle) clearTimeout(clock.handle);
  clocks.delete(id);
  toasts.set((list) => list.filter((t) => t.id !== id));
}

export function ToastHost({ bottom }: { bottom: number }) {
  const list = toasts.useValue((t) => t);
  const phone = useIsPhone();
  if (!list.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        alignItems: "center",
        gap: s.s2,
        paddingHorizontal: s.s4,
        zIndex: 20,
      }}
    >
      {list.map((t) => (
        <View
          key={t.id}
          role="status"
          aria-live="polite"
          onPointerEnter={() => holdClock(t.id)}
          onPointerLeave={() => startClock(t.id)}
          onFocus={() => holdClock(t.id)}
          onBlur={() => startClock(t.id)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s.s3,
            maxWidth: phone ? "100%" : 480,
            alignSelf: phone ? "stretch" : "center",
            paddingVertical: s.s1,
            paddingLeft: s.s4,
            paddingRight: s.s1,
            borderRadius: r.card,
            backgroundColor: c.overlay,
            boxShadow: shadows.overlay,
          }}
        >
          <Txt variant="body" style={{ flex: 1 }} numberOfLines={2}>
            {t.text}
          </Txt>
          {t.action ? (
            <Button
              label={t.action.label}
              onPress={() => {
                t.action?.run();
                dismissToast(t.id);
              }}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}
