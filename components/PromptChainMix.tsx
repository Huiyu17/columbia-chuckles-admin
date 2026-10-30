"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveResource } from "@/app/actions/resources";
import type { RecordRow } from "@/lib/resources";

export default function PromptChainMix({ chains, rows }: { chains: RecordRow[]; rows: RecordRow[] }) {
  const [message, setMessage] = useState("");
  return <section className="card stack-md"><h2>Prompt chain mix</h2>
    <MixForm key={JSON.stringify(rows)} chains={chains} rows={rows} setMessage={setMessage} />
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
function MixForm({ chains, rows, setMessage }: { chains: RecordRow[]; rows: RecordRow[]; setMessage: (value: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => rows.map(row => ({ id: row.id, chain: row.prompt_chain_id, enabled: row.enabled === true, weight: String(row.weight ?? 0) })));
  const [saved, setSaved] = useState(drafts);
  const [uncertain, setUncertain] = useState(false);
  const dirty = drafts.some((row,index)=>row.enabled!==saved[index].enabled || Number(row.weight)!==Number(saved[index].weight) || !row.weight.trim());
  const liveWeights = saved.map(row=>row.enabled && Number.isFinite(Number(row.weight)) && Number(row.weight)>0 ? Number(row.weight) : 0);
  const liveMaximum = Math.max(1,...liveWeights);
  const liveTotal = liveWeights.reduce((sum,weight)=>sum+weight/liveMaximum,0);
  const weights = drafts.map(row => row.enabled && Number.isFinite(Number(row.weight)) && Number(row.weight) > 0 ? Number(row.weight) : 0);
  const maximum = Math.max(1, ...weights);
  const total = weights.reduce((sum, weight) => sum + weight / maximum, 0);
  return <form className="stack-md" onSubmit={event => {
    event.preventDefault(); setMessage("");
    if (drafts.some(row => !row.weight.trim() || !Number.isFinite(Number(row.weight)) || Number(row.weight) < 0)) { setMessage("Enter a weight of 0 or greater for each chain."); return; }
    startTransition(async () => {
      const outcomes = await Promise.allSettled(drafts.map(row => saveResource("prompt-chain-mix", "update", row.id, { enabled: row.enabled, weight: Number(row.weight) })));
      const failures = outcomes.filter(result => result.status === "rejected" || result.value.error);
      setUncertain(failures.length>0);
      setMessage(failures.length ? `${outcomes.length - failures.length} of ${outcomes.length} settings saved. Refresh to confirm the live mix before making further changes.` : "Saved successfully. The updated mix is now live.");
      if (!failures.length) { setSaved(drafts.map(row=>({...row}))); router.refresh(); }
    });
  }}>
    <p role="status" className="small muted"><strong>{uncertain ? "Live settings need confirmation" : liveTotal>0 ? "Live mix enabled" : "Live mix disabled"}</strong>{!uncertain && <> · {liveWeights.filter(weight=>weight>0).length} active {liveWeights.filter(weight=>weight>0).length===1?"chain":"chains"}</>}</p>
    {dirty && !uncertain && <p role="status" className="mix-unsaved">Unsaved changes. The live mix has not changed. Save to apply this preview.</p>}
    <fieldset disabled={pending || uncertain} className="resource-fields"><div className="chain-table-wrap"><table className="chain-table">
      <thead><tr><th>Prompt chain</th><th>{dirty ? "Enable (draft)" : "Enabled"}</th><th>{dirty ? "Weight (draft)" : "Weight"}</th><th>Live chance</th>{dirty && <th>Preview chance</th>}</tr></thead>
      <tbody>{chains.map(chain => {
        const index = drafts.findIndex(row => row.chain === chain.id);
        const draft = drafts[index];
        const name = String(chain.name ?? "Unnamed prompt chain");
        return <tr key={String(chain.id)}><td>{name}</td>{draft ? <>
          <td><input type="checkbox" aria-label={`Enable ${name}`} checked={draft.enabled} onChange={event => { setMessage(""); setDrafts(drafts.map((row, i) => i === index ? { ...row, enabled: event.target.checked } : row)); }} /></td>
          <td><input aria-label={`Weight for ${name}`} type="number" min="0" step="any" required value={draft.weight} onChange={event => { setMessage(""); setDrafts(drafts.map((row, i) => i === index ? { ...row, weight: event.target.value } : row)); }} /></td>
          <td>{uncertain ? "Unconfirmed" : `${liveTotal>0?(liveWeights[index]/liveMaximum/liveTotal*100).toFixed(1):"0.0"}%`}</td>
          {dirty && <td>{total > 0 ? (weights[index] / maximum / total * 100).toFixed(1) : "0.0"}%</td>}
        </> : <td colSpan={dirty?4:3}>Not configured</td>}</tr>;
      })}</tbody>
    </table></div></fieldset>
    {total === 0 && <p role="status" className="test-error">No chain is selected. New caption generation will be unavailable with these settings.</p>}
    <div className="row"><button className="button button-primary" disabled={pending || uncertain || !drafts.length || !dirty}>{pending ? "Saving…" : "Save changes"}</button>
      {dirty && !uncertain && <button type="button" className="button button-ghost" disabled={pending} onClick={()=>{setDrafts(saved.map(row=>({...row})));setMessage("");}}>Discard changes</button>}
      {uncertain && <button type="button" className="button button-ghost" onClick={()=>window.location.reload()}>Refresh saved settings</button>}
    </div>
  </form>;
}
