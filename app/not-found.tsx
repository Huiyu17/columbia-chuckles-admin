import Link from "next/link";

export default function NotFound() {
  return (
    <main className="gate">
      <section className="gate-card">
        <span className="eyebrow">404</span>
        <h1>That bit isn&apos;t in the set list.</h1>
        <p className="muted">The record may have been deleted, or the link is wrong.</p>
        <Link href="/" className="button button-primary button-wide">Back to the laugh report</Link>
      </section>
    </main>
  );
}
