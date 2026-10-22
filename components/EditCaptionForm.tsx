"use client";
import { useActionState, useState } from "react";
import { updateCaption, type FormState } from "@/app/actions/media";
import ImagePicker, { type PickerImage } from "./ImagePicker";

export default function EditCaptionForm({ id, content: initial, imageId: initialImage, images }: {
  id: string; content: string; imageId: string; images: PickerImage[];
}) {
  const [content, setContent] = useState(initial);
  const [imageId, setImageId] = useState(initialImage);
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateCaption, {});
  const dirty = content.trim() !== initial || imageId !== initialImage;
  return (
    <form action={formAction} className="stack-md" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="imageId" value={imageId} />
      <label className="field">
        <span>Caption text</span>
        <textarea name="content" rows={3} maxLength={500} required value={content} onChange={(e) => setContent(e.target.value)} />
        <span className="muted small counter">{content.trim().length}/500</span>
      </label>
      <details className="details">
        <summary>Change photo</summary>
        <ImagePicker images={images} value={imageId} onChange={setImageId} />
      </details>
      {state.error && <p role="alert" className="form-error">{state.error}</p>}
      {state.success && !dirty && <p role="status" className="form-success">{state.success}</p>}
      <div className="row">
        <button className="button button-primary" disabled={pending || !dirty || !content.trim()}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty && (
          <button type="button" className="button button-ghost" onClick={() => { setContent(initial); setImageId(initialImage); }}>
            Discard
          </button>
        )}
      </div>
    </form>
  );
}
