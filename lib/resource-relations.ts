import type { createClient } from "./supabase/server";
import type { RecordRow } from "./resources";
import { emptyRelations } from "./resource-summary";
import { captionLifecycle, unavailableCaption } from "./caption-lifecycle";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Resolve only relationships needed by the visible page, with duplicate IDs
 * fetched once. Use existing admin RPCs because these tables deny direct reads. */
export async function loadResourceRelations(supabase: Supabase, key: string, rows: RecordRow[]) {
  const relations = emptyRelations();
  const targets: { field: string; table: string; map: "chains" | "models" | "providers" | "requests" }[] = [];
  if (["prompt-chain-steps", "prompt-chain-mix"].includes(key)) targets.push({ field: "prompt_chain_id", table: "prompt_chains", map: "chains" });
  if (["prompt-chain-steps", "llm-responses"].includes(key)) targets.push({ field: "llm_model_id", table: "llm_models", map: "models" });
  if (key === "llm-models") targets.push({ field: "provider_id", table: "llm_providers", map: "providers" });
  if (key === "llm-responses") targets.push({ field: "generation_request_id", table: "generation_requests", map: "requests" });
  const idsFor = (field: string) => [...new Set(rows.map(row => row[field]).filter((id): id is string => typeof id === "string" && id.length > 0))];
  let unavailable = false;
  const tasks = targets.flatMap(target => idsFor(target.field).map(async id => {
    const { data, error } = await supabase.rpc("admin_resource_read", { resource: target.table, page_number: 1, search_text: id });
    if (error) { unavailable = true; return; }
    const result = data as { rows?: RecordRow[] } | null;
    const match = result?.rows?.find(row => row.id === id);
    if (match) relations[target.map][id] = match;
  }));
  if (["images", "generation-requests"].includes(key)) {
    const ids = idsFor("user_id");
    if (ids.length) tasks.push((async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      if (error) { unavailable = true; return; }
      for (const row of data ?? []) relations.users[row.id] = row;
    })());
  }
  const outcomes = await Promise.allSettled(tasks);
  if (outcomes.some(result => result.status === "rejected")) unavailable = true;
  const requests = key === "generation-requests" ? rows : key === "llm-responses" ? Object.values(relations.requests) : [];
  if (requests.length) {
    const ids = [...new Set(requests.map(row => row.generation_id).filter((id): id is string => typeof id === "string" && id.length > 0))];
    // With no generation, a failed/pending request is classifiable without a
    // caption lookup. Never infer deletion from a missing or failed query.
    for (const request of requests) relations.captionStates[String(request.id)] = request.generation_id
      ? unavailableCaption() : captionLifecycle(request, undefined, []);
    if (ids.length) {
      // PostgREST caps results. Page BOTH caption sources so truncation can never
      // turn an existing hidden caption into a false "permanently deleted" label.
      const readAll = async (query: (from: number, to: number) => PromiseLike<{ data: RecordRow[] | null; error: unknown }>) => {
        const records: RecordRow[] = [];
        for (let page = 0; page < 50; page++) {
          const { data, error } = await query(page * 1000, page * 1000 + 999);
          if (error || !data) throw new Error("Caption status read failed");
          records.push(...data);
          if (data.length < 1000) return records;
        }
        throw new Error("Caption status read incomplete");
      };
      const reads = await Promise.allSettled([
        readAll((a, b) => supabase.from("generations").select("id, withdrawn_at").in("id", ids).order("id").range(a, b)),
        readAll((a, b) => supabase.from("captions").select("id, generation_id, deleted_at, deleted_by").in("generation_id", ids).order("id").range(a, b)),
        readAll((a, b) => supabase.rpc("admin_list_withdrawn_captions").in("generation_id", ids).order("id").range(a, b)),
      ]);
      const [generationRead, liveRead, hiddenRead] = reads;
      if (generationRead.status === "fulfilled" && liveRead.status === "fulfilled" && hiddenRead.status === "fulfilled") {
        const generations = generationRead.value, live = liveRead.value, hidden = hiddenRead.value;
        const byId = new Map(generations.map(row => [row.id, row]));
        for (const request of requests) if (request.generation_id) relations.captionStates[String(request.id)] =
          captionLifecycle(request, byId.get(request.generation_id), [...live, ...hidden]);
      } else unavailable = true;
    }
  }
  return { relations, unavailable };
}
