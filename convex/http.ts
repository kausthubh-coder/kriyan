import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/**
 * OAuth callback handler for Google authentication.
 * Receives the authorization code and exchanges it for tokens.
 */
http.route({
  path: "/oauth/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    // Determine the redirect URI (the current URL without query params)
    const redirectUri = `${url.origin}/oauth/google/callback`;

    // Get the frontend URL from environment or default
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

    if (error) {
      // User denied access or error occurred
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(error)}`,
        302
      );
    }

    if (!code) {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent("No authorization code received")}`,
        302
      );
    }

    // Exchange code for tokens
    const result = await ctx.runAction(api.googleActions.exchangeCode, {
      code,
      redirectUri,
    });

    if (result.success) {
      return Response.redirect(`${frontendUrl}/settings?google=connected`, 302);
    } else {
      return Response.redirect(
        `${frontendUrl}/settings?error=${encodeURIComponent(result.error ?? "Unknown error")}`,
        302
      );
    }
  }),
});

/**
 * Health check endpoint.
 */
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
