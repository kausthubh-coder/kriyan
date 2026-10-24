import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

const PAGES = ["/", "/docs", "/docs/quick-add", "/docs/mcp", "/docs/cli", "/docs/api", "/android", "/privacy", "/terms"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
