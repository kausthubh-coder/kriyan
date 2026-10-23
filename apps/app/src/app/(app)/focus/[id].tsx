import { useLocalSearchParams } from "expo-router";
import type { Id } from "@kriyan/convex/dataModel";
import { FocusScreen } from "@/features/focus/FocusScreen";

export { RouteError as ErrorBoundary } from "@/ui/RouteError";

export default function FocusRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FocusScreen id={id as Id<"tasks">} />;
}
