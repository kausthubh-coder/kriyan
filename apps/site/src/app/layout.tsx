import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import { color } from "@kriyan/core/tokens";
import { DESCRIPTION, HEADLINE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// One variable file covers 400 to 600; next/font self-hosts it and sizes a local fallback to match.
const figtree = Figtree({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ${HEADLINE}`, template: `%s | ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: HEADLINE,
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: HEADLINE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: color.bg,
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={figtree.variable}>
      <body>{children}</body>
    </html>
  );
}
