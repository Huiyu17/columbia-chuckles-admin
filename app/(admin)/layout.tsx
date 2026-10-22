import Sidebar from "@/components/Sidebar";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Layouts don't re-run on every client navigation, so each page ALSO calls
  // requireAdmin(); this call just provides the signed-in identity for the shell.
  const { user } = await requireAdmin();
  return (
    <div className="shell">
      <Sidebar email={user.email ?? "signed in"} />
      <main className="content">{children}</main>
    </div>
  );
}
