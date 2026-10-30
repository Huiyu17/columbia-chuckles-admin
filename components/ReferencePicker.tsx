"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { searchReferenceOptions } from "@/app/actions/reference-options";
import { fieldLabel, referenceField, type ReferenceOption, type ReferencePage } from "@/lib/reference-fields";

export default function ReferencePicker({ resource, field, defaultValue, required, initial }: {
  resource: string; field: string; defaultValue: string; required: boolean; initial?: ReferencePage;
}) {
  const config = referenceField(field)!;
  const empty: ReferencePage = { options: [], selected: [], total: 0, page: 1 };
  const seed = initial ?? empty;
  const find = (id: string, data: ReferencePage) => [...data.options, ...data.selected].find(option => option.id === id);
  const [value, setValue] = useState(defaultValue);
  const [selection, setSelection] = useState<ReferenceOption | undefined>(() => find(defaultValue, seed));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(initial ? 0 : 1);
  const [result, setResult] = useState(seed);
  const [loading, setLoading] = useState(false);
  const select = useRef<HTMLSelectElement>(null);
  const valueRef = useRef(value);
  const id = useId();

  useEffect(() => {
    const form = select.current?.form;
    const reset = () => {
      setValue(defaultValue); valueRef.current = defaultValue;
      setSelection(initial ? [...initial.options, ...initial.selected].find(option => option.id === defaultValue) : undefined);
      setQuery(""); setPage(1);
    };
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue, initial]);

  useEffect(() => {
    if (query === "" && page === 1 && reload === 0 && initial) {
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const next = await searchReferenceOptions(resource, field, query, page, valueRef.current || undefined);
        if (!active) return;
        setResult(previous => page === 1 ? next : {
          ...next, options: [...new Map([...previous.options, ...next.options].map(option => [option.id, option])).values()],
        });
        const current = [...next.options, ...next.selected].find(option => option.id === valueRef.current);
        if (current) setSelection(current);
      } catch {
        if (active) setResult(previous => ({ ...previous, error: `Could not load ${config.plural}. Please retry.` }));
      } finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [resource, field, query, page, reload, initial, config.plural]);

  const useInitial = query === "" && page === 1 && reload === 0 && !!initial;
  const visible = useInitial ? initial : result;
  const busy = !useInitial && loading;
  const currentSelection = find(value, visible) ?? selection;
  const options = currentSelection && !visible.options.some(option => option.id === currentSelection.id)
    ? [currentSelection, ...visible.options] : visible.options;
  const unavailable = value && !options.some(option => option.id === value);
  const selectedHref = value ? config.table === "profiles" ? `/users/${encodeURIComponent(value)}`
    : `/manage/${config.route}?record=${encodeURIComponent(value)}` : undefined;
  return <div className="stack-sm reference-picker">
    <div className="field">
      <label className="reference-label" htmlFor={id}>{fieldLabel(resource, field)}</label>
      <select ref={select} id={id} name={field} value={value} required={required} aria-describedby={`${id}-help`}
        onChange={event => {
          const chosen = event.target.value;
          setValue(chosen); valueRef.current = chosen;
          setSelection(options.find(option => option.id === chosen));
        }}>
        <option value="">{required ? `Choose a ${config.singular}` : config.empty}</option>
        {unavailable && <option value={value}>Previously selected {config.singular} (unavailable)</option>}
        {options.map(option => <option key={option.id} value={option.id}>
          {option.label}
        </option>)}
      </select>
    </div>
    {!["image_id", "provider_id", "user_id"].includes(field) && <label className="field reference-search">
      <span className="small muted">Find a {config.singular}</span>
      <input type="search" aria-label={`Search ${config.plural}`} placeholder={`Search ${config.plural} by name…`}
        value={query} maxLength={200} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
        onChange={event => { setLoading(true); setQuery(event.target.value); setPage(1); }} />
    </label>}
    <p id={`${id}-help`} className="small muted">{busy ? `Loading ${config.plural}…`
      : visible.error ? visible.error : visible.total === 0 ? field === "image_id" ? "No images available." : field === "provider_id" ? "No providers registered. Add a provider first." : `No matching ${config.plural}. Try a different search.`
      : ["image_id", "provider_id"].includes(field) ? `${visible.total} ${config.plural} available.` : `${visible.total} matching ${config.plural}.`}</p>
    {visible.error && <button type="button" className="button button-sm button-ghost" disabled={busy} onClick={() => { setLoading(true); setReload(n => n + 1); }}>Retry choices</button>}
    {!visible.error && page * 25 < visible.total && <button type="button" className="button button-sm button-ghost" disabled={busy} onClick={() => { setLoading(true); setPage(n => n + 1); }}>Load more {config.plural}</button>}
    {currentSelection?.description && <p className="small muted">{currentSelection.description}</p>}
    {currentSelection?.imageUrl && <Image unoptimized width={160} height={100} className="reference-image" src={currentSelection.imageUrl} alt={currentSelection.label} />}
    {selectedHref && !["provider_id", "user_id"].includes(field) && <a className="small link-strong" href={selectedHref} target="_blank" rel="noreferrer">View selected {config.singular} <span className="sr-only">(opens in a new tab)</span>↗</a>}
  </div>;
}
