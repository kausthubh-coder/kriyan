// Shared state for dragging a task from a list onto the timeline. The timeline registers
// itself as the drop zone; a drag source reports where the pointer is.

import { createStore } from "@/data/store";

export const STEP = 15;
export const snap = (minutes: number) => Math.round(minutes / STEP) * STEP;
export const clampDay = (minutes: number, length = 0) =>
  Math.max(0, Math.min(1440 - Math.max(length, STEP), minutes));

export interface DropZone {
  /** Window coordinates of the timeline's top-left, and its size. */
  measure: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  /** Minutes at the timeline's y = 0 line, and pixels per hour. */
  startMinutes: number;
  hourPx: number;
  topPad: number;
  onDrop: (taskId: string, minutes: number) => void;
}

let zone: DropZone | null = null;
export function registerDropZone(z: DropZone | null) {
  zone = z;
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
  /** The snapped start over the timeline, or null when outside it. */
  over: number | null;
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
