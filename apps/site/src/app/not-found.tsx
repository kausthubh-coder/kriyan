import Link from "next/link";
import { PlainPage } from "@/components/PlainPage";
import css from "@/components/Prose.module.css";
import ui from "@/components/ui.module.css";

export default function NotFound() {
  return (
    <PlainPage>
      <h1>There&apos;s no page here</h1>
      <p className={css.lede}>The link may be old, or the address has a typo. The docs and the app are one click away.</p>
      <p>
        <Link href="/" className={`${ui.btn} ${ui.secondary}`}>
          Go to the home page
        </Link>
      </p>
    </PlainPage>
  );
}
