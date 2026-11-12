import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/session";
import { allCampaigns, activeDhams, allDhams } from "@/lib/lookups";
import { toggleDrive } from "@/app/actions/setup";
import { fmtDate, inr, num, todayIST } from "@/lib/format";
import { Badge, Card, EmptyState, HelpTip, PageHeader } from "@/components/ui";
import { DriveForm } from "./forms";
import { DeleteButton } from "@/components/delete";
import { deleteDrive } from "@/app/actions/setup";

export default async function DrivesPage() {
  await requireUser("admin");
  const today = todayIST();
  const [drives, dhams, all, stats] = await Promise.all([
    allCampaigns(),
    activeDhams(),
    allDhams(),
    db.execute(sql`select campaign_id, sum(total_sold)::int as qty, sum(sales_paise)::bigint as amt from daily_report where status = 'approved' group by campaign_id`) as unknown as Promise<{ campaign_id: number; qty: number; amt: number }[]>,
  ]);
  const st = new Map(stats.map((s) => [s.campaign_id, s]));
  const dn = new Map(all.map((d) => [d.id, d.name]));
  return (
    <>
      <PageHeader
        title="Distribution Drives"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Settings" }, { label: "Distribution Drives" }]}
        doHere={<>Create a named period of book distribution, like a festival marathon.<HelpTip>Every daily report and book movement during the drive's dates is tagged with the drive, so you can see its results separately.</HelpTip></>}
        next="Reports during the drive's dates are counted under it. Filter reports by drive in All Dhams Overview."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Create a Distribution Drive" className="lg:col-span-2 lg:self-start">
          <DriveForm dhams={dhams.map((d) => ({ id: d.id, name: d.name }))} today={today} />
        </Card>
        <Card title="All drives" className="lg:col-span-3">
          {drives.length === 0 ? (
            <EmptyState icon="🚩" title="No distribution drives yet.">Create one to group sales by a festival or campaign period.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {drives.map((c) => {
                const running = c.isActive && c.startDate <= today && (!c.endDate || c.endDate >= today);
                const s = st.get(c.id);
                return (
                  <li key={c.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.name} {running ? <Badge tone="green">Running</Badge> : c.isActive ? <Badge tone="blue">Scheduled / ended</Badge> : <Badge>Inactive</Badge>}</p>
                      <p className="text-sm text-ink-500">{fmtDate(c.startDate)} – {c.endDate ? fmtDate(c.endDate) : "no end date"} · {c.dhamId ? dn.get(c.dhamId) : "All Dhams"}</p>
                      <p className="text-sm text-ink-700">{num(s?.qty ?? 0)} books sold · {inr(Number(s?.amt ?? 0))}</p>
                    </div>
                    <form action={toggleDrive}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn-secondary btn-sm">{c.isActive ? "Mark as Inactive" : "Mark as Active"}</button>
                    </form>
                  </div>
                  <details className="mt-2">
                    <summary className="tap cursor-pointer text-sm font-semibold text-brand-700">Edit · delete</summary>
                    <div className="mt-2 space-y-3 rounded-xl bg-stone-50 p-3">
                      <DriveForm dhams={dhams.map((d) => ({ id: d.id, name: d.name }))} today={today} drive={c} />
                      <DeleteButton action={deleteDrive} id={c.id} label="Delete drive" confirm={`Delete "${c.name}"? Reports are kept.`} />
                    </div>
                  </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
