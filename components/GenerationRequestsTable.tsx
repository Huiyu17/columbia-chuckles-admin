"use client";

import { Fragment, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { RecordRow } from "@/lib/resources";
import type { CaptionLifecycle } from "@/lib/caption-lifecycle";
import { preview, resourceDate } from "@/lib/resource-summary";
import Avatar from "./Avatar";

const object = (value: unknown): RecordRow => value && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};
const text = (value: unknown, fallback = "Not recorded") => typeof value === "string" && value.trim() ? value : fallback;
const responseResult = (row: RecordRow) => {
  const output = object(row.responseRecord);
  return output.error != null ? "Error" : text(output.response, "") ? "Returned" : "Empty response";
};
export default function GenerationRequestsTable({ rows, chains, images, responses, users, states, query, responseView = false }: {
  rows: RecordRow[]; chains: RecordRow[]; images: RecordRow[]; responses: RecordRow[]; users: Record<string, RecordRow>; states: Record<string, CaptionLifecycle>; query: string; responseView?: boolean;
}) {
  const queryChain = chains.find(chain => chain.id === query);
  const linkedRecord = !queryChain && query && (rows.some(row => row.id === query || row.generation_request_id === query || row.generation_id === query) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(query)) ? query : "";
  const [scope, setScope] = useState(linkedRecord);
  const [chain, setChain] = useState(queryChain ? String(queryChain.id) : "");
  const [search, setSearch] = useState(queryChain || linkedRecord ? "" : query);
  const [model, setModel] = useState(""); const [style, setStyle] = useState("");
  const [generation, setGeneration] = useState(""); const [caption, setCaption] = useState("");
  const [page, setPage] = useState(1); const [expanded, setExpanded] = useState<string | null>(null);
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  const filtered = rows.filter(row => (!scope || row.id === scope || row.generation_request_id === scope || row.generation_id === scope) && (!chain || row.prompt_chain_id === chain) && (!model || object(row.request).model === model)
    && (!style || object(row.request).style === style) && (!generation || (responseView ? responseResult(row) : row.status) === generation)
    && (!caption || states[String(row.id)]?.state === caption) && (!search || [object(row.request).context, object(row.request).scene, object(row.request).model, object(row.responseRecord).response, chains.find(chain => chain.id === row.prompt_chain_id)?.name, users[String(row.user_id)]?.first_name, users[String(row.user_id)]?.last_name].filter(value=>typeof value === "string").join(" ").toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pages);
  function select(label: string, value: string, update: (value: string) => void, options: { value: string; label: string }[]) {
    return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={event => { update(event.target.value); setPage(1); }}><option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  const choices = (values: string[]) => unique(values).map(value => ({value,label:value}));
  return <div className="stack-lg">
    {scope && <div className="row"><span className="small muted">{responseView ? "Responses for the selected request" : "Selected generation request"}</span><button className="button button-sm button-ghost" onClick={()=>{setScope("");setPage(1);}}>Show all {responseView ? "responses" : "requests"}</button></div>}
    <div className="request-filters">
      {!responseView && select("Prompt chain",chain,setChain,chains.map(row=>({value:String(row.id),label:text(row.name)})))}
      {select("Model",model,setModel,choices(rows.map(row=>text(object(row.request).model,""))))}
      {!responseView && select("Style",style,setStyle,choices(rows.map(row=>text(object(row.request).style,""))))}
      {select(responseView ? "Result" : "Generation status",generation,setGeneration,choices(rows.map(row=>responseView ? responseResult(row) : text(row.status,""))))}
      {!responseView && select("Caption status",caption,setCaption,unique(Object.values(states).map(state=>state.state)).map(value=>({value,label:Object.values(states).find(state=>state.state===value)!.label})))}
      <label className="field"><span>{responseView ? "Search responses" : "Search requests"}</span><input value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder={responseView ? "Response text or model name" : "Scene or user name"} /></label>
    </div>
    <p className="small muted">{filtered.length} {responseView ? "responses" : "requests"} · Page {current} of {pages}</p>
    <div className="card request-table-wrap"><table className={`request-table ${responseView ? "response-table" : ""}`}><thead><tr>{responseView ? <><th>Response</th><th>Model</th><th>Result</th><th>Usage</th></> : <><th>Photo</th><th>User</th><th>Prompt chain / Model</th><th>Style</th><th>Generation</th><th>Caption</th></>}<th>When</th><th>Details</th></tr></thead>
      <tbody>{filtered.slice((current-1)*25,current*25).map(row=>{
        const id=String(row.id), request=object(row.request);
        const photo=images.find(image=>image.id===row.image_id), user=users[String(row.user_id)];
        const name=[user?.first_name,user?.last_name].filter(Boolean).join(" ") || "User name unavailable";
        const lifecycle=states[id];
        const chainName=text(chains.find(item=>item.id===row.prompt_chain_id)?.name,"Chain unavailable");
        const outputs=responseView ? [object(row.responseRecord)] : responses.filter(response=>response.generation_request_id===row.id);
        return <Fragment key={id}><tr>
          {!responseView && <>
          <td>{typeof photo?.url === "string" && /^https?:\/\//.test(photo.url) ? <Image unoptimized width={64} height={64} className="request-thumbnail" src={photo.url} alt={text(photo.alt_text,"Input photo")} /> : <span className="muted">Unavailable</span>}</td>
          <td>{row.user_id ? <Link href={`/users/${encodeURIComponent(String(row.user_id))}`} className="request-user"><Avatar url={typeof user?.avatar_url === "string" ? user.avatar_url : null} name={name} /><span>{name}</span></Link> : "User unavailable"}</td>
          <td><strong>{chainName}</strong><p className="small muted">{text(request.model)}</p></td><td>{text(request.style)}</td>
          <td><span className="resource-status">{text(row.status)}</span></td><td>{lifecycle?.href ? <Link className="link-strong" href={lifecycle.href}>{lifecycle.label}</Link> : lifecycle?.label ?? "Status unavailable"}</td>
          </>}
          {responseView && <><td><p className="response-preview">{(expanded === id ? text(outputs[0].response, "") : preview(outputs[0].response, 140)) || (outputs[0].error ? "Model call failed" : "No text returned")}</p></td><td>{text(request.model)}</td><td><span className={`resource-status resource-status-${responseResult(row) === "Returned" ? "ok" : "warn"}`}>{responseResult(row)}</span></td><td><p className="small">{typeof outputs[0].latency_ms === "number" ? `${outputs[0].latency_ms} ms` : "Latency not reported"}</p><p className="small muted">In: {String(outputs[0].input_tokens ?? "—")} · Out: {String(outputs[0].output_tokens ?? "—")}</p></td></>}
          <td><time dateTime={String(row.created_at)}>{resourceDate(row.created_at) ?? "Not recorded"}</time></td>
          <td className="request-details-control"><button className="button button-sm button-ghost" aria-expanded={expanded===id} onClick={()=>setExpanded(expanded===id?null:id)}>{expanded===id?"Close":"View details"}</button></td>
        </tr>{expanded===id && <tr><td colSpan={responseView ? 6 : 8}><div className="request-details stack-md">
          {!responseView && <h3>{text(request.context ?? request.scene,"Generation details")}</h3>}
          {!responseView && <div className="row">{outputs.length > 0 ? <Link className="button button-ghost" href={`/manage/llm-responses?request=${encodeURIComponent(id)}`}>View model response{outputs.length > 1 ? "s" : ""} →</Link> : <span className="muted">No model response recorded.</span>}
            {lifecycle?.href && <Link className="button button-primary" href={lifecycle.href}>{lifecycle.state === "published" ? "View caption in AI media" : "Review caption in AI media"} →</Link>}
          </div>}
          {responseView && outputs.filter(output=>output.error != null).map(output=><section className="stack-sm" key={String(output.id)}>
            {output.error != null && <p className="test-error">{typeof output.error === "string" ? output.error : "The model call failed. Review the response record for this request."}</p>}
          </section>)}
          <details><summary>Instructions sent to the model</summary><p className="prompt">{text(responseView ? outputs[0]?.prompt ?? request.prompt : request.prompt,"Prompt was not recorded for this request.")}</p></details>
          {responseView && <div className="row">{typeof row.generation_request_id === "string" && <Link className="button button-ghost" href={`/manage/generation-requests?record=${encodeURIComponent(row.generation_request_id)}`}>View generation request →</Link>}</div>}
        </div></td></tr>}</Fragment>;
      })}</tbody></table>{filtered.length===0 && <p>No requests match these filters.</p>}</div>
    <nav className="row" aria-label="Request pages"><button className="button button-ghost" disabled={current<=1} onClick={()=>setPage(current-1)}>Previous</button><button className="button button-ghost" disabled={current>=pages} onClick={()=>setPage(current+1)}>Next</button></nav>
  </div>;
}
