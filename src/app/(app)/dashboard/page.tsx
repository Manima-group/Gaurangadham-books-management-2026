import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/session";
import { ContactDashboard } from "./contact";
import { Alert } from "@/components/ui";
import { AdminDashboard } from "./admin";
import { ManagerDashboard } from "./manager";
import { DevoteeDashboard } from "./devotee";
import { LimitedDashboard, PendingDashboard } from "./pending";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const u = await requireSignedIn();
  // Pending / not-approved registrations see only their status — no tour, no data.
  if (u.approvalStatus !== "approved") return <PendingDashboard user={u} />;
  if (!u.onboarded) redirect("/welcome");
  const sp = await searchParams;
  return (
    <>
      {sp.denied && (
        <div className="mb-4">
          <Alert tone="amber" title="That page is not available for your role.">
            You have been brought back to your Home page.
          </Alert>
        </div>
      )}
      {u.role === "admin" ? <AdminDashboard /> : u.role === "manager" ? <ManagerDashboard user={u} /> : u.role === "contact" ? <ContactDashboard user={u} /> : u.canDistribute ? <DevoteeDashboard user={u} /> : <LimitedDashboard user={u} />}
    </>
  );
}
