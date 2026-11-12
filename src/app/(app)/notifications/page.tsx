import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { markAllRead } from "@/app/actions/setup";
import { timeAgo } from "@/lib/format";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ClearAll, NotifDelete } from "./buttons";

export default async function NotificationsPage() {
  const u = await requireUser();
  const rows = await db.select().from(schema.notification).where(eq(schema.notification.userId, u.id)).orderBy(desc(schema.notification.createdAt)).limit(50);
  const unread = rows.filter((r) => !r.isRead).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Notifications" }]}
        doHere="Updates that need your attention. Tap one to open it."
        actions={
          rows.length ? (
            <>
              {unread > 0 && <form action={markAllRead}><button className="btn-secondary btn-sm w-full">Mark all as read</button></form>}
              <ClearAll />
            </>
          ) : undefined
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications yet.">You'll be told here when something needs your attention.</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((n) => {
              const body = (
                <div className={`flex gap-3 py-3 ${n.isRead ? "" : "font-medium"}`}>
                  <span className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${n.isRead ? "bg-stone-200" : "bg-red-500"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p>{n.title}</p>
                    {n.body && <p className="text-sm font-normal text-ink-500">{n.body}</p>}
                    <p className="text-xs font-normal text-ink-500">{timeAgo(n.createdAt)}</p>
                  </div>
                  {n.link && <span className="self-center text-ink-500" aria-hidden>›</span>}
                </div>
              );
              return (
                <li key={n.id} className="flex items-center gap-1">
                  <div className="min-w-0 flex-1">{n.link ? <Link href={n.link} className="block hover:bg-brand-50/40">{body}</Link> : body}</div>
                  <NotifDelete id={n.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
