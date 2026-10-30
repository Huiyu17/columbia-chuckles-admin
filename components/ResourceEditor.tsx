"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResource, uploadAdminImage } from "@/app/actions/resources";
import type { Column, RecordRow } from "@/lib/resources";
import { fieldValue, resourcePayload } from "@/lib/resource-fields";
import { fieldHelp, fieldLabel, referenceField, type ReferenceChoices, type ReferenceField } from "@/lib/reference-fields";
import ReferencePicker from "./ReferencePicker";

export default function ResourceEditor({ resource, mode, columns, row, choices = {}, fixedFields = [], showFieldHelp = true }: {
  resource: string; mode: string; columns: Column[]; row?: RecordRow; choices?: ReferenceChoices; fixedFields?: string[]; showFieldHelp?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uploadNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (uploadNoticeTimer.current) clearTimeout(uploadNoticeTimer.current); }, []);
  const primary = columns.find(c => c.primary)?.name ?? "id";
  const fields = columns.filter(c => !c.generated && !c.primary && !["created_at", "updated_at"].includes(c.name)
    && !(resource === "images" && ["url", "storage_path"].includes(c.name)));
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
  return <div className={row ? "stack-md resource-editor-existing" : "stack-md"}>
    {!(resource === "images" && !row) && <form className="stack-md resource-editor-form" onSubmit={event => {
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
      {fields.map(c => fixedFields.includes(c.name) ? <input key={c.name} type="hidden" name={c.name} value={String(row?.[c.name] ?? "")} /> : <div key={c.name} className="stack-sm">
        {referenceField(c.name) ? <ReferencePicker resource={resource} field={c.name}
          defaultValue={row?.[c.name] == null ? "" : String(row[c.name])}
          required={c.required && (!!row || c.default_value === null)} initial={choices[c.name as ReferenceField]} />
        : <label className="field">
          <span>{fieldLabel(resource, c.name)}</span>
          {c.type === "boolean" ? <select name={c.name} defaultValue={String(row?.[c.name] ?? "")} required={c.required && (!!row || c.default_value === null)}>
            {!(resource === "prompt-chain-mix" && c.name === "enabled") && <option value="">Use default / none</option>}
            <option value="true">{resource === "prompt-chain-mix" && c.name === "enabled" ? "Enabled — can be selected" : "True"}</option>
            <option value="false">{resource === "prompt-chain-mix" && c.name === "enabled" ? "Disabled — will not be selected" : "False"}</option>
          </select> : /prompt|response|content|definition|description|alt_text|json|\[\]/.test(c.name + c.type)
            ? <textarea name={c.name} aria-label={fieldLabel(resource, c.name)} rows={4} required={c.required && (!!row || c.default_value === null)} maxLength={100_000}
              placeholder={/json|\[\]/.test(c.type) ? "Enter JSON" : undefined} defaultValue={fieldValue(c, row?.[c.name])} />
            : <input name={c.name} type={/^(smallint|integer|bigint|numeric|real|double precision)/.test(c.type) ? "number" : c.name === "email" ? "email" : "text"}
              step="any" min={resource === "prompt-chain-mix" && c.name === "weight" ? 0 : undefined}
              required={c.required && (!!row || c.default_value === null)} defaultValue={fieldValue(c, row?.[c.name])} />}
        </label>}
        {showFieldHelp && fieldHelp(resource, c.name) && <p className="small muted">{fieldHelp(resource, c.name)}</p>}
        {!c.required && !referenceField(c.name) && <label className="small muted"><input type="checkbox" name={`null:${c.name}`} defaultChecked={!!row && row[c.name] === null} /> Set to null (clear this field)</label>}
      </div>)}
      </fieldset>
      <button className="button button-primary" disabled={pending}>{pending ? "Saving…" : row ? "Save changes" : "Create record"}</button>
    </form>}
    {row && mode === "crud" && (confirmDelete ? <div className="stack-sm" role="alert">
      <p>Delete this record permanently? Related records may prevent deletion.</p>
      {resource === "images" && <p>Image metadata will be deleted. The stored file is retained to avoid breaking existing media links.</p>}
      <button className="button button-danger" disabled={pending} onClick={() => mutate("delete", {})}>Confirm delete</button>{" "}
      <button className="button button-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
    </div> : <button className="button button-danger-ghost" onClick={() => setConfirmDelete(true)}>Delete record</button>)}
    {!row && resource === "images" && <form className="stack-sm" action={form => startTransition(async () => {
      try {
        if (uploadNoticeTimer.current) clearTimeout(uploadNoticeTimer.current);
        const result = await uploadAdminImage(form);
        setMessage(result.error ?? "Image uploaded.");
        if (!result.error) {
          router.refresh();
          uploadNoticeTimer.current = setTimeout(() => setMessage(current => current === "Image uploaded." ? "" : current), 3500);
        }
      }
      catch { setMessage("Upload failed. Please try again."); }
    })}>
      <label className="field"><span>JPEG, PNG or WebP · up to 3 MB</span><input type="file" name="file" accept="image/jpeg,image/png,image/webp" required disabled={pending} /></label>
      <label className="field"><span>Image description</span><input name="alt_text" required maxLength={1000} /></label>
      <button disabled={pending} className="button button-primary">Upload image</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
  </div>;
}
