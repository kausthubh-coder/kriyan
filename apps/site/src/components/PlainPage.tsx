import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./Chrome";
import css from "./Prose.module.css";
import shell from "./PlainPage.module.css";

/** A page of reading, outside the docs: privacy, terms. */
export function PlainPage({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className={shell.main}>
        <article className={css.prose}>{children}</article>
      </main>
      <SiteFooter />
    </>
  );
}
