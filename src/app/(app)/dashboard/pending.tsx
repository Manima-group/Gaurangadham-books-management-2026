import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { APPROVAL_LABEL } from "@/lib/terms";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";

/** Shown to a self-registered devotee until a Sector Sevak approves them. No books, money or stock data here. */
export async function PendingDashboard({ user: u }: { user: AppUser }) {
  const [row] = await db.select({ note: schema.user.reviewNote }).from(schema.user).where(eq(schema.user.id, u.id));
  const st = APPROVAL_LABEL[u.approvalStatus] ?? APPROVAL_LABEL.pending;
  return (
    <>
      <PageHeader title={`Hare Krishna, ${u.name.split(" ")[0]} 🙏`} crumbs={[{ label: "Home" }]} doHere="Your registration is saved." />
      <div className="grid gap-4 lg:grid-cols-2" data-testid="pending-dashboard">
        {u.approvalStatus === "rejected" ? (
          <Alert tone="red" title="Your registration was not approved.">
            {row?.note ? <>Reason: {row.note}. </> : null}Please speak to your Sector Sevak.
          </Alert>
        ) : (
          <Alert tone="amber" title="Awaiting Sector Sevak Approval">
            Your Sector Sevak of {u.dhamName ?? "your Dham"} will check and approve your registration. You will get a notification here when it is done.
          </Alert>
        )}
        <Card title="My profile">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink-500">Name</dt><dd className="font-semibold">{u.name}</dd></div>
            <div><dt className="text-ink-500">Mobile number</dt><dd className="font-semibold">{u.phone ?? "—"}</dd></div>
            <div><dt className="text-ink-500">Dham</dt><dd className="font-semibold">{u.dhamName ?? "—"}</dd></div>
            <div><dt className="text-ink-500">Status</dt><dd><Badge tone={st.tone}>{st.label}</Badge></dd></div>
            <div><dt className="text-ink-500">Book Distribution</dt><dd className="font-semibold">Disabled</dd></div>
          </dl>
          <div className="mt-4 flex gap-2"><Link href="/account" className="btn-secondary btn-sm">Change password</Link></div>
        </Card>
      </div>
    </>
  );
}

/** Approved devotee whose Book Distribution is off: only profile + (if allowed) Dham Sales View. */
export function LimitedDashboard({ user: u }: { user: AppUser }) {
  return (
    <>
      <PageHeader title={`Hare Krishna, ${u.name.split(" ")[0]} 🙏`} crumbs={[{ label: "Home" }]} doHere="Your registration is approved." />
      <div className="grid gap-4 lg:grid-cols-2" data-testid="limited-dashboard">
        <Alert tone="blue" title="Book Distribution: Disabled">
          Your Sector Sevak has not turned on book distribution for you yet. Please speak to them when you are ready to distribute books.
        </Alert>
        <Card title="What you can use">
          <ul className="space-y-2 text-sm">
            {u.canViewDhamSales && <li><Link href="/dham-sales" className="font-semibold text-brand-700">📊 Dham Sales</Link> — total books and money of {u.dhamName}</li>}
            <li><Link href="/contacts/mine" className="font-semibold text-brand-700">📇 Interested contacts</Link> — note people who want to know more</li>
            <li><Link href="/account" className="font-semibold text-brand-700">🔑 My Account</Link></li>
          </ul>
        </Card>
      </div>
    </>
  );
}
