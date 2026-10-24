// The app's root opens Today. A plain <Redirect> replaced this route with a second copy of the
// tabs on top of the anchor's, so after a cold start on Android the first Back only removed
// that copy. dismissTo goes back to the anchor's tabs instead, leaving one entry.

import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";

export default function Index() {
  useFocusEffect(
    useCallback(() => {
      router.dismissTo("/today");
    }, []),
  );
  return null;
}
