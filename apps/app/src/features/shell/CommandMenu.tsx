// The command menu (Ctrl K): add a task from one sentence, go anywhere, find a space or a
// task. Opens with no animation, cursor in the field; every command shows its shortcut.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import { useMutation } from "convex/react";
import { Bot, CalendarDays, Inbox, Layers, Plus, Search, SlidersHorizontal, Sun, Target, type LucideIcon } from "lucide-react-native";
import { api } from "@kriyan/convex/api";
import { startOfWeek } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import { parseTask } from "@kriyan/core/parse";
import { useClock } from "@/data/time";
import { useInboxView, useSpaces, useTodayView, useWeekView, type TaskView } from "@/data/views";
import { errorText } from "@/features/tasks/actions";
import { findSpace } from "@/features/tasks/QuickAdd";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s, shadows, spaceTone } from "@/theme/tokens";
import { Dot, Ring } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { showToast } from "@/ui/toast";
import { useInertOutside } from "@/ui/inert";
import { Txt } from "@/ui/Txt";
import { closeCommand, shellState } from "./context";

interface Item {
  key: string;
  group: "Add" | "Go to" | "Spaces" | "Tasks";
  label: string;
  icon?: LucideIcon;
  leading?: ReactNode;
  hint?: string;
  kbd?: string;
  sub?: ReactNode;
  run: () => void | Promise<void>;
}

const GO: { label: string; href: Href; icon: LucideIcon; kbd?: string; keywords?: string }[] = [
  { label: "Today", href: "/today", icon: Sun, kbd: "T" },
  { label: "Upcoming", href: "/upcoming", icon: CalendarDays, kbd: "U", keywords: "week plan" },
  { label: "Inbox", href: "/inbox", icon: Inbox, kbd: "I" },
  { label: "Browse spaces", href: "/browse", icon: Layers, keywords: "spaces" },
  { label: "Progress", href: "/progress", icon: Target, keywords: "goals habits heatmap time" },
  { label: "Settings", href: "/settings", icon: SlidersHorizontal, keywords: "tokens reminders day" },
  { label: "Connect an AI", href: "/settings", icon: Bot, keywords: "mcp, claude, chatgpt" },
];

export function CommandMenu() {
  const open = shellState.useValue((st) => st.commandOpen);
  if (!open) return null;
  return <Menu />;
}

