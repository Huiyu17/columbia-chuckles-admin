import type { RecordRow } from "./resources";

const references = {
  prompt_chain_id: { label: "Prompt chain", singular: "prompt chain", plural: "prompt chains", table: "prompt_chains", route: "prompt-chains", empty: "No prompt chain" },
  provider_id: { label: "AI provider", singular: "provider", plural: "providers", table: "llm_providers", route: "llm-providers", empty: "No provider" },
  llm_model_id: { label: "AI model", singular: "model", plural: "models", table: "llm_models", route: "llm-models", empty: "Use app default model" },
  image_id: { label: "Image", singular: "image", plural: "images", table: "images", route: "images", empty: "No image" },
  user_id: { label: "Owner", singular: "user", plural: "users", table: "profiles", route: "users", empty: "No owner (preset image)" },
  generation_id: { label: "Generated preview", singular: "preview", plural: "previews", table: "generations", route: "generation-requests", empty: "No generated preview" },
  generation_request_id: { label: "Generation request", singular: "request", plural: "requests", table: "generation_requests", route: "generation-requests", empty: "No request" },
  prompt_chain_step_id: { label: "Prompt chain step", singular: "step", plural: "steps", table: "prompt_chain_steps", route: "prompt-chain-steps", empty: "No step" },
} as const;
export type ReferenceField = keyof typeof references;
export type ReferenceOption = { id: string; label: string; description?: string; imageUrl?: string };
export type ReferencePage = { options: ReferenceOption[]; selected: ReferenceOption[]; total: number; page: number; error?: string };
export type ReferenceChoices = Partial<Record<ReferenceField, ReferencePage>>;

export function referenceField(field: string) {
  return Object.hasOwn(references, field) ? references[field as ReferenceField] : undefined;
}
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const short = (value: string) => {
  const characters = Array.from(value.replace(/\s+/gu, " "));
  return characters.length > 120 ? `${characters.slice(0, 119).join("")}…` : characters.join("");
};
export function referenceOption(field: string, row: RecordRow): ReferenceOption | undefined {
  if (typeof row.id !== "string" && typeof row.id !== "number") return;
  const config = referenceField(field);
  if (!config) return;
  let label = str(row.name) || str(row.term);
  if (field === "image_id") label = str(row.alt_text) || "Image without a description";
  if (field === "user_id") {
    const name = [str(row.first_name), str(row.last_name)].filter(Boolean).join(" ");
    label = name && str(row.email) ? `${name} (${row.email})` : name || str(row.email) || "User without a display name";
  }
  if (field === "generation_id") label = str(row.user_input) || str(row.generated_content) || "Generated preview";
  if (field === "generation_request_id") {
    const request = row.request && typeof row.request === "object" ? row.request as RecordRow : {};
    label = str(request.context) || str(request.scene) || "Generation request";
  }
  if (field === "prompt_chain_step_id") label = str(row.prompt) || "Prompt chain step";
  return { id: String(row.id), label: short(label || `Unnamed ${config.singular}`),
    description: short(str(row.description) || str(row.model)) || undefined,
    imageUrl: field === "image_id" && /^https?:\/\//.test(str(row.url)) ? str(row.url) : undefined };
}

export function fieldLabel(resource: string, field: string) {
  if (resource === "images" && field === "alt_text") return "Image description";
  if (resource === "prompt-chain-mix" && field === "weight") return "Selection weight";
  if (resource === "prompt-chain-mix" && field === "enabled") return "Available for caption generation";
  return referenceField(field)?.label ?? field.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
export function fieldHelp(resource: string, field: string): string | undefined {
  if (resource !== "prompt-chain-mix") return;
  if (field === "prompt_chain_id") return "Choose the prompt chain these mix settings apply to. You do not need to look up an ID.";
  if (field === "weight") return "Relative selection chance, not caption quality or step count. With only one enabled chain, any positive weight selects it for every request. Weight 0 excludes it.";
  if (field === "enabled") return "Disabled prompt chains are never selected. If all prompt chains are disabled or have weight 0, new caption generation stops.";
}
