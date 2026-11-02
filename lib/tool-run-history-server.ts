import type { createClient } from "./supabase/server";
import type { RecordRow } from "./resources";
import { toolHistoryRecords } from "./tool-run-history";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export async function loadToolRuns(supabase: Supabase) {
  const rows: RecordRow[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await supabase.rpc("admin_tool_run_history", { p_page: page });
    if (error || !data) throw new Error("Tool history unavailable");
    const result = data as { rows: RecordRow[]; total: number };
    rows.push(...result.rows);
    if (rows.length >= result.total) return rows;
    if (!result.rows.length) break;
  }
  throw new Error("Tool history incomplete");
}

async function publicChainRuns(supabase: Supabase, id: string) {
  const rows: RecordRow[] = [];
  for (let page = 1; page <= 200; page++) {
    const { data, error } = await supabase.rpc("admin_resource_read", { resource: "generation_requests", page_number: page, search_text: id });
    if (error || !data) throw new Error("Public history unavailable");
    const result = data as { rows: RecordRow[]; total: number };
    rows.push(...result.rows);
    if (rows.length >= result.total) return rows.filter(row => row.prompt_chain_id === id);
    if (!result.rows.length) break;
  }
  throw new Error("Public history incomplete");
}

export async function loadRecentChainRuns(supabase: Supabase, ids: string[]) {
  const [tool, publicReads] = await Promise.all([
    loadToolRuns(supabase).then(rows => ({ rows: toolHistoryRecords(rows).rows, unavailable: false })).catch(() => ({ rows: [], unavailable: true })),
    Promise.allSettled(ids.map(id => publicChainRuns(supabase, id))),
  ]);
  const recentRuns: Record<string, RecordRow[] | undefined> = {};
  const recentRunsIncomplete: Record<string, boolean> = {};
  for (const [index, id] of ids.entries()) {
    const publicRead = publicReads[index];
    recentRunsIncomplete[id] = tool.unavailable || publicRead.status === "rejected";
    if (tool.unavailable && publicRead.status === "rejected") continue;
    const rows: RecordRow[] = [...(publicRead.status === "fulfilled" ? publicRead.value : []), ...tool.rows.filter(row => row.prompt_chain_id === id)];
    recentRuns[id] = rows.sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id))).slice(0,5);
  }
  return { recentRuns, recentRunsIncomplete };
}
