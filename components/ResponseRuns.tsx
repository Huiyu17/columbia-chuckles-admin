"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { RecordRow } from "@/lib/resources";
import { groupResponses, responseModel, recordObject, recordText, type ResponseGroup, type UsageTotal } from "@/lib/response-groups";
import { preview, resourceDate } from "@/lib/resource-summary";

const sourceName = (source: string) => source === "prompt-tool" ? "Prompt Chain Tool" : "Public app";
const usage = (value: UsageTotal, unit = "") => value.value === null ? "Unavailable" : `${value.partial ? "≥ " : ""}${value.value.toLocaleString("en-US")}${unit}`;

export default function ResponseRuns({ rows, responses, chains, images, models, users, query }: {
  rows: RecordRow[]; responses: RecordRow[]; chains: RecordRow[]; images: RecordRow[]; models: RecordRow[]; users: Record<string, RecordRow>; query: string;
}) {
  const groups = groupResponses(rows, responses);
  const queryChain = chains.find(chain => chain.id === query);
  const responseRequest = responses.find(response => response.id === query)?.generation_request_id;
  const linkedId = queryChain ? "" : groups.find(group => group.id === query || group.request.generation_id === query)?.id
    ?? (typeof responseRequest === "string" ? responseRequest : /^[0-9a-f-]{36}$/i.test(query) ? query : "");
  const [scope, setScope] = useState(linkedId);
  const [source, setSource] = useState("");
  const [chain, setChain] = useState(queryChain ? String(queryChain.id) : "");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(queryChain || linkedId ? "" : query);
  const [page, setPage] = useState(1);
  const chainName = (group: ResponseGroup) => recordText(chains.find(item => item.id === group.request.prompt_chain_id)?.name)
    || recordText(recordObject(group.request.request).chain_name) || recordText(recordObject(group.request.request).deleted_chain_name, "Chain unavailable");
  const groupModels = (group: ResponseGroup) => [...new Set(group.responses.map(response => responseModel(group, response, models)))];
  const modelNames = [...new Set(groups.flatMap(groupModels))].sort();
  const statuses = [...new Set(groups.map(group => recordText(group.request.status, "unavailable")))].sort();
  const filtered = groups.filter(group => {
    const context = recordObject(group.request.request), user = users[String(group.request.user_id)];
    return (!scope || group.id === scope) && (!source || group.source === source) && (!chain || group.request.prompt_chain_id === chain)
      && (!model || groupModels(group).includes(model)) && (!status || group.request.status === status)
      && (!search || [group.id, chainName(group), context.context, context.scene, user?.first_name, user?.last_name,
        ...groupModels(group), ...group.responses.map(response => response.response)].join(" ").toLowerCase().includes(search.toLowerCase()));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 10)), current = Math.min(page, pages);
  const recordedCount = filtered.reduce((sum, group) => sum + group.responses.length, 0);
  function select(label: string, value: string, update: (value: string) => void, options: { value: string; label: string }[]) {
    return <label className="field"><span>{label}</span><select aria-label={label} value={value} onChange={event => { update(event.target.value); setPage(1); }}><option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  return <div className="stack-lg">
    <p className="muted">One card per generation. Follow its model responses in step order, from the first analysis to the final output.</p>
    {scope && <div className="row"><span className="small muted">Responses for the selected generation</span><button className="button button-sm button-ghost" onClick={() => { setScope(""); setPage(1); }}>Show all generations</button></div>}
    <div className="request-filters response-run-filters">
      {select("Source",source,setSource,[{value:"caption-app",label:"Public app"},{value:"prompt-tool",label:"Prompt Chain Tool"}])}
      {select("Prompt chain",chain,setChain,chains.map(item=>({value:String(item.id),label:recordText(item.name,"Unnamed chain")})))}
      {select("Model",model,setModel,modelNames.map(name=>({value:name,label:name})))}
      {select("Generation status",status,setStatus,statuses.map(name=>({value:name,label:name})))}
      <label className="field"><span>Search generations</span><input value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} placeholder="Scene, response, chain or user" /></label>
    </div>
    <p className="small muted">{filtered.length} generations · {recordedCount} recorded model responses · Page {current} of {pages}</p>
    <div className="response-run-list">{filtered.slice((current-1)*10,current*10).map(group => {
      const row=group.request, context=recordObject(row.request), user=users[String(row.user_id)];
      const name=[user?.first_name,user?.last_name].filter(Boolean).join(" ") || "User unavailable";
      const photo=images.find(image=>image.id===row.image_id), url=photo?.url ?? row.image_url;
      const last=group.responses.at(-1), output=recordText(context.output) || recordText(last?.response);
      const failure=recordText(context.error) || recordText(group.responses.find(response=>response.error)?.error);
      const completed=row.status === "completed";
      return <article key={group.id} className="card response-run">
        <header className="response-run-head"><div className="response-run-identity">
          {typeof url === "string" && /^https?:\/\//u.test(url) && <Image unoptimized width={68} height={68} className="response-run-photo" src={url} alt={recordText(photo?.alt_text,"Input photo")} />}
          <div className="stack-sm"><div className="row"><h2>{chainName(group)}</h2><span className="response-source">{sourceName(group.source)}</span></div><p className="small muted">{name} · <time dateTime={String(row.created_at)}>{resourceDate(row.created_at) ?? "Time unavailable"}</time>{context.style ? ` · ${String(context.style)}` : ""}</p></div>
        </div><span className={`resource-status generation-status-${["completed","failed","running","pending"].includes(String(row.status)) ? String(row.status) : "unknown"}`}>{recordText(row.status,"unavailable")}</span></header>
        <p className="response-run-scene">{recordText(context.context ?? context.scene,"Scene not recorded")}</p>
        <dl className="response-run-metrics"><div><dt>Recorded steps</dt><dd>{group.responses.length}{group.expectedSteps !== null ? ` / ${group.expectedSteps}` : ""}</dd></div><div><dt>Recorded duration</dt><dd>{usage(group.duration," ms")}</dd></div><div><dt>Input tokens</dt><dd>{usage(group.input)}</dd></div><div><dt>Output tokens</dt><dd>{usage(group.output)}</dd></div></dl>
        {(group.duration.partial || group.input.partial || group.output.partial) && <p className="small muted">≥ indicates a partial total; some step usage was not reported.</p>}
        <div className="response-run-output"><span className="eyebrow">{completed ? "Final output" : "Last saved output"}</span><p>{output ? preview(output,260) : "No output saved yet."}</p></div>
        {failure && <p className="test-error" role="status">{failure}</p>}
        <details className="response-run-execution" open={scope === group.id || undefined}><summary><span>View execution</span><span className="small muted">{group.responses.length} {group.responses.length===1?"step":"steps"}</span></summary>
          {!group.responses.length && <p className="muted">No model response has been recorded for this generation.</p>}
          <ol className="response-timeline">{group.responses.map((response,index)=>{
            const ordinal=typeof response.chain_step_order === "number" ? response.chain_step_order+1 : index+1;
            const isLast=group.expectedSteps !== null ? ordinal===group.expectedSteps : completed && index===group.responses.length-1;
            return <li key={String(response.id)} className="response-timeline-step"><span className="response-step-marker" aria-hidden="true">{ordinal}</span><section className="response-step-content">
              <header className="row"><strong>Step {ordinal}</strong>{isLast && <span className="response-final-tag">Final step</span>}<span className="small muted">{responseModel(group,response,models)}</span>{response.error != null && <span className="resource-status resource-status-warn">Error</span>}</header>
              <p className="small muted">{typeof response.latency_ms === "number" ? `${response.latency_ms.toLocaleString("en-US")} ms` : "Duration unavailable"} · In: {typeof response.input_tokens === "number" ? response.input_tokens.toLocaleString("en-US") : "Unavailable"} · Out: {typeof response.output_tokens === "number" ? response.output_tokens.toLocaleString("en-US") : "Unavailable"}</p>
              <p className="response-step-output">{recordText(response.response,"No text returned.")}</p>
              {response.error != null && <p className="test-error">{recordText(response.error,"Model call failed.")}</p>}
              <details className="response-step-prompt"><summary>Instructions sent to the model</summary><pre tabIndex={0} aria-label={`Full instructions for step ${ordinal}`}>{recordText(response.prompt,"Instructions were not recorded for this step.")}</pre></details>
            </section></li>;
          })}</ol>
        </details>
        <footer className="response-run-footer"><span className="small muted">{group.source === "prompt-tool" ? "Test only · No public caption created" : "Public caption generation"}</span><Link className="link-strong small" href={`/manage/generation-requests?record=${encodeURIComponent(group.id)}`}>View generation request →</Link></footer>
      </article>;
    })}</div>
    {!filtered.length && <section className="card"><h2>No generations match these filters.</h2><p className="muted">Try a different source, prompt chain or search.</p></section>}
    {pages>1 && <nav className="row" aria-label="Generation pages"><button className="button button-ghost" disabled={current<=1} onClick={()=>setPage(current-1)}>Previous</button><button className="button button-ghost" disabled={current>=pages} onClick={()=>setPage(current+1)}>Next</button></nav>}
  </div>;
}
