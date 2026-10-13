// Web: drag a block to move it, drag its bottom edge to set its length. Both snap to
// 15 minutes and show the start and end while moving. Escape cancels.

import { useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { formatTimeRange } from "@kriyan/core/format";
import { c, r, s, shadows } from "@/theme/tokens";
import { Txt } from "@/ui/Txt";
import { clampDay, snap, STEP } from "./drag";

export interface BlockDragProps {
  top: number;
  height: number;
  left: number;
  width: number;
  start: number;
  length: number | null;
  hourPx: number;
  /** Events and done blocks can still move; projected repeats can't. */
  disabled?: boolean;
  onMove: (start: number) => void;
  onResize: (length: number) => void;
  children: ReactNode;
}

type Mode = "move" | "resize";

export function BlockDrag({
  top,
  height,
  left,
  width,
  start,
  length,
  hourPx,
  disabled,
  onMove,
  onResize,
  children,
}: BlockDragProps) {
  const [drag, setDrag] = useState<{ mode: Mode; dMin: number } | null>(null);
  const moved = useRef(false);

  const begin = (mode: Mode) => (e: PointerEvent) => {
    if (disabled || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (mode === "move" && target.closest('[role="checkbox"]')) return;
    e.stopPropagation();
    const y0 = e.clientY;
    moved.current = false;
    let dMin = 0;
    let shown = false;
    const move = (ev: PointerEvent) => {
      const raw = ((ev.clientY - y0) / hourPx) * 60;
      const next = Math.round(raw / STEP) * STEP;
      if (!moved.current && Math.abs(ev.clientY - y0) < 4) return;
      moved.current = true;
      ev.preventDefault();
      if (next !== dMin || !shown) {
        shown = true;
        dMin = next;
        setDrag({ mode, dMin });
      }
    };
    const finish = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
      document.body.style.cursor = "";
      setDrag(null);
      if (!moved.current) return;
      window.addEventListener("click", (ce) => ce.stopPropagation(), { capture: true, once: true });
      if (!commit || dMin === 0) return;
      if (mode === "move") onMove(clampDay(snap(start + dMin), length ?? 0));
      else onResize(Math.max(STEP, Math.min(1440 - start, (length ?? 0) + dMin)));
    };
    const up = () => finish(true);
    const key = (ke: KeyboardEvent) => {
      if (ke.key === "Escape") {
        ke.stopPropagation();
        finish(false);
      }
    };
    document.body.style.cursor = mode === "move" ? "grabbing" : "ns-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
  };

  const dMin = drag?.dMin ?? 0;
  const liveStart = drag?.mode === "move" ? clampDay(start + dMin, length ?? 0) : start;
  const liveLength = drag?.mode === "resize" ? Math.max(STEP, (length ?? 0) + dMin) : length;
  const liveTop = drag?.mode === "move" ? top + (dMin / 60) * hourPx : top;
  const liveHeight =
    drag?.mode === "resize" ? Math.max((STEP / 60) * hourPx - 2, height + (dMin / 60) * hourPx) : height;

  return (
    <View
      {...({ onPointerDown: begin("move") } as object)}
      style={[
        {
          position: "absolute",
          top: liveTop,
          left,
          width,
          height: liveHeight,
          borderRadius: r.ctl,
          cursor: disabled ? "default" : "grab",
        } as object,
        drag ? { boxShadow: shadows.overlay, zIndex: 3, transform: [{ scale: 1.01 }] } : null,
      ]}
    >
      {children}
      {disabled ? null : (
        <View
          aria-hidden
          {...({ onPointerDown: begin("resize") } as object)}
          style={
            { position: "absolute", left: 0, right: 0, bottom: -3, height: 8, cursor: "ns-resize" } as object
          }
        />
      )}
      {drag ? (
        <View
          style={{
            position: "absolute",
            right: s.s3,
            top: -30,
            paddingHorizontal: s.s2,
            paddingVertical: 2,
            borderRadius: r.sm,
            backgroundColor: c.overlay,
            boxShadow: shadows.overlay,
            zIndex: 4,
          }}
        >
          <Txt variant="caption" tnum>
            {formatTimeRange(liveStart, liveLength ?? undefined)}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
