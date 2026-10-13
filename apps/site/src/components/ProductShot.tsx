import { getImageProps, type StaticImageData } from "next/image";
import css from "./ProductShot.module.css";

/**
 * One screen of the product: the phone layout on narrow screens, the desktop layout on wide ones.
 * Rendered from docs/design/v3 by scripts/render-product.mjs. Width and height are set from the files,
 * so the space is held before the image arrives.
 */
export function ProductShot({
  desktop,
  phone,
  alt,
  lead = false,
}: {
  desktop: StaticImageData;
  phone: StaticImageData;
  alt: string;
  /** The first image on the page: fetched first, never lazy. */
  lead?: boolean;
}) {
  const common = { alt, ...(lead ? { fetchPriority: "high" as const, loading: "eager" as const } : {}) };
  const { props: phoneProps } = getImageProps({
    ...common,
    src: phone,
    sizes: "(max-width: 760px) calc(100vw - 32px), 1px",
  });
  const {
    props: { srcSet: desktopSet, ...rest },
  } = getImageProps({ ...common, src: desktop, sizes: "(max-width: 1120px) calc(100vw - 64px), 1056px" });

  return (
    <picture className={css.frame}>
      <source media="(max-width: 760px)" srcSet={phoneProps.srcSet} sizes={phoneProps.sizes} width={phone.width} height={phone.height} />
      <source media="(min-width: 761px)" srcSet={desktopSet} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
      <img {...rest} className={css.img} />
    </picture>
  );
}
