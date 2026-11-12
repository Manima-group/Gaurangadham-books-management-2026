"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, fromZod, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { dhamManagers, logActivity, notify } from "@/lib/activity";
import { lockKey } from "@/lib/stock";
import { fmtDate, inr, toPaise, todayIST } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/terms";

const MoneySchema = z
  .object({
    amount: z
      .string()
      .trim()
      .min(1, "Please enter the amount you are submitting.")
      .refine((v) => toPaise(v) > 0, "Amount must be more than ₹0."),
    method: z.enum(["cash", "upi", "bank"], { errorMap: () => ({ message: "Please choose how you are submitting the money." }) }),
    reference: z.string().trim().optional(),
    submissionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose the date.")
      .refine((v) => v <= todayIST(), "The date cannot be in the future."),
    remarks: z.string().trim().optional(),
  })
  .refine((v) => v.method === "cash" || (v.reference && v.reference.length >= 4), {
    path: ["reference"],
    message: "For UPI or bank transfer, please enter the transaction / UTR number.",
  });

/* ---------------- STEP 6: Money submission (devotee) ---------------- */

export async function submitMoney(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("devotee", "manager");
  if (!u.dhamId) return fail("You are not linked to a Dham yet.");
  const p = MoneySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fromZod(p.error);
  const amountPaise = toPaise(p.data.amount);
  const dhamId = u.dhamId;
  // Lock this devotee's money while checking the balance and saving, so a double tap can't submit twice.
  const res = await db.transaction(async (tx) => {
    await lockKey(tx, `money:${u.id}`);
    const [m] = (await tx.execute(sql`
      select
        (select coalesce(sum(collected_paise),0) from daily_report where devotee_id = ${u.id} and status in ('submitted','approved','changes_required'))::bigint as collected,
        (select coalesce(sum(amount_paise),0) from money_submission where devotee_id = ${u.id} and status <> 'disputed')::bigint as submitted`)) as unknown as { collected: number; submitted: number }[];
    const remaining = Number(m.collected) - Number(m.submitted);
    if (amountPaise > remaining) return { remaining };
    const [row] = await tx
      .insert(schema.moneySubmission)
      .values({
        devoteeId: u.id,
        dhamId,
        amountPaise,
        method: p.data.method,
        reference: p.data.reference || null,
        submissionDate: p.data.submissionDate,
        remarks: p.data.remarks || null,
      })
      .returning();
    return { row, remaining };
  });
  const remaining = res.remaining;
  if (!("row" in res) || !res.row)
    return fail(
      remaining > 0
        ? `You are submitting more than you have to submit (${inr(remaining)}).`
        : "You have no collected money left to submit.",
      "If you collected more money, first include it in your daily sales report. Then submit it here.",
      { amount: remaining > 0 ? `Maximum ${inr(remaining)}` : "Nothing left to submit" },
    );
  const row = res.row;
  await logActivity(u.id, `${u.name} submitted ${inr(amountPaise)} by ${METHOD_LABEL[p.data.method]}`, {
    dhamId: u.dhamId,
    entity: "money",
    entityId: row.id,
  });
  await notify(await dhamManagers(u.dhamId), `${u.name} submitted ${inr(amountPaise)}`, `${METHOD_LABEL[p.data.method]} · please confirm you received it`, "/money?status=submitted");
  revalidatePath("/my/money");
  revalidatePath("/dashboard");
  const left = remaining - amountPaise;
  return ok(
    `${inr(amountPaise)} submitted. Thank you! 🙏`,
    left > 0
      ? `You still have ${inr(left)} to submit. Your Dham Manager will confirm once they receive this money.`
      : "You have submitted all the money you collected. Your Dham Manager will confirm once they receive it.",
  );
}

/* ---------------- Manager: Receive Collected Money ---------------- */

export async function confirmMoney(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const id = Number(fd.get("id"));
  const decision = fd.get("decision") === "dispute" ? "disputed" : "received";
  const note = String(fd.get("note") || "").trim();
  const [row] = await db.select().from(schema.moneySubmission).where(eq(schema.moneySubmission.id, id));
  if (!row) return fail("This money entry could not be found.");
  if (u.role === "manager" && row.dhamId !== u.dhamId) return fail("This entry belongs to another Dham.");
  if (row.status !== "submitted") return fail("This entry has already been checked.");
  if (decision === "disputed" && !note)
    return fail("Please write what does not match.", "For example: “Received ₹1,800 in cash, not ₹2,000.”", { note: "A reason is required" });
  // Only changes an entry that is still waiting — a second click at the same moment updates nothing.
  const changed = await db
    .update(schema.moneySubmission)
    .set({ status: decision, receivedBy: u.id, receivedAt: new Date(), reviewNote: note || null })
    .where(and(eq(schema.moneySubmission.id, id), eq(schema.moneySubmission.status, "submitted")))
    .returning({ id: schema.moneySubmission.id });
  if (!changed.length) return fail("This entry has already been checked.", "Someone may have confirmed it a moment ago. Refresh the page.");
  const [dev] = await db.select().from(schema.user).where(eq(schema.user.id, row.devoteeId));
  await logActivity(
    u.id,
    decision === "received"
      ? `${u.name} confirmed receiving ${inr(row.amountPaise)} from ${dev?.name}`
      : `${u.name} could not match ${inr(row.amountPaise)} from ${dev?.name}: ${note}`,
    { dhamId: row.dhamId, entity: "money", entityId: id },
  );
  await notify(
    [row.devoteeId],
    decision === "received"
      ? `Your Manager received ${inr(row.amountPaise)} ✅`
      : `Your money entry of ${inr(row.amountPaise)} needs checking`,
    decision === "received" ? `Submitted on ${fmtDate(row.submissionDate)}` : note,
    "/my/money",
  );
  revalidatePath("/money");
  revalidatePath("/dashboard");
  return decision === "received"
    ? ok(`Marked ${inr(row.amountPaise)} as received from ${dev?.name}.`, "The devotee has been informed.")
    : ok(
        `Entry marked as "Changes Required".`,
        `${dev?.name} has been informed. This amount is no longer counted as submitted, so it will show again as money yet to submit.`,
      );
}

/* ---------------- Delete a money entry ---------------- */

export async function deleteMoney(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const [row] = await db.select().from(schema.moneySubmission).where(eq(schema.moneySubmission.id, id));
  if (!row) return fail("This entry was already deleted.");
  const own = row.devoteeId === u.id;
  const canManage = u.role === "admin" || (u.role === "manager" && row.dhamId === u.dhamId);
  if (!own && !canManage) return fail("You can't delete this entry.");
  if (own && !canManage && row.status === "received")
    return fail("Your Manager already confirmed receiving this money.", "Ask your Dham Manager if it needs to be removed.");
  await db.delete(schema.moneySubmission).where(eq(schema.moneySubmission.id, id));
  await logActivity(u.id, `${u.name} deleted a money entry of ${inr(row.amountPaise)} (${fmtDate(row.submissionDate)})`, { dhamId: row.dhamId });
  revalidatePath("/money");
  revalidatePath("/my/money");
  revalidatePath("/dashboard");
  return ok(`Entry of ${inr(row.amountPaise)} deleted.`);
}
