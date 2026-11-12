import { requireUser } from "@/lib/session";
import { activeBooks, activeDhams, devoteesOf } from "@/lib/lookups";
import { H, holderStock, total } from "@/lib/stock";
import { devoteeBooks } from "@/lib/devotee";
import { num, todayIST } from "@/lib/format";
import { assignToDevotee } from "@/app/actions/stock";
import { AllocationForm } from "@/components/allocation";
import { Card, EmptyState, Field, LinkButton, PageHeader } from "@/components/ui";

export default async function AssignDevoteesPage({ searchParams }: { searchParams: Promise<{ devotee?: string; dham?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const dhams = u.role === "admin" ? await activeDhams() : [];
  const dhamId = u.role === "manager" ? u.dhamId! : Number(sp.dham) || null;
  const dhamName = u.role === "manager" ? u.dhamName : dhams.find((d) => d.id === dhamId)?.name;

  const [books, devotees, store] = dhamId
    ? await Promise.all([activeBooks(), devoteesOf(dhamId), holderStock(H.dham(dhamId))])
    : [[], [], new Map<number, number>()];
  const dev = devotees.find((d) => d.id === sp.devotee);
  const holding = dev ? await devoteeBooks(dev.id) : [];
  const avail = books.filter((b) => (store.get(b.id) ?? 0) > 0).map((b) => ({ id: b.id, title: b.title, language: b.language, coverUrl: b.coverUrl, available: store.get(b.id)! }));

  return (
    <>
      <PageHeader
        title="Assign Books to Devotees"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock", href: "/stock" }, { label: "Assign Books" }]}
        doHere="Give books from the Dham store to a devotee: choose the devotee, enter quantities, review and confirm."
        next="The devotee sees the books on their phone immediately and can record sales for them."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="1. Choose the devotee">
          <form className="space-y-3" action="/stock/assign-devotees">
            {u.role === "admin" && (
              <Field label="Dham" htmlFor="dham">
                <select id="dham" name="dham" defaultValue={dhamId ?? ""} className="field-input">
                  <option value="">Choose a Dham…</option>
                  {dhams.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
            )}
            {dhamId && (
              devotees.length === 0 ? (
                <EmptyState icon="🙋" title="No devotees in this Dham yet" action={<LinkButton href="/people?role=devotee" size="sm">Add a Devotee</LinkButton>} />
              ) : (
                <Field label="Devotee" htmlFor="devotee">
                  <select id="devotee" name="devotee" defaultValue={sp.devotee ?? ""} className="field-input">
                    <option value="">Choose a devotee…</option>
                    {devotees.map((d) => <option key={d.id} value={d.id}>{d.name}{d.id === u.id ? " — me (to distribute myself)" : d.role === "manager" ? " (Manager)" : ""}</option>)}
                  </select>
                </Field>
              )
            )}
            <button className="btn-secondary w-full">Continue</button>
          </form>
          {dev && (
            <div className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-semibold">{dev.name} already has:</p>
              {holding.filter((h) => h.available > 0).length === 0 ? (
                <p className="text-ink-500">No books right now.</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-ink-700">
                  {holding.filter((h) => h.available > 0).map((h) => <li key={h.id}>{h.available} × {h.title} ({h.language})</li>)}
                </ul>
              )}
            </div>
          )}
        </Card>
        <Card title={dev ? `2. Books to give ${dev.name}` : "2. Choose books and quantities"} subtitle={dhamName ? `${dhamName} store has ${num(total(store))} books available` : undefined} className="lg:col-span-2">
          {!dhamId ? (
            <p className="text-sm text-ink-500">First choose a Dham.</p>
          ) : !dev ? (
            <p className="text-sm text-ink-500">First choose a devotee in step 1.</p>
          ) : (
            <AllocationForm
              key={dev.id}
              action={assignToDevotee}
              books={avail}
              hidden={{ devoteeId: dev.id, date: todayIST() }}
              sourceLabel={`the ${dhamName} store`}
              targetLabel={dev.name}
              verb="give"
              confirmLabel={`Confirm — Give to ${dev.name.split(" ")[0]}`}
              emptyText={<EmptyState title="The Dham store has no books to give." action={<LinkButton href="/stock/receive">Receive Books</LinkButton>}>Receive books at the Dham first, or ask the Admin to send books.</EmptyState>}
            />
          )}
        </Card>
      </div>
    </>
  );
}
