import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { schemes } from "@kriyan/core/tokens";
import { DESCRIPTION, HEADLINE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// B2's one typeface. next/font self-hosts the variable file (400 to 600 are all the site uses)
// and sizes a local fallback to match, so text shows at once and doesn't move when Inter lands.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${HEADLINE}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  // Pages replace these with their own through pageMetadata (src/lib/metadata.ts).
  openGraph: { type: "website", siteName: SITE_NAME, title: HEADLINE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: HEADLINE, description: DESCRIPTION },
};

// The browser bar follows the visitor's scheme, from the same tokens the page paints with.
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: schemes.light.color.bg },
    { media: "(prefers-color-scheme: dark)", color: schemes.dark.color.bg },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
