// Writes the site's static icons from the logo in src/lib/brand.tsx, so a new mark is one rerun:
//   bun apps/site/scripts/render-icons.tsx
// favicon.ico (16, 32 and 48 px, for tools and crawlers that ask for /favicon.ico) and icon.svg
// (what current browsers show in the tab). The Apple icon and the social image are drawn per
// request by src/app/apple-icon.tsx and src/app/opengraph-image.tsx.

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ImageResponse } from "next/og";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIcon, ICON_BG, ICON_INK, NOW_RED_ON_DARK, markPaths } from "../src/lib/brand";

const app = join(dirname(fileURLToPath(import.meta.url)), "../src/app");

async function png(size: number): Promise<Buffer> {
  const res = new ImageResponse(<AppIcon size={size} />, { width: size, height: size });
  return Buffer.from(await res.arrayBuffer());
}

// An .ico file is a directory of images. Each entry here is a whole PNG, which every current
// browser and OS reads, so no bitmap conversion is needed.
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size) })));
await writeFile(join(app, "favicon.ico"), ico(images));

// The tab icon: the same tile as AppIcon (the mark at 56% on the black ground), with the corners
// browsers expect of a tab icon.
const svg = renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="14" fill={ICON_BG} />
    <g transform="translate(14.08 14.08) scale(1.4933)">
      {markPaths({ ink: ICON_INK, dot: NOW_RED_ON_DARK })}
    </g>
  </svg>,
);
await writeFile(join(app, "icon.svg"), `${svg}\n`);
console.log(`Wrote favicon.ico (${sizes.join(", ")} px) and icon.svg`);
