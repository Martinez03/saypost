import { AppShell } from "@/components/app/app-shell";
import { getSession, requireBusiness } from "@/lib/session";

// Every dashboard page needs a session (proxy.ts) and a business (else onboarding).
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ supabase, email }, business] = await Promise.all([getSession(), requireBusiness()]);
  const { count } = await supabase.from("actions").select("id", { count: "exact", head: true }).eq("status", "pending");

  return (
    <AppShell businessName={business.name} email={email} pending={count ?? 0}>
      {children}
    </AppShell>
  );
}
