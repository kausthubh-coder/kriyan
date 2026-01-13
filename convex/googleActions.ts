"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Google OAuth configuration
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

/**
 * Generate OAuth authorization URL.
 * Client should redirect to this URL to start OAuth flow.
 */
export const getAuthUrl = action({
  args: {
    redirectUri: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("GOOGLE_CLIENT_ID not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: args.redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  },
});

/**
 * Exchange authorization code for tokens.
 * Called by HTTP callback after user authorizes.
 */
export const exchangeCode = action({
  args: {
    code: v.string(),
    redirectUri: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false, error: "Google OAuth not configured" };
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: args.code,
          grant_type: "authorization_code",
          redirect_uri: args.redirectUri,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Token exchange failed: ${error}` };
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      // Store tokens
      await ctx.runMutation(internal.google.storeTokens, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? "",
        expiresIn: data.expires_in,
        scope: data.scope,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Refresh access token if expired.
 */
export const refreshTokenIfNeeded = action({
  args: {},
  returns: v.union(
    v.object({
      success: v.literal(true),
      accessToken: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx): Promise<
    | { success: true; accessToken: string }
    | { success: false; error: string }
  > => {
    const tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    } | null = await ctx.runQuery(internal.google.getTokens, {});
    if (!tokens) {
      return { success: false as const, error: "Not connected to Google" };
    }

    // Check if token is still valid (with 5 min buffer)
    if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) {
      return { success: true as const, accessToken: tokens.accessToken };
    }

    // Refresh the token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false as const, error: "Google OAuth not configured" };
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        return { success: false as const, error: "Token refresh failed" };
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        scope: string;
      };

      // Update stored tokens
      await ctx.runMutation(internal.google.updateAccessToken, {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      });

      return { success: true as const, accessToken: data.access_token };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Internal: Get a valid access token (refreshing if needed).
 * Use this in other actions that need to call Google APIs.
 */
export const getValidAccessToken = internalAction({
  args: {},
  returns: v.union(
    v.object({
      success: v.literal(true),
      accessToken: v.string(),
    }),
    v.object({
      success: v.literal(false),
      error: v.string(),
    })
  ),
  handler: async (ctx): Promise<
    | { success: true; accessToken: string }
    | { success: false; error: string }
  > => {
    const tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    } | null = await ctx.runQuery(internal.google.getTokens, {});
    if (!tokens) {
      return { success: false as const, error: "Not connected to Google" };
    }

    // Check if token is still valid (with 5 min buffer)
    if (Date.now() < tokens.expiresAt - 5 * 60 * 1000) {
      return { success: true as const, accessToken: tokens.accessToken };
    }

    // Refresh the token
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { success: false as const, error: "Google OAuth not configured" };
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!response.ok) {
        return { success: false as const, error: "Token refresh failed" };
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        scope: string;
      };

      // Update stored tokens
      await ctx.runMutation(internal.google.updateAccessToken, {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      });

      return { success: true as const, accessToken: data.access_token };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
