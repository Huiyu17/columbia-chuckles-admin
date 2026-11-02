import type { Column, RecordRow } from "@/lib/resources";
import type { ReferenceChoices } from "@/lib/reference-fields";
import { chainSteps, type ChainDisplayData } from "@/lib/prompt-chain-display";
import PromptChainMix from "./PromptChainMix";
import Link from "next/link";
import { preview, resourceDate } from "@/lib/resource-summary";
import PromptChainTemplate from "./PromptChainTemplate";

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
            <PromptChainTemplate steps={steps} data={data} />
            {!steps && <p role="status">Steps could not be loaded. Refresh to retry.</p>}
            {steps?.length === 0 && <p className="test-error">This prompt chain has no AI step and cannot generate a caption.</p>}
            {steps && steps.length > 1 && <p className="small muted">The public app executes these steps in order. Each step receives the previous output; the last output becomes the caption preview.</p>}
          </section>
          <section className="stack-md" aria-label="Recent runs">
            <h3>Recent runs</h3>
            <p className="small muted">Latest five runs from the public app and Prompt Chain Tool.</p>
            {data.recentRunsIncomplete?.[id] && data.recentRuns?.[id] !== undefined && <p role="status" className="small muted">Some run history could not be loaded. Showing available records; refresh to retry.</p>}
            {data.recentRuns?.[id] === undefined ? <p className="muted">Recent runs could not be loaded.</p> : data.recentRuns[id]!.length === 0 ? <p className="muted">{data.recentRunsIncomplete?.[id] ? "No runs available from the loaded sources." : "No recorded runs for this prompt chain yet."}</p> : <div className="chain-table-wrap"><table className="chain-table recent-runs-table">
              <thead><tr><th>Request scene / Source</th><th>User</th><th>Status</th><th>When</th></tr></thead>
              <tbody>{data.recentRuns[id]!.map(run => {
                const request = run.request && typeof run.request === "object" ? run.request as RecordRow : {};
                const user = data.users?.[String(run.user_id)];
                const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
                return <tr key={String(run.id)}><td><Link className="link-strong" href={`/manage/llm-responses?request=${encodeURIComponent(String(run.id))}`}>{preview(request.context ?? request.scene ?? "Scene not recorded", 100)}</Link><p className="recent-run-source"><span className="response-source">{request.source === "prompt-tool" ? "Prompt Chain Tool" : "Public app"}</span></p></td><td>{name || "User unavailable"}</td><td>{String(run.status ?? "Unknown")}</td><td>{resourceDate(run.created_at) ?? "Not recorded"}</td></tr>;
              })}</tbody>
            </table></div>}
            <Link className="small link-strong" href={`/manage/llm-responses?q=${encodeURIComponent(id)}`}>View all runs →</Link>
          </section>
        </div>
      </details>;
    })}
  </div>;
}
