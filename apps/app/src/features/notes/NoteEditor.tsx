// The Markdown note on a task or a space: headings, checklists, bullets, numbered lists,
// quotes and links. Type "/" for blocks (web) or use the toolbar above the keyboard
// (Android); Markdown prefixes like "# " or "- [ ] " work too. Saved as Markdown.

import { useEffect, useRef, useState } from "react";
import { Keyboard, Linking, Platform, View, type TextStyle } from "react-native";
import { Check, Heading, Link2, List, ListOrdered, ListTodo, Quote, type LucideIcon } from "lucide-react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { createStore } from "@/data/store";
import { useIsPhone, useType } from "@/theme/layout";
import { c, hex, r, s, shadows } from "@/theme/tokens";
import { AutoInput } from "@/ui/AutoInput";
import { Button } from "@/ui/Button";
import { Field } from "@/ui/bits";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Txt } from "@/ui/Txt";
import { lineToBlock, linkSegments, newId, parseNote, serializeNote, type Block, type BlockKind } from "./markdown";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  /** Shown when the note is empty. */
  placeholder?: string;
}

const COMMANDS: { kind: BlockKind | "link"; label: string; icon: LucideIcon; hint: string }[] = [
  { kind: "h1", label: "Heading", icon: Heading, hint: "#" },
  { kind: "todo", label: "Checklist", icon: ListTodo, hint: "[ ]" },
  { kind: "bullet", label: "Bullet list", icon: List, hint: "-" },
  { kind: "numbered", label: "Numbered list", icon: ListOrdered, hint: "1." },
  { kind: "quote", label: "Quote", icon: Quote, hint: ">" },
  { kind: "link", label: "Link", icon: Link2, hint: "[ ]( )" },
];

const CONTINUES: BlockKind[] = ["todo", "done", "bullet", "numbered", "quote"];

