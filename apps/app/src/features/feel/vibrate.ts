// Whether this device can give a haptic: the Android app always can; on the web, a touch phone
// whose browser has the Vibration API (Chrome on Android; Safari on iPhone has none). Desktops
// never show the Haptics switch, even where the API exists, because nothing there vibrates.

import { Platform } from "react-native";

export function canVibrate(): boolean {
  if (Platform.OS === "android") return true;
  if (Platform.OS !== "web" || typeof navigator === "undefined" || typeof window === "undefined")
    return false;
  return typeof navigator.vibrate === "function" && window.matchMedia?.("(pointer: coarse)").matches === true;
}
