"use client";
import { useActionState, useState, useTransition } from "react";
import { createCaption, draftCaption, type FormState } from "@/app/actions/media";
import ImagePicker, { type PickerImage } from "./ImagePicker";

export default function CreateMediaForm({ images, geminiReady }: { images: PickerImage[]; geminiReady: boolean }) {
  const [imageId, setImageId] = useState(images.find((i) => !i.user_id)?.id ?? images[0]?.id ?? "");
  const [scene, setScene] = useState("");
  const [style, setStyle] = useState("relatable");
  const [content, setContent] = useState("");
  const [draft, setDraft] = useState<{ content: string; prompt: string; model: string } | null>(null);
  const [draftError, setDraftError] = useState("");
  const [drafting, startDraft] = useTransition();
  const [state, formAction, publishing] = useActionState<FormState, FormData>(createCaption, {});

  function generate() {
    setDraftError("");
    startDraft(async () => {
      const res = await draftCaption({ imageId, scene, style });
      if ("error" in res && res.error) setDraftError(res.error);
      else if ("content" in res && res.content) {
        setDraft({ content: res.content, prompt: res.prompt, model: res.model });
        setContent(res.content);
      }
    });
  }

  const edited = draft && content.trim() !== draft.content;
  return (
    <form action={formAction} className="create-grid" aria-busy={publishing}>
      <div className="panel">
        <ImagePicker images={images} value={imageId} onChange={setImageId} />
      </div>
      <div className="panel stack-md">
        <input type="hidden" name="imageId" value={imageId} />
        <input type="hidden" name="draft" value={draft?.content ?? ""} />
        <input type="hidden" name="prompt" value={draft?.prompt ?? ""} />
        <input type="hidden" name="model" value={draft?.model ?? ""} />

        <label className="field">
          <span>Scene / context <span className="muted small">(sent to Gemini, saved as the generation input)</span></span>
          <textarea name="scene" rows={3} maxLength={500} value={scene} onChange={(e) => setScene(e.target.value)}
            placeholder="e.g. Waiting 25 minutes for the 1 train after a 9am midterm" />
        </label>
        <div className="field">
          <span>Humor style</span>
          <div className="segmented" role="radiogroup" aria-label="Humor style">
            {["relatable", "deadpan", "absurd"].map((s) => (
              <button type="button" key={s} role="radio" aria-checked={style === s}
                className={style === s ? "seg active" : "seg"} onClick={() => setStyle(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <button type="button" className="button button-dark" onClick={generate}
            disabled={!geminiReady || drafting || !imageId || scene.trim().length < 5}>
            {drafting ? "Asking Gemini…" : draft ? "↻ Draft another" : "✦ Draft with Gemini"}
          </button>
          {!geminiReady && <span className="muted small">Gemini key not configured — write manually.</span>}
          {geminiReady && scene.trim().length < 5 && <span className="muted small">Add a scene (5+ chars) to draft.</span>}
        </div>
        {draftError && <p role="alert" className="form-error">{draftError}</p>}

        <label className="field">
          <span>Caption {draft && <span className="badge">{edited ? `${draft.model} + edit` : draft.model}</span>}</span>
          <textarea name="content" rows={4} maxLength={500} required value={content}
            onChange={(e) => setContent(e.target.value)} placeholder="Draft with Gemini or write it yourself" />
          <span className="muted small counter">{content.trim().length}/500</span>
        </label>
        {state.error && <p role="alert" className="form-error">{state.error}</p>}
        <button className="button button-primary button-wide" disabled={publishing || !imageId || !content.trim()}>
          {publishing ? "Publishing…" : "Publish to Explore"}
        </button>
        <p className="muted small">
          Publishing goes live immediately for every user. The prompt and model are recorded for provenance.
        </p>
      </div>
    </form>
  );
}
