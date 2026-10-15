// The browser the e2e scripts and render-product drive. On my Windows machine that's the
// headless shell they always used; on a cloud VM it's the Chromium the VM ships under
// PLAYWRIGHT_BROWSERS_PATH, an older build than this playwright-core wants, which still works.
//
//   import { launchBrowser } from "../../../scripts/browser.mjs";
//   const browser = await launchBrowser();
//
// CHROMIUM_PATH overrides the search.

import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { chromium } from "playwright-core";

const WINDOWS_SHELL =
  "C:/Users/kaust/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe";
const CHROME = [
  join(process.env.PROGRAMFILES ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  "/usr/bin/google-chrome",
];

/** { name, launch } where launch is the executablePath or channel for chromium.launch; null when there's none. */
export function findBrowser() {
  if (process.env.CHROMIUM_PATH)
    return {
      name: `CHROMIUM_PATH (${process.env.CHROMIUM_PATH})`,
      launch: { executablePath: process.env.CHROMIUM_PATH },
    };
  if (existsSync(WINDOWS_SHELL))
    return { name: "the headless shell 1248", launch: { executablePath: WINDOWS_SHELL } };
  let bundled = "";
  try {
    bundled = chromium.executablePath();
  } catch {} // throws on hosts Playwright doesn't support
  if (bundled && existsSync(bundled)) return { name: `Playwright's Chromium (${bundled})`, launch: {} };
  const shipped = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? "", "chromium");
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(shipped))
    return { name: `the VM's Chromium (${realpathSync(shipped)})`, launch: { executablePath: shipped } };
  if (CHROME.some((file) => isAbsolute(file) && existsSync(file)))
    return { name: "Google Chrome", launch: { channel: "chrome" } };
  return null;
}

export async function launchBrowser(options = {}) {
  const browser = findBrowser();
  if (!browser)
    throw new Error(
      "no browser: set CHROMIUM_PATH, or run `node node_modules/playwright-core/cli.js install chromium`",
    );
  return chromium.launch({ ...options, ...browser.launch });
}
