"use client";

import { useEffect, useState } from "react";

/** The abbreviated ID is presentation only; copying always uses the full key. */
export default function RecordIdentifier({ id }: { id: string }) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">("idle");
  useEffect(() => {
    if (status !== "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy() {
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(id);
      setStatus("copied");
    } catch { setStatus("error"); }
  }

  return <div className="row small muted record-identifier">
    <span className="record-short-id" title={id.length > 8 ? "Abbreviated ID. Copy ID copies the complete key." : undefined}>
      ID: <span className="mono">{id.slice(0, 8)}{id.length > 8 ? "…" : ""}</span>
    </span>
    <button type="button" className="record-id-copy" onClick={copy} disabled={status === "copying"}
      aria-label="Copy complete record ID" title="Copy complete ID">
      {status === "copied" ? "Copied" : status === "copying" ? "Copying…" : "Copy ID"}
    </button>
    <span role="status" aria-live="polite" className={status === "error" ? "record-copy-error" : "sr-only"}>
      {status === "error" ? "Could not copy. Copy the complete ID from View full record." : status === "copied" ? "Complete ID copied." : ""}
    </span>
  </div>;
}
