// Builds the npm package in dist/: one ESM file for Node 20+ with @kriyan/core bundled in,
// plus the manifest, README and licence. Publish from dist/ (see README.md).

import { chmodSync, copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const source = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
  description: string;
};

rmSync(dist, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [join(root, "src", "main.ts")],
  outdir: dist,
  naming: "kriyan.js",
  target: "node",
  format: "esm",
  minify: false,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const bundle = join(dist, "kriyan.js");
const code = readFileSync(bundle, "utf8");
if (!code.startsWith("#!/usr/bin/env node")) writeFileSync(bundle, `#!/usr/bin/env node\n${code}`);
chmodSync(bundle, 0o755);

writeFileSync(
  join(dist, "package.json"),
  `${JSON.stringify(
    {
      name: "kriyan",
      version: source.version,
      description: source.description,
      license: "MIT",
      type: "module",
      bin: { kriyan: "kriyan.js" },
      files: ["kriyan.js", "README.md", "LICENSE"],
      engines: { node: ">=20" },
      homepage: "https://kriyan.app",
      keywords: ["planner", "cli", "tasks", "calendar", "mcp", "agents"],
    },
    null,
    2,
  )}\n`,
);
copyFileSync(join(root, "README.md"), join(dist, "README.md"));
copyFileSync(join(root, "..", "..", "LICENSE"), join(dist, "LICENSE"));
console.log(`Built ${bundle} (${(code.length / 1024).toFixed(1)} KB)`);
