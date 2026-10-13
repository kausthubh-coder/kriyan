// The ensō: a day drawn as one stroke that opens where you are now. From docs/design/v3/logo/mark.svg.

import Svg, { Circle, Path } from "react-native-svg";
import { hex } from "@/theme/tokens";

export function Mark({ size = 22, color = hex.ink }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <Path d="M21.00 10.09A9.2 9.2 0 1 1 15.15 3.35L14.83 4.97A6.35 6.35 0 1 0 18.87 9.62Z" />
      <Circle cx={19.94} cy={9.85} r={1.09} />
      <Circle cx={14.99} cy={4.16} r={0.82} />
    </Svg>
  );
}
