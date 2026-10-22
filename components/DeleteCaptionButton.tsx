"use client";
import { useRef, useState, useTransition } from "react";
import { deleteCaption } from "@/app/actions/media";

export default function DeleteCaptionButton({ id, preview, votes, compact = false }: {
  id: string; preview: string; votes: number; compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function confirm() {
    setError("");
    start(async () => {
      const res = await deleteCaption(id); // redirects on success
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
          This removes it from Explore and every user&apos;s collections, and deletes its {votes} vote{votes === 1 ? "" : "s"}.
          The author&apos;s photo and generation record are kept, and the author can&apos;t re-publish it. This cannot be undone.
        </p>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="row row-end">
          <button type="button" className="button button-ghost" onClick={() => dialog.current?.close()} disabled={pending} autoFocus>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={confirm} disabled={pending}>
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
        </div>
      </dialog>
    </>
  );
}
