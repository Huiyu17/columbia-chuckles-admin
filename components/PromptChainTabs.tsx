import Link from "next/link";
import { promptChainHref, promptChainTabs, type PromptChainTab } from "@/lib/prompt-chain-workspace";

export default function PromptChainTabs({ active, chainId = "" }: { active: PromptChainTab; chainId?: string }) {
  return <nav className="row prompt-chain-tabs" aria-label="Prompt chain sections">
    {promptChainTabs.map(tab => <Link key={tab.id} href={promptChainHref(tab.id, "", 1, chainId)}
      className={`button ${tab.id === active ? "button-primary" : "button-ghost"}`}
      aria-current={tab.id === active ? "page" : undefined}>{tab.id === "workflows" && chainId ? "Overview" : tab.id === "steps" ? "Steps" : tab.label}</Link>)}
  </nav>;
}
