import type { AuthConfig } from "convex/server";

// Set CLERK_JWT_ISSUER_DOMAIN on each deployment (dev and prod use different Clerk instances).
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
} satisfies AuthConfig;
