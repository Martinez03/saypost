import { AppShell } from "@/components/app/app-shell";
import { getBusinesses, getSession, getWorkspaceContext, requireBusiness } from "@/lib/session";

// Every dashboard page needs a session (proxy.ts) and a business (else onboarding).
// The approvals badge counts every business the user can see: approvals are unified for agencies.
// Agency mode (switcher, Clients): an agency workspace, or more than one business.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [{ supabase, email }, business, businesses, { agencyMode }] = await Promise.all([getSession(), requireBusiness(), getBusinesses(), getWorkspaceContext()]);
  const { count } = await supabase.from("actions").select("id", { count: "exact", head: true }).eq("status", "pending");

  return (
    <AppShell
      businessName={business.name}
      businessId={business.id}
      businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
      email={email}
      pending={count ?? 0}
      agencyMode={agencyMode}
    >
      {children}
    </AppShell>
  );
}
