import type { Column, RecordRow } from "@/lib/resources";
import type { ReferenceChoices } from "@/lib/reference-fields";
import { chainSteps, stepModelName, type ChainDisplayData } from "@/lib/prompt-chain-display";
import PromptChainMix from "./PromptChainMix";
import Link from "next/link";
import { preview, resourceDate } from "@/lib/resource-summary";

export default function PromptChainFlow({ data, selectedId }: {
  data: ChainDisplayData; selectedId: string; columns: Column[]; choices: ReferenceChoices;
}) {
  return <div className="stack-lg">
    {data.chains && data.mix && <PromptChainMix chains={data.chains} rows={data.mix} />}
    {!data.chains?.length && <p className="card">No prompt chains available.</p>}
    {data.chains?.map((chain, index) => {
      const id = String(chain.id);
      const steps = chainSteps(data, chain.id);
      return <details className="card stack-md chain-flow" key={id} open={selectedId ? selectedId === id : index === 0}>
        <summary><span>{String(chain.name ?? "Unnamed prompt chain")}</span>{" "}<span className="chain-kind-label">Prompt chain</span><span className="small muted"> · {steps ? `${steps.length} ${steps.length === 1 ? "step" : "steps"}` : "Steps unavailable"}</span></summary>
        <div className="chain-flow-layout">
          <section className="stack-md" aria-label="Caption generation flow">
            <div className="flow-node"><span className="eyebrow">Input</span><h3>Photo + scene + humor style</h3></div>
            <div className="flow-arrow" aria-hidden="true">↓</div>
            {steps?.map((step, stepIndex) => <div key={String(step.id)} className="stack-md">
              <div className="flow-node flow-model"><span className="eyebrow">{steps.length === 1 ? "Prompt chain step: Generate caption" : `Prompt chain step ${stepIndex + 1}`}</span>
                <h3 className="chain-model-label">Model: {stepModelName(data, step)}</h3>
                <blockquote className="test-instruction">{String(step.prompt ?? "No instruction configured.")}</blockquote>
              </div><div className="flow-arrow" aria-hidden="true">↓</div>
            </div>)}
            {!steps && <p role="status">Steps could not be loaded. Refresh to retry.</p>}
            {steps?.length === 0 && <p className="test-error">This prompt chain has no AI step and cannot generate a caption.</p>}
            {steps && steps.length > 1 && <p className="test-error">These are the configured steps in order. The current generation engine supports exactly one step, so this prompt chain cannot run yet.</p>}
            <div className="flow-node"><span className="eyebrow">Output</span><h3>Caption draft</h3></div>
          </section>
          <section className="stack-md" aria-label="Recent runs">
            <h3>Recent runs</h3>
            {data.recentRuns?.[id] === undefined ? <p className="muted">Recent runs could not be loaded.</p> : data.recentRuns[id]!.length === 0 ? <p className="muted">No recorded runs for this prompt chain yet.</p> : <div className="chain-table-wrap"><table className="chain-table recent-runs-table">
              <thead><tr><th>Request scene</th><th>User</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{data.recentRuns[id]!.map(run => {
                const request = run.request && typeof run.request === "object" ? run.request as RecordRow : {};
                const user = data.users?.[String(run.user_id)];
                const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
                return <tr key={String(run.id)}><td><Link className="link-strong" href={`/manage/generation-requests?record=${encodeURIComponent(String(run.id))}`}>{preview(request.context ?? request.scene ?? "Scene not recorded", 100)}</Link></td><td>{name || "User unavailable"}</td><td>{String(run.status ?? "Unknown")}</td><td>{resourceDate(run.created_at) ?? "Not recorded"}</td></tr>;
              })}</tbody>
            </table></div>}
            <Link className="small link-strong" href={`/manage/generation-requests?chain=${encodeURIComponent(id)}`}>View all runs →</Link>
          </section>
        </div>
      </details>;
    })}
  </div>;
}
