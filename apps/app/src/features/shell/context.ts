// Shell state the screens read: whether a task panel is open beside the column, and the
// command menu.

import { createStore } from "@/data/store";

export const shellState = createStore<{ commandOpen: boolean; commandQuery: string }>({
  commandOpen: false,
  commandQuery: "",
});

export function openCommand(query = "") {
  shellState.set({ commandOpen: true, commandQuery: query });
}

export function closeCommand() {
  shellState.set({ commandOpen: false, commandQuery: "" });
}

/** The task selected with J and K (web), shared by rows and shortcuts. */
export const selection = createStore<{ taskId: string | null }>({ taskId: null });

/** The desktop Today field registers here so N can focus it; elsewhere N opens the add sheet. */
export const quickAddTarget = createStore<{ focus: () => void } | null>(null);
