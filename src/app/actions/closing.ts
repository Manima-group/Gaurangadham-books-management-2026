"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fail, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { admins, logActivity, notify } from "@/lib/activity";
import { computeClosing } from "@/lib/closing";
import { fmtDate, todayIST } from "@/lib/format";

/* ---------------- STEP 9: Daily closing ---------------- */

export async function closeDay(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const dhamId = u.role === "manager" ? u.dhamId! : Number(fd.get("dhamId"));
  const date = String(fd.get("date") || "");
  const note = String(fd.get("note") || "").trim();
  if (!dhamId) return fail("Please choose the Dham.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) return fail("Please choose a valid date (today or earlier).");
  const f = await computeClosing(dhamId, date);
  if (f.closed) return fail(`${fmtDate(date)} has already been closed.`);
  const hasWarn = f.differences.some((d) => d.severity === "warn");
  if (hasWarn && note.length < 5)
    return fail(
      "There are differences that need your review.",
      "Figures are never adjusted automatically. Please write a short explanation of the differences before closing the day.",
      { note: "Please explain the differences" },
    );
  const [dh] = await db.select().from(schema.dham).where(eq(schema.dham.id, dhamId));
  // The unique (Dham, date) index means a second close at the same moment inserts nothing.
  const inserted = await db
    .insert(schema.dailyClosing)
    .values({
      dhamId,
      closingDate: date,
      figures: { book: f.book, money: f.money, differences: f.differences },
      hasDifferences: f.differences.length > 0,
      note: note || null,
      closedBy: u.id,
    })
    .onConflictDoNothing()
    .returning({ id: schema.dailyClosing.id });
  if (!inserted.length) return fail(`${fmtDate(date)} has already been closed.`, "Someone closed it a moment ago. Refresh the page.");
  await logActivity(u.id, `${u.name} closed ${fmtDate(date)} for ${dh?.name}${hasWarn ? " (with differences noted)" : ""}`, { dhamId });
  if (hasWarn && u.role === "manager")
    await notify(await admins(), `${dh?.name}: day closed with differences`, `${fmtDate(date)} — ${note}`, `/closing?dham=${dhamId}&date=${date}`);
  revalidatePath("/closing");
  return ok(
    `${fmtDate(date)} has been closed for ${dh?.name}.`,
    hasWarn ? "Your explanation has been saved and the Admin has been informed about the differences." : "All figures were in order.",
  );
}

/** Re-open a closed day (deletes its closing record; nothing else changes). */
export async function reopenDay(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const [c] = await db.select().from(schema.dailyClosing).where(eq(schema.dailyClosing.id, id));
  if (!c) return fail("This day is already open.");
  if (u.role === "manager" && c.dhamId !== u.dhamId) return fail("This belongs to another Dham.");
  await db.delete(schema.dailyClosing).where(eq(schema.dailyClosing.id, id));
  await logActivity(u.id, `${u.name} re-opened ${fmtDate(c.closingDate)}`, { dhamId: c.dhamId });
  revalidatePath("/closing");
  return ok(`${fmtDate(c.closingDate)} re-opened.`, "You can close it again after checking.");
}
