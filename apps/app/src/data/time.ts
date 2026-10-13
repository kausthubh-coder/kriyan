// "Today" and "now" in the person's own time zone, never the server's UTC date.

import { useEffect, useState } from "react";
import { todayIn, zonedParts, type CivilDate } from "@kriyan/core/dates";

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export interface Clock {
  timeZone: string;
  today: CivilDate;
  /** Minutes after midnight. */
  now: number;
}

function read(): Clock {
  const timeZone = deviceTimeZone();
  const at = Date.now();
  return { timeZone, today: todayIn(timeZone, at), now: zonedParts(at, timeZone).minutes };
}

/** Ticks every 30 seconds so the now line and "today" roll over on their own. */
export function useClock(): Clock {
  const [clock, setClock] = useState(read);
  useEffect(() => {
    const id = setInterval(() => {
      const next = read();
      setClock((prev) => (prev.today === next.today && prev.now === next.now ? prev : next));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return clock;
}
