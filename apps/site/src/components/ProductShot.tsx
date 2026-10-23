import type { CSSProperties } from "react";
import { getImageProps, type StaticImageData } from "next/image";
import css from "./ProductShot.module.css";

const PHONE = "(max-width: 760px)";
const DESKTOP = "(min-width: 761px)";
const DARK = "(prefers-color-scheme: dark)";

/**
 * One screen of the product: the phone layout on narrow screens, the desktop layout on wide ones,
 * and the dark renders when the reader's system is dark. Rendered by scripts/render-product.mjs.
 * Width and height are set from the files, so the space is held before the image arrives.
 */
export function ProductShot({
  desktop,
  phone,
  darkDesktop,
  darkPhone,
  alt,
  lead = false,
}: {
  desktop: StaticImageData;
  phone: StaticImageData;
  darkDesktop?: StaticImageData;
  darkPhone?: StaticImageData;
  alt: string;
  /** The first image on the page: fetched first, never lazy. */
  lead?: boolean;
}) {
  const common = { alt, ...(lead ? { fetchPriority: "high" as const, loading: "eager" as const } : {}) };
  const phoneSizes = "(max-width: 760px) min(calc(100vw - 32px), 390px)";
  const desktopSizes = "(max-width: 1120px) calc(100vw - 64px), 1120px";
  const set = (src: StaticImageData, sizes: string) => getImageProps({ ...common, src, sizes }).props.srcSet;
  const {
    props: { srcSet: desktopSet, ...rest },
  } = getImageProps({ ...common, src: desktop, sizes: desktopSizes });

  // Sources are tried in order, so the dark ones come first.
  const sources: { media: string; src: StaticImageData; sizes: string }[] = [
    ...(darkPhone ? [{ media: `${PHONE} and ${DARK}`, src: darkPhone, sizes: phoneSizes }] : []),
    ...(darkDesktop ? [{ media: `${DESKTOP} and ${DARK}`, src: darkDesktop, sizes: desktopSizes }] : []),
    { media: PHONE, src: phone, sizes: phoneSizes },
    { media: DESKTOP, src: desktop, sizes: desktopSizes },
  ];

  return (
    <picture
      className={css.frame}
      style={
        {
          "--phone-ratio": `${phone.width} / ${phone.height}`,
          "--desktop-ratio": `${desktop.width} / ${desktop.height}`,
        } as CSSProperties
      }
    >
      {sources.map((s) => (
        <source
          key={s.media}
          media={s.media}
          srcSet={set(s.src, s.sizes)}
          sizes={s.sizes}
          width={s.src.width}
          height={s.src.height}
        />
      ))}
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
      <img {...rest} srcSet={desktopSet} className={css.img} />
    </picture>
  );
}
