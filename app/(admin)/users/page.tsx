import Link from "next/link";
import Avatar from "@/components/Avatar";
import Pager from "@/components/Pager";
import { requireAdmin } from "@/lib/auth";
import { loadDataset, loadUsers } from "@/lib/data";
import { fmtDate, fmtDateTime, fmtNum, fmtPct, pageNumber, param } from "@/lib/format";
import { buildIndex, displayName, laughRate, type Tally } from "@/lib/stats";

const PER_PAGE = 25;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = param(sp.q).trim().toLowerCase();
  const role = param(sp.role) === "admin" ? "admin" : "";
  const sort = ["laughs", "votes", "recent"].includes(param(sp.sort)) ? param(sp.sort) : "joined";

  const [users, ds] = await Promise.all([loadUsers(supabase), loadDataset(supabase)]);
  const ix = buildIndex(ds);
  const stats = new Map<string, { captions: number; votes: number; received: Tally }>();
  const get = (id: string) => {
    if (!stats.has(id)) stats.set(id, { captions: 0, votes: 0, received: { up: 0, down: 0 } });
    return stats.get(id)!;
  };
  for (const c of ds.captions) {
    const author = ix.authorOf(c);
    if (!author) continue;
    const s = get(author);
    const t = ix.tallies.get(c.id)!;
    s.captions++;
    s.received.up += t.up;
    s.received.down += t.down;
  }
  for (const v of ds.votes) get(v.user_id).votes++;

  let rows = users.map((u) => ({ ...u, ...(stats.get(u.id) ?? { captions: 0, votes: 0, received: { up: 0, down: 0 } }) }));
  if (role) rows = rows.filter((u) => u.is_superadmin);
  if (q) {
    rows = rows.filter((u) =>
      `${displayName(u, "")} ${u.email ?? ""} ${u.id}`.toLowerCase().includes(q));
  }
  const sorters: Record<string, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
    joined: (a, b) => b.created_at.localeCompare(a.created_at),
    recent: (a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""),
    laughs: (a, b) => b.received.up - a.received.up || b.captions - a.captions,
    votes: (a, b) => b.votes - a.votes,
  };
  rows.sort(sorters[sort]);
  const pages = Math.ceil(rows.length / PER_PAGE);
  const page = Math.min(pageNumber(sp.page), Math.max(1, pages));
  const visible = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const completed = users.filter((u) => u.first_name?.trim() && u.last_name?.trim()).length;

  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <span className="eyebrow">Users · read only</span>
          <h1>Who&apos;s in the audience</h1>
          <p className="muted">
            {fmtNum(users.length)} accounts · {fmtNum(completed)} completed profiles ·{" "}
            {fmtNum(users.filter((u) => u.is_superadmin).length)} superadmin(s)
          </p>
        </div>
      </header>

      <form className="filters" role="search">
        <label className="field grow">
          <span>Search</span>
          <input name="q" defaultValue={param(sp.q)} placeholder="Name, email or user id" />
        </label>
        <label className="field">
          <span>Role</span>
          <select name="role" defaultValue={role}>
            <option value="">Everyone</option>
            <option value="admin">Superadmins</option>
          </select>
        </label>
        <label className="field">
          <span>Sort by</span>
          <select name="sort" defaultValue={sort}>
            <option value="joined">Newest account</option>
            <option value="recent">Last sign-in</option>
            <option value="laughs">Laughs received</option>
            <option value="votes">Votes cast</option>
          </select>
        </label>
        <button className="button button-primary">Apply</button>
        {(q || role || sort !== "joined") && <Link href="/users" className="button button-ghost">Clear</Link>}
      </form>

      <section className="panel table-panel">
        {visible.length === 0 ? (
          <p className="empty-state muted">No users match these filters.</p>
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Joined</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col" className="num">Captions</th>
                  <th scope="col" className="num">Votes cast</th>
                  <th scope="col" className="num">Laugh rate received</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/users/${u.id}`} className="user-cell">
                        <Avatar url={u.avatar_url} name={displayName(u, u.email ?? "?")} />
                        <span>
                          <strong>{displayName(u, "Profile incomplete")}</strong>
                          {u.is_superadmin && <span className="badge badge-admin">Admin</span>}
                          <span className="muted small block">{u.email ?? "no email"}</span>
                        </span>
                      </Link>
                    </td>
                    <td>{fmtDate(u.created_at)}</td>
                    <td>{fmtDateTime(u.last_sign_in_at)}</td>
                    <td className="num">{u.captions}</td>
                    <td className="num">{u.votes}</td>
                    <td className="num">{fmtPct(laughRate(u.received))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager base="/users" params={{ q: param(sp.q) || undefined, role: role || undefined, sort: sort === "joined" ? undefined : sort }}
          page={page} pages={pages} totalLabel={`${rows.length} result${rows.length === 1 ? "" : "s"}`} />
      </section>
    </div>
  );
}
