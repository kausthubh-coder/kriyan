// The ring: the day as an open circle, with now as the red dot in its gap. The same paths as the
// site's mark and the app icons (apps/site/src/lib/brand.tsx, docs/design/brand/build.mjs).

import Svg, { Circle, Path } from "react-native-svg";
import { hex } from "@/theme/tokens";

export function Mark({ size = 22, color = hex.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path
        d="M19.78 11.46A7.8 7.8 0 1 1 12.54 4.22"
        fill="none"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={17.52} cy={6.48} r={2.6} fill={hex.now} />
    </Svg>
  );
}
