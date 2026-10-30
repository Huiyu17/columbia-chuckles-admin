export const workflowDescriptions: Record<string, string> = {
  "prompt-chains": "Prompt chains are reusable caption-writing workflows. A workflow groups the instructions the AI follows when someone generates a caption.",
  "prompt-chain-steps": "Prompt chain steps are the individual AI instructions inside a workflow, shown in the order they run. Step 1 runs first. The current caption generator uses one step per workflow.",
  "prompt-chain-mix": "Prompt chain mix controls which caption workflows can be used and how often they are selected. Changes apply to future generation attempts, not captions that already exist.",
};
const stages = [
  { key: "prompt-chains", title: "1. Caption workflows", detail: "What should the AI do? View the available workflows." },
  { key: "prompt-chain-steps", title: "2. AI instructions", detail: "How should it do it? Read each workflow's steps and model." },
  { key: "prompt-chain-mix", title: "3. Workflow selection", detail: "Which workflow should run? Enable workflows and set their relative weights." },
];
export default function WorkflowGuide({ resource }: { resource: string }) {
  if (!workflowDescriptions[resource]) return null;
  return <details className="workflow-guide stack-md">
    <summary>How prompt chains work</summary>
    <div className="workflow-stages">
      {stages.map(stage => <div key={stage.key}
        className={resource === stage.key ? "workflow-stage current" : "workflow-stage"}>
        <strong>{stage.title}</strong><span className="small muted">{stage.detail}</span>
      </div>)}
    </div>
    <p className="small muted">Workflows and instructions are view-only. Use Selection settings to change which workflows are available, or Test run to inspect a generation without publishing.</p>
    {resource === "prompt-chain-steps" && <p className="small muted">App default model means the step uses the model configured for the caption app, rather than a model override.</p>}
    {resource === "prompt-chain-mix" && <p className="small muted">Example: if two workflows are enabled with weights 2 and 1, the first is selected about twice as often. With only one enabled workflow, any positive weight selects that workflow.</p>}
  </details>;
}
