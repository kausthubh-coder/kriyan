// Toasts: news from somewhere else, with one action (Undo). Five seconds, then gone.

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

export function showToast(text: string, action?: Toast["action"], ms = 5000): number {
  const id = nextId++;
  toasts.set((list) => [...list.slice(-2), { id, text, ...(action ? { action } : {}) }]);
  setTimeout(() => dismissToast(id), ms);
  return id;
}

/** Changes a toast's text in place (e.g. once the server says when a repeat comes next). */
export function updateToast(id: number, text: string) {
  toasts.set((list) => list.map((t) => (t.id === id ? { ...t, text } : t)));
}

export function dismissToast(id: number) {
  toasts.set((list) => list.filter((t) => t.id !== id));
}

export function ToastHost({ bottom }: { bottom: number }) {
  const list = toasts.useValue((t) => t);
  const phone = useIsPhone();
  if (!list.length) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center", gap: s.s2, paddingHorizontal: s.s4, zIndex: 20 }}
    >
      {list.map((t) => (
        <View
          key={t.id}
          role="status"
          aria-live="polite"
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
