import "server-only";
import { count, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export async function setupProgress() {
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const [org, dhams, drives, books, priced, managers, devotees] = await Promise.all([
    c(db.select({ n: count() }).from(schema.organization)),
    c(db.select({ n: count() }).from(schema.dham)),
    c(db.select({ n: count() }).from(schema.campaign)),
    c(db.select({ n: count() }).from(schema.book)),
    c(db.select({ n: count() }).from(schema.bookPriceHistory)),
    c(db.select({ n: count() }).from(schema.user).where(eq(schema.user.role, "manager"))),
    c(db.select({ n: count() }).from(schema.user).where(eq(schema.user.role, "devotee"))),
  ]);
  const steps = [
    { key: "org", title: "Organisation details", desc: "Your organisation's name and contact.", done: org > 0, count: org, href: "/setup#organisation", action: "Add details" },
    { key: "dhams", title: "Dhams", desc: "The places where books are distributed.", done: dhams > 0, count: dhams, href: "/dhams", action: "Add a Dham" },
    { key: "drive", title: "Distribution Drive", desc: "A named period of distribution, e.g. Kartik Marathon.", done: drives > 0, count: drives, href: "/drives", action: "Create a Drive" },
    { key: "books", title: "Book list", desc: "Every book you distribute, with a Book Code.", done: books > 0, count: books, href: "/books", action: "Add a Book" },
    { key: "prices", title: "Book prices", desc: "The price devotees will collect for each book.", done: books > 0 && priced >= books, count: priced, href: "/books#prices", action: "Set prices" },
    { key: "managers", title: "Dham Managers", desc: "One person in charge of each Dham.", done: managers > 0, count: managers, href: "/people?role=manager", action: "Add a Manager" },
    { key: "devotees", title: "Devotees", desc: "The people who distribute books.", done: devotees > 0, count: devotees, href: "/people?role=devotee", action: "Add a Devotee" },
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, complete: done === steps.length };
}
