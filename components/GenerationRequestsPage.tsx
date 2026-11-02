import type { createClient } from "@/lib/supabase/server";
import { configRows } from "@/lib/prompt-chain-test-server";
import { loadResourceRelations } from "@/lib/resource-relations";
import GenerationRequestsTable from "./GenerationRequestsTable";
import RefreshStatusesButton from "./RefreshStatusesButton";
import { toolHistoryRecords } from "@/lib/tool-run-history";
import type { RecordRow } from "@/lib/resources";
import ResponseRuns from "./ResponseRuns";
import { loadToolRuns } from "@/lib/tool-run-history-server";

export default async function GenerationRequestsPage({ supabase, query, responseView = false }: { supabase: Awaited<ReturnType<typeof createClient>>; query: string; responseView?: boolean }) {
  const result = await loadRequests(supabase).catch(() => null);
  if (!result) return <section className="card stack-md" role="alert"><h1>{responseView ? "LLM responses" : "Generation requests"}</h1><p>The complete history could not be loaded. Refresh to retry.</p><RefreshStatusesButton /></section>;
  const { rows, chains, images, responses, models, relations, unavailable, toolHistoryUnavailable } = result;
  return <div className="stack-lg"><header className="page-head"><div><span className="eyebrow">Generation &amp; Access</span><h1>{responseView ? "LLM responses" : "Generation requests"}</h1></div><RefreshStatusesButton /></header>
    {unavailable && <p role="status">Some related information could not be loaded. Refresh to retry.</p>}
    {toolHistoryUnavailable && <p role="status">Prompt Chain Tool history could not be loaded. Apply 018_admin_tool_history_single_caption.sql if it has not been applied, then refresh.</p>}
    {responseView ? <ResponseRuns key={query} rows={rows} chains={chains} images={images} responses={responses} models={models} users={relations.users} query={query} /> : <GenerationRequestsTable key={query} rows={rows} chains={chains} images={images} responses={responses} users={relations.users} states={relations.captionStates} query={query} />}
  </div>;
}
async function loadRequests(supabase: Awaited<ReturnType<typeof createClient>>) {
    const [publicRows, chains, images, publicResponses, models, toolRuns] = await Promise.all([
      configRows(supabase, "generation_requests"), configRows(supabase, "prompt_chains"),
      configRows(supabase, "images"), configRows(supabase, "llm_responses"),
      configRows(supabase, "llm_models"),
      loadToolRuns(supabase).catch(() => null),
    ]);
    const tool = toolHistoryRecords(toolRuns ?? []);
    const rows: RecordRow[] = [...publicRows, ...tool.rows];
    const responses = [...publicResponses, ...tool.responses];
    const { relations, unavailable } = await loadResourceRelations(supabase, "generation-requests", publicRows);
    for (const row of tool.rows) relations.captionStates[String(row.id)] = { state: "not-created", label: "Test only", tone: "neutral", description: "Prompt Chain Tool test. No public caption or preview was created." };
    const userIds = [...new Set(rows.map(row => String(row.user_id)).filter(Boolean))];
    for (let index = 0; index < userIds.length; index += 200) {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name, avatar_url").in("id", userIds.slice(index, index + 200));
      for (const user of data ?? []) relations.users[user.id] = user;
    }
    return { rows, chains, images, responses, models, relations, unavailable, toolHistoryUnavailable: toolRuns === null };
}
