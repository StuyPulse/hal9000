"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function pageName(pathname: string) {
  if (pathname === "/") return "Home";
  if (pathname === "/dashboard") return "Assignments";
  if (pathname === "/events") return "Events";
  if (pathname.includes("/compare")) return "Team comparison";
  if (pathname.includes("/summary")) return "Scouting summary";
  if (pathname.includes("/teams/")) return "Team details";
  if (pathname.includes("/teams")) return "Teams";
  if (pathname.includes("/matches")) return "Match schedule";
  if (pathname === "/scout/manual") return "Scouting forms";
  if (pathname === "/scout/assignments") return "My assignments";
  if (pathname.includes("/scout/match/manual")) return "Manual match scouting";
  if (pathname.includes("/scout/match")) return "Match scouting";
  if (pathname.includes("/scout/pre-scout")) return "Pre scouting";
  if (pathname.includes("/scout/pit")) return "Pit scouting";
  if (pathname.includes("/scout/global")) return "Global scouting";
  if (pathname === "/submissions") return "Submissions";
  if (pathname.includes("/admin/assignments")) return "Scout assignments";
  if (pathname.includes("/admin/forms")) return "Form builder";
  if (pathname.includes("/admin/users")) return "Users & roles";
  if (pathname.includes("/admin/sync")) return "Event import";
  if (pathname.includes("/auth/login")) return "Sign in";
  if (pathname.includes("/auth/reset-password")) return "Reset password";
  if (pathname === "/privacy") return "Privacy";
  if (pathname === "/terms") return "Terms";
  return "HAL9000";
}

export function AdaptivePageTitle() {
  const pathname = usePathname();
  useEffect(() => { document.title = `${pageName(pathname)} | HAL9000`; }, [pathname]);
  return null;
}
