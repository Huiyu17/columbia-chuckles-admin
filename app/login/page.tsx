import BrandMark from "@/components/BrandMark";
import LoginButton from "@/components/LoginButton";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="gate">
      <section className="gate-card">
        <BrandMark />
        <span className="eyebrow">Staff entrance</span>
        <h1>Backstage is for superadmins.</h1>
        <p className="muted">
          Sign in with Google. Access is granted only to accounts whose profile is
          marked <code>is_superadmin</code> in the Columbia Chuckles database.
        </p>
        {error && (
          <p role="alert" className="form-error">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        <LoginButton />
      </section>
    </main>
  );
}
