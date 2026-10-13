// A tiny external store for app-wide UI state (toasts, ticking rows, selection).

import { useSyncExternalStore } from "react";

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: T | ((prev: T) => T)) {
      state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    useValue<S>(select: (state: T) => S): S {
      return useSyncExternalStore(this.subscribe, () => select(state), () => select(state));
    },
  };
}
