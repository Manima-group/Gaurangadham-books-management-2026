import { requireUser } from "@/lib/session";
import { activeDhams } from "@/lib/lookups";
import { baseUrl, inviteLink, invitesFor, qrDataUrl } from "@/lib/registration";
import { revokeInvite } from "@/app/actions/registration";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { InviteForm } from "../access-forms";

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);

export default async function RegistrationPage() {
  const u = await requireUser("manager", "admin");
  const isAdmin = u.role === "admin";
  const [invites, dhams, base] = await Promise.all([invitesFor(u), activeDhams(), baseUrl()]);
  const rows = await Promise.all(invites.map(async ({ inv, dham }) => { const link = inviteLink(base, inv.token); return { inv, dham, link, qr: await qrDataUrl(link) }; }));
  return (
    <>
      <PageHeader
        title="Registration QR"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: isAdmin ? "Sevaks & Devotees" : "My Devotees", href: "/people" }, { label: "Registration QR" }]}
        doHere="Create a QR that new devotees scan to register themselves under your Dham. Print it as PDF or share the link."
        next="New registrations wait in Registration Requests until you approve them. Approval gives no access by itself — you turn on Book Distribution or Dham Sales View."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Create a registration QR" className="lg:col-span-2 lg:self-start">
          <InviteForm dhams={dhams.map((d) => ({ id: d.id, name: d.name }))} isAdmin={isAdmin} ownDham={u.dhamName ?? null} />
        </Card>
        <Card title={`Active QR codes (${rows.length})`} className="lg:col-span-3">
          {rows.length === 0 ? (
            <EmptyState icon="🔗" title="No active registration QR yet.">Create one on the left.</EmptyState>
          ) : (
            <ul className="space-y-4">
              {rows.map(({ inv, dham, link, qr }) => (
                <li key={inv.id} className="flex flex-col gap-3 rounded-xl p-3 ring-1 ring-stone-200 sm:flex-row" data-testid="invite-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`Registration QR for ${dham}`} width={140} height={140} className="h-36 w-36 shrink-0 rounded-lg ring-1 ring-stone-200" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-semibold text-ink-900">{dham}</p>
                    <p className="text-sm text-ink-500">Works until {fmt(inv.expiresAt)}</p>
                    <input readOnly value={link} className="field-input text-xs" aria-label="Registration link" data-testid="invite-link" />
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/register/qr/${inv.id}`} className="btn-primary btn-sm" data-testid="invite-pdf">Download QR as PDF</a>
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={inv.id} />
                        <button className="btn-secondary btn-sm" data-testid="invite-revoke">Turn off this QR</button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
