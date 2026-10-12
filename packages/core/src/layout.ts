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
  /** 0-based column inside its overlap group. */
  column: number;
  /** Columns in its overlap group. */
  columns: number;
}

/** Side-by-side columns for overlapping blocks, so nothing hides behind anything else. */
export function layoutDay(items: Interval[], minLength = 30): Placed[] {
  const sorted = items
    .map((i) => ({ id: i.id, start: i.start, end: i.start + Math.max(i.length ?? 0, minLength) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columns = Math.max(1, ...group.map((g) => g.column + 1));
    for (const g of group) g.columns = columns;
    group = [];
  };
  for (const item of sorted) {
    if (item.start >= groupEnd) {
      flush();
      groupEnd = item.end;
    } else {
      groupEnd = Math.max(groupEnd, item.end);
    }
    const taken = new Set(group.filter((g) => g.end > item.start).map((g) => g.column));
    let column = 0;
    while (taken.has(column)) column++;
    const p: Placed = { ...item, column, columns: 1 };
    group.push(p);
    placed.push(p);
  }
  flush();
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
