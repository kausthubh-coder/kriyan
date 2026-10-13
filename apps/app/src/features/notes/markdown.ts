// Notes are stored as plain Markdown (agents read and write them). The editor works on
// blocks: one per line, each with a kind and its text without the Markdown prefix.

export type BlockKind = "p" | "h1" | "h2" | "h3" | "todo" | "done" | "bullet" | "numbered" | "quote";

export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
}

let seq = 0;
export const newId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

const PREFIX: [RegExp, BlockKind][] = [
  [/^###\s+/, "h3"],
  [/^##\s+/, "h2"],
  [/^#\s+/, "h1"],
  [/^[-*]\s+\[[xX]\]\s+/, "done"],
  [/^[-*]\s+\[\s\]\s+/, "todo"],
  [/^[-*]\s+/, "bullet"],
  [/^\d+[.)]\s+/, "numbered"],
  [/^>\s?/, "quote"],
];

/** The kind a line's Markdown prefix means, and the text after it. */
export function lineToBlock(line: string): Omit<Block, "id"> {
  for (const [re, kind] of PREFIX) {
    const m = re.exec(line);
    if (m) return { kind, text: line.slice(m[0].length) };
  }
  return { kind: "p", text: line };
}

export function parseNote(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = lines.filter((l) => l.trim() !== "").map((l) => ({ id: newId(), ...lineToBlock(l) }));
  return blocks.length ? blocks : [{ id: newId(), kind: "p", text: "" }];
}

const LIST: BlockKind[] = ["todo", "done", "bullet", "numbered"];

export function serializeNote(blocks: Block[]): string {
  const out: string[] = [];
  let number = 0;
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    number = b.kind === "numbered" ? (prev?.kind === "numbered" ? number + 1 : 1) : 0;
    const prefix = {
      p: "",
      h1: "# ",
      h2: "## ",
      h3: "### ",
      todo: "- [ ] ",
      done: "- [x] ",
      bullet: "- ",
      numbered: `${number}. `,
      quote: "> ",
    }[b.kind];
    // Lists stay together; everything else gets a blank line between, as Markdown expects.
    if (prev && !(LIST.includes(prev.kind) && LIST.includes(b.kind)) && !(prev.kind === "quote" && b.kind === "quote")) out.push("");
    out.push(prefix + b.text);
  });
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n").trim() === "" ? "" : out.join("\n");
}

/** Inline links, `[text](url)`, split out for display. */
export function linkSegments(text: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push({ text: m[1] ?? "", url: m[2] ?? "" });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
