"use client";
import { useMemo, useState } from "react";
import Thumb from "./Thumb";

export type PickerImage = { id: string; url: string; alt_text: string; user_id: string | null; owner?: string };

export default function ImagePicker({ images, value, onChange }: {
  images: PickerImage[]; value: string; onChange: (id: string) => void;
}) {
  const [tab, setTab] = useState<"sample" | "uploaded">(
    images.find((i) => i.id === value)?.user_id ? "uploaded" : "sample");
  const [q, setQ] = useState("");
  const shown = useMemo(() => images
    .filter((i) => (tab === "sample" ? !i.user_id : Boolean(i.user_id)))
    .filter((i) => `${i.alt_text} ${i.owner ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 60), [images, tab, q]);
  const selected = images.find((i) => i.id === value);

  return (
    <fieldset className="picker">
      <legend>Photo</legend>
      <div className="picker-bar">
        <div className="segmented" role="tablist" aria-label="Photo source">
          {(["sample", "uploaded"] as const).map((t) => (
            <button type="button" role="tab" key={t} aria-selected={tab === t}
              className={tab === t ? "seg active" : "seg"} onClick={() => setTab(t)}>
              {t === "sample" ? "Sample photos" : "User uploads"}
            </button>
          ))}
        </div>
        <input aria-label="Filter photos by description" placeholder="Filter by description…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {shown.length === 0 ? <p className="muted small">No photos here.</p> : (
        <div className="picker-grid">
          {shown.map((img) => (
            <button type="button" key={img.id} onClick={() => onChange(img.id)}
              className={img.id === value ? "pick selected" : "pick"} aria-pressed={img.id === value}
              title={img.alt_text}>
              <Thumb url={img.url} alt={img.alt_text} size="md" />
              {img.id === value && <span className="pick-badge">Selected</span>}
            </button>
          ))}
        </div>
      )}
      <p className="small muted picker-caption">
        {selected ? <>Selected: {selected.alt_text}{selected.owner ? ` · uploaded by ${selected.owner}` : ""}</> : "No photo selected."}
      </p>
    </fieldset>
  );
}
