import { redirect } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import LogoutButton from "@/components/LogoutButton";
import { createClient } from "@/lib/supabase/server";

export default async function DeniedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_superadmin");
  if (isAdmin === true) redirect("/");

  return (
    <main className="gate">
      <section className="gate-card">
        <BrandMark />
        <span className="eyebrow eyebrow-warn">403 · Not on the list</span>
        <h1>This account isn&apos;t a superadmin.</h1>
        <p className="muted">
          You&apos;re signed in as <strong>{user.email}</strong>, but its profile does
          not have <code>is_superadmin = true</code>. No admin data was loaded.
        </p>
        <p className="muted small">
          Admin access is granted by the project owner directly in the database,
          never from inside this app.
        </p>
        <LogoutButton className="button button-primary button-wide" />
      </section>
    </main>
  );
}
