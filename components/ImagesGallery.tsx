"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Column, RecordRow } from "@/lib/resources";
import type { ReferenceChoices } from "@/lib/reference-fields";
import { resourceDate } from "@/lib/resource-summary";
import ResourceEditor from "./ResourceEditor";
import Avatar from "./Avatar";

export default function ImagesGallery({ rows, columns, choices, query, selected, avatars = {} }: { rows:RecordRow[];columns:Column[];choices:ReferenceChoices;query:string;selected:string;avatars?:Record<string,string> }) {
  const [search,setSearch]=useState(query),[owner,setOwner]=useState(""),[page,setPage]=useState(1),[scope,setScope]=useState(selected);
  const [editing,setEditing]=useState<string|null>(null);
  const userChoices=choices.user_id;
  const users=[...new Map([...(userChoices?.options??[]),...(userChoices?.selected??[])].map(user=>[user.id,user])).values()];
  const filtered=rows.filter(row=>(!scope||row.id===scope)&&(!owner||(owner==='preset'?row.user_id==null:row.user_id===owner))&&
    (!search||`${row.alt_text??""} ${users.find(user=>user.id===row.user_id)?.label??""}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const pages=Math.max(1,Math.ceil(filtered.length/12)),current=Math.min(page,pages);
  return <div className="stack-lg">
    <div className="filters"><label className="field grow"><span>Search images</span><input placeholder="Image description or user name" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} /></label>
      <label className="field"><span>Uploaded by</span><select aria-label="Uploaded by" value={owner} onChange={event=>{setOwner(event.target.value);setPage(1);}}><option value="">All users</option><option value="preset">Sample photos</option>{users.map(user=><option key={user.id} value={user.id}>{user.label}</option>)}</select></label>
    </div>
    {userChoices?.error && <p role="status">Uploader choices could not be fully loaded. You can still browse images and search descriptions.</p>}
    {scope && <button className="button button-ghost" onClick={()=>{setScope("");setPage(1);}}>Show all images</button>}
    <details className="card"><summary>Upload image</summary><ResourceEditor resource="images" mode="crud" columns={columns} choices={choices} /></details>
    <p className="small muted">{filtered.length} images · Page {current} of {pages}</p>
    <div className="images-gallery">{filtered.slice((current-1)*12,current*12).map(row=>{
      const id=String(row.id),description=String(row.alt_text??"Image without description");
      return <article className="card stack-md image-gallery-card" key={id}>
        {typeof row.url==='string'&&/^https?:\/\//.test(row.url)&&<Image unoptimized width={480} height={300} className="image-gallery-preview" src={row.url} alt={description} />}
        <h2 className="resource-card-title">{description}</h2>
        {row.user_id==null ? <p className="small muted">Sample photo</p> : <Link href={`/users/${encodeURIComponent(String(row.user_id))}`} className="image-uploader image-uploader-link small muted"><Avatar url={avatars[String(row.user_id)]??null} name={users.find(user=>user.id===row.user_id)?.label.split(' (')[0]??"User"} /><span>{users.find(user=>user.id===row.user_id)?.label??"Uploader unavailable"}</span></Link>}
        {resourceDate(row.created_at)&&<p className="small muted">{resourceDate(row.created_at)}</p>}
        <div className="row image-gallery-actions"><Link className="button button-sm button-ghost" href={`/media?image=${encodeURIComponent(id)}`}>View captions →</Link><button className="button button-sm button-ghost" aria-expanded={editing===id} onClick={()=>setEditing(editing===id?null:id)}>{editing===id?"Close":"Edit"}</button></div>
        {editing===id&&<ResourceEditor resource="images" mode="crud" columns={columns} choices={choices} row={row} />}
      </article>;
    })}</div>
    {!filtered.length&&<p className="card">No images match these filters.</p>}
    <nav className="row" aria-label="Image pages"><button className="button button-ghost" disabled={current<=1} onClick={()=>setPage(current-1)}>Previous</button><button className="button button-ghost" disabled={current>=pages} onClick={()=>setPage(current+1)}>Next</button></nav>
  </div>;
}
