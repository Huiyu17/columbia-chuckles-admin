export const resources = {
  "prompt-chains": { table: "prompt_chains", title: "Prompt chains", navLabel: "Caption workflows", mode: "read" },
  "prompt-chain-steps": { table: "prompt_chain_steps", title: "Prompt chain steps", navLabel: "Workflow instructions", mode: "read" },
  "prompt-chain-mix": { table: "prompt_chain_mix", title: "Prompt chain mix", navLabel: "Workflow selection", mode: "update" },
  terms: { table: "terms", title: "Terms", mode: "crud" },
  "generation-requests": { table: "generation_requests", title: "Generation requests", mode: "read" },
  "generation-examples": { table: "ai_generation_examples", title: "AI generation examples", mode: "crud" },
  "llm-models": { table: "llm_models", title: "LLM models", mode: "crud" },
  "llm-providers": { table: "llm_providers", title: "LLM providers", mode: "crud" },
  "llm-responses": { table: "llm_responses", title: "LLM responses", mode: "read" },
  "signup-domains": { table: "allowed_signup_domains", title: "Allowed signup domains", mode: "crud" },
  "whitelisted-emails": { table: "whitelisted_email_addresses", title: "Whitelisted email addresses", mode: "crud" },
  images: { table: "images", title: "Images", mode: "crud" },
} as const;
export type ResourceKey = keyof typeof resources;
export function getResource(key: string) {
  return Object.hasOwn(resources, key) ? resources[key as ResourceKey] : undefined;
}
export type Column = { name: string; type: string; required: boolean; generated: boolean; primary: boolean; default_value: string | null };
export type RecordRow = Record<string, unknown>;

/** Follow generation provenance without having to copy foreign keys by hand. */
export function relatedRecordHref(field: string, value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return;
  if (field === "user_id") return `/users/${encodeURIComponent(value)}`;
  if (field === "prompt_chain_id") return `/manage/prompt-chains?chain=${encodeURIComponent(value)}`;
  if (field === "prompt_chain_step_id") return `/manage/prompt-chains?tab=steps&q=${encodeURIComponent(value)}`;
  const related: Record<string, ResourceKey> = {
    prompt_chain_id: "prompt-chains", llm_model_id: "llm-models",
    provider_id: "llm-providers", generation_request_id: "generation-requests", image_id: "images",
    prompt_chain_step_id: "prompt-chain-steps",
  };
  return related[field] ? `/manage/${related[field]}?record=${encodeURIComponent(value)}` : undefined;
}
