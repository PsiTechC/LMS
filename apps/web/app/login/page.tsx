import { redirect } from "next/navigation";

// Login is now handled via modal on the landing page
export default function LoginPage() {
  redirect("/");
}
