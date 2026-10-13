import { useLocalSearchParams } from "expo-router";
import type { Id } from "@kriyan/convex/dataModel";
import { SpaceScreen } from "@/features/space/SpaceScreen";

export { RouteError as ErrorBoundary } from "@/ui/RouteError";

export default function SpaceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SpaceScreen key={id} id={id as Id<"spaces">} />;
}
