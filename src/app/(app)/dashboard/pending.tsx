import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AppUser } from "@/lib/session";
import { APPROVAL_LABEL } from "@/lib/terms";
import { devoteeBooks } from "@/lib/devotee";
import { moneySummary } from "@/lib/stats";
import { inr } from "@/lib/format";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";

/** Shown to a self-registered devotee until a Sector Sevak approves them. No books, money or stock data here. */
export async function PendingDashboard({ user: u }: { user: AppUser }) {
  const [[row], [mine]] = await Promise.all([
    db.select({ note: schema.user.reviewNote }).from(schema.user).where(eq(schema.user.id, u.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.outreachContact).where(eq(schema.outreachContact.collectorId, u.id)),
  ]);
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
        {u.approvalStatus === "pending" && u.role === "devotee" && (
          <Card title="You can start outreach now" subtitle="Collect contacts of people who want to know more — no need to wait for approval">
            <p className="mb-3 text-sm text-ink-700">Contacts you collected: <b data-testid="pending-contacts">{Number(mine?.n ?? 0)}</b></p>
            <div className="flex flex-wrap gap-2">
              <Link href="/contacts/new" className="btn-primary">➕ Collect Contacts</Link>
              <Link href="/contacts/mine" className="btn-secondary">📇 My Contacts</Link>
            </div>
          </Card>
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
export async function LimitedDashboard({ user: u }: { user: AppUser }) {
  // Book Distribution was turned off: books and money they still have are shown so they can be handed back — never removed silently.
  const [books, money] = await Promise.all([devoteeBooks(u.id), moneySummary({ devoteeId: u.id })]);
  const held = books.reduce((a, b) => a + Math.max(b.holding, 0), 0);
  const due = Math.max(money.collected - money.submitted, 0);
  return (
    <>
      <PageHeader title={`Hare Krishna, ${u.name.split(" ")[0]} 🙏`} crumbs={[{ label: "Home" }]} doHere="Your registration is approved." />
      <div className="grid gap-4 lg:grid-cols-2" data-testid="limited-dashboard">
        <Alert tone="blue" title="Book Distribution: Disabled">
          Your Sector Sevak has not turned on book distribution for you yet. Please speak to them when you are ready to distribute books.
        </Alert>
        {(held > 0 || due > 0) && (
          <Alert tone="amber" title="Please hand these back to your Sector Sevak">
            <span data-testid="reconcile-notice">
              {held > 0 && <>You still have <b>{held}</b> book{held === 1 ? "" : "s"}. Your Sector Sevak will take them back. </>}
              {due > 0 && <>Money still to hand over: <b>{inr(due)}</b>. <Link href="/my/money" className="font-semibold underline">Submit Money</Link></>}
            </span>
          </Alert>
        )}
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
