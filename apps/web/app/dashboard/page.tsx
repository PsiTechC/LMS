"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const ROLE_ROUTES: Record<string, string> = {
  superadmin:           "/dashboard/superadmin",
  superadmin_secondary: "/dashboard/superadmin",
  program_manager:      "/dashboard/program-manager",
  faculty:              "/dashboard/faculty",
  // Coach gets a dedicated workspace tailored to delivering coaching engagements.
  coach:                "/dashboard/coach",
  participant:          "/dashboard/participant",
  participant_retailer: "/dashboard/participant",
};

export default function DashboardIndex() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/"); return; }
    router.replace(ROLE_ROUTES[user.role] || "/dashboard/participant");
  }, [user, loading, router]);

  return null;
}
