import type { createClient } from "@/lib/supabase/server";
import { configRows } from "@/lib/prompt-chain-test-server";
import { loadResourceRelations } from "@/lib/resource-relations";
import GenerationRequestsTable from "./GenerationRequestsTable";
import RefreshStatusesButton from "./RefreshStatusesButton";

export default async function GenerationRequestsPage({ supabase, query, responseView = false }: { supabase: Awaited<ReturnType<typeof createClient>>; query: string; responseView?: boolean }) {
  const result = await loadRequests(supabase).catch(() => null);
  if (!result) return <section className="card stack-md" role="alert"><h1>{responseView ? "LLM responses" : "Generation requests"}</h1><p>The complete history could not be loaded. Refresh to retry.</p><RefreshStatusesButton /></section>;
  const { rows, chains, images, responses, models, relations, unavailable } = result;
  const displayRows = responseView ? responses.map(response => {
    const request = rows.find(row => row.id === response.generation_request_id);
    const context = request?.request && typeof request.request === "object" ? request.request as Record<string, unknown> : {};
    const model = models.find(row => row.id === response.llm_model_id);
    return { ...request, id: response.id, generation_request_id: response.generation_request_id, created_at: response.created_at,
      request: { ...context, model: model?.name ?? context.model }, responseRecord: response };
  }) : rows;
  const displayStates = responseView ? Object.fromEntries(responses.map(response => [String(response.id), relations.captionStates[String(response.generation_request_id)]]).filter(([, state]) => state)) : relations.captionStates;
  return <div className="stack-lg"><header className="page-head"><div><span className="eyebrow">Generation &amp; Access</span><h1>{responseView ? "LLM responses" : "Generation requests"}</h1></div><RefreshStatusesButton /></header>
    {unavailable && <p role="status">Some related information could not be loaded. Refresh to retry.</p>}
    <GenerationRequestsTable key={`${responseView}:${query}`} rows={displayRows} chains={chains} images={images} responses={responses} users={relations.users} states={displayStates} query={query} responseView={responseView} />
  </div>;
}
async function loadRequests(supabase: Awaited<ReturnType<typeof createClient>>) {
    const [rows, chains, images, responses, models] = await Promise.all([
      configRows(supabase, "generation_requests"), configRows(supabase, "prompt_chains"),
      configRows(supabase, "images"), configRows(supabase, "llm_responses"),
      configRows(supabase, "llm_models"),
    ]);
    const { relations, unavailable } = await loadResourceRelations(supabase, "generation-requests", rows);
    const userIds = [...new Set(rows.map(row => String(row.user_id)).filter(Boolean))];
    for (let index = 0; index < userIds.length; index += 200) {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", userIds.slice(index, index + 200));
      for (const user of data ?? []) relations.users[user.id] = user;
    }
    return { rows, chains, images, responses, models, relations, unavailable };
}
