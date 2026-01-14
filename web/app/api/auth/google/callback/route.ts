import { NextRequest, NextResponse } from "next/server";

/**
 * Google OAuth callback handler.
 * Forwards the authorization code to the Convex HTTP endpoint for token exchange.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Get the Convex URL from environment
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!convexUrl) {
    return NextResponse.redirect(
      new URL("/settings?error=Server%20misconfigured", request.url)
    );
  }

  // Convert Convex URL to HTTP endpoint URL
  // Convex URL format: https://<deployment>.convex.cloud
  // HTTP endpoint format: https://<deployment>.convex.site/oauth/google/callback
  const convexHttpUrl = convexUrl.replace(".convex.cloud", ".convex.site");
  
  // Build the callback URL for Convex
  const callbackUrl = new URL(`${convexHttpUrl}/oauth/google/callback`);

  // Forward all query parameters
  if (code) {
    callbackUrl.searchParams.set("code", code);
  }
  if (error) {
    callbackUrl.searchParams.set("error", error);
  }

  // Also forward state if present (for CSRF protection)
  const state = searchParams.get("state");
  if (state) {
    callbackUrl.searchParams.set("state", state);
  }

  // Redirect to the Convex HTTP endpoint
  return NextResponse.redirect(callbackUrl.toString());
}
