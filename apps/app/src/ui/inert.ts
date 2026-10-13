// Android: the system makes what's behind a modal or sheet unreachable on its own.

import type { RefObject } from "react";
import type { View } from "react-native";

export function useInertOutside(_ref: RefObject<View | null>, _active = true) {}
