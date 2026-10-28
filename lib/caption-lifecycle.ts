import type { RecordRow } from "./resources";

export type CaptionLifecycle = {
  state: "published" | "draft" | "author-trash" | "admin-removed" | "hidden" | "deleted" | "not-created" | "pending" | "unavailable";
  label: string;
  tone: "ok" | "warn" | "neutral";
  description: string;
  href?: string;
};

export function unavailableCaption(): CaptionLifecycle {
  return { state: "unavailable", label: "Status unavailable", tone: "neutral",
    description: "The current caption status could not be confirmed. Refresh to check again." };
}

/** Call only after complete, successful reads of both live and hidden captions.
 * An absent caption alone is never evidence of permanent deletion. */
export function captionLifecycle(request: RecordRow, generation: RecordRow | undefined, captions: RecordRow[]): CaptionLifecycle {
  if (!request.generation_id) {
    if (request.status === "failed") return { state: "not-created", label: "Not created", tone: "neutral",
      description: "Generation failed, so no caption preview was created." };
    if (request.status === "running" || request.status === "pending") return { state: "pending", label: "Not created yet", tone: "neutral",
      description: "Generation is in progress. No caption is ready to publish yet." };
    return unavailableCaption();
  }
  if (!generation) return unavailableCaption();
  const linked = captions.filter(caption => caption.generation_id === request.generation_id);
  const live = linked.find(caption => caption.deleted_at == null);
  if (live) return { state: "published", label: "Published", tone: "ok",
    description: "This caption is currently visible on the main site.", href: `/media/${encodeURIComponent(String(live.id))}` };
  const hidden = linked.find(caption => caption.deleted_by === "admin") ?? linked[0];
  if (hidden) {
    const href = `/media/${encodeURIComponent(String(hidden.id))}`;
    if (hidden.deleted_by === "admin") return { state: "admin-removed", label: "Removed by admin", tone: "warn", href,
      description: "Hidden from the main site. An admin can restore it from caption details." };
    if (hidden.deleted_by === "author") return { state: "author-trash", label: "In author's Trash", tone: "warn", href,
      description: "Hidden from the main site. The author or an admin can restore it." };
    return { state: "hidden", label: "Hidden", tone: "warn", href,
      description: "This caption is hidden. Open caption details to review its status." };
  }
  if (generation.withdrawn_at != null) return { state: "deleted", label: "Permanently deleted", tone: "warn",
    description: "The caption and its votes were permanently deleted. The original AI response is retained for review." };
  return { state: "draft", label: "Not published", tone: "neutral",
    description: "This generation has no published caption. Its saved preview and original AI response are retained." };
}
