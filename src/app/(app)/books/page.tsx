import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { allBooks } from "@/lib/lookups";
import { toggleBook } from "@/app/actions/setup";
import { fmtDateTime, inr } from "@/lib/format";
import { Badge, BookCover, Card, EmptyState, PageHeader } from "@/components/ui";
import { BookForm, PricesForm } from "./forms";
import { DeleteButton } from "@/components/delete";
import { deleteBook } from "@/app/actions/setup";

export default async function BooksPage() {
  await requireUser("admin");
  const [books, history] = await Promise.all([
    allBooks(),
    db
      .select({ h: schema.bookPriceHistory, title: schema.book.title, language: schema.book.language, by: schema.user.name })
      .from(schema.bookPriceHistory)
      .innerJoin(schema.book, eq(schema.book.id, schema.bookPriceHistory.bookId))
      .leftJoin(schema.user, eq(schema.user.id, schema.bookPriceHistory.changedBy))
      .orderBy(desc(schema.bookPriceHistory.changedAt))
      .limit(15),
  ]);
  const active = books.filter((b) => b.isActive);
  return (
    <>
      <PageHeader
        title="Books & Prices"
        crumbs={[{ label: "Home", href: "/dashboard" }, { label: "Settings" }, { label: "Books & Prices" }]}
        doHere="Add every book you distribute, with its Book Code and price. Update prices here whenever they change."
        next="Once a book is added, receive copies of it in Book Stock. Devotees see the current price when they record sales."
      />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="Add a Book" className="lg:col-span-2 lg:self-start"><BookForm /></Card>
        <Card title={`Book list (${books.length})`} className="lg:col-span-3">
          {books.length === 0 ? (
            <EmptyState title="No books added yet.">Add your first book using the form.</EmptyState>
          ) : (
            <ul className="divide-y divide-stone-100">
              {books.map((b) => (
                <li key={b.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <BookCover title={b.title} url={b.coverUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{b.title} <Badge tone={b.size === "big" ? "purple" : "blue"}>{b.size === "big" ? "Big" : "Small"}</Badge> {!b.isActive && <Badge>Inactive</Badge>}</p>
                      <p className="text-sm text-ink-500">{b.language} · Book Code {b.sku} · <span className="font-semibold text-ink-900">{inr(b.pricePaise)}</span></p>
                    </div>
                    <form action={toggleBook}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="btn-secondary btn-sm">{b.isActive ? "Mark as Inactive" : "Mark as Active"}</button>
                    </form>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-brand-700">Edit details</summary>
                    <div className="mt-3 space-y-3 rounded-xl bg-stone-50 p-3">
                      <BookForm book={b} />
                      <DeleteButton action={deleteBook} id={b.id} label="Delete book" confirm={`Delete "${b.title}"?`} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card title="Update Book Prices" subtitle="Type the new price and press Save New Prices" className="lg:col-span-3">
          <div id="prices" />
          {active.length ? <PricesForm books={active} /> : <p className="text-sm text-ink-500">Add a book first.</p>}
        </Card>
        <Card title="Price change history" className="lg:col-span-2">
          {history.length === 0 ? (
            <p className="text-sm text-ink-500">No price changes yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {history.map(({ h, title, language, by }) => (
                <li key={h.id}>
                  <p><span className="font-medium">{title}</span> ({language}): {h.oldPricePaise != null ? <>{inr(h.oldPricePaise)} → </> : "set to "}<b>{inr(h.newPricePaise)}</b></p>
                  <p className="text-xs text-ink-500">{by ?? "—"} · {fmtDateTime(h.changedAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
