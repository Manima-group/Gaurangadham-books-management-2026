import Link from "next/link";
import type { AppUser } from "@/lib/session";
import { contactStats, INTERESTS } from "@/lib/outreach";
import { num } from "@/lib/format";
import { StatCard } from "@/components/ui";

/** Contact Collection Sevak home: four counts, interest totals, one big button. */
export async function ContactDashboard({ user }: { user: AppUser }) {
  const s = await contactStats(user, {}, true);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[24px] font-extrabold text-ink-900">Outreach Contacts</h1>
        <p className="text-sm text-ink-500">{user.dhamName ?? "No Dham assigned"}</p>
      </div>
      <Link href="/contacts/new" className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-lg font-bold text-white shadow-lift transition hover:bg-brand-700" data-testid="add-contact">
        ➕ Add New Contact
      </Link>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total collected" value={num(s.total)} href="/contacts/mine" />
        <StatCard label="Today" value={num(s.today)} tone="blue" href="/contacts/mine" />
        <StatCard label="This month" value={num(s.month)} tone="purple" href="/contacts/mine" />
      </div>
      <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-card">
        <h2 className="mb-3 font-display text-base font-bold text-ink-900">Interested in</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="interest-counts">
          {INTERESTS.map((i) => (
            <li key={i.key} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5 text-sm">
              <span><span aria-hidden>{i.icon}</span> {i.label}</span>
              <b className="tabular-nums">{num(s.interests.get(i.key) ?? 0)}</b>
            </li>
          ))}
        </ul>
      </section>
      <Link href="/contacts/mine" className="btn-secondary w-full">📇 My Submitted Contacts</Link>
    </div>
  );
}
