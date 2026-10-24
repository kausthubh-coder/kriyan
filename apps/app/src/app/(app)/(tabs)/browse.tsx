// Browse's tab became Ask, which now holds its spaces and the way to Settings; old links land there.

import { Redirect } from "expo-router";

export default function Browse() {
  return <Redirect href="/ask" />;
}
