// Goals and habits moved to /goals in design v5; old links land there.

import { Redirect } from "expo-router";

export default function Progress() {
  return <Redirect href="/goals" />;
}
