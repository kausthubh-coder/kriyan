// Timeline layout and the "how much of today is free" sum.

export interface Interval {
  id: string;
  /** Minutes after midnight. */
  start: number;
  /** Minutes. Tasks without a length take `minLength` on the timeline but count 0 towards planned time. */
  length?: number;
}

export interface Placed {
  id: string;
  start: number;
  end: number;
  /** 0-based column among the blocks that start together. */
  column: number;
  /** Blocks that start together, sharing the width. */
  columns: number;
  /** How many earlier blocks this one sits on top of; each level is indented. */
  depth: number;
}

/**
 * Blocks that start within `share` minutes of each other sit side by side. A block that starts
 * later sits on top of the running ones, one level deeper, so their titles stay readable
 * instead of every overlap halving both blocks.
 */
export function layoutDay(items: Interval[], minLength = 30, share = 30): Placed[] {
  const sorted = items
    .map((i) => ({ id: i.id, start: i.start, end: i.start + Math.max(i.length ?? 0, minLength) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  const rows: { start: number; depth: number; members: Placed[] }[] = [];
  for (const item of sorted) {
    // Every block lasts at least `minLength` >= `share`, so a row started moments ago is still running.
    const last = rows.at(-1);
    let row = last && item.start - last.start < share ? last : undefined;
    if (!row) {
      const running = placed.filter((p) => p.end > item.start);
      row = { start: item.start, depth: Math.max(-1, ...running.map((p) => p.depth)) + 1, members: [] };
      rows.push(row);
    }
    const p: Placed = { ...item, column: row.members.length, columns: 1, depth: row.depth };
    row.members.push(p);
    placed.push(p);
  }
  for (const r of rows) for (const m of r.members) m.columns = r.members.length;
  return placed;
}

/**
 * Free minutes between `now` and the end of the day, minus time already planned.
 * Overlapping blocks count once; blocks without a length count nothing.
 */
export function freeMinutes(items: Interval[], now: number, dayEnd: number): number {
  if (now >= dayEnd) return 0;
  const busy = items
    .filter((i) => i.length)
    .map((i) => [Math.max(i.start, now), Math.min(i.start + i.length!, dayEnd)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const [s, e] of busy) {
    if (s > curE) {
      total += curE - curS;
      curS = s;
      curE = e;
    } else curE = Math.max(curE, e);
  }
  total += curE - curS;
  return dayEnd - now - total;
}

/** Planned minutes across a set of blocks (overlaps counted once). */
export function plannedMinutes(items: Interval[]): number {
  return 1440 - freeMinutes(items, 0, 1440);
}

/**
 * The longest stretch with nothing planned between `from` and `to`, at least `min` minutes long,
 * as [start, end], or null when there's none. A block without a length still breaks the stretch
 * at its start time, because its length is unknown, not zero.
 */
export function longestFree(items: Interval[], from: number, to: number, min = 30): [number, number] | null {
  const busy = items
    .map((i) => [i.start, i.start + (i.length ?? 0)] as const)
    .filter(([s, e]) => e >= from && s <= to)
    .sort((a, b) => a[0] - b[0]);
  let best: [number, number] | null = null;
  let cur = from;
  for (const [s, e] of [...busy, [to, to] as const]) {
    const gapEnd = Math.min(s, to);
    if (gapEnd - cur >= min && (!best || gapEnd - cur > best[1] - best[0])) best = [cur, gapEnd];
    cur = Math.max(cur, e);
  }
  return best;
}
