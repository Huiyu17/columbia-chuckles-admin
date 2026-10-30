import type { RecordRow } from "@/lib/resources";
import { stepModelName, type ChainDisplayData } from "@/lib/prompt-chain-display";

export default function PromptChainTemplate({ steps, data }: { steps?: RecordRow[]; data: ChainDisplayData }) {
  return <section className="chain-example stack-md" aria-label="Prompt chain template">
    <h3>How this prompt chain works</h3>
    <p className="small muted">Illustrative flow — shows the types of input and output, not a loaded request.</p>
    <div className="flow-node stack-md"><span className="eyebrow">Input</span>
      <div className="chain-example-input"><div className="template-photo template-photo-guide"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-6 5 7" /></svg><span>Photo selected<br />by the user</span></div>
        <dl className="stack-sm"><div><dt className="small muted">Image description</dt><dd>Description of the selected photo</dd></div><div><dt className="small muted">Scene</dt><dd>Situation entered by the user</dd></div><div><dt className="small muted">Humor style</dt><dd>Relatable / Deadpan / Absurd</dd></div></dl>
      </div>
    </div>
    <div className="flow-arrow" aria-hidden="true">↓</div>
    <div className="flow-node flow-model stack-md"><span className="eyebrow">Prompt chain step{steps && steps.length!==1 ? "s" : ""}</span>
      <dl className="template-instruction-guide">
        <div><dt>Caption writing rules</dt><dd>Keep it short, ground the joke in the photo, and avoid invented details.</dd></div>
        <div><dt>Humor style</dt><dd>Apply the writing directions for the style selected above: relatable, deadpan or absurd.</dd></div>
        <div><dt>Photo &amp; scene</dt><dd>Use the photo or its description together with the user’s scene as the context for the joke.</dd></div>
      </dl>
      <details open><summary>Current prompt chain step configuration</summary><div className="stack-md">
        {steps?.map((step,index)=><div className="stack-sm" key={String(step.id)}>{steps.length>1&&<h4>Step {index+1}</h4>}<p className="chain-model-label">Model: {stepModelName(data,step)}</p><blockquote className="test-instruction">{String(step.prompt??"No instruction configured.")}</blockquote></div>)}
        {!steps&&<p className="muted">Step configuration could not be loaded.</p>}
        {steps?.length===0&&<p className="muted">No step configured.</p>}
      </div></details>
    </div>
    <div className="flow-arrow" aria-hidden="true">↓</div>
    <div className="flow-node stack-sm"><span className="eyebrow">Output</span><h3>Caption draft</h3><p className="muted">Caption generated from these inputs, ready for the user to review.</p></div>
  </section>;
}
