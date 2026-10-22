"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="panel empty-state" role="alert">
      <h1>Backstage couldn&apos;t load this page.</h1>
      <p className="muted">
        The database read failed. If this is a fresh setup, check that
        <code> supabase/008_admin_panel.sql</code> has been run in the Supabase SQL Editor.
      </p>
      {error.digest && <p className="muted small">Reference: {error.digest}</p>}
      <button className="button button-primary" onClick={reset}>Try again</button>
    </section>
  );
}