export function NoteEditor({ value, onChange, placeholder }: Props) {
  const phone = useIsPhone();
  const roles = useType();
  const [blocks, setBlocks] = useState<Block[]>(() => parseNote(value));
  const [focus, setFocus] = useState<number | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const lastSaved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(blocks);

  // A change from elsewhere (an agent, another device) replaces the note when we're not editing.
  useEffect(() => {
    if (focus === null && value !== lastSaved.current) {
      setBlocks(parseNote(value));
      lastSaved.current = value;
    }
  }, [value, focus]);

  const save = () => {
    const md = serializeNote(latest.current);
    if (md !== lastSaved.current) {
      lastSaved.current = md;
      onChange(md);
    }
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      save();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const commit = (next: Block[]) => {
    setBlocks(next);
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  };

  const setKind = (i: number, kind: BlockKind) => {
    const b = blocks[i];
    if (!b) return;
    const next = [...blocks];
    next[i] = { ...b, kind: b.kind === kind && kind !== "p" ? "p" : kind, text: b.text.startsWith("/") ? "" : b.text };
    commit(next);
    setFocus(i);
  };

  const onText = (i: number, text: string) => {
    const b = blocks[i];
    if (!b) return;
    const next = [...blocks];
    if (text.includes("\n")) {
      // Enter splits the block; lists continue, an empty list item ends the list.
      const [head, ...rest] = text.split("\n");
      const tail = rest.join("\n");
      if (head === "" && CONTINUES.includes(b.kind) && tail === "") {
        next[i] = { ...b, kind: "p", text: "" };
        commit(next);
        return;
      }
      next[i] = { ...b, text: head ?? "" };
      const kind: BlockKind = CONTINUES.includes(b.kind) ? (b.kind === "done" ? "todo" : b.kind) : "p";
      next.splice(i + 1, 0, { id: newId(), kind, text: tail });
      commit(next);
      setFocus(i + 1);
      return;
    }
    if (b.kind === "p") {
      const typed = lineToBlock(text);
      if (typed.kind !== "p") {
        next[i] = { ...b, ...typed };
        commit(next);
        return;
      }
    }
    next[i] = { ...b, text };
    commit(next);
    setMenuIndex(0);
  };

  const onBackspaceAtStart = (i: number) => {
    const b = blocks[i];
    if (!b) return;
    if (b.kind !== "p") {
      const next = [...blocks];
      next[i] = { ...b, kind: "p" };
      commit(next);
      return;
    }
    if (i === 0) return;
    const prev = blocks[i - 1];
    if (!prev) return;
    const next = [...blocks];
    next[i - 1] = { ...prev, text: prev.text + b.text };
    next.splice(i, 1);
    commit(next);
    setFocus(i - 1);
  };

  const toggleDone = (i: number) => {
    const b = blocks[i];
    if (!b) return;
    const next = [...blocks];
    next[i] = { ...b, kind: b.kind === "done" ? "todo" : "done" };
    commit(next);
    if (timer.current) clearTimeout(timer.current);
    save();
  };

  const slashQuery = focus !== null && Platform.OS === "web" && blocks[focus]?.kind === "p" && blocks[focus]?.text.startsWith("/") ? (blocks[focus]?.text.slice(1).toLowerCase() ?? "") : null;
  const matches = slashQuery === null ? [] : COMMANDS.filter((cmd) => cmd.label.toLowerCase().includes(slashQuery));

  const runCommand = (i: number, kind: BlockKind | "link") => {
    if (kind === "link") {
      const b = blocks[i];
      if (b?.text.startsWith("/")) {
        const next = [...blocks];
        next[i] = { ...b, text: "" };
        commit(next);
      }
      setLinkFor(i);
      return;
    }
    setKind(i, kind);
  };

  const textStyle = (kind: BlockKind): TextStyle => {
    if (kind === "h1") return { ...roles.title, color: c.ink };
    if (kind === "h2") return { ...roles.subhead, color: c.ink };
    if (kind === "h3") return { ...roles.label, color: c.ink };
    if (kind === "done") return { ...roles.body, color: c.ink3, textDecorationLine: "line-through" };
    if (kind === "quote") return { ...roles.body, color: c.ink3 };
    return { ...roles.body, color: c.ink2 };
  };

  useEffect(() => {
    if (focus === null) {
      toolbar.set(null);
      return;
    }
    toolbar.set({
      onPick: (kind) => runCommand(focus, kind),
      onDone: () => {
        Keyboard.dismiss();
        setFocus(null);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  useEffect(() => () => toolbar.set(null), []);

  const numbers: number[] = [];
  blocks.forEach((b, i) => numbers.push(b.kind === "numbered" ? (blocks[i - 1]?.kind === "numbered" ? (numbers[i - 1] ?? 0) + 1 : 1) : 0));
  const empty = blocks.length === 1 && blocks[0]?.text === "" && blocks[0]?.kind === "p";

  return (
    <View style={{ gap: s.s2 }}>
      {blocks.map((b, i) => {
        const number = numbers[i] ?? 0;
        const editing = focus === i;
        const style = textStyle(b.kind);
        return (
          <View key={b.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: s.s3, marginTop: b.kind.startsWith("h") && i > 0 ? s.s2 : 0 }}>
            {b.kind === "todo" || b.kind === "done" ? (
              <Press
                role="checkbox"
                aria-checked={b.kind === "done"}
                accessibilityLabel={`${b.kind === "done" ? "Uncheck" : "Check"}: ${b.text || "item"}`}
                onPress={() => toggleDone(i)}
                hoverBg={null}
                style={{ width: phone ? 44 : 24, height: phone ? 44 : 24, margin: phone ? -10 : -2, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    borderWidth: b.kind === "done" ? 0 : 1.5,
                    borderColor: c.lineStrong,
                    backgroundColor: b.kind === "done" ? c.ink3 : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {b.kind === "done" ? <Check size={12} color={hex.bg} strokeWidth={3} /> : null}
                </View>
              </Press>
            ) : null}
            {b.kind === "bullet" ? (
              <View style={{ width: 16, height: style.lineHeight, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.ink3 }} />
              </View>
            ) : null}
            {b.kind === "numbered" ? (
              <Txt variant="body" tone="ink3" tnum style={{ minWidth: 16 }}>
                {number}.
              </Txt>
            ) : null}
            {b.kind === "quote" ? <View style={{ width: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: c.lineStrong, marginRight: s.s1 }} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <AutoInput
                  autoFocus
                  lineHeight={style.lineHeight ?? 20}
                  value={b.text}
                  accessibilityLabel={`Note, ${COMMANDS.find((x) => x.kind === b.kind)?.label ?? "text"}`}
                  placeholder={empty ? (placeholder ?? (Platform.OS === "web" && !phone ? "Type / for blocks" : "Add a note")) : undefined}
                  placeholderTextColor={hex.ink3}
                  onChangeText={(t) => onText(i, t)}
                  onBlur={() => {
                    setTimeout(() => setFocus((f) => (f === i ? null : f)), 120);
                    if (timer.current) clearTimeout(timer.current);
                    save();
                  }}
                  onKeyPress={(e) => {
                    const key = e.nativeEvent.key;
                    if (slashQuery !== null && matches.length) {
                      if (key === "ArrowDown" || key === "ArrowUp") {
                        (e as unknown as { preventDefault: () => void }).preventDefault?.();
                        setMenuIndex((m) => (m + (key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                        return;
                      }
                      if (key === "Enter") {
                        (e as unknown as { preventDefault: () => void }).preventDefault?.();
                        const cmd = matches[menuIndex];
                        if (cmd) runCommand(i, cmd.kind);
                        return;
                      }
                    }
                    if (key === "Escape" && slashQuery !== null) {
                      onText(i, "");
                      return;
                    }
                    if (key === "Backspace" && b.text === "") onBackspaceAtStart(i);
                  }}
                  style={style}
                />
              ) : (
                <Press
                  role="button"
                  accessibilityLabel={b.text ? `Edit: ${b.text}` : "Add a note"}
                  onPress={() => setFocus(i)}
                  hoverBg={null}
                  scale={false}
                  ripple={false}
                  style={{ minHeight: style.lineHeight, cursor: "text" } as object}
                >
                  <Txt style={[style, empty ? { color: c.ink3 } : null]}>
                    {empty
                      ? (placeholder ?? (Platform.OS === "web" && !phone ? "Type / for blocks" : "Add a note"))
                      : linkSegments(b.text).map((seg, k) =>
                          seg.url ? (
                            <Txt
                              key={k}
                              style={[style, { color: c.ink, textDecorationLine: "underline" }]}
                              role="link"
                              onPress={() => void Linking.openURL(seg.url ?? "")}
                            >
                              {seg.text}
                            </Txt>
                          ) : (
                            seg.text
                          ),
                        )}
                  </Txt>
                </Press>
              )}
              {editing && slashQuery !== null && matches.length ? (
                <View
                  role="menu"
                  aria-label="Blocks"
                  style={{ position: "absolute", top: (style.lineHeight ?? 20) + s.s1, left: 0, width: 248, zIndex: 7, padding: s.s1, borderRadius: r.card, backgroundColor: c.overlay, boxShadow: shadows.overlay }}
                >
                  <Txt variant="caption" tone="ink3" style={{ paddingHorizontal: s.s2, paddingTop: s.s2, paddingBottom: s.s1 }}>
                    Turn into
                  </Txt>
                  {matches.map((cmd, k) => (
                    <Press
                      key={cmd.kind}
                      role="option"
                      aria-selected={k === menuIndex}
                      onPress={() => runCommand(i, cmd.kind)}
                      scale={false}
                      style={{ flexDirection: "row", alignItems: "center", gap: s.s3, height: 36, paddingHorizontal: s.s2, borderRadius: r.ctl, backgroundColor: k === menuIndex ? c.select : "transparent" }}
                    >
                      <View style={{ width: 24, height: 24, borderRadius: r.sm, borderWidth: 1, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center" }}>
                        <Icon icon={cmd.icon} size={14} tone="ink2" />
                      </View>
                      <Txt variant="body" tone={k === menuIndex ? "ink" : "ink2"} style={{ flex: 1 }}>
                        {cmd.label}
                      </Txt>
                      <Txt variant="caption" tone="ink3">
                        {cmd.hint}
                      </Txt>
                    </Press>
                  ))}
                </View>
              ) : null}
              {linkFor === i ? (
                <LinkForm
                  onCancel={() => setLinkFor(null)}
                  onAdd={(label, url) => {
                    const cur = latest.current[i];
                    if (cur) {
                      const next = [...latest.current];
                      next[i] = { ...cur, text: `${cur.text}${cur.text ? " " : ""}[${label}](${url})` };
                      commit(next);
                    }
                    setLinkFor(null);
                  }}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The toolbar's actions for the block being edited; the screen draws it above the keyboard. */
const toolbar = createStore<{ onPick: (kind: BlockKind | "link") => void; onDone: () => void } | null>(null);

/** Render once at the bottom of a screen that holds a note (Android). */
export function NoteToolbarHost() {
  const actions = toolbar.useValue((t) => t);
  if (Platform.OS === "web" || !actions) return null;
  return (
    <KeyboardStickyView style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <Toolbar onPick={actions.onPick} onDone={actions.onDone} />
    </KeyboardStickyView>
  );
}

function Toolbar({ onPick, onDone }: { onPick: (kind: BlockKind | "link") => void; onDone: () => void }) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: s.s2, height: 48, backgroundColor: c.overlay, boxShadow: shadows.overlay }}
    >
      {COMMANDS.map((cmd) => (
        <Button key={cmd.kind} icon={cmd.icon} accessibilityLabel={cmd.label} onPress={() => onPick(cmd.kind)} />
      ))}
      <Button label="Done" onPress={onDone} style={{ marginLeft: "auto" }} />
    </View>
  );
}

function LinkForm({ onAdd, onCancel }: { onAdd: (label: string, url: string) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");
  const valid = /^https?:\/\/\S+\.\S+/.test(url) && label.trim() !== "";
  return (
    <View style={{ gap: s.s2, marginTop: s.s2, padding: s.s3, borderRadius: r.ctl, backgroundColor: c.sunken }}>
      <Field label="Link text" value={label} onChangeText={setLabel} placeholder="Course page" autoFocus />
      <Field label="Address" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" />
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: s.s2 }}>
        <Button label="Cancel" onPress={onCancel} />
        <Button variant="primary" label="Add link" disabled={!valid} onPress={() => onAdd(label.trim(), url.trim())} />
      </View>
    </View>
  );
}
