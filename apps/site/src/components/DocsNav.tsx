"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import css from "./DocsNav.module.css";

const PAGES = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quick-add", label: "Quick add" },
  { href: "/docs/mcp", label: "MCP" },
  { href: "/docs/cli", label: "CLI" },
  { href: "/docs/api", label: "API" },
] as const;

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className={css.nav} aria-label="Docs">
      <ul>
        {PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className={css.link} aria-current={pathname === page.href ? "page" : undefined}>
              {page.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
