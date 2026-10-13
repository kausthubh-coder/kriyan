import { AddSheet } from "@/features/tasks/AddSheet";
import { goBack } from "@/ui/Screen";

export default function AddRoute() {
  return <AddSheet onClose={() => goBack("/today")} />;
}
