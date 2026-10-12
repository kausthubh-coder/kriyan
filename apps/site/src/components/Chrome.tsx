import Link from "next/link";
import { APP_URL, GITHUB_URL } from "@/lib/site";
import { Mark } from "./Mark";
import css from "./Chrome.module.css";
import ui from "./ui.module.css";

export function SiteHeader() {
  return (
    <header className={css.header}>
      <Link href="/" className={css.brand} aria-label="Kriyan home">
        <Mark size={22} />
        kriyan
      </Link>
      <nav className={css.nav} aria-label="Site">
        <Link href="/docs" className={ui.btn}>
          Docs
        </Link>
        <a href={GITHUB_URL} className={`${ui.btn} ${css.hideOnPhone}`}>
          GitHub
        </a>
        <a href={APP_URL} className={`${ui.btn} ${ui.secondary}`}>
          Open Kriyan
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
          <Mark size={20} />
          kriyan
        </Link>
        <p>Open source under the MIT licence. Kriyan is Sanskrit for action.</p>
      </div>
      <nav aria-label="Footer">
        <ul className={css.footerLinks}>
          <li>
            <a href={GITHUB_URL} className={ui.btn}>
              GitHub
            </a>
          </li>
          <li>
            <Link href="/docs" className={ui.btn}>
              Docs
            </Link>
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
          <li>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className={ui.btn}>
              MIT licence
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
