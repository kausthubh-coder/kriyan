import { CopyButton } from "./CopyButton";
import css from "./Code.module.css";

/** A copyable snippet. Set in Inter like everything else; there is one typeface. */
export function Code({
  children,
  caption,
  copy = true,
}: {
  children: string;
  caption?: string;
  copy?: boolean;
}) {
  return (
    <figure className={css.block}>
      {(caption || copy) && (
        <figcaption className={css.head}>
          <span className={css.caption}>{caption}</span>
          {copy && <CopyButton text={children} />}
        </figcaption>
      )}
      <pre className={css.pre} tabIndex={0}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}
