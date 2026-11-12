import { requireUser } from "@/lib/session";
import { devoteeBooks } from "@/lib/devotee";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { takeBack } from "@/app/actions/stock";
import { AllocationForm } from "@/components/allocation";
import { Card, EmptyState, Field, LinkButton, PageHeader, Alert } from "@/components/ui";

export default async function TakeBackPage({ searchParams }: { searchParams: Promise<{ devotee?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const [dev] = sp.devotee ? await db.select().from(schema.user).where(eq(schema.user.id, sp.devotee)) : [];
  if (!dev || (u.role === "manager" && dev.dhamId !== u.dhamId))
    return <Alert tone="amber" title="Please choose a devotee from the Book Stock page.">Go to <a className="tap underline" href="/stock">Book Stock</a> and press “Take Back” next to the devotee.</Alert>;
  const books = (await devoteeBooks(dev.id)).filter((b) => b.available > 0).map((b) => ({ id: b.id, title: b.title, language: b.language, coverUrl: b.coverUrl, available: b.available }));
  return (
    <>
      <PageHeader
        title={`Take Back Books from ${dev.name}`}
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock", href: "/stock" }, { label: "Take Back" }]}
        doHere="Record books the devotee returned to the Dham, or books that were damaged or lost."
        next="Returned books go back into the Dham store and can be given to someone else."
      />
      <Card className="max-w-2xl">
        <AllocationForm
          action={takeBack}
          books={books}
          hidden={{ devoteeId: dev.id }}
          sourceLabel={dev.name}
          targetLabel="the Dham"
          verb="take back"
          confirmLabel="Confirm"
          extra={
            <div className="space-y-3 rounded-xl bg-stone-50 p-3">
              <fieldset className="space-y-1">
                <legend className="text-sm font-semibold">What happened?</legend>
                <label className="flex items-center gap-2"><input type="radio" name="kind" value="returned" defaultChecked className="h-5 w-5" /> Returned to the Dham in good condition</label>
                <label className="flex items-center gap-2"><input type="radio" name="kind" value="damaged" className="h-5 w-5" /> Damaged or lost</label>
              </fieldset>
              <Field label="Note" htmlFor="note" help="Required if the books are damaged or lost.">
                <input id="note" name="note" className="field-input" />
              </Field>
            </div>
          }
          emptyText={<EmptyState title={`${dev.name} has no books to take back.`} action={<LinkButton href="/stock" variant="secondary">Back to Book Stock</LinkButton>} />}
        />
      </Card>
    </>
  );
}
