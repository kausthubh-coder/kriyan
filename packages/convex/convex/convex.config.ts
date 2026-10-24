import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    /** The Clerk instance's issuer, e.g. https://clerk.kriyan.app. Without it nobody can sign in. */
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    /** Shared with the site so its MCP server can act for a signed-in person. */
    KRIYAN_SERVICE_SECRET: v.optional(v.string()),
    /**
     * Web Push (VAPID) keys, so reminders reach the web app on an iPhone Home Screen and in
     * browsers. Without them reminders still go to the Android app; web subscriptions wait.
     */
    VAPID_PUBLIC_KEY: v.optional(v.string()),
    VAPID_PRIVATE_KEY: v.optional(v.string()),
    /** A contact for push services, "mailto:…" or "https://…". */
    VAPID_SUBJECT: v.optional(v.string()),
  },
});

export default app;
