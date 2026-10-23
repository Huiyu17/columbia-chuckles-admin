"use client";
import { useState, useTransition } from "react";
import { restoreCaption, type HiddenTab } from "@/app/actions/media";

export default function RestoreCaptionButton({ id, from, compact = false }: {
  id: string; from: "detail" | HiddenTab; compact?: boolean;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function restore() {
    setError("");
    start(async () => {
      const res = await restoreCaption(id, from); // redirects on success
      if (res?.error) setError(res.error);
    });
  }
  return (
    <span className="restore-wrap">
      <button type="button" className={compact ? "button button-restore button-sm" : "button button-restore"}
        onClick={restore} disabled={pending}>
        {pending ? "Restoring…" : "↺ Restore"}
      </button>
      {error && <span role="alert" className="form-error small">{error}</span>}
    </span>
  );
}
