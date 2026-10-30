import type { createClient } from "@/lib/supabase/server";
import type { Column } from "@/lib/resources";
import { configRows } from "@/lib/prompt-chain-test-server";
import { loadReferenceChoices } from "@/lib/reference-options";
import ImagesGallery from "./ImagesGallery";

export default async function ImagesPage({ supabase, query, selected }: {
  supabase: Awaited<ReturnType<typeof createClient>>; query: string; selected: string;
}) {
  const data = await load(supabase).catch(()=>null);
  if(!data) return <section className="card" role="alert"><h1>Images</h1><p>Images could not be loaded. Refresh to retry.</p></section>;
  return <div className="stack-lg"><header className="page-head"><div><span className="eyebrow">Generation &amp; Access</span><h1>Images</h1></div></header>
    <ImagesGallery rows={data.rows} columns={data.columns} choices={data.choices} avatars={data.avatars} query={query} selected={selected} />
  </div>;
}
async function load(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [rows, read] = await Promise.all([configRows(supabase,"images"),supabase.rpc("admin_resource_read",{resource:"images",page_number:1,search_text:""})]);
  if(read.error||!read.data)throw new Error("Image schema unavailable");
  const columns=(read.data as {columns:Column[]}).columns;
  const choices=await loadReferenceChoices(supabase,columns,rows);
  const avatars: Record<string,string> = {};
  const ids=[...new Set(rows.map(row=>row.user_id).filter((id): id is string=>typeof id==='string'&&!!id))];
  for(let index=0;index<ids.length;index+=200){
    try {
    const {data}=await supabase.from('profiles').select('id, avatar_url').in('id',ids.slice(index,index+200));
    for(const user of data??[])if(typeof user.avatar_url==='string')avatars[user.id]=user.avatar_url;
    } catch { /* Show initials when profile images cannot be loaded. */ }
  }
  return {rows,columns,choices,avatars};
}
