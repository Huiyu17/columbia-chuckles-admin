"use client";
import { useRef, useState, useTransition } from "react";
import { deleteCaption, type HiddenTab } from "@/app/actions/media";

/** Second step, offered only for captions that are already hidden. Irreversible. */
export default function DeleteCaptionButton({ id, preview, back, compact = false }: {
  id: string; preview: string; back: HiddenTab; compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function confirm() {
    setError("");
    start(async () => {
      const res = await deleteCaption(id, back); // redirects on success
      if (res?.error) setError(res.error);
    });
  }
  return (
    <>
      <button type="button" className={compact ? "button button-danger-ghost button-sm" : "button button-danger"}
        onClick={() => dialog.current?.showModal()}>
        Delete{compact ? "" : " permanently"}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`del-${id}`}>
        <h2 id={`del-${id}`}>Delete this caption permanently?</h2>
        <blockquote className="caption-quote">“{preview}”</blockquote>
        <p className="muted small">
          The caption and all of its votes are erased, and nobody can restore it, including the author and you.
          The author&apos;s photo and generation record are kept, and the author can&apos;t re-publish it.
          <strong> This cannot be undone.</strong>
        </p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="row row-end">
          <button type="button" className="button button-ghost" onClick={() => dialog.current?.close()} disabled={pending} autoFocus>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={confirm} disabled={pending}>
            {pending ? "Deleting…" : "Yes, delete forever"}
          </button>
        </div>
      </dialog>
    </>
  );
}
