"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RefreshStatusesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className="button button-sm button-ghost" disabled={pending}
    onClick={() => startTransition(() => router.refresh())} aria-label="Refresh generation and caption statuses">
    {pending ? "Refreshing…" : "Refresh statuses"}
  </button>;
}
