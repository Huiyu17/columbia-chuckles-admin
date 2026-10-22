"use client";
import { useEffect, useState } from "react";

/**
 * One-time confirmation triggered by a query flag (e.g. ?deleted=1).
 * On mount it strips the flag from the URL, so a refresh or a shared link never
 * shows a stale "deleted"/"published" message, then fades out after a few seconds.
 */
export default function FlashNotice({ param, message }: { param: string; message: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const timer = window.setTimeout(() => setOpen(false), 6000);
    return () => window.clearTimeout(timer);
  }, [param]);

  if (!open) return null;
  return (
    <div className="notice notice-flash" role="status">
      <span aria-hidden="true">✓</span>
      <span className="grow">{message}</span>
      <button type="button" className="notice-close" aria-label="Dismiss" onClick={() => setOpen(false)}>×</button>
    </div>
  );
}
