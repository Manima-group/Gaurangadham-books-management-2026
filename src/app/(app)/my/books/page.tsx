import Link from "next/link";
import { requireUser } from "@/lib/session";
import { devoteeBooks } from "@/lib/devotee";
import { inr } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { BookList, BookTotals } from "@/components/mybooks";

export default async function MyBooks() {
  const u = await requireUser("devotee", "manager");
  const books = await devoteeBooks(u.id);
  const value = books.reduce((a, b) => a + b.soldAmount, 0);
  return (
    <>
      <PageHeader title="My Books" crumbs={[{ label: "Home", href: "/dashboard" }, { label: "My Books" }]} doHere="Every book given to you: how many you sold, how many are left, and the money from each." />
      {books.length === 0 ? (
        <EmptyState title="You haven't received any books yet.">Once your Manager gives you books, they will appear here.</EmptyState>
      ) : (
        <div className="space-y-4">
          <BookTotals books={books} />
          <p className="text-center text-sm text-ink-700">Sales value so far: <b className="text-ink-900">{inr(value)}</b></p>
          <section className="rounded-3xl bg-white p-4 shadow-card ring-1 ring-stone-200/70">
            <BookList books={books} />
          </section>
          <Link href="/my/sales" className="btn-primary w-full">➕ Add Today's Sales</Link>
        </div>
      )}
    </>
  );
}
