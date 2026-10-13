// Web: press a task row and move the pointer to lift it; drop it on the timeline to give it a
// time. Escape cancels. A plain click still opens the task.

import { useRef, type ReactNode } from "react";
import { View } from "react-native";
import { dropZone, externalDrag, minutesAt } from "./drag";

interface Props {
  taskId: string;
  title: string;
  color: string;
  length: number | null;
  children: ReactNode;
}

const THRESHOLD = 6;

export function DragSource({ taskId, title, color, length, children }: Props) {
  const ref = useRef<View>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || e.pointerType !== "mouse") return;
    const target = e.target as HTMLElement;
    // The checkbox is its own control.
    if (target.closest('[role="checkbox"]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let ended = false;
    const zone = dropZone();

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD) return;
        active = true;
        document.body.style.cursor = "grabbing";
      }
      ev.preventDefault();
      const x = ev.clientX;
      const y = ev.clientY;
      // Measure each move: the page may scroll while dragging.
      void (zone ? zone.measure() : Promise.resolve(null)).then((rect) => {
        if (ended) return;
        const over = rect && zone ? minutesAt(rect, zone, x, y) : null;
        externalDrag.set({ taskId, title, color, length, x, y, over });
      });
    };
    const end = (commit: boolean) => {
      ended = true;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
      document.body.style.cursor = "";
      const drag = externalDrag.get();
      externalDrag.set(null);
      if (!active) return;
      // Swallow the click that follows a drag, so the row doesn't open.
      window.addEventListener("click", (ce) => ce.stopPropagation(), { capture: true, once: true });
      if (commit && drag?.over !== null && drag?.over !== undefined && zone) zone.onDrop(taskId, drag.over);
    };
    const up = () => end(true);
    const key = (ke: KeyboardEvent) => {
      if (ke.key === "Escape") {
        ke.stopPropagation();
        end(false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
  };
  return (
    <View ref={ref} {...({ onPointerDown } as object)} style={{ cursor: "grab" } as object}>
      {children}
    </View>
  );
}
