import { ConvexReactClient } from "convex/react";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("EXPO_PUBLIC_CONVEX_URL is missing. Run `bun run setup` to copy the dev env.");

/** One client for the app. Actions outside components (undo, notifications) use it directly. */
export const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });
