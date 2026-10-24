import type { Metadata } from "next";
import { HEADLINE, SITE_NAME } from "@/lib/site";

// The social image drawn by src/app/opengraph-image.tsx. Next only adds it on its own to pages that
// don't set `openGraph`, so pages that do name it here.
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: `Kriyan: ${HEADLINE}` };

/**
 * Head tags for one page. Next merges metadata shallowly, so a page that set only `title` would
 * share the home page's `openGraph` and `twitter` text. `title` is the short tab title (the root
 * layout adds "| Kriyan"); `heading` is the page's h1, which is what a shared link should preview.
 */
export function pageMetadata({
  path,
  title,
  heading,
  description,
}: {
  path: string;
  title: string;
  heading: string;
  description: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: heading,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: heading, description, images: [SHARE_IMAGE] },
  };
}
