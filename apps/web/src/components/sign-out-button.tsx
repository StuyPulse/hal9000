"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    navigator.serviceWorker?.controller?.postMessage({ type: "hal9000:clear-private-caches" });
    await createClient().auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }
  return <button type="button" className="nav-item" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", marginTop: 18 }} onClick={signOut}><LogOut size={17}/><span>Sign out</span></button>;
}
