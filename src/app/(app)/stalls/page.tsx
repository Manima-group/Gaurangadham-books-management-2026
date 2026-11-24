import Link from "next/link";
import { requireApproved } from "@/lib/session";
import { canCreateStall, ref, stallsFor } from "@/lib/stalls";
import { STALL_STATUS } from "@/lib/terms";
import { fmtDate, num, todayIST } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { CreateStallForm } from "./forms";

export default async function StallsPage() {
  const u = await requireApproved("devotee", "manager", "admin");
  // Devotees need Book Distribution on to take part (Sevaks always can).
  if (u.role === "devotee" && !u.canDistribute) return <EmptyState icon="🔒" title="Book Distribution is not turned on for you.">Please speak to your Sector Sevak.</EmptyState>;
  const list = await stallsFor(u);
  const can = canCreateStall(u);
  return (
    <>
      <PageHeader title="Shared Book Stall" crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Shared Book Stall" }]}
        doHere="Run one book table together: each devotee puts some of their own books on it, anyone sells, and at the end the books left are shared back fairly."
        next="Your books stay yours until the stall closes. Every sale and every change is recorded." />
      <div className="grid gap-4 lg:grid-cols-5">
        {can && (
          <Card title="Start a new stall" className="lg:col-span-2 lg:self-start">
            <CreateStallForm today={todayIST()} canMulti />
          </Card>
        )}
        <Card title={`Stalls (${list.length})`} className={can ? "lg:col-span-3" : "lg:col-span-5"}>
          {list.length === 0 ? <EmptyState icon="🛖" title="No stalls yet.">{can ? "Create one on the left and invite devotees." : "You'll see stalls here when someone invites you."}</EmptyState> : (
            <ul className="divide-y divide-stone-100">
              {list.map((s) => (
                <li key={s.id} className="py-3">
                  <Link href={`/stalls/${s.id}`} className="flex flex-wrap items-center gap-2" data-testid="stall-row">
                    <span className="font-semibold text-ink-900">{s.name}</span>
                    <Badge tone={STALL_STATUS[s.status]?.tone}>{STALL_STATUS[s.status]?.label}</Badge>
                    {s.my_status === "invited" && <Badge tone="amber">You are invited</Badge>}
                    {s.mode === "multi_dham" && <Badge tone="purple">Several Dhams</Badge>}
                  </Link>
                  <p className="text-sm text-ink-500">{ref(s.id)} · {fmtDate(s.event_date)} · {s.dham}{s.location ? ` · ${s.location}` : ""} · coordinator {s.coordinator} · {num(s.sold)} sold</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
