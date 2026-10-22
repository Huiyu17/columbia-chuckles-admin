"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({ className = "button button-ghost" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await createClient().auth.signOut().catch(() => undefined);
    // proxy.ts re-checks the (now missing) session on this navigation.
    router.replace("/login");
    router.refresh();
  }
  return (
    <button className={className} onClick={logout} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
