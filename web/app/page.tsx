import { redirect } from "next/navigation";

export default function RootPage() {
  // Redirect to dashboard tasks page as the default landing
  redirect("/tasks");
}
