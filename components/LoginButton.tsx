"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login() {
    setBusy(true);
    setError("");
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: new URL("/auth/callback", window.location.origin).toString() },
      });
      if (error) throw error;
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setBusy(false);
    }
  }
  return (
    <div className="stack-sm">
      <button className="button button-primary button-wide" onClick={login} disabled={busy}>
        <span className="google-g" aria-hidden="true">G</span>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {error && <p role="alert" className="form-error">{error}</p>}
    </div>
  );
}
