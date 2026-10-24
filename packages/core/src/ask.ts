// What the Ask tab can do by itself. Kriyan has no AI of its own: it understands a few fixed
// requests and anything quick add understands. Everything else waits for an agent connected
// through MCP or the CLI, which reads it with get_asks and replies with answer_ask.

export type AskIntent =
  /** Add a task from the words after the verb, parsed like quick add. */
  | { kind: "add"; text: string }
  /** Move what's still open today to tomorrow (Review's close day). */
  | { kind: "tomorrow" }
  /** How much free time is left today. */
  | { kind: "free" }
  /** The next thing on today's plan. */
  | { kind: "next" }
  /** How the week has gone so far. */
  | { kind: "week" }
  /** Not something Kriyan can do alone: an agent answers it. */
  | { kind: "agent" };

const ADD = /^(?:please\s+)?(?:add|create|new task|remind me(?:\s+to)?|capture|note down)\b[:\s]*/i;
/** Requests that start like these are about the plan, not a new task, even with a time in them. */
const REQUEST =
  /^(?:please\s+)?(?:move|plan|push|shift|reschedule|cancel|delete|remove|clear|what|what's|whats|when|where|how|why|which|who|can|could|should|would|will|do|does|did|is|are|am|find|show|list|tell|help|give|organi[sz]e|sort|summari[sz]e|review|fit|schedule|make)\b/i;

/**
 * Reads one request. `hasWhen` says whether quick add found a date or time in it, so a bare
 * "dentist fri 10am" adds a task the way quick add would.
 */
export function understand(raw: string, hasWhen: (text: string) => boolean): AskIntent {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "agent" };
  const lower = text.toLowerCase();
  const add = text.match(ADD);
  if (add) {
    const rest = text.slice(add[0].length).trim();
    return rest ? { kind: "add", text: rest } : { kind: "agent" };
  }
  if (/\b(left|rest|unfinished|everything|what'?s open)\b.*\btomorrow\b/.test(lower)) return { kind: "tomorrow" };
  if (/\b(free time|time for|how much time|what can i (do|fit)|am i free|free today)\b/.test(lower))
    return { kind: "free" };
  if (/\b(what'?s next|whats next|next up|what now|what should i do now)\b/.test(lower)) return { kind: "next" };
  if (/\b(week go|this week so far|how did (my|the) week|how is my week|how's my week)\b/.test(lower))
    return { kind: "week" };
  if (!text.endsWith("?") && !REQUEST.test(text) && hasWhen(text)) return { kind: "add", text };
  return { kind: "agent" };
}

/** Suggestions shown under the box: things Kriyan can do by itself, so each one works. */
export const ASK_SUGGESTIONS = [
  "What's next?",
  "How much free time do I have?",
  "Move what's left to tomorrow",
  "How did my week go?",
  "Add call mum tomorrow 18:00",
] as const;
