import type { createClient } from "./supabase/server";
import { configRows } from "./prompt-chain-test-server";
import type { RecordRow } from "./resources";
import { loadRecentChainRuns } from "./tool-run-history-server";

export type ChainDisplayData = {
  chains?: RecordRow[]; steps?: RecordRow[]; mix?: RecordRow[]; models?: RecordRow[]; providers?: RecordRow[];
  unavailable: boolean; defaultModel: string;
  recentRuns?: Record<string, RecordRow[] | undefined>;
  recentRunsIncomplete?: Record<string, boolean>;
  users?: Record<string, RecordRow>;
};
export async function loadChainDisplay(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ChainDisplayData> {
  const reads = await Promise.allSettled(["prompt_chains", "prompt_chain_steps", "prompt_chain_mix", "llm_models", "llm_providers"].map(table => configRows(supabase, table)));
  const value = (index: number) => reads[index].status === "fulfilled" ? (reads[index] as PromiseFulfilledResult<RecordRow[]>).value : undefined;
  const { recentRuns, recentRunsIncomplete } = await loadRecentChainRuns(supabase, (value(0) ?? []).map(chain => String(chain.id)));
  const users: Record<string, RecordRow> = {};
  const userIds = [...new Set(Object.values(recentRuns).flatMap(rows => rows ?? []).map(row => row.user_id).filter((id): id is string => typeof id === "string" && !!id))];
  for (let index = 0; index < userIds.length; index += 200) {
    try {
      const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds.slice(index, index + 200));
      for (const user of data ?? []) users[user.id] = user;
    } catch { /* Runs remain visible when a profile cannot be loaded. */ }
  }
  return { chains: value(0), steps: value(1), mix: value(2), models: value(3), providers: value(4),
    recentRuns, recentRunsIncomplete, users,
    unavailable: reads.some(read => read.status === "rejected"), defaultModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite" };
}
export function chainSteps(data: ChainDisplayData, chainId: unknown) {
  return data.steps?.filter(row => row.prompt_chain_id === chainId).sort((a, b) => Number(a.step_order) - Number(b.step_order));
}
export function stepModelName(data: ChainDisplayData, step: RecordRow) {
  if (step.llm_model_id == null) return data.defaultModel;
  return String(data.models?.find(model => model.id === step.llm_model_id)?.name ?? "Model unavailable");
}
export function chainAvailability(data: ChainDisplayData, chainId: unknown) {
  if (!data.mix) return "Status unavailable";
  const setting = data.mix.find(row => row.prompt_chain_id === chainId);
  if (!setting) return "Not in selection";
  if (setting.enabled !== true) return "Disabled";
  if (!Number.isFinite(Number(setting.weight))) return "Invalid selection weight";
  if (Number(setting.weight) <= 0) return "Weight 0 — not selected";
  return `Enabled · weight ${setting.weight}`;
}
