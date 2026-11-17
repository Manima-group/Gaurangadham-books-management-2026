import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { shelvesExcept } from "@/lib/transfers";
import { Card, PageHeader } from "@/components/ui";
import { RequestForm } from "../forms";

/** Ask another Dham for books. Only books that Dham has on its shelf can be asked for. */
export default async function NewTransferPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  const u = await requireUser("admin", "manager");
  const sp = await searchParams;
  const shelves = await shelvesExcept(u.role === "manager" ? u.dhamId : null);
  const toDhams = u.role === "admin" ? await db.select({ id: schema.dham.id, name: schema.dham.name }).from(schema.dham).orderBy(schema.dham.name) : undefined;
  return (
    <>
      <PageHeader
        title="Ask another Dham for books"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Dham Transfers", href: "/transfers" }, { label: "New request" }]}
        doHere="Choose the Dham to ask. You will see only the books it has on its shelf, with the count. Enter how many you need."
        next="Their Sector Sevak checks and approves, then sends. Tap Received when the books arrive — the counts update then."
      />
      <Card>
        <RequestForm shelves={shelves.filter((s) => s.books.length > 0)} toDhams={toDhams} presetBook={sp.book ? Number(sp.book) : undefined} />
      </Card>
    </>
  );
}
