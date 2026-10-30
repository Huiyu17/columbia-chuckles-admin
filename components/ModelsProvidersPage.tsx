import Link from "next/link";
import type { createClient } from "@/lib/supabase/server";
import type { Column, RecordRow } from "@/lib/resources";
import { configRows } from "@/lib/prompt-chain-test-server";
import { loadReferenceChoices } from "@/lib/reference-options";
import { resourceDate } from "@/lib/resource-summary";
import ResourceEditor from "./ResourceEditor";
import ConfigurationRow from "./ConfigurationRow";

export default async function ModelsProvidersPage({ supabase, query, selected }: {
  supabase: Awaited<ReturnType<typeof createClient>>; query: string; selected: string;
}) {
  const data = await load(supabase).catch(() => null);
  if (!data) return <section className="card" role="alert"><h1>LLM models &amp; providers</h1><p>Model configuration could not be loaded. Refresh to retry.</p></section>;
  const { models, providers, steps, chains, mix, modelColumns, providerColumns, choices } = data;
  const defaultModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const modelUsers = (model: RecordRow) => chains.filter(chain => steps.some(step => step.prompt_chain_id === chain.id &&
    (step.llm_model_id === model.id || (step.llm_model_id == null && model.name === defaultModel && providers.some(provider => provider.id === model.provider_id && provider.name === "Google")))));
  const providerName = (model: RecordRow) => String(providers.find(provider => provider.id === model.provider_id)?.name ?? "Provider unavailable");
  const modelInUse = (model: RecordRow) => providerName(model) === "Google" && modelUsers(model).some(chain =>
    steps.filter(step=>step.prompt_chain_id===chain.id).length === 1 && mix.some(setting=>setting.prompt_chain_id===chain.id && setting.enabled===true && Number(setting.weight)>0));
  const visibleModels = models.filter(model => (!selected || model.id === selected || model.provider_id === selected) && (!query || `${model.name} ${providerName(model)}`.toLowerCase().includes(query.toLowerCase())));
  return <div className="stack-lg">
    <header className="page-head"><div><span className="eyebrow">Generation &amp; Access</span><h1>LLM models &amp; providers</h1><p className="muted">Providers supply models. Each prompt chain step uses a model.</p></div></header>
    <section className="card stack-md" id="providers"><div className="row resource-results-head"><h2>LLM providers</h2><span className="small muted">{providers.length} providers</span></div>
      <details className="model-add"><summary>Add provider</summary><ResourceEditor resource="llm-providers" mode="crud" columns={providerColumns} /></details>
      <div className="chain-table-wrap"><table className="configuration-table configuration-providers"><colgroup><col style={{width:"28%"}} /><col style={{width:"22%"}} /><col /><col style={{width:110}} /></colgroup><thead><tr><th>Provider</th><th>Registered models</th><th>Created</th><th>Manage</th></tr></thead><tbody>
        {providers.map(provider => <ConfigurationRow key={String(provider.id)} selected={selected === provider.id} columns={4} variant="provider" editor={<ResourceEditor resource="llm-providers" mode="crud" columns={providerColumns} row={provider} />}><td><strong>{String(provider.name ?? "Unnamed provider")}</strong></td><td>{models.filter(model=>model.provider_id===provider.id).length}</td><td>{resourceDate(provider.created_at) ?? "Not recorded"}</td></ConfigurationRow>)}
      </tbody></table></div>{providers.length === 0 && <p>No providers registered.</p>}
    </section>
    <section className="card stack-md" id="models"><div className="row resource-results-head"><h2>LLM models</h2><span className="small muted">{models.length} models</span></div>
      <details className="model-add"><summary>Add model</summary><ResourceEditor resource="llm-models" mode="crud" columns={modelColumns} choices={choices} /></details>
      <form className="filters"><label className="field grow"><span>Search models</span><input name="q" defaultValue={query} placeholder="Model or provider name" /></label><button className="button button-dark">Search</button></form>
      {selected && <Link className="small link-strong" href="/manage/llm-models">Show all models</Link>}
      <div className="chain-table-wrap"><table className="configuration-table configuration-models"><colgroup><col style={{width:"23%"}} /><col style={{width:"12%"}} /><col style={{width:"28%"}} /><col /><col style={{width:110}} /></colgroup><thead><tr><th>Model</th><th>Provider</th><th>Used by prompt chains</th><th>Created</th><th>Manage</th></tr></thead><tbody>
        {visibleModels.map(model => <ConfigurationRow key={String(model.id)} selected={selected===model.id} columns={5} variant="model" editor={<ResourceEditor resource="llm-models" mode="crud" columns={modelColumns} row={model} choices={choices} />}><td><strong>{String(model.name ?? "Unnamed model")}</strong>{modelInUse(model) && <p><span className="resource-status resource-status-ok">In use</span></p>}</td><td>{providerName(model)}</td><td>{modelUsers(model).length ? <div className="model-chain-links">{modelUsers(model).map(chain=><Link key={String(chain.id)} className="link-strong" href={`/manage/prompt-chains?chain=${encodeURIComponent(String(chain.id))}`}>{String(chain.name ?? "Prompt chain")}</Link>)}</div> : <span className="muted">Not assigned</span>}</td><td>{resourceDate(model.created_at) ?? "Not recorded"}</td></ConfigurationRow>)}
      </tbody></table></div>{visibleModels.length===0 && <p>No models match your search.</p>}
    </section>
  </div>;
}
async function load(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [models,providers,steps,chains,modelRead,providerRead,mix]=await Promise.all([
    configRows(supabase,"llm_models"),configRows(supabase,"llm_providers"),configRows(supabase,"prompt_chain_steps"),configRows(supabase,"prompt_chains"),
    supabase.rpc("admin_resource_read",{resource:"llm_models",page_number:1,search_text:""}),
    supabase.rpc("admin_resource_read",{resource:"llm_providers",page_number:1,search_text:""}),
    configRows(supabase,"prompt_chain_mix"),
  ]);
  if(modelRead.error||providerRead.error||!modelRead.data||!providerRead.data)throw new Error("Schema unavailable");
  const modelColumns=(modelRead.data as {columns:Column[]}).columns;
  const providerColumns=(providerRead.data as {columns:Column[]}).columns;
  const choices=await loadReferenceChoices(supabase,modelColumns,models);
  return {models,providers,steps,chains,mix,modelColumns,providerColumns,choices};
}
