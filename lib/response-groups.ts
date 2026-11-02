import type { RecordRow } from "./resources";

export const recordObject = (value: unknown): RecordRow => value && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};
export const recordText = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value : fallback;
export type UsageTotal = { value: number | null; partial: boolean };
export type ResponseGroup = { id: string; request: RecordRow; responses: RecordRow[]; source: string; expectedSteps: number | null; duration: UsageTotal; input: UsageTotal; output: UsageTotal };

function total(rows: RecordRow[], field: string): UsageTotal {
  const values = rows.map(row => row[field]).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  return { value: values.length ? values.reduce((sum, value) => sum + value, 0) : null, partial: values.length > 0 && values.length < rows.length };
}
export function groupResponses(requests: RecordRow[], responses: RecordRow[]): ResponseGroup[] {
  const groups = new Map<string, { request: RecordRow; responses: RecordRow[] }>();
  for (const request of requests) groups.set(String(request.id), { request, responses: [] });
  for (const response of responses) {
    const id = recordText(response.generation_request_id, `unlinked:${String(response.id)}`);
    if (!groups.has(id)) groups.set(id, { request: { id, created_at: response.created_at, status: "unavailable" }, responses: [] });
    groups.get(id)!.responses.push(response);
  }
  return [...groups].map(([id, group]) => {
    const context = recordObject(group.request.request);
    const ordered = group.responses.sort((a, b) => {
      const ai = typeof a.chain_step_order === "number" ? a.chain_step_order : null;
      const bi = typeof b.chain_step_order === "number" ? b.chain_step_order : null;
      if (ai !== null && bi !== null) return ai - bi;
      return String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
    });
    const expected = Array.isArray(context.steps) ? context.steps.length : typeof context.step_count === "number" ? context.step_count : null;
    return { id, request: group.request, responses: ordered, source: context.source === "prompt-tool" ? "prompt-tool" : "caption-app",
      expectedSteps: expected, duration: total(ordered, "latency_ms"), input: total(ordered, "input_tokens"), output: total(ordered, "output_tokens") };
  }).sort((a, b) => String(b.request.created_at).localeCompare(String(a.request.created_at)) || a.id.localeCompare(b.id));
}

export function responseModel(group: ResponseGroup, response: RecordRow, models: RecordRow[]): string {
  const index = typeof response.chain_step_order === "number" ? response.chain_step_order : -1;
  const context = recordObject(group.request.request);
  const steps = Array.isArray(context.steps) ? context.steps : [];
  return recordText(response.model_name) || recordText(recordObject(steps[index]).model)
    || recordText(models.find(model => model.id === response.llm_model_id)?.name) || recordText(context.model, "Model unavailable");
}
