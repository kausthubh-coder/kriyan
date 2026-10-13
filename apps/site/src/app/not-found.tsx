import Link from "next/link";
import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import ui from "@/components/ui.module.css";

export default function NotFound() {
  return (
    <PlainPage>
      <h1>There&apos;s no page here</h1>
      <p className={css.lede}>The link may be old, or the address may have a typo.</p>
      <p className={css.actions}>
        <Link href="/" className={`${ui.btn} ${ui.secondary}`}>
          Go to the home page
        </Link>
        <Link href="/docs" className={ui.btn}>
          Read the docs
        </Link>
      </p>
    </PlainPage>
  );
}
