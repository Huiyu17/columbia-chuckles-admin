import type { RecordRow } from "./resources";
import { unavailableCaption, type CaptionLifecycle } from "./caption-lifecycle";

export type SummaryRelations = {
  chains: Record<string, RecordRow>;
  models: Record<string, RecordRow>;
  providers: Record<string, RecordRow>;
  users: Record<string, RecordRow>;
  requests: Record<string, RecordRow>;
  captionStates: Record<string, CaptionLifecycle>;
};
export const emptyRelations = (): SummaryRelations => ({ chains: {}, models: {}, providers: {}, users: {}, requests: {}, captionStates: {} });
type Fact = { label: string; value: string };
export type ResourceSummary = {
  title: string; preview?: string; previewLabel?: string; facts: Fact[];
  status?: string; tone?: "ok" | "warn" | "neutral";
  statusLabel?: string; caption?: CaptionLifecycle;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function preview(value: unknown, limit = 160): string {
  const raw = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
  const compact = (raw ?? "").replace(/\s+/gu, " ").trim();
  const characters = Array.from(compact);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : compact;
}
function object(value: unknown): RecordRow {
  if (typeof value === "string") {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};
}
function related(rows: Record<string, RecordRow>, id: unknown) {
  return typeof id === "string" ? rows[id] : undefined;
}
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
export function resourceDate(value: unknown): string | undefined {
  const iso = text(value);
  if (!iso) return;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? dateFormat.format(date) : "Date unavailable";
}

/** Presentation only: never modifies the saved record or substitutes fake content. */
export function summarizeResource(key: string, row: RecordRow, relations = emptyRelations()): ResourceSummary {
  const facts: Fact[] = [];
  const fact = (label: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) facts.push({ label, value: preview(value, 100) });
    else if (typeof value === "number" && Number.isFinite(value)) facts.push({ label, value: String(value) });
  };
  const chain = related(relations.chains, row.prompt_chain_id);
  const model = related(relations.models, row.llm_model_id);
  const user = related(relations.users, row.user_id);
  const modelName = text(model?.name) || text(row.model);
  const chainName = text(chain?.name);
  const name = [text(user?.first_name), text(user?.last_name)].filter(Boolean).join(" ");
  let title = text(row.name), detail = "", label: string | undefined;
  let status: string | undefined, tone: ResourceSummary["tone"];
  let caption: CaptionLifecycle | undefined;

  switch (key) {
    case "prompt-chains": detail = text(row.description); break;
    case "prompt-chain-steps": {
      const order = typeof row.step_order === "number" ? row.step_order
        : typeof row.step_order === "string" && row.step_order.trim() ? Number(row.step_order) : NaN;
      const step = Number.isInteger(order) && order >= 0 ? `Step ${order + 1}` : "Prompt chain step";
      title = `${step}${text(row.prompt) ? ` · ${preview(row.prompt, 80)}` : ""}`;
      fact("Chain", chainName || "Chain unavailable");
      fact("Model", modelName || (row.llm_model_id == null ? "App default model" : "Model unavailable"));
      break;
    }
    case "prompt-chain-mix":
      title = chainName || "Prompt chain mix";
      fact("Weight", row.weight);
      if (typeof row.enabled === "boolean") { status = row.enabled ? "Enabled" : "Disabled"; tone = row.enabled ? "ok" : "warn"; }
      break;
    case "terms": title = text(row.term) || title; detail = text(row.definition); break;
    case "generation-requests": {
      const request = object(row.request);
      title = text(request.context) || text(request.scene) || text(request.user_input)
        || text(row.user_input) || text(row.context)
        || (Object.keys(request).length > 0 || text(row.request) ? preview(row.request, 110) : "")
        || "Generation request";
      fact("Model", text(request.model) || modelName);
      fact("Style", request.style);
      fact("User", name);
      status = text(row.status) || undefined;
      tone = status === "completed" ? "ok" : status === "failed" ? "warn" : "neutral";
      caption = relations.captionStates[String(row.id)] ?? unavailableCaption();
      break;
    }
    case "generation-examples":
      title = text(row.prompt) || "Generation example"; detail = text(row.response); label = "Response"; break;
    case "llm-models":
      fact("Provider", text(related(relations.providers, row.provider_id)?.name) || "Provider unavailable"); break;
    case "llm-responses":
      title = text(row.response) || text(row.error) || "No response recorded";
      if (text(row.error)) { status = "Failed"; tone = "warn"; detail = text(row.error); label = "Error"; }
      else if (text(row.response)) { status = "Completed"; tone = "ok"; }
      caption = relations.captionStates[String(row.generation_request_id)] ?? unavailableCaption();
      fact("Model", modelName || "Model unavailable");
      if (row.latency_ms != null) fact("Latency", `${row.latency_ms} ms`);
      fact("Input tokens", row.input_tokens); fact("Output tokens", row.output_tokens);
      break;
    case "signup-domains": title = text(row.domain); break;
    case "whitelisted-emails": title = text(row.email); break;
    case "images":
      title = text(row.alt_text) || "Image without description";
      fact("Uploaded by", row.user_id == null ? "Preset image" : name || "Profile name unavailable"); break;
  }
  return { title: preview(title || "Unnamed record", 120), preview: preview(detail) || undefined,
    previewLabel: label, facts, status, tone, caption, statusLabel: caption ? "Generation" : undefined };
}
