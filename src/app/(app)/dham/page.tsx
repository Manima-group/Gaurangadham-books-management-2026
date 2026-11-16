import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { dhamOverview } from "@/lib/hierarchy";
import { inr, num } from "@/lib/format";
import { Badge, EmptyState, PageHeader, StatCard } from "@/components/ui";

/** Level 1 — every Dham as a card. Managers go straight to their own Dham. */
export default async function DhamsHierarchy() {
  const u = await requireUser("admin", "manager");
  if (u.role === "manager") redirect(u.dhamId ? `/dham/${u.dhamId}` : "/dashboard");
  const dhams = await dhamOverview();
  const t = dhams.reduce(
    (a, d) => ({ received: a.received + d.received, available: a.available + d.available, withDevotees: a.withDevotees + d.withDevotees, sold: a.sold + d.sold, amount: a.amount + d.amount }),
    { received: 0, available: 0, withDevotees: 0, sold: 0, amount: 0 },
  );

  return (
    <>
      <PageHeader
        title="Dhams & Devotees"
        crumbs={[{ label: "Global Admin", href: "/dashboard" }, { label: "Dhams" }]}
        doHere="Tap a Dham to see its devotees and the books on its shelf."
        next="Then tap a devotee to see their books, every sale and full history."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Books at Dhams (shelf)" value={num(t.available)} tone="blue" />
        <StatCard label="With devotees now" value={num(t.withDevotees)} tone="purple" />
        <StatCard label="Sold (approved)" value={num(t.sold)} tone="green" hint={inr(t.amount)} />
        <StatCard label="Received by Dhams" value={num(t.received)} />
      </div>

      {dhams.length === 0 ? (
        <EmptyState icon="🛕" title="No Dhams yet.">Add a Dham in Settings → Dhams.</EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dhams.map((d) => (
            <li key={d.id}>
              <Link
                href={`/dham/${d.id}`}
                data-testid="dham-card"
                className="block h-full rounded-2xl border border-stone-200/70 bg-white p-4 shadow-card transition hover:border-brand-300 hover:bg-brand-50/30"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-lg font-bold text-ink-900">🛕 {d.name}</p>
                    <p className="text-xs text-ink-500">{d.city ?? "—"} · {num(d.devotees)} devotee{d.devotees === 1 ? "" : "s"}</p>
                  </div>
                  {!d.active && <Badge tone="gray">Inactive</Badge>}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["On shelf", d.available],
                    ["With devotees", d.withDevotees],
                    ["Sold", d.sold],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl bg-stone-50 px-1 py-2">
                      <dt className="text-[11px] text-ink-500">{k}</dt>
                      <dd className="font-display text-lg font-extrabold tabular-nums">{num(v as number)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500">
                  <span>Received {num(d.received)}</span>
                  <span>Given to devotees {num(d.allocated)}</span>
                  <span>Sales {inr(d.amount)}</span>
                </p>
                <p className="mt-2 text-sm font-semibold text-brand-700">See devotees →</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
