// Browse became the menu in design v5 (the Inbox, spaces, Goals, Agents, Settings); old links land there.

import { Redirect } from "expo-router";

export default function Browse() {
  return <Redirect href="/menu" />;
}
