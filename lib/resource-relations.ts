import type { createClient } from "./supabase/server";
import type { RecordRow } from "./resources";
import { emptyRelations } from "./resource-summary";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Resolve only relationships needed by the visible page, with duplicate IDs
 * fetched once. Use existing admin RPCs because these tables deny direct reads. */
export async function loadResourceRelations(supabase: Supabase, key: string, rows: RecordRow[]) {
  const relations = emptyRelations();
  const targets: { field: string; table: string; map: "chains" | "models" | "providers" }[] = [];
  if (["prompt-chain-steps", "prompt-chain-mix"].includes(key)) targets.push({ field: "prompt_chain_id", table: "prompt_chains", map: "chains" });
  if (["prompt-chain-steps", "llm-responses"].includes(key)) targets.push({ field: "llm_model_id", table: "llm_models", map: "models" });
  if (key === "llm-models") targets.push({ field: "provider_id", table: "llm_providers", map: "providers" });
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
  return { relations, unavailable };
}
