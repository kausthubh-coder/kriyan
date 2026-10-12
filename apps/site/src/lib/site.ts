// Addresses the site links to. One place, so a move is one edit.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://kriyan.app").replace(/\/$/, "");
export const APP_URL = "https://app.kriyan.app";
export const GITHUB_URL = "https://github.com/kausthubh-coder/kriyan";
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const MCP_URL = `${SITE_URL}/mcp`;

export const SITE_NAME = "Kriyan";
export const HEADLINE = "Plan the day calmly. Then do it.";
export const DESCRIPTION =
  "Kriyan turns everything you have to do into a plan for your time, and keeps that plan quiet enough to follow. Your AI can plan with you.";
