"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResource, uploadAdminImage } from "@/app/actions/resources";
import type { Column, RecordRow } from "@/lib/resources";
import { fieldValue, resourcePayload } from "@/lib/resource-fields";

export default function ResourceEditor({ resource, mode, columns, row }: {
  resource: string; mode: string; columns: Column[]; row?: RecordRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const primary = columns.find(c => c.primary)?.name ?? "id";
  const fields = columns.filter(c => !c.generated && !c.primary && !["created_at", "updated_at"].includes(c.name));
  function mutate(operation: string, payload: RecordRow, onSuccess?: () => void) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await saveResource(resource, operation, row?.[primary], payload);
        setMessage(result.error ?? "Saved successfully.");
        if (!result.error) { onSuccess?.(); setConfirmDelete(false); router.refresh(); }
      } catch { setMessage("Request failed. Please try again."); }
    });
  }
  return <div className="stack-md">
    <form className="stack-md" onSubmit={event => {
      // React form actions reset uncontrolled fields on completion. Keep edit
      // values until the refreshed record arrives, and preserve failed input.
      event.preventDefault();
      const form = event.currentTarget;
      try {
        mutate(row ? "update" : "create", resourcePayload(fields, new FormData(form), !row),
          row ? undefined : () => form.reset());
      } catch (error) { setMessage(error instanceof Error ? error.message : "Check the record fields."); }
    }}>
      {/* Recreate only the fields when saved data changes; keep confirmation
          feedback and the open editor while updating every default value. */}
      <fieldset key={JSON.stringify(row ?? null)} className="resource-fields stack-md" disabled={pending}>
      {fields.map(c => <div key={c.name}><label className="field">
        <span>{c.name.replaceAll("_", " ")} <small className="muted">({c.type})</small></span>
        {c.type === "boolean" ? <select name={c.name} defaultValue={String(row?.[c.name] ?? "")} required={c.required && (!!row || c.default_value === null)}>
          <option value="">Default / empty</option><option value="true">True</option><option value="false">False</option>
        </select> : <textarea name={c.name} rows={/prompt|response|content|json|description/.test(c.name + c.type) ? 4 : 2}
          required={c.required && (!!row || c.default_value === null)} maxLength={100_000}
          placeholder={!row && c.default_value !== null ? `Default: ${c.default_value}` : /json|\[\]/.test(c.type) ? "Enter JSON" : undefined}
          defaultValue={fieldValue(c, row?.[c.name])} />}
      </label>{!c.required && <label className="small muted"><input type="checkbox" name={`null:${c.name}`} defaultChecked={!!row && row[c.name] === null} /> Set to null (clear this field)</label>}</div>)}
      </fieldset>
      <button className="button button-primary" disabled={pending}>{pending ? "Saving…" : row ? "Save changes" : "Create record"}</button>
    </form>
    {row && mode === "crud" && (confirmDelete ? <div className="stack-sm" role="alert">
      <p>Delete this record permanently? Related records may prevent deletion.</p>
      {resource === "images" && <p>Image metadata will be deleted. The stored file is retained to avoid breaking existing media links.</p>}
      <button className="button button-danger" disabled={pending} onClick={() => mutate("delete", {})}>Confirm delete</button>{" "}
      <button className="button button-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
    </div> : <button className="button button-danger-ghost" onClick={() => setConfirmDelete(true)}>Delete record</button>)}
    {!row && resource === "images" && <form className="stack-sm" action={form => startTransition(async () => {
      try { const result = await uploadAdminImage(form); setMessage(result.error ?? "Image uploaded."); if (!result.error) router.refresh(); }
      catch { setMessage("Upload failed. Please try again."); }
    })}>
      <h3>Upload a new image</h3>
      <label className="field"><span>JPEG, PNG or WebP · up to 3 MB</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp" required disabled={pending} /></label>
      <label className="field"><span>Image description</span><input name="alt_text" required maxLength={1000} /></label>
      <button disabled={pending} className="button button-primary">Upload image</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
