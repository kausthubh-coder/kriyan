// Where the CLI keeps its token and the numbers from the last listing.
// %APPDATA%\kriyan on Windows, $XDG_CONFIG_HOME/kriyan or ~/.config/kriyan elsewhere.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  token?: string;
  /** The server the token belongs to, when it isn't the default. */
  apiUrl?: string;
  /** The person's time zone, from their profile, so date phrases mean the same as in the app. */
  timeZone?: string;
}

export interface Listed {
  id: string;
  title: string;
}

export function configDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  if (env.KRIYAN_CONFIG_DIR) return env.KRIYAN_CONFIG_DIR;
  if (platform === "win32") return join(env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "kriyan");
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "kriyan");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Writes owner-only (0600) where the platform supports it; the token is a secret. */
function writePrivate(path: string, dir: string, value: unknown): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows keeps the file private through the user profile's ACLs.
  }
}

export class Store {
  constructor(readonly dir: string) {}

  get configPath(): string {
    return join(this.dir, "config.json");
  }

  get listingPath(): string {
    return join(this.dir, "last-listing.json");
  }

  config(): Config {
    return readJson<Config>(this.configPath) ?? {};
  }

  saveConfig(config: Config): void {
    writePrivate(this.configPath, this.dir, config);
  }

  /** Forgets the token and the last listing, which holds that account's task titles. */
  clear(): void {
    rmSync(this.configPath, { force: true });
    rmSync(this.listingPath, { force: true });
  }

  /** Task ids from the last listing; the number shown next to a task is its index plus one. */
  listing(): Listed[] {
    return readJson<{ tasks: Listed[] }>(this.listingPath)?.tasks ?? [];
  }

  saveListing(tasks: Listed[]): void {
    writePrivate(this.listingPath, this.dir, { tasks });
  }
}
