"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

export default function ConfigurationRow({ children, editor, columns, selected = false, variant = "default" }: {
  children: ReactNode; editor: ReactNode; columns: number; selected?: boolean; variant?: "provider" | "model" | "default";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <Fragment>
    <tr className={selected ? "configuration-selected" : undefined}>{children}<td><button className="button button-ghost" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{open ? "Close" : "Edit"}</button></td></tr>
    {open && <tr id={id}><td colSpan={columns}><div className={`configuration-editor configuration-editor-${variant}`}>{editor}</div></td></tr>}
  </Fragment>;
}
