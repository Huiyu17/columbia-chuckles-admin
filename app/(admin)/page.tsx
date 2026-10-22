import DashboardView from "@/components/DashboardView";
import { requireAdmin } from "@/lib/auth";
import { loadDataset } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { computeDashboard } from "@/lib/stats";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadReport(supabase: Supabase) {
  const dataset = await loadDataset(supabase);
  const now = new Date();
  return { d: computeDashboard(dataset, now), generatedAt: `as of ${fmtDateTime(now.toISOString())}` };
}

export default async function DashboardPage() {
  const { supabase } = await requireAdmin();
  const { d, generatedAt } = await loadReport(supabase);
  return <DashboardView d={d} generatedAt={generatedAt} />;
}
