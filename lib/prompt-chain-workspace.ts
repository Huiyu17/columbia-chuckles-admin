export const promptChainTabs = [
  { id: "workflows", label: "Workflows", resource: "prompt-chains" },
  { id: "steps", label: "Instructions", resource: "prompt-chain-steps" },
  { id: "selection", label: "Selection settings", resource: "prompt-chain-mix" },
  { id: "test", label: "Test run", resource: "prompt-chains" },
] as const;
export type PromptChainTab = (typeof promptChainTabs)[number]["id"];
export function promptChainTab(value: string | undefined): PromptChainTab {
  return promptChainTabs.find(tab => tab.id === value)?.id ?? "workflows";
}
export function promptChainHref(tab: PromptChainTab = "workflows", query = "", page = 1, chainId = "") {
  const params = new URLSearchParams();
  if (tab !== "workflows") params.set("tab", tab);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (chainId) params.set("chain", chainId);
  return `/manage/prompt-chains${params.size ? `?${params}` : ""}`;
}
