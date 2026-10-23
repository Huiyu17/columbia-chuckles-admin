"use client";
import { useRef, useState, useTransition } from "react";
import { removeCaption } from "@/app/actions/media";

/** Default "delete" for live captions: reversible, keeps votes, author can't undo it. */
export default function RemoveCaptionButton({ id, preview, from, compact = false }: {
  id: string; preview: string; from: "list" | "detail"; compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  function confirm() {
    setError("");
    start(async () => {
      const res = await removeCaption(id, from); // redirects on success
      if (res?.error) setError(res.error);
    });
  }
  return (
    <>
      <button type="button" className={compact ? "button button-warn-ghost button-sm" : "button button-warn"}
        onClick={() => dialog.current?.showModal()}>
        Remove{compact ? "" : " from Explore"}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`rm-${id}`}>
        <h2 id={`rm-${id}`}>Remove this caption from Explore?</h2>
        <blockquote className="caption-quote">“{preview}”</blockquote>
        <ul className="dialog-points">
          <li>Hidden from Explore and every user&apos;s collections right away.</li>
          <li>Its votes are hidden too, and come back if you restore it.</li>
          <li>The author sees it in Trash as &ldquo;Removed by a moderator&rdquo; and <strong>can&apos;t restore it</strong>.</li>
          <li>You can <strong>restore</strong> it or <strong>delete it permanently</strong> later from the <strong>Removed</strong> tab.</li>
        </ul>
        {error && <p role="alert" className="form-error">{error}</p>}
        <div className="row row-end">
          <button type="button" className="button button-ghost" onClick={() => dialog.current?.close()} disabled={pending} autoFocus>
            Cancel
          </button>
          <button type="button" className="button button-warn" onClick={confirm} disabled={pending}>
            {pending ? "Removing…" : "Yes, remove"}
          </button>
        </div>
      </dialog>
    </>
  );
}
