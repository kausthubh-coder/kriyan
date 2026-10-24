// Shared state for dragging a task from a list onto a schedule: Today's timeline, or the
// week on Upcoming. The screen on show registers itself as the drop zone; a drag source
// reports where the pointer is.

import { createStore } from "@/data/store";

export const STEP = 15;
export const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;
export const clampDay = (minutes: number, length = 0) =>
  Math.max(0, Math.min(1440 - Math.max(length, STEP), minutes));

/** Where a drop lands: a start time, and the day when the zone spans several. */
export interface Drop {
  /** Minutes after midnight, or null for the day itself with no time (a week's day header). */
  minutes: number | null;
  date?: string;
}

export interface DropZone {
  /** Window coordinates of the timeline's top-left, and its size. */
  measure: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  /** Minutes at the timeline's y = 0 line, and pixels per hour. */
  startMinutes: number;
  hourPx: number;
  topPad: number;
  /** A zone with more than one day (the week) says where a point lands; the timeline's is its minutes. */
  hit?: (rect: { x: number; y: number; width: number; height: number }, x: number, y: number) => Drop | null;
  /**
   * A zone without an hour grid (the phone's Today list and spine) takes drops on its free
   * stretches instead: each one's window rectangle and the time it starts.
   */
  slots?: () => Promise<SlotRect[]>;
  onDrop: (taskId: string, drop: Drop) => void;
}

let zone: DropZone | null = null;
/** The focused screen's zone; the returned function clears it only if no other screen took over. */
export function registerDropZone(z: DropZone): () => void {
  zone = z;
  return () => {
    if (zone === z) zone = null;
  };
}
export function dropZone(): DropZone | null {
  return zone;
}

export interface ExternalDrag {
  taskId: string;
  title: string;
  color: string;
  length: number | null;
  /** Window position of the pointer. */
  x: number;
  y: number;
  /** Where letting go would land, or null when outside the zone. */
  over: Drop | null;
}

export const externalDrag = createStore<ExternalDrag | null>(null);

/** Minutes for a window y over the zone, or null when the pointer is outside it. */
export function minutesAt(
  rect: { x: number; y: number; width: number; height: number },
  z: Pick<DropZone, "startMinutes" | "hourPx" | "topPad">,
  x: number,
  y: number,
): number | null {
  if (x < rect.x || x > rect.x + rect.width || y < rect.y - 24 || y > rect.y + rect.height + 24) return null;
  const minutes = z.startMinutes + ((y - rect.y - z.topPad) / z.hourPx) * 60;
  return clampDay(snap(minutes));
}

/** A free stretch a dragged task can be dropped on: where it is on screen, and its start. */
export interface SlotRect {
  y: number;
  height: number;
  minutes: number;
}

const slots = new Map<
  string,
  { minutes: number; measure: () => Promise<{ y: number; height: number } | null> }
>();

/** A free-stretch row offers itself as a drop target while it's on screen. */
export function registerSlot(
  key: string,
  slot: { minutes: number; measure: () => Promise<{ y: number; height: number } | null> },
): () => void {
  slots.set(key, slot);
  return () => {
    if (slots.get(key) === slot) slots.delete(key);
  };
}

export async function measureSlots(): Promise<SlotRect[]> {
  const out = await Promise.all(
    [...slots.values()].map(async (sl) => {
      const box = await sl.measure();
      return box && box.height > 0 ? { y: box.y, height: box.height, minutes: sl.minutes } : null;
    }),
  );
  return out.filter((sl): sl is SlotRect => sl !== null);
}

/** The slot under a window y, with a little slack above and below. */
export function slotAt(list: SlotRect[], y: number): SlotRect | null {
  return list.find((sl) => y >= sl.y - 8 && y <= sl.y + sl.height + 8) ?? null;
}
