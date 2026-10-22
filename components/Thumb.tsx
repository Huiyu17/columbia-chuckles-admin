"use client";
import { useState } from "react";

export default function Thumb({ url, alt, size = "md" }: { url?: string; alt?: string; size?: "sm" | "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`thumb thumb-${size}`}>
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt ?? ""} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="thumb-missing" aria-label="Image unavailable">no image</span>
      )}
    </span>
  );
}