function Menu() {
  const initial = shellState.useValue((st) => st.commandQuery);
  const [query, setQuery] = useState(initial);
  const [index, setIndex] = useState(0);
  const phone = useIsPhone();
  const roles = useType();
  const { today } = useClock();
  const spaces = useSpaces();
  const inbox = useInboxView();
  const todayView = useTodayView();
  const week = useWeekView(startOfWeek(today));
  const addText = useMutation(api.tasks.addText);
  const input = useRef<TextInput>(null);
  const layer = useRef<View>(null);
  useInertOutside(layer);

  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  const q = query.trim().toLowerCase();
  const parsed = useMemo(() => (q ? parseTask(query.trim(), today) : null), [query, q, today]);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    if (parsed && parsed.title) {
      const space = parsed.spaceName ? findSpace(spaces, parsed.spaceName) : undefined;
      const bits = [
        ...(parsed.spaceName ? [space?.path ?? `New space ${parsed.spaceName}`] : []),
        ...(parsed.date ? [`${formatDay(parsed.date, today)}${parsed.time !== undefined ? `, ${String(Math.floor(parsed.time / 60)).padStart(2, "0")}:${String(parsed.time % 60).padStart(2, "0")}` : ""}`] : []),
        ...(parsed.repeat ? ["Repeats"] : []),
        ...(parsed.reminders.length ? [`${parsed.reminders.length} ${parsed.reminders.length === 1 ? "reminder" : "reminders"}`] : []),
      ];
      out.push({
        key: "add",
        group: "Add",
        label: `Add “${parsed.title}”`,
        icon: Plus,
        kbd: "Enter",
        sub: bits.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s.s2 }}>
            {bits.map((b, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: s.s1, paddingHorizontal: s.s2, height: 24, borderRadius: 12, backgroundColor: c.hover }}>
                {i === 0 && space ? <Dot color={spaceTone(space.color).dot} /> : null}
                <Txt variant="meta" tone="ink2">
                  {b}
                </Txt>
              </View>
            ))}
          </View>
        ) : undefined,
        run: async () => {
          try {
            await addText({ text: query.trim() });
            showToast(`Added: ${parsed.title}`);
          } catch (e) {
            showToast(errorText(e));
          }
        },
      });
    }
    for (const g of GO) {
      if (q && !`${g.label} ${g.keywords ?? ""}`.toLowerCase().includes(q)) continue;
      out.push({ key: `go-${g.label}`, group: "Go to", label: g.label, icon: g.icon, kbd: g.kbd, hint: q ? undefined : g.keywords, run: () => router.navigate(g.href) });
    }
    if (q) {
      for (const sp of spaces ?? []) {
        if (!sp.name.toLowerCase().includes(q)) continue;
        out.push({ key: `sp-${sp._id}`, group: "Spaces", label: sp.path, leading: <Dot color={spaceTone(sp.color).dot} />, run: () => router.navigate(`/space/${sp._id}`) });
      }
      const seen = new Set<string>();
      const pool: TaskView[] = [
        ...(todayView ? [...todayView.anytime, ...todayView.scheduled, ...todayView.earlier] : []),
        ...(inbox ?? []),
        ...(week ? week.days.flatMap((d) => [...d.scheduled, ...d.anytime, ...d.deadlines]) : []),
        ...(week ? [...week.inbox, ...week.unscheduled] : []),
      ];
      for (const t of pool) {
        if (seen.has(t._id) || !t.title.toLowerCase().includes(q)) continue;
        seen.add(t._id);
        out.push({
          key: `t-${t._id}`,
          group: "Tasks",
          label: t.title,
          leading: <Ring color={spaceTone(t.color).dot} done={t.done} size={16} />,
          hint: t.spacePath ?? (t.date ? formatDay(t.date, today) : "Inbox"),
          run: () => router.push(`/task/${t._id}`),
        });
        if (seen.size >= 8) break;
      }
    }
    return out;
  }, [parsed, q, query, spaces, today, todayView, inbox, week, addText]);

  const current = Math.min(index, Math.max(0, items.length - 1));
  const run = (item: Item | undefined) => {
    if (!item) return;
    closeCommand();
    void item.run();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={closeCommand}>
      <Pressable accessibilityLabel="Close" onPress={closeCommand} focusable={false} style={{ position: "absolute", inset: 0, backgroundColor: c.scrim } as object} />
      <View
        ref={layer}
        role="dialog"
        aria-modal
        aria-label="Command menu"
        style={{
          position: "absolute",
          top: phone ? s.s8 : "15%",
          left: phone ? s.s3 : undefined,
          right: phone ? s.s3 : undefined,
          alignSelf: "center",
          width: phone ? undefined : 600,
          maxHeight: "70%",
          borderRadius: r.card,
          backgroundColor: c.overlay,
          boxShadow: shadows.overlay,
          overflow: "hidden",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: s.s3, height: 56, paddingHorizontal: s.s4, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Icon icon={Search} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setIndex(0);
            }}
            placeholder="Search, go to, or type a task like “call mum fri 6pm”"
            placeholderTextColor={hex.ink3}
            accessibilityLabel="Search or type a task"
            autoCapitalize="none"
            onSubmitEditing={() => run(items[current])}
            submitBehavior="submit"
            onKeyPress={(e) => {
              const key = e.nativeEvent.key;
              if (key === "ArrowDown" || key === "ArrowUp") {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                setIndex((i) => (items.length ? (i + (key === "ArrowDown" ? 1 : items.length - 1)) % items.length : 0));
              } else if (key === "Escape") closeCommand();
            }}
            style={[roles.body, { flex: 1, height: "100%", color: c.ink, fontSize: 16, lineHeight: 24 }, Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null]}
          />
        </View>
        <ScrollView role="menu" aria-label="Results" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: s.s2 }}>
          {items.length === 0 ? (
            <Txt variant="body" tone="ink3" style={{ padding: s.s3 }}>
              Nothing matches “{query.trim()}”. Clear the search to see everything.
            </Txt>
          ) : null}
          {items.map((item, i) => (
            <View key={item.key}>
              {i === 0 || items[i - 1]?.group !== item.group ? (
                <Txt variant="caption" tone="ink3" style={{ paddingHorizontal: s.s2, paddingTop: s.s2, paddingBottom: s.s1 }}>
                  {item.group}
                </Txt>
              ) : null}
              <Press
                role="menuitem"
                aria-selected={i === current}
                onPress={() => run(item)}
                onHoverIn={() => setIndex(i)}
                hoverBg={null}
                scale={false}
                style={{
                  flexDirection: "row",
                  alignItems: item.sub ? "flex-start" : "center",
                  gap: s.s3,
                  minHeight: phone ? 44 : 40,
                  paddingVertical: item.sub ? s.s2 : 0,
                  paddingHorizontal: s.s2,
                  borderRadius: r.ctl,
                  backgroundColor: i === current ? c.select : "transparent",
                }}
              >
                <View style={{ width: 18, alignItems: "center", paddingTop: item.sub ? 1 : 0 }}>{item.leading ?? (item.icon ? <Icon icon={item.icon} /> : null)}</View>
                <View style={{ flex: 1, gap: s.s2 }}>
                  <Txt variant="body" tone={i === current ? "ink" : "ink2"} numberOfLines={1}>
                    {item.label}
                  </Txt>
                  {item.sub}
                </View>
                {item.hint ? (
                  <Txt variant="meta" tone="ink3" numberOfLines={1}>
                    {item.hint}
                  </Txt>
                ) : null}
                {item.kbd && !phone ? (
                  <Txt variant="caption" tone="ink3">
                    {item.kbd}
                  </Txt>
                ) : null}
              </Press>
            </View>
          ))}
        </ScrollView>
        {phone ? null : (
          <View style={{ flexDirection: "row", gap: s.s4, paddingVertical: s.s3, paddingHorizontal: s.s4, borderTopWidth: 1, borderTopColor: c.line }}>
            <Txt variant="meta" tone="ink3">
              Enter to run
            </Txt>
            <Txt variant="meta" tone="ink3">
              Arrows to move
            </Txt>
            <Txt variant="meta" tone="ink3">
              Esc to close
            </Txt>
          </View>
        )}
      </View>
    </Modal>
  );
}
