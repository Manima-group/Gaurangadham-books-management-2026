import Link from "next/link";
import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { allDhams } from "@/lib/lookups";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ReviewForm } from "../access-forms";

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
const PERM = { approval: "Registration", book_distribution: "Book Distribution", dham_sales_view: "Dham Sales View" } as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser("manager", "admin");
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const c: SQL[] = [eq(schema.user.role, "devotee"), eq(schema.user.approvalStatus, "pending")];
  if (u.role !== "admin") c.push(eq(schema.user.dhamId, u.dhamId ?? -1));
  if (q) c.push(sql`(${schema.user.name} ilike ${"%" + q + "%"} or ${schema.user.phone} like ${"%" + q.replace(/\D/g, "") + "%"})`);
  const [pending, dhams] = await Promise.all([db.select().from(schema.user).where(and(...c)).orderBy(desc(schema.user.createdAt)).limit(200), allDhams()]);
  const dn = new Map(dhams.map((d) => [d.id, d.name]));
  // Possible duplicates: an existing (non-pending) devotee with the same name in the same Dham. Accounts are never merged.
  const names = [...new Set(pending.map((p) => p.name.toLowerCase()))];
  const existing = names.length
    ? await db.select({ name: schema.user.name, dhamId: schema.user.dhamId }).from(schema.user)
        .where(and(inArray(sql`lower(${schema.user.name})`, names), ne(schema.user.approvalStatus, "pending")))
    : [];
  const dupKey = new Set(existing.map((e) => `${e.name.toLowerCase()}|${e.dhamId}`));

  const target = alias(schema.user, "target");
  const auditWhere: SQL[] = [];
  if (u.role !== "admin") auditWhere.push(eq(target.dhamId, u.dhamId ?? -1));
  const recent = await db
    .select({ a: schema.accessAudit, who: schema.user.name, whom: target.name })
    .from(schema.accessAudit)
    .innerJoin(target, eq(target.id, schema.accessAudit.userId))
    .leftJoin(schema.user, eq(schema.user.id, schema.accessAudit.actorId))
    .where(auditWhere.length ? and(...auditWhere) : undefined)
    .orderBy(desc(schema.accessAudit.createdAt))
    .limit(40);

  return (
    <>
      <PageHeader
        title="Registration Requests"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: u.role === "admin" ? "Sevaks & Devotees" : "My Devotees", href: "/people" }, { label: "Registration Requests" }]}
        doHere="Devotees who registered with your QR wait here. Approve or do not approve them — one by one or many at once."
        next="Approval alone gives no access. Tick Book Distribution or Dham Sales View only for those who need it; you can change it later on the devotee list."
        actions={<Link href="/people/registration" className="btn-secondary btn-sm">Registration QR</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={`Waiting for approval (${pending.length})`} className="lg:col-span-3">
          <form className="mb-3 flex gap-2" role="search">
            <input name="q" defaultValue={q} placeholder="Search name or mobile" className="field-input" aria-label="Search requests" />
            <button className="btn-secondary btn-sm">Search</button>
          </form>
          {pending.length === 0 ? (
            <EmptyState icon="✅" title={q ? "No request matches." : "No one is waiting."}>New registrations from your QR show here.</EmptyState>
          ) : (
            <ReviewForm people={pending.map((p) => ({ id: p.id, name: p.name, phone: p.phone, dham: dn.get(p.dhamId ?? -1) ?? "—", when: fmt(p.createdAt), dup: dupKey.has(`${p.name.toLowerCase()}|${p.dhamId}`) }))} />
          )}
        </Card>
        <Card title="Recent access changes" subtitle="Who changed what, and why" className="lg:col-span-2 lg:self-start">
          {recent.length === 0 ? <p className="text-sm text-ink-500">Nothing yet.</p> : (
            <ul className="space-y-2 text-sm" data-testid="access-audit">
              {recent.map(({ a, who, whom }) => (
                <li key={a.id} className="rounded-lg bg-stone-50 px-3 py-2">
                  <p><b>{whom}</b> · {PERM[a.permission]}: {a.oldValue ?? "—"} → <Badge tone={a.newValue === "on" || a.newValue === "approved" ? "green" : "gray"}>{a.newValue}</Badge></p>
                  <p className="text-xs text-ink-500">by {who ?? "—"} · {fmt(a.createdAt)}{a.reason ? ` · “${a.reason}”` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
