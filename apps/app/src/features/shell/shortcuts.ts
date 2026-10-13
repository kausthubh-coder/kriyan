// Keyboard shortcuts on the web: N new task, Ctrl K command menu, T Today, U Upcoming,
// I Inbox, J and K move, Enter open, X complete, D date, R repeat, M move to space,
// Delete delete (with Undo), Escape close. Typing in a field never triggers them.

import { useEffect } from "react";
import { router, usePathname } from "expo-router";
import { completeTask, deleteTask } from "@/features/tasks/actions";
import { panelOpenedByKeyboard } from "@/features/tasks/panelState";
import { closeCommand, openCommand, quickAddTarget, selection, shellState } from "./context";
import { rowRegistry } from "./rows";

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid^="task-"]')].filter((el) => el.offsetParent !== null);
}

function openSelected(edit?: "when" | "repeat" | "space") {
  const id = selection.get().taskId;
  if (!id) return;
  panelOpenedByKeyboard.set(true);
  router.push(edit ? `/task/${id}?edit=${edit}` : `/task/${id}`);
  setTimeout(() => panelOpenedByKeyboard.set(false), 400);
}

export function useShortcuts() {
  const path = usePathname();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (shellState.get().commandOpen) closeCommand();
        else openCommand();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || shellState.get().commandOpen) return;
      if (document.querySelector('[aria-modal="true"]') && e.key !== "Escape") return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const selected = selection.get().taskId;
      switch (key) {
        case "n":
          e.preventDefault();
          if (quickAddTarget.get()) quickAddTarget.get()?.focus();
          else router.push("/add");
          return;
        case "t":
          router.navigate("/today");
          return;
        case "u":
          router.navigate("/upcoming");
          return;
        case "i":
          router.navigate("/inbox");
          return;
        case "j":
        case "k":
        case "ArrowDown":
        case "ArrowUp": {
          if (key.startsWith("Arrow") && !selected) return;
          const list = rows();
          if (!list.length) return;
          e.preventDefault();
          const ids = list.map((el) => (el.dataset.testid ?? "").slice(5));
          const at = selected ? ids.indexOf(selected) : -1;
          const down = key === "j" || key === "ArrowDown";
          const next = at === -1 ? (down ? 0 : ids.length - 1) : Math.max(0, Math.min(ids.length - 1, at + (down ? 1 : -1)));
          selection.set({ taskId: ids[next] ?? null });
          list[next]?.scrollIntoView({ block: "nearest" });
          return;
        }
        case "Enter":
          if (selected) {
            e.preventDefault();
            openSelected();
          }
          return;
        case "d":
          openSelected("when");
          return;
        case "r":
          openSelected("repeat");
          return;
        case "m":
          openSelected("space");
          return;
        case "x": {
          const row = selected ? rowRegistry.get(selected) : undefined;
          if (row && !row.done) completeTask(row);
          return;
        }
        case "Delete":
        case "Backspace": {
          const row = selected ? rowRegistry.get(selected) : undefined;
          if (row) {
            e.preventDefault();
            deleteTask(row);
            selection.set({ taskId: null });
          }
          return;
        }
        case "Escape":
          if (window.location.pathname.startsWith("/task/") || window.location.pathname === "/add") {
            if (router.canGoBack()) router.back();
            else router.replace("/today");
          } else selection.set({ taskId: null });
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A new screen starts with nothing selected.
  useEffect(() => {
    if (!path.startsWith("/task/")) selection.set({ taskId: null });
  }, [path]);
}
