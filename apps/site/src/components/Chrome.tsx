import Link from "next/link";
import { BrandMark } from "@/lib/brand";
import { ANDROID_PAGE, APP_URL, GITHUB_URL } from "@/lib/site";
import css from "./Chrome.module.css";
import ui from "./ui.module.css";

/**
 * The header on every page. Every link is quiet, so the page's own heading or call to action
 * leads; `current` marks the section you're in.
 */
export function SiteHeader({ current }: { current?: "docs" }) {
  return (
    <header className={css.header}>
      <Link href="/" className={css.brand} aria-label="Kriyan home">
        <BrandMark size={24} />
        Kriyan
      </Link>
      <nav className={css.nav} aria-label="Site">
        <Link href="/docs" className={ui.btn} aria-current={current === "docs" ? "page" : undefined}>
          Docs
        </Link>
        <a href={GITHUB_URL} className={`${ui.btn} ${css.hideOnPhone}`}>
          GitHub
        </a>
        <a href={APP_URL} className={ui.btn}>
          Open the web app
        </a>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={css.footer}>
      <div className={css.footerBrand}>
        <Link href="/" className={css.brand} aria-label="Kriyan home">
          <BrandMark size={20} />
          Kriyan
        </Link>
        <p>Open source under the MIT licence. Kriyan is Sanskrit for action.</p>
      </div>
      <nav aria-label="Footer">
        <ul className={css.footerLinks}>
          <li>
            <Link href="/docs" className={ui.btn}>
              Docs
            </Link>
          </li>
          <li>
            <Link href={ANDROID_PAGE} className={ui.btn}>
              Android
            </Link>
          </li>
          <li>
            <a href={GITHUB_URL} className={ui.btn}>
              GitHub
            </a>
          </li>
          <li>
            <Link href="/privacy" className={ui.btn}>
              Privacy
            </Link>
          </li>
          <li>
            <Link href="/terms" className={ui.btn}>
              Terms
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
