import { defineConfig } from "vitest/config";

// The CLI tests start a real process per command.
export default defineConfig({ test: { testTimeout: 30_000 } });
