// While a layer is open, everything outside it is inert: no focus, no clicks, hidden from
// screen readers (Overlays). Same as the prototype's makeInert.

import { useEffect, type RefObject } from "react";
import type { View } from "react-native";

export function useInertOutside(ref: RefObject<View | null>, active = true) {
  useEffect(() => {
    if (!active) return;
    const changed: HTMLElement[] = [];
    let node = ref.current as unknown as HTMLElement | null;
    while (node && node.parentElement && node !== document.body) {
      for (const sibling of Array.from(node.parentElement.children) as HTMLElement[]) {
        if (sibling === node || sibling.inert || sibling.tagName === "SCRIPT" || sibling.tagName === "STYLE")
          continue;
        sibling.inert = true;
        changed.push(sibling);
      }
      node = node.parentElement;
    }
    return () => {
      for (const el of changed) el.inert = false;
    };
  }, [ref, active]);
}
