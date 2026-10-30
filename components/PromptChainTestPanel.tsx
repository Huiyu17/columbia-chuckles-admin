"use client";

import { useId, useRef, useState } from "react";
import { preparePromptChainTest, runPromptChainTest } from "@/app/actions/prompt-chain-test";
import type { ChainTestInput, ChainTestResult, PreparedChainTest } from "@/lib/prompt-chain-test";
import type { ReferencePage } from "@/lib/reference-fields";
import ReferencePicker from "./ReferencePicker";

export default function PromptChainTestPanel({ workflows, images, workflowId = "" }: {
  workflows: ReferencePage; images: ReferencePage; workflowId?: string;
}) {
  const [mode, setMode] = useState<"current" | "specific">(workflowId ? "specific" : "current");
  const [plan, setPlan] = useState<PreparedChainTest | null>(null);
  const [result, setResult] = useState<ChainTestResult | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "preparing" | "preview" | "calling" | "done">("idle");
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const id = useId();
  const titles = ["Choose inputs & prompt chain", "Assemble the prompt", "Call the model", "Check the response"];
  function stage(index: number) {
    if (index === 0) return phase === "preparing" ? "Running" : plan ? "Complete" : "Waiting";
    if (index === 1) return plan ? "Complete" : "Waiting";
    if (index === 2) return phase === "calling" ? "Running" : result?.modelCalled ? result.validation === "not-run" ? "Failed" : "Complete" : "Not run";
    return result?.validation === "passed" ? "Passed" : result?.validation === "rejected" ? "Rejected" : "Not run";
  }
  return <div className="stack-lg">
    <div className="card stack-sm"><h2>Test a prompt chain</h2>
      <p className="muted">Inspect the exact instructions, prompt and model response. Preview prompt makes no AI call. Run test calls the configured AI model.</p>
      <p className="small muted">Admin test only: no caption is published, and no test request or response is saved to user history.</p>
    </div>
    <form className="card stack-md" onChange={() => { if (!pending) { setPlan(null); setResult(null); setError(""); setPhase("idle"); } }}
      onSubmit={event => {
        event.preventDefault();
        if (running.current) return;
        const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "run";
        const form = new FormData(event.currentTarget);
        const input: ChainTestInput = { mode, workflowId: String(form.get("prompt_chain_id") ?? "") || undefined,
          imageId: String(form.get("image_id") ?? ""), scene: String(form.get("scene") ?? ""), style: String(form.get("style")) as ChainTestInput["style"] };
        setError(""); setResult(null);
        running.current = true; setPending(true);
        // Keep progress updates urgent so the prepared prompt is visible while
        // the separate, real model call is still pending.
        void (async () => {
          try {
            let prepared = plan;
            if (!prepared || intent === "preview") {
              setPlan(null); setPhase("preparing");
              const next = await preparePromptChainTest(input);
              if (!next.plan || next.error) { setError(next.error ?? "Could not prepare this test."); setPhase("idle"); return; }
              prepared = next.plan; setPlan(prepared);
            }
            if (intent === "preview") { setPhase("preview"); return; }
            setPhase("calling");
            const output = await runPromptChainTest(prepared);
            setResult(output); setPhase("done");
          } catch { setError("The test was interrupted. Please try again."); setPhase("idle"); }
          finally { running.current = false; setPending(false); }
        })();
      }}>
      <fieldset className="resource-fields stack-md" disabled={pending}>
        <div className="field"><label className="reference-label" htmlFor={`${id}-mode`}>Prompt chain selection</label><select id={`${id}-mode`} value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
          <option value="current">Follow prompt chain mix</option>
          <option value="specific">Test a specific prompt chain</option>
        </select></div>
        {mode === "specific" && <><ReferencePicker resource="prompt-chain-mix" field="prompt_chain_id" defaultValue={workflowId} required initial={workflows} />
          <p className="small muted">A specific prompt chain test ignores its enabled flag and weight. Live selection settings are not changed.</p></>}
        <ReferencePicker resource="prompt-chain-mix" field="image_id" defaultValue="" required initial={images} />
        <label className="field"><span>Scene</span><textarea name="scene" required minLength={5} maxLength={500} rows={3} placeholder="Describe the moment this caption should be about." /></label>
        <div className="field"><label className="reference-label" htmlFor={`${id}-style`}>Humor style</label><select id={`${id}-style`} name="style" defaultValue="relatable">
          <option value="relatable">Relatable</option><option value="deadpan">Deadpan</option><option value="absurd">Absurd</option>
        </select></div>
        <div className="row"><button className="button button-primary" type="submit" value="run">{phase === "calling" ? "Running test…" : "Run test"}</button>
          <button className="button button-ghost" type="submit" value="preview">Preview prompt only</button></div>
      </fieldset>
      <p role="status" aria-live="polite" className="small muted">{pending ? phase === "calling" ? "Waiting for the model. The AI call has a 45-second timeout." : "Reading the prompt chain and building its prompt…" : phase === "preview" ? "Preview ready. The model has not been called." : ""}</p>
      {error && <p role="alert" className="test-error">{error}</p>}
    </form>
    <section className="card stack-md" aria-label="Test execution trace">
      <h2>Execution trace</h2>
      <ol className="test-trace">{titles.map((title, index) => <li key={title} className={stage(index) === "Running" ? "test-stage active" : "test-stage"}>
        <div className="row"><strong>{index + 1}. {title}</strong><span className="resource-status">{stage(index)}</span></div>
        {index === 0 && plan && <div className="stack-sm small muted">
          <p><strong>{plan.workflow.name}</strong> · {plan.selection.mode === "current" ? `Selected from ${plan.selection.eligibleCount} eligible prompt chain(s) using live weights.` : "Manually selected for this test."}</p>
          {plan.selection.mode === "specific" && <p>Live setting: {plan.selection.enabled === null ? "Not in selection" : plan.selection.enabled ? "Enabled" : "Disabled"}{plan.selection.weight !== null ? ` · weight ${plan.selection.weight}` : ""}. This test does not change that setting.</p>}
          <p>Scene: {plan.input.scene} · Style: {plan.input.style}</p>
          <p>Image context: {plan.image.usesPhoto ? "Image pixels and description" : "Image description only"}. {plan.recentCaptionCount} recent preview(s) supplied as examples to avoid repeating.</p>
        </div>}
        {index === 1 && plan && <div className="stack-sm"><p className="small muted">Step 1 · {plan.model.provider} / {plan.model.name}</p>
          <blockquote className="test-instruction">{plan.step.instruction}</blockquote>
          <details><summary>Full assembled prompt</summary><pre className="prompt">{plan.prompt}</pre></details>
          <details><summary>Shared caption rules before the step instruction</summary><pre className="prompt">{plan.basePrompt}</pre></details>
        </div>}
        {index === 2 && result?.modelCalled && <dl className="resource-meta small muted"><div><dt>Model latency</dt><dd>{result.latencyMs} ms</dd></div>
          <div><dt>Input tokens</dt><dd>{result.inputTokens ?? "Not reported"}</dd></div><div><dt>Output tokens</dt><dd>{result.outputTokens ?? "Not reported"}</dd></div></dl>}
        {index === 3 && <p className="small muted">Checks cover non-empty output, the caption length limit and repetition. Review humor and visual fit yourself against the instructions above.</p>}
      </li>)}</ol>
      {result && <div className="test-output stack-sm"><span className="eyebrow">Admin test · Not published</span>
        <h3>Model response</h3>{result.response ? <p className="test-response">{result.response}</p> : <p className="muted">No response was returned.</p>}
        {result.error && <p role="alert" className="test-error">{result.error}</p>}
      </div>}
    </section>
  </div>;
}
