// On the web, Figtree is one family with three weights, so `font-weight` picks the face and
// the browser and the Critly check both read "Figtree". The stylesheet with the tokens is
// injected here too, before the first frame.

import { useEffect, useState } from "react";
import { Asset } from "expo-asset";
import { Figtree_400Regular } from "@expo-google-fonts/figtree/400Regular";
import { Figtree_500Medium } from "@expo-google-fonts/figtree/500Medium";
import { Figtree_600SemiBold } from "@expo-google-fonts/figtree/600SemiBold";
import { webCss } from "./tokens";

const faces: [number, number][] = [
  [400, Figtree_400Regular],
  [500, Figtree_500Medium],
  [600, Figtree_600SemiBold],
];

function inject() {
  if (typeof document === "undefined" || document.getElementById("kriyan-css")) return;
  const style = document.createElement("style");
  style.id = "kriyan-css";
  const fontFaces = faces
    .map(
      ([weight, mod]) =>
        `@font-face { font-family: "Figtree"; font-style: normal; font-weight: ${weight}; font-display: block; src: url("${Asset.fromModule(mod).uri}") format("truetype"); }`,
    )
    .join("\n");
  style.textContent = `${fontFaces}\n${webCss()}`;
  document.head.appendChild(style);
}

inject();

export function useAppFonts(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Wait for the faces (they are local, so this is quick); never longer than a second.
    const timeout = new Promise((resolve) => setTimeout(resolve, 1000));
    const load = Promise.all(faces.map(([w]) => document.fonts.load(`${w} 16px Figtree`)));
    void Promise.race([load, timeout]).finally(() => setReady(true));
  }, []);
  return ready;
}
