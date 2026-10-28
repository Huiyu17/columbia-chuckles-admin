import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getResource, relatedRecordHref, type Column, type RecordRow } from "@/lib/resources";
import { loadResourceRelations } from "@/lib/resource-relations";
import ResourceEditor from "@/components/ResourceEditor";
import ResourceCardSummary from "@/components/ResourceCardSummary";
import RecordIdentifier from "@/components/RecordIdentifier";
import RefreshStatusesButton from "@/components/RefreshStatusesButton";

export default async function ResourcePage({ params, searchParams }: {
  params: Promise<{ resource: string }>;
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  const { supabase } = await requireAdmin();
  const { resource: key } = await params;
  const resource = getResource(key);
  if (!resource) notFound();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(100000, Math.floor(Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1)));
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 200);
  const { data, error } = await supabase.rpc("admin_resource_read", { resource: resource.table, page_number: page, search_text: q });
  const result = data as { columns: Column[]; rows: RecordRow[]; total: number } | null;
  const { relations, unavailable } = await loadResourceRelations(supabase, key, result?.rows ?? []);
  const primary = result?.columns.find(c => c.primary)?.name ?? "id";
  const href = (p: number) => `/manage/${key}?page=${p}&q=${encodeURIComponent(q)}`;
  return <div className="stack-lg">
    <header className="page-head"><div><span className="eyebrow">Generation &amp; Access · {resource.mode === "read" ? "Read only" : resource.mode === "update" ? "Read / update" : "Create / read / update / delete"}</span><h1>{resource.title}</h1>
      <p className="muted">Scan summaries, expand full records and follow related data.</p></div></header>
    <form className="filters"><label className="field grow"><span>Search all record fields</span><input name="q" defaultValue={q} maxLength={200} /></label><button className="button button-dark">Search</button></form>
    {error && <div role="alert" className="card stack-sm"><h2>Could not load records</h2><p>{error.message}</p><p>Verify the configured Supabase project and apply supabase/012_week7_observability.sql. Missing tables are reported rather than shown as empty data.</p></div>}
    {result && <>
      <div className="row resource-results-head">
        <p className="muted">{result.total} matching records · Page {page} of {Math.max(1, Math.ceil(result.total / 25))}</p>
        {["generation-requests", "llm-responses"].includes(key) && <RefreshStatusesButton />}
      </div>
      {unavailable && <p className="small muted" role="status">Some related information could not be loaded. Refresh to try again; full records remain available.</p>}
      {resource.mode === "crud" && <details className="card"><summary>Create {resource.title.toLowerCase()}</summary><ResourceEditor resource={key} mode={resource.mode} columns={result.columns} /></details>}
      {result.rows.length === 0 && <p className="card">No records found. Try a different search.</p>}
      {result.rows.map((row, index) => <article className="card stack-md" key={String(row[primary] ?? index)}>
        <ResourceCardSummary resource={key} row={row} relations={relations} />
        {(typeof row[primary] === "string" || typeof row[primary] === "number") &&
          <RecordIdentifier id={String(row[primary])} />}
        <details><summary>View full record</summary><dl className="resource-record">{Object.entries(row).map(([field, value]) => {
          const related = relatedRecordHref(field, value);
          return <div key={field}><dt>{field}</dt><dd><pre>{typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}</pre>{related && <Link className="button button-sm button-ghost" href={related}>View related record →</Link>}</dd></div>;
        })}</dl></details>
        {key === "prompt-chains" && <div className="row"><Link className="button button-sm button-ghost" href={`/manage/prompt-chain-steps?q=${encodeURIComponent(String(row[primary]))}`}>View chain steps</Link><Link className="button button-sm button-ghost" href={`/manage/prompt-chain-mix?q=${encodeURIComponent(String(row[primary]))}`}>View chain mix</Link></div>}
        {key === "generation-requests" && <Link className="button button-sm button-ghost" href={`/manage/llm-responses?q=${encodeURIComponent(String(row[primary]))}`}>View LLM responses</Link>}
        {resource.mode !== "read" && <details><summary>Edit record</summary><ResourceEditor resource={key} mode={resource.mode} columns={result.columns} row={row} /></details>}
      </article>)}
      <nav className="row" aria-label="Pagination">{page > 1 && <Link className="button button-ghost" href={href(page - 1)}>Previous</Link>}{page * 25 < result.total && <Link className="button button-ghost" href={href(page + 1)}>Next</Link>}</nav>
    </>}
  </div>;
}
