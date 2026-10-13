// Figtree 400, 500 and 600, bundled with the app.

import { useFonts } from "expo-font";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";

/** True once the fonts are ready, or failed (the app then draws in the system font). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({ Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold });
  return loaded || error !== null;
}
