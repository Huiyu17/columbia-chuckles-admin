import Link from "next/link";
import { promptChainHref } from "@/lib/prompt-chain-workspace";
import { chainAvailability, chainSteps, stepModelName, type ChainDisplayData } from "@/lib/prompt-chain-display";
import type { RecordRow } from "@/lib/resources";
import RecordIdentifier from "./RecordIdentifier";

export default function PromptChainOverview({ chains, data, selected }: { chains: RecordRow[]; data: ChainDisplayData; selected?: RecordRow }) {
  if (selected) {
    const steps = chainSteps(data, selected.id);
    const id = String(selected.id);
    return <div className="stack-lg">
      <section className="card stack-md"><div className="row resource-results-head"><h2>Steps in this workflow</h2><span className="resource-status">{chainAvailability(data, selected.id)}</span></div>
        <p className="muted">Read from top to bottom. Each numbered card is one configured model step. The caption app currently runs a single step per generation.</p>
        {!steps && <p role="status">The steps could not be loaded. Please refresh.</p>}
        {steps?.length === 0 && <p>No steps are configured for this workflow.</p>}
        {steps && steps.length > 1 && <p className="test-error">This workflow has multiple steps. They are shown in order below, but the current caption app and Test run require exactly one step.</p>}
        <ol className="test-trace">{steps?.map((step, index) => <li className="test-stage" key={String(step.id)}>
          <h3>Step {index + 1}</h3><p className="small muted">Model: {stepModelName(data, step)}</p>
          <details open={steps.length === 1}><summary>AI instructions</summary><pre className="prompt">{String(step.prompt ?? "No instruction text")}</pre></details>
          <Link className="small link-strong" href={promptChainHref("steps", String(step.id), 1, id)}>View full step record →</Link>
        </li>)}</ol>
        <p className="small muted">Shared caption rules are added before these instructions. Test run shows the exact assembled prompt and actual model response.</p>
      </section>
      <div className="row"><Link className="button button-ghost" href={promptChainHref("selection", "", 1, id)}>Change selection settings</Link>
        <Link className="button button-primary" href={promptChainHref("test", "", 1, id)}>Test this workflow</Link>
        <Link className="button button-ghost" href={`/manage/generation-requests?q=${encodeURIComponent(id)}`}>View generation history</Link></div>
      <details className="card"><summary>Workflow details</summary><RecordIdentifier id={id} />
        <dl className="resource-record">{Object.entries(selected).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><pre>{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}</pre></dd></div>)}</dl>
      </details>
    </div>;
  }
  return <div className="chain-table-wrap card"><table className="chain-table">
    <thead><tr><th>Workflow</th><th>Model</th><th>Steps</th><th>Selection</th><th><span className="sr-only">Actions</span></th></tr></thead>
    <tbody>{chains.map(chain => {
      const steps = chainSteps(data, chain.id);
      const models = steps ? [...new Set(steps.map(step => stepModelName(data, step)))].join(", ") : "Model unavailable";
      return <tr key={String(chain.id)}><td><Link className="link-strong" href={promptChainHref("workflows", "", 1, String(chain.id))}>{String(chain.name ?? "Unnamed workflow")}</Link>
        {chain.description != null && <p className="small muted clamp-2">{String(chain.description)}</p>}
        <RecordIdentifier id={String(chain.id)} /></td>
        <td>{models || "Not configured"}</td><td>{steps?.length ?? "Unavailable"}</td><td>{chainAvailability(data, chain.id)}</td>
        <td><Link className="button button-sm button-ghost" href={promptChainHref("workflows", "", 1, String(chain.id))}>Open workflow →</Link></td></tr>;
    })}</tbody>
  </table></div>;
}
