import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && user) {
      // proxy.ts decides between the dashboard and /denied on the next request.
      return NextResponse.redirect(new URL("/", origin));
    }
    console.error("[auth/callback] session exchange failed", {
      errorCode: error?.code ?? "unknown",
      status: error?.status,
    });
  }
  return NextResponse.redirect(new URL("/login?error=signin", origin));
}
