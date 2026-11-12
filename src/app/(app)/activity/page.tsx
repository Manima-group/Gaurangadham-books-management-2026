import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { allDhams } from "@/lib/lookups";
import { fmtDateTime } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ dham?: string; page?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const c: SQL[] = [];
  if (u.role === "manager") c.push(eq(schema.activityLog.dhamId, u.dhamId!));
  else if (sp.dham) c.push(eq(schema.activityLog.dhamId, Number(sp.dham)));
  const [rows, dhams] = await Promise.all([
    db.select().from(schema.activityLog).where(c.length ? and(...c) : undefined).orderBy(desc(schema.activityLog.createdAt)).limit(61).offset((page - 1) * 60),
    u.role === "admin" ? allDhams() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        title="Activity History"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Activity History" }]}
        doHere="See who did what and when. Every important action is recorded here and cannot be changed."
      />
      {u.role === "admin" && (
        <form className="mb-4 flex gap-2" action="/activity">
          <select name="dham" defaultValue={sp.dham ?? ""} className="field-input max-w-xs py-2 text-sm" aria-label="Dham">
            <option value="">All Dhams and organisation-level</option>
            {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className="btn-secondary btn-sm">Filter</button>
        </form>
      )}
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="🕘" title="No activity yet.">Actions such as receiving books or approving reports will appear here.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {rows.slice(0, 60).map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <div><p>{a.action}</p><p className="text-xs text-ink-500">{fmtDateTime(a.createdAt)}</p></div>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-4 flex justify-between">
          {page > 1 ? <a className="btn-secondary btn-sm" href={`?page=${page - 1}${sp.dham ? `&dham=${sp.dham}` : ""}`}>← Newer</a> : <span />}
          {rows.length > 60 && <a className="btn-secondary btn-sm" href={`?page=${page + 1}${sp.dham ? `&dham=${sp.dham}` : ""}`}>Older →</a>}
        </div>
      </Card>
    </>
  );
}
