import Link from "next/link";
import CreateMediaForm from "@/components/CreateMediaForm";
import { requireAdmin } from "@/lib/auth";
import { loadPickerImages } from "@/lib/images";

export default async function NewMediaPage() {
  const { supabase } = await requireAdmin();
  const images = await loadPickerImages(supabase);
  return (
    <div className="stack-lg">
      <Link href="/media" className="back-link">← AI media</Link>
      <header className="page-head">
        <div>
          <span className="eyebrow">AI media · create</span>
          <h1>Put a new caption on stage</h1>
          <p className="muted">Pick a photo, draft with Gemini (or write your own), review, then publish.</p>
        </div>
      </header>
      {images.length === 0
        ? <p className="panel empty-state muted">There are no photos in the database yet.</p>
        : <CreateMediaForm images={images} geminiReady={Boolean(process.env.GEMINI_API_KEY)} />}
    </div>
  );
}
