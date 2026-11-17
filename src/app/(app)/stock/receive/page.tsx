import Link from "next/link";
import { requireUser } from "@/lib/session";
import { activeBooks, activeDhams } from "@/lib/lookups";
import { todayIST } from "@/lib/format";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ReceiveForm } from "./form";

export default async function ReceivePage() {
  const u = await requireUser("admin", "manager");
  const [books, dhams] = await Promise.all([activeBooks(), activeDhams()]);
  return (
    <>
      <PageHeader
        title="Receive Books"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Book Stock", href: "/stock" }, { label: "Receive Books" }]}
        doHere="Record new books that have arrived: choose the book, enter the quantity and date, then confirm."
        next={u.role === "admin" ? "The books are added to stock immediately. Then send them to a Dham." : "The books are added to your Dham's stock immediately. Then assign them to devotees."}
      />
      {u.role === "admin" && (
        <p className="mb-3 max-w-xl rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-900 ring-1 ring-brand-200">
          Many books at once? <Link href="/books#import" className="font-semibold underline">📥 Import books and copies from Excel</Link>
        </p>
      )}
      <Card className="max-w-xl">
        {books.length === 0 ? (
          <EmptyState title="No books in the book list yet." action={u.role === "admin" ? <LinkButton href="/books">Add a Book</LinkButton> : undefined}>
            {u.role === "admin" ? "Add the book first, then come back to receive copies." : "Ask the Chakra Sevak to add the book to the book list first."}
          </EmptyState>
        ) : (
          <ReceiveForm
            books={books.map((b) => ({ id: b.id, title: b.title, language: b.language }))}
            dhams={dhams.map((d) => ({ id: d.id, name: d.name }))}
            today={todayIST()}
            isAdmin={u.role === "admin"}
            dhamName={u.dhamName}
          />
        )}
      </Card>
    </>
  );
}
