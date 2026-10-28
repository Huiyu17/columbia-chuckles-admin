import Link from "next/link";
import { notFound } from "next/navigation";
import DeleteCaptionButton from "@/components/DeleteCaptionButton";
import EditCaptionForm from "@/components/EditCaptionForm";
import FlashNotice from "@/components/FlashNotice";
import RemoveCaptionButton from "@/components/RemoveCaptionButton";
import RestoreCaptionButton from "@/components/RestoreCaptionButton";
import Thumb from "@/components/Thumb";
import { SplitBars } from "@/components/charts";
import { requireAdmin, uuidPattern } from "@/lib/auth";
import { captionColumns, generationColumns, loadWithdrawn } from "@/lib/data";
import { fmtDateTime, param } from "@/lib/format";
import { loadPickerImages } from "@/lib/images";
import { displayName, styleOf, total, wilson } from "@/lib/stats";
import type { CaptionRow, Generation, Profile, Vote } from "@/lib/types";

export default async function MediaDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidPattern.test(id)) notFound();

  const { data: liveRow } = await supabase.from("captions").select(captionColumns).eq("id", id).maybeSingle();
  const live = liveRow as CaptionRow | null;
  let caption: (CaptionRow & { deleted_at?: string; deleted_by?: "author" | "admin" | null }) | null = live;
  if (!caption) {
    const w = (await loadWithdrawn(supabase)).find((x) => x.id === id);
    caption = w ? { ...w, admin_edited_at: null } : null;
  }
  if (!caption) notFound();
  const isLive = Boolean(live);
  // Hidden captions are either removed by an admin, or in the author's Trash.
  const hiddenTab = caption.deleted_by === "admin" ? "removed" : "withdrawn";

  const [{ data: image }, { data: generationRow }, { data: voteRows }, images] = await Promise.all([
    supabase.from("images").select("id, url, alt_text, user_id").eq("id", caption.image_id).maybeSingle(),
    caption.generation_id
      ? supabase.from("generations").select(generationColumns).eq("id", caption.generation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("caption_votes").select("user_id, caption_id, value, updated_at").eq("caption_id", id)
      .order("updated_at", { ascending: false }),
    isLive ? loadPickerImages(supabase) : Promise.resolve([]),
  ]);
  const generation = generationRow as Generation | null;
  const votes = voteRows as Vote[] | null;
  const people = [...new Set([...(votes ?? []).map((v) => v.user_id), generation?.user_id].filter(Boolean))] as string[];
  const profiles = (people.length
    ? (await supabase.from("profiles").select("id, first_name, last_name, avatar_url, is_superadmin").in("id", people)).data
    : []) as Profile[] | null;
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, displayName(p, "Unnamed student")]));
  const tally = {
    up: (votes ?? []).filter((v) => v.value > 0).length,
    down: (votes ?? []).filter((v) => v.value < 0).length,
  };
  const author = generation ? nameOf.get(generation.user_id) ?? "Unnamed student" : "Seed collection";

  return (
    <div className="stack-lg">
      <Link href={isLive ? "/media" : `/media?tab=${hiddenTab}`} className="back-link">← AI media</Link>
      {param(sp.created) && <FlashNotice param="created" message="Published! It’s live in Explore now." />}
      {param(sp.restored) && <FlashNotice param="restored" message="Restored! It’s live in Explore again, with its votes." />}
      {param(sp.removed) && <FlashNotice param="removed" message="Removed from Explore. Its votes are hidden too; restore it below to bring both back." />}

      <div className="detail-grid">
        <section className="panel stack-md">
          <Thumb url={image?.url} alt={image?.alt_text} size="lg" />
          <blockquote className="caption-hero">“{caption.content}”</blockquote>
          <p className="muted small">
            {image?.alt_text}
            {image && <> · <Link className="link-strong" href={`/media?image=${image.id}`}>other captions on this photo</Link></>}
          </p>
          <div className="row">
            {isLive ? <span className="badge badge-live">Live in Explore</span>
              : hiddenTab === "removed" ? <span className="badge badge-removed">Removed by admin</span>
              : <span className="badge badge-warn">In author&apos;s Trash</span>}
            {caption.admin_edited_at && <span className="badge badge-edit">Admin-edited {fmtDateTime(caption.admin_edited_at)}</span>}
          </div>
        </section>

        <div className="stack-md">
          {isLive && (
            <section className="panel">
              <h2>Edit</h2>
              <EditCaptionForm id={caption.id} content={caption.content} imageId={caption.image_id} images={images} />
            </section>
          )}
          {!isLive && (
            <section className="panel restore-panel">
              <h2>{hiddenTab === "removed" ? "Removed by an admin" : "In the author's Trash"}</h2>
              <p className="muted small">
                {hiddenTab === "removed"
                  ? "An admin removed this caption, so it is hidden from everyone and the author can’t restore it. "
                  : "The author deleted this caption from My humor, so it is hidden from everyone. "}
                Restoring it puts it back in Explore and in the author&apos;s My captions, with its original votes and likes.
              </p>
              <RestoreCaptionButton id={caption.id} from="detail" />
            </section>
          )}
          <section className="panel">
            <h2>Provenance</h2>
            <dl className="facts facts-wide">
              <div><dt>Author</dt><dd>{generation ? <Link className="link-strong" href={`/users/${generation.user_id}`}>{author}</Link> : author}</dd></div>
              <div><dt>Published</dt><dd>{fmtDateTime(caption.created_at)}</dd></div>
              {caption.deleted_at && <div><dt>{hiddenTab === "removed" ? "Removed" : "Moved to Trash"}</dt><dd>{fmtDateTime(caption.deleted_at)}</dd></div>}
              <div><dt>Model</dt><dd>{generation?.model ?? "—"}</dd></div>
              <div><dt>Style</dt><dd>{generation ? styleOf(generation) : "—"}</dd></div>
              <div><dt>Scene input</dt><dd>{generation?.user_input ?? "—"}</dd></div>
              {generation?.generated_content && generation.generated_content !== caption.content && (
                <div><dt>Original AI text</dt><dd>“{generation.generated_content}”</dd></div>
              )}
              <div><dt>Caption id</dt><dd className="mono small">{caption.id}</dd></div>
              {generation && <div><dt>Generation trace</dt><dd><Link className="link-strong" href={`/manage/generation-requests?q=${encodeURIComponent(generation.id)}`}>View request and LLM response</Link></dd></div>}
            </dl>
            {generation?.prompt && (
              <details className="details">
                <summary>Full prompt sent to the model</summary>
                <pre className="prompt">{generation.prompt}</pre>
              </details>
            )}
          </section>

          <section className="panel">
            <h2>Votes</h2>
            {!isLive ? <p className="muted">Votes on hidden captions are kept, but hidden from everyone until it is restored.</p> : (
              <>
                <SplitBars rows={[{ label: "All voters", sub: `Wilson score ${wilson(tally).toFixed(2)}`, tally }]} />
                {total(tally) > 0 && (
                  <ul className="vote-list">
                    {(votes ?? []).map((v) => (
                      <li key={v.user_id}>
                        <span className={v.value > 0 ? "vote-chip vote-up" : "vote-chip vote-down"}>{v.value > 0 ? "▲ Laugh" : "▼ Not quite"}</span>
                        <Link href={`/users/${v.user_id}`}>{nameOf.get(v.user_id) ?? "Unnamed student"}</Link>
                        <span className="muted small nowrap">{fmtDateTime(v.updated_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {isLive ? (
            <section className="panel warn-zone">
              <h2>Remove</h2>
              <p className="muted small">
                Hide this caption and its votes from Explore and every collection. It&apos;s reversible: restoring it
                from the Removed tab brings back the caption and its votes. Permanent deletion becomes available after removing.
              </p>
              <RemoveCaptionButton id={caption.id} preview={caption.content} from="detail" />
            </section>
          ) : (
            <section className="panel danger-zone">
              <h2>Danger zone</h2>
              <p className="muted small">Erase this caption and all of its votes. Nobody can restore it afterwards.</p>
              <DeleteCaptionButton id={caption.id} preview={caption.content} back={hiddenTab} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
