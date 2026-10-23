import Link from "next/link";
import DeleteCaptionButton from "@/components/DeleteCaptionButton";
import FlashNotice from "@/components/FlashNotice";
import RemoveCaptionButton from "@/components/RemoveCaptionButton";
import RestoreCaptionButton from "@/components/RestoreCaptionButton";
import Pager from "@/components/Pager";
import Thumb from "@/components/Thumb";
import { TallyPill } from "@/components/charts";
import { requireAdmin, uuidPattern } from "@/lib/auth";
import { loadDataset, loadWithdrawn } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtNum, hrefWith, pageNumber, param } from "@/lib/format";
import type { CaptionRow } from "@/lib/types";
import { buildIndex, displayName, styleOf, total, wilson } from "@/lib/stats";

const PER_PAGE = 24;
type SP = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function MediaPage({ searchParams }: { searchParams: SP }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  // live = in Explore · removed = hidden by an admin · withdrawn = in the author's Trash
  const tab = param(sp.tab) === "withdrawn" ? "withdrawn" : param(sp.tab) === "removed" ? "removed" : "live";
  const q = param(sp.q).trim();
  const source = ["sample", "uploaded"].includes(param(sp.source)) ? param(sp.source) : "";
  const sort = ["top", "votes", "oldest"].includes(param(sp.sort)) ? param(sp.sort) : "newest";
  const imageFilter = uuidPattern.test(param(sp.image)) ? param(sp.image) : "";

  const [ds, hidden] = await Promise.all([loadDataset(supabase), loadWithdrawn(supabase)]);
  const removed = hidden.filter((h) => h.deleted_by === "admin");
  const withdrawn = hidden.filter((h) => h.deleted_by !== "admin");
  const ix = buildIndex(ds);
  const base = { tab: tab === "live" ? undefined : tab, q: q || undefined, source: source || undefined,
    sort: sort === "newest" ? undefined : sort, image: imageFilter || undefined };

  const list: (CaptionRow & { deleted_at?: string | null })[] = tab === "live"
    ? ds.captions : (tab === "removed" ? removed : withdrawn).map((w) => ({ ...w, admin_edited_at: null }));
  let rows = list.map((c) => {
    const authorId = c.generation_id ? ix.generations.get(c.generation_id)?.user_id : undefined;
    return {
      c, img: ix.images.get(c.image_id),
      tally: ix.tallies.get(c.id) ?? { up: 0, down: 0 },
      author: authorId ? displayName(ix.profiles.get(authorId), "Unnamed student") : "Seed collection",
      authorId,
      style: c.generation_id ? styleOf(ix.generations.get(c.generation_id)) : "unknown",
      deletedAt: c.deleted_at ?? null,
    };
  });
  if (imageFilter) rows = rows.filter((r) => r.c.image_id === imageFilter);
  if (source) rows = rows.filter((r) => (source === "uploaded") === Boolean(r.img?.user_id));
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => `${r.c.content} ${r.author} ${r.img?.alt_text ?? ""}`.toLowerCase().includes(needle));
  }
  const sorters = {
    newest: (a: (typeof rows)[number], b: (typeof rows)[number]) => b.c.created_at.localeCompare(a.c.created_at),
    oldest: (a: (typeof rows)[number], b: (typeof rows)[number]) => a.c.created_at.localeCompare(b.c.created_at),
    top: (a: (typeof rows)[number], b: (typeof rows)[number]) => wilson(b.tally) - wilson(a.tally),
    votes: (a: (typeof rows)[number], b: (typeof rows)[number]) => total(b.tally) - total(a.tally),
  };
  rows.sort(sorters[sort as keyof typeof sorters]);
  const pages = Math.ceil(rows.length / PER_PAGE);
  const page = Math.min(pageNumber(sp.page), Math.max(1, pages));
  const visible = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const filterImage = imageFilter ? ix.images.get(imageFilter) : undefined;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <span className="eyebrow">AI media · create · read · update · delete</span>
          <h1>AI-generated captions</h1>
          <p className="muted">
            {fmtNum(ds.captions.length)} live · {fmtNum(removed.length)} removed by admins · {fmtNum(withdrawn.length)} in authors&apos; Trash
          </p>
        </div>
        <Link href="/media/new" className="button button-primary">+ Create AI caption</Link>
      </header>

      {param(sp.removed) && <FlashNotice param="removed" message="Removed from Explore. Its votes are hidden too. Restore it or delete it permanently from the Removed tab." />}
      {param(sp.deleted) && <FlashNotice param="deleted" message="Caption deleted permanently. It can no longer be restored." />}
      {param(sp.restored) && <FlashNotice param="restored" message="Caption restored. It’s back in Explore with its votes, and back in the author’s My captions." />}

      <nav className="tabs" aria-label="Caption status">
        <Link href={hrefWith("/media", { ...base, tab: undefined, page: 1 })} className={tab === "live" ? "tab active" : "tab"}>
          Live <span className="count">{ds.captions.length}</span>
        </Link>
        <Link href={hrefWith("/media", { ...base, tab: "removed", page: 1 })} className={tab === "removed" ? "tab active" : "tab"}>
          Removed <span className="count">{removed.length}</span>
        </Link>
        <Link href={hrefWith("/media", { ...base, tab: "withdrawn", page: 1 })} className={tab === "withdrawn" ? "tab active" : "tab"}>
          Author&apos;s Trash <span className="count">{withdrawn.length}</span>
        </Link>
      </nav>

      <form className="filters" role="search">
        {tab !== "live" && <input type="hidden" name="tab" value={tab} />}
        {imageFilter && <input type="hidden" name="image" value={imageFilter} />}
        <label className="field grow">
          <span>Search</span>
          <input name="q" defaultValue={q} placeholder="Caption text, author or photo description" />
        </label>
        <label className="field">
          <span>Photo source</span>
          <select name="source" defaultValue={source}>
            <option value="">All photos</option>
            <option value="sample">Sample photos</option>
            <option value="uploaded">User uploads</option>
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select name="sort" defaultValue={sort}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="top">Funniest (Wilson)</option>
            <option value="votes">Most votes</option>
          </select>
        </label>
        <button className="button button-primary">Apply</button>
        {(q || source || sort !== "newest" || imageFilter) && (
          <Link href={hrefWith("/media", { tab: base.tab })} className="button button-ghost">Clear</Link>
        )}
      </form>
      {filterImage && (
        <p className="notice">Showing captions for one photo: <em>{filterImage.alt_text}</em></p>
      )}
      {tab === "live" && (
        <p className="muted small">
          <strong>Remove</strong> hides a caption and its votes from everyone. You can undo it, and the votes come back on restore.
          Permanent deletion is only offered once a caption is removed.
        </p>
      )}
      {tab === "removed" && (
        <p className="muted small">
          Admins removed these. They are hidden from all users, and the author can&apos;t restore them.
          <strong> Restore</strong> puts one back in Explore with its votes; <strong>Delete</strong> erases it for good.
        </p>
      )}
      {tab === "withdrawn" && (
        <p className="muted small">
          Authors moved these to Trash in My humor. They are hidden from all users. <strong>Restore</strong> puts one back in
          Explore with its votes (the author can do the same from their Trash); <strong>Delete</strong> erases it for good.
        </p>
      )}

      {visible.length === 0 ? (
        <section className="panel empty-state">
          <p className="muted">{q || source || imageFilter ? "No captions match these filters."
            : tab === "removed" ? "Nothing removed. Captions you remove from the Live tab land here."
            : tab === "withdrawn" ? "No author has a caption in Trash right now."
            : "No live captions yet."}</p>
        </section>
      ) : (
        <ul className="media-grid">
          {visible.map((r) => (
            <li key={r.c.id} className="media-card">
              <Link href={`/media/${r.c.id}`} className="media-thumb" aria-label="Open caption">
                <Thumb url={r.img?.url} alt={r.img?.alt_text} size="lg" />
              </Link>
              <div className="media-body">
                <Link href={`/media/${r.c.id}`} className="caption-quote">“{r.c.content}”</Link>
                <p className="muted small">
                  {r.authorId ? <Link href={`/users/${r.authorId}`} className="link-strong">{r.author}</Link> : r.author}
                  {" · "}{fmtDate(r.c.created_at)}
                  {r.style !== "unknown" && <> · <span className="badge">{r.style}</span></>}
                  {r.c.admin_edited_at && <> · <span className="badge badge-edit">admin-edited</span></>}
                </p>
                {r.deletedAt && <p className="muted small">{tab === "removed" ? "Removed" : "Moved to Trash"} {fmtDateTime(r.deletedAt)}</p>}
              </div>
              <div className="media-foot">
                {tab === "live" ? <TallyPill tally={r.tally} /> : <span className="muted small">votes hidden</span>}
                <span className="row">
                  <Link href={`/media/${r.c.id}`} className="button button-ghost button-sm">{tab === "live" ? "Edit" : "View"}</Link>
                  {tab === "live"
                    ? <RemoveCaptionButton id={r.c.id} preview={r.c.content} from="list" compact />
                    : <>
                        <RestoreCaptionButton id={r.c.id} from={tab} compact />
                        <DeleteCaptionButton id={r.c.id} preview={r.c.content} back={tab} compact />
                      </>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager base="/media" params={base} page={page} pages={pages}
        totalLabel={`${rows.length} caption${rows.length === 1 ? "" : "s"}`} />
    </div>
  );
}
