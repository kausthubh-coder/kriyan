// The room the phone's floating controls take at the bottom of the screen: Today's three round
// buttons and the pages' add button (design v5; the v4 dock with its tabs is gone). Toasts sit
// above it and scrolling pages leave it free under their last row.

import { s } from "@/theme/tokens";

/** The floating buttons' height, their gap above the bottom edge, and the room content leaves under them. */
export const DOCK_HEIGHT = 60;
export const DOCK_GAP = s.s3;
export const DOCK_CLEARANCE = DOCK_HEIGHT + DOCK_GAP + s.s4;
