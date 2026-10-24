import type { ReactNode } from "react";

/**
 * A description from @kriyan/core/ops, written for agents, set for people: `backtick` spans and
 * object examples like {kind:'day',offset:-1} become <code>. ops.ts keeps the plain text, because
 * agents read it as it is.
 */
export function OpDescription({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let plain = "";
  let i = 0;
  const flush = () => {
    if (plain) parts.push(plain);
    plain = "";
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        parts.push(<code key={i}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // An object example starts at "{" or "[{" and runs to its matching close.
    if (ch === "{" || (ch === "[" && text[i + 1] === "{")) {
      let depth = 0;
      let end = i;
      for (; end < text.length; end++) {
        const c = text[end];
        if (c === "{" || c === "[") depth++;
        if (c === "}" || c === "]") depth--;
        if (depth === 0) break;
      }
      if (depth === 0) {
        flush();
        parts.push(<code key={i}>{text.slice(i, end + 1)}</code>);
        i = end + 1;
        continue;
      }
    }
    plain += ch;
    i++;
  }
  flush();
  return <>{parts}</>;
}
