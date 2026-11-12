import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export const activeBooks = () =>
  db.select().from(schema.book).where(eq(schema.book.isActive, true)).orderBy(asc(schema.book.title), asc(schema.book.language));
export const allBooks = () => db.select().from(schema.book).orderBy(asc(schema.book.title), asc(schema.book.language));
export const allDhams = () => db.select().from(schema.dham).orderBy(asc(schema.dham.name));
export const activeDhams = () => db.select().from(schema.dham).where(eq(schema.dham.isActive, true)).orderBy(asc(schema.dham.name));
/** Everyone in a Dham who distributes books: devotees and the Dham Manager. */
export const devoteesOf = (dhamId: number) =>
  db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.dhamId, dhamId), inArray(schema.user.role, ["devotee", "manager"]), eq(schema.user.isActive, true)))
    .orderBy(asc(schema.user.role), asc(schema.user.name));
/** Devotees only (for "who hasn't reported today"). */
export const onlyDevoteesOf = (dhamId: number) =>
  db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.dhamId, dhamId), eq(schema.user.role, "devotee"), eq(schema.user.isActive, true)))
    .orderBy(asc(schema.user.name));
export const allDevotees = () =>
  db.select().from(schema.user).where(and(eq(schema.user.role, "devotee"), eq(schema.user.isActive, true))).orderBy(asc(schema.user.name));
export const allCampaigns = () => db.select().from(schema.campaign).orderBy(asc(schema.campaign.startDate));
