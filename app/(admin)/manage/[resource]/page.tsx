import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin, uuidPattern } from "@/lib/auth";
import { getResource, type Column, type RecordRow } from "@/lib/resources";
import { loadResourceRelations } from "@/lib/resource-relations";
import ResourceEditor from "@/components/ResourceEditor";
import RefreshStatusesButton from "@/components/RefreshStatusesButton";
import WorkflowGuide, { workflowDescriptions } from "@/components/WorkflowGuide";
import { loadReferenceChoices, readReferenceOptions } from "@/lib/reference-options";
import { promptChainHref, promptChainTab, promptChainTabs } from "@/lib/prompt-chain-workspace";
import { loadChainDisplay } from "@/lib/prompt-chain-display";
import PromptChainTabs from "@/components/PromptChainTabs";
import PromptChainOverview from "@/components/PromptChainOverview";
import PromptChainTestPanel from "@/components/PromptChainTestPanel";
import PromptChainFlow from "@/components/PromptChainFlow";
import GenerationRequestsPage from "@/components/GenerationRequestsPage";
import ResourceDetails from "@/components/ResourceDetails";
import ModelsProvidersPage from "@/components/ModelsProvidersPage";
import ImagesPage from "@/components/ImagesPage";

export const maxDuration = 90;

export default async function ResourcePage({ params, searchParams }: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ page?: string | string[]; q?: string | string[]; tab?: string | string[]; chain?: string | string[]; record?: string; request?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const { resource: routeKey } = await params;
  const sp = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1)));
  const rawQuery = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 200);
  const recordId = typeof sp.record === "string" && uuidPattern.test(sp.record) ? sp.record : uuidPattern.test(rawQuery) ? rawQuery : "";
  const q = uuidPattern.test(rawQuery) ? "" : rawQuery;
  const contextQuery = sp.request ?? recordId ?? "";
  const incomingChain = Array.isArray(sp.chain) ? sp.chain[0] : sp.chain;
  if (routeKey === "llm-providers") {
    const query = new URLSearchParams({ tab: "providers" });
    if (q) query.set("q", q);
    if (recordId) query.set("record", recordId);
    if (page > 1) query.set("page", String(page));
    redirect(`/manage/llm-models?${query}`);
  }
  if (routeKey === "llm-models") return <ModelsProvidersPage supabase={supabase} query={q} selected={recordId} />;
  if (routeKey === "images") return <ImagesPage supabase={supabase} query={q} selected={recordId} />;
  const modelWorkspace = routeKey === "llm-models";
  const providerTab = modelWorkspace && (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) === "providers";
  if (routeKey === "generation-requests") return <GenerationRequestsPage supabase={supabase} query={contextQuery || incomingChain || q} />;
  if (routeKey === "llm-responses") return <GenerationRequestsPage supabase={supabase} query={contextQuery || q} responseView />;
  if (routeKey === "prompt-chain-steps" || routeKey === "prompt-chain-mix") redirect(promptChainHref(routeKey === "prompt-chain-steps" ? "steps" : "selection", q, page));
  const workspace = routeKey === "prompt-chains";
  const tab = promptChainTab(Array.isArray(sp.tab) ? sp.tab[0] : sp.tab);
  const key = workspace ? promptChainTabs.find(item => item.id === tab)!.resource : providerTab ? "llm-providers" : routeKey;
  const resource = getResource(key);
  if (!resource) notFound();
  const chainId = workspace ? (Array.isArray(sp.chain) ? sp.chain[0] : sp.chain) ?? "" : "";
  if (chainId && !uuidPattern.test(chainId)) notFound();
  const testing = workspace && tab === "test";
  const [read, workspaceData, testChoices] = await Promise.all([
    testing ? Promise.resolve({ data: null, error: null }) : supabase.rpc("admin_resource_read", { resource: resource.table, page_number: recordId ? 1 : page, search_text: recordId || chainId || q }),
    workspace ? loadChainDisplay(supabase) : Promise.resolve(null),
    testing ? Promise.all([readReferenceOptions(supabase, "prompt_chain_id", "", 1, chainId ? [chainId] : []), readReferenceOptions(supabase, "image_id")]) : Promise.resolve(null),
  ]);
  const { error } = read;
  let result = read.data as { columns: Column[]; rows: RecordRow[]; total: number } | null;
  if (!workspace && recordId && result) {
    const primary = result.columns.find(column => column.primary)?.name ?? "id";
    const exact = result.rows.filter(row => row[primary] === recordId);
    result = { ...result, rows: exact, total: exact.length };
  }
  if (workspaceData && result) {
    const source = key === "prompt-chains" ? workspaceData.chains : key === "prompt-chain-steps" ? workspaceData.steps : workspaceData.mix;
    if (source) {
      const matches = source.filter(row => (!chainId || (key === "prompt-chains" ? row.id : row.prompt_chain_id) === chainId)
        && (!q || JSON.stringify(row).toLowerCase().includes(q.toLowerCase())));
      result = { ...result, rows: matches.slice((page - 1) * 25, page * 25), total: matches.length };
    }
  }
  const selectedChain = chainId ? workspaceData?.chains?.find(row => row.id === chainId) : undefined;
  if (chainId && workspaceData?.chains && !selectedChain) notFound();
  if (workspace && workspaceData) {
    const mixRead = testing ? null : await supabase.rpc("admin_resource_read", { resource: "prompt_chain_mix", page_number: 1, search_text: "" });
    const mixColumns = (mixRead?.data as { columns: Column[] } | null)?.columns ?? [];
    return <div className="stack-lg">
      <header className="page-head"><div><span className="eyebrow">Generation &amp; Access</span><h1>{testing ? "Test a prompt chain" : "Prompt chains"}</h1>
        <p className="muted">{testing ? "Inspect the prompt and try the model without publishing." : "Follow the photo from input to caption. Manage each workflow’s availability alongside its instructions."}</p></div></header>
      {testing ? <>
        <Link className="back-link" href={promptChainHref("workflows", "", 1, chainId)}>← Back to prompt chains</Link>
        {testChoices && <PromptChainTestPanel key={chainId} workflows={testChoices[0]} images={testChoices[1]} workflowId={chainId} />}
      </> : <>
        {workspaceData.unavailable && <p role="alert">Some workflow information could not be loaded. Refresh to retry.</p>}
        {mixRead?.error && <p role="alert">Selection settings could not be loaded. Refresh to retry.</p>}
        <PromptChainFlow data={mixRead?.error || !mixColumns.length ? { ...workspaceData, mix: undefined } : workspaceData} selectedId={chainId} columns={mixColumns} choices={{}} />
      </>}
    </div>;
  }
  const [related, choices] = await Promise.all([
    loadResourceRelations(supabase, key, result?.rows ?? []),
    resource.mode !== "read" && result ? loadReferenceChoices(supabase, result.columns, result.rows) : Promise.resolve({}),
  ]);
  const { relations, unavailable } = related;
  const primary = result?.columns.find(c => c.primary)?.name ?? "id";
  const href = (p: number) => workspace ? promptChainHref(tab, q, p, chainId) : modelWorkspace ? `/manage/llm-models?tab=${providerTab ? "providers" : "models"}&page=${p}&q=${encodeURIComponent(q)}` : `/manage/${key}?page=${p}&q=${encodeURIComponent(q)}`;
  return <div className="stack-lg">
    {workspace && chainId && <Link className="back-link" href={promptChainHref()}>← All prompt chains</Link>}
    <header className="page-head"><div><span className="eyebrow">Generation &amp; Access · {testing ? "Admin test" : resource.mode === "read" ? "Read only" : resource.mode === "update" ? "Read / update" : "Create / read / update / delete"}</span><h1>{workspace ? selectedChain ? String(selectedChain.name ?? "Unnamed workflow") : "Prompt chains" : modelWorkspace ? "LLM models & providers" : resource.title}</h1>
      <p className="muted">{testing ? "Test the configured workflow and inspect its actual prompt, model response and output checks without publishing." : workflowDescriptions[key] ?? "Browse and manage entries."}</p></div></header>
    {workspace && <PromptChainTabs active={tab} chainId={chainId} />}
    {modelWorkspace && <nav className="row" aria-label="Models and providers"><Link className={`button ${providerTab ? "button-ghost" : "button-primary"}`} aria-current={!providerTab ? "page" : undefined} href="/manage/llm-models">Models</Link><Link className={`button ${providerTab ? "button-primary" : "button-ghost"}`} aria-current={providerTab ? "page" : undefined} href="/manage/llm-models?tab=providers">Providers</Link></nav>}
    {!testing && <WorkflowGuide resource={key} />}
    {!testing && !(selectedChain && tab === "workflows") && <form className="filters">
      {modelWorkspace && <input type="hidden" name="tab" value={providerTab ? "providers" : "models"} />}
      {workspace && <><input type="hidden" name="tab" value={tab} />{chainId && <input type="hidden" name="chain" value={chainId} />}</>}
      <label className="field grow"><span>Search {resource.title.toLowerCase()}</span><input name="q" defaultValue={q} placeholder={key === "terms" ? "Term or definition" : key === "generation-examples" ? "Example input or response" : key === "signup-domains" ? "Email domain" : key === "whitelisted-emails" ? "Email address" : key === "images" ? "Image description" : "Name or description"} maxLength={200} /></label><button className="button button-dark">Search</button></form>}
    {!workspace && recordId && <p className="small muted">Showing the selected entry. <Link className="link-strong" href={`/manage/${key}`}>Show all {resource.title.toLowerCase()}</Link></p>}
    {workspaceData?.unavailable && <p className="small muted" role="status">Some workflow context could not be loaded. Refresh to try again.</p>}
    {testing && testChoices && <PromptChainTestPanel key={chainId} workflows={testChoices[0]} images={testChoices[1]} workflowId={chainId} />}
    {error && <div role="alert" className="card stack-sm"><h2>Could not load records</h2><p>{error.message}</p><p>Verify the configured Supabase project and apply supabase/012_week7_observability.sql. Missing tables are reported rather than shown as empty data.</p></div>}
    {result && <>
      <div className="row resource-results-head">
        <p className="muted">{result.total} matching records · Page {page} of {Math.max(1, Math.ceil(result.total / 25))}</p>
        {["generation-requests", "llm-responses"].includes(key) && <RefreshStatusesButton />}
      </div>
      {unavailable && <p className="small muted" role="status">Some related information could not be loaded. Refresh to try again; full records remain available.</p>}
      {resource.mode === "crud" && <details className="card"><summary>Create {resource.title.toLowerCase()}</summary><ResourceEditor key={key} resource={key} mode={resource.mode} columns={result.columns} choices={choices} /></details>}
      {result.rows.length === 0 && <p className="card">No records found. Try a different search.</p>}
      {workspace && tab === "workflows" && workspaceData && result.rows.length > 0 && <PromptChainOverview chains={result.rows} data={workspaceData} selected={selectedChain} />}
      {!(workspace && tab === "workflows") && result.rows.map((row, index) => <article className="card stack-md resource-entry" key={String(row[primary] ?? index)}>
        <ResourceDetails resource={key} row={row} choices={choices} relations={relations} />
        {key === "generation-requests" && <Link className="button button-sm button-ghost" href={`/manage/llm-responses?q=${encodeURIComponent(String(row[primary]))}`}>View LLM responses</Link>}
        {resource.mode !== "read" && <details className="resource-edit"><summary>Edit</summary><div className="resource-edit-body"><ResourceEditor resource={key} mode={resource.mode} columns={result.columns} row={row} choices={choices} /></div></details>}
      </article>)}
      <nav className="row" aria-label="Pagination">{page > 1 && <Link className="button button-ghost" href={href(page - 1)}>Previous</Link>}{page * 25 < result.total && <Link className="button button-ghost" href={href(page + 1)}>Next</Link>}</nav>
    </>}
  </div>;
}
