import { requireUser } from "@/lib/session";
import { allDhams } from "@/lib/lookups";
import { dhamHealth } from "@/lib/stats";
import { toggleDham } from "@/app/actions/setup";
import { inr, todayIST } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DhamForm } from "./forms";
import { DeleteButton } from "@/components/delete";
import { deleteDham } from "@/app/actions/setup";

export default async function DhamsPage() {
  await requireUser("admin");
  const [dhams, health] = await Promise.all([allDhams(), dhamHealth(todayIST())]);
  const h = new Map(health.map((x) => [x.id, x]));
  return (
    <>
      <PageHeader
        title="Dhams"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Settings" }, { label: "Dhams" }]}
        doHere="Add each Dham where books are distributed. You can rename a Dham or mark it as inactive."
        next="After adding a Dham, add a Dham Manager for it and send it books."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Add a Dham" className="lg:col-span-2 lg:self-start"><DhamForm /></Card>
        <Card title={`All Dhams (${dhams.length})`} className="lg:col-span-3">
          {dhams.length === 0 ? (
            <EmptyState icon="🛕" title="No Dhams added yet.">Add your first Dham using the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {dhams.map((d) => {
                const x = h.get(d.id);
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{d.name} {d.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</p>
                        <p className="text-sm text-ink-500">{[d.city, d.address].filter(Boolean).join(" · ") || "No address"} · {x?.devotees ?? 0} devotees · sales {inr(x?.sales ?? 0)}</p>
                      </div>
                      <form action={toggleDham}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="btn-secondary btn-sm">{d.isActive ? "Mark as Inactive" : "Mark as Active"}</button>
                      </form>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit details</summary>
                      <div className="mt-3 space-y-3 rounded-xl bg-stone-50 p-3">
                        <DhamForm dham={d} />
                        <DeleteButton action={deleteDham} id={d.id} label="Delete Dham" confirm={`Delete "${d.name}"?`} />
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
