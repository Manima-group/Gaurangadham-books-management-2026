"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, ok, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { dhamManagers, logActivity, notify } from "@/lib/activity";
import { H, holderStock, lockHolders, pendingReportedQty } from "@/lib/stock";
import { deleteReportTx, holdsEnough, postReport } from "@/lib/ledger";
import { findCampaign } from "@/lib/campaign";
import { addDays, fmtDate, inr, num, toPaise, todayIST } from "@/lib/format";

const SLOTS = ["morning", "afternoon", "evening"] as const;
type Slot = (typeof SLOTS)[number];

/* ---------------- STEP 5: Daily sales entry — one or more places per day ---------------- */

export async function saveSalesReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("devotee", "manager");
  if (!u.dhamId) return fail("You are not linked to a Dham yet.", "Please ask your Admin to add you to a Dham.");
  const dhamId = u.dhamId;
  const intent = fd.get("intent") === "draft" ? "draft" : "submit";
  const date = String(fd.get("reportDate") || todayIST());
  const today = todayIST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today)
    return fail("Please choose a valid date.", "You can't add sales for a future date.");
  if (date < addDays(today, -7)) return fail("This date is more than 7 days ago.", "Please ask your Dham Manager to help with older days.");

  const books = await db.select().from(schema.book);
  const byId = new Map(books.map((b) => [b.id, b]));
  const campaign = await findCampaign(dhamId, date);
  const errors: Record<string, string> = {};
  const readInt = (k: string) => {
    const raw = String(fd.get(k) ?? "").trim();
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors[k] = "Enter a whole number (0 or more)";
      return 0;
    }
    return n;
  };

  // ---- Places (venues) and what was sold at each
  const venueCount = Math.min(Math.max(Number(fd.get("venueCount") || 1), 1), 12);
  const bookIds = new Set<number>();
  for (const [k] of fd.entries()) {
    const m = /^sold_\d+_(\d+)$/.exec(k) || /^(?:returned|damaged)_(\d+)$/.exec(k);
    if (m) bookIds.add(Number(m[1]));
  }
  const venues: { name: string; area: string | null; slot: Slot | null; sold: Map<number, number> }[] = [];
  for (let i = 0; i < venueCount; i++) {
    const name = String(fd.get(`venue_${i}_name`) || "").trim();
    const area = String(fd.get(`venue_${i}_area`) || "").trim() || null;
    const slotRaw = String(fd.get(`venue_${i}_slot`) || "");
    const slot = (SLOTS as readonly string[]).includes(slotRaw) ? (slotRaw as Slot) : null;
    const sold = new Map<number, number>();
    for (const b of bookIds) {
      const n = readInt(`sold_${i}_${b}`);
      if (n) sold.set(b, n);
    }
    if (!name && !sold.size) continue; // empty place card — ignore
    if (!name) errors[`venue_${i}_name`] = "Please write the place name (where you distributed).";
    if (name.length > 120) errors[`venue_${i}_name`] = "Place name is too long.";
    venues.push({ name, area, slot, sold });
  }
  if (Object.keys(errors).length) return fail("Please check the highlighted places and numbers.", undefined, errors);

  const remarks = String(fd.get("remarks") || "").trim() || null;

  const result = await db.transaction(async (tx) => {
    await lockHolders(tx, [H.devotee(u.id)]);
    const [existing] = await tx
      .select()
      .from(schema.dailyReport)
      .where(and(eq(schema.dailyReport.devoteeId, u.id), eq(schema.dailyReport.reportDate, date)));
    if (existing && (existing.status === "submitted" || existing.status === "approved"))
      return fail(
        `Your sales for ${fmtDate(date)} were already ${existing.status === "approved" ? "approved" : "sent"}.`,
        existing.status === "submitted"
          ? "To change them, delete that report from My Reports and add it again, or ask your Manager to request a correction."
          : "To change them, ask your Dham Manager.",
      );

    const hold = await holderStock(H.devotee(u.id), tx);
    const pending = await pendingReportedQty(u.id, existing?.id, tx);
    const lineErrors: Record<string, string> = {};
    const totals = new Map<number, { sold: number; returned: number; damaged: number; opening: number }>();
    for (const bookId of bookIds) {
      if (!byId.has(bookId)) continue;
      const opening = Math.max((hold.get(bookId) ?? 0) - (pending.get(bookId) ?? 0), 0);
      const sold = venues.reduce((a, v) => a + (v.sold.get(bookId) ?? 0), 0);
      const returned = readInt(`returned_${bookId}`);
      const damaged = readInt(`damaged_${bookId}`);
      if (sold + returned + damaged > opening)
        lineErrors[`book_${bookId}`] = `You have only ${num(opening)} ${opening === 1 ? "copy" : "copies"} of ${byId.get(bookId)!.title}. All places together + returned + damaged can't be more.`;
      totals.set(bookId, { sold, returned, damaged, opening });
    }
    if (Object.keys(lineErrors).length)
      return fail("Some numbers are more than the books you have.", "Please check the highlighted books and try again.", lineErrors);

    const totalSold = [...totals.values()].reduce((a, t) => a + t.sold, 0);
    const salesPaise = [...totals].reduce((a, [b, t]) => a + t.sold * byId.get(b)!.pricePaise, 0);
    const anyActivity = [...totals.values()].some((t) => t.sold + t.returned + t.damaged > 0);
    // Money collected: optional. Empty = same as sales value.
    const collectedRaw = String(fd.get("collected") ?? "").trim();
    const collectedPaise = collectedRaw === "" ? salesPaise : toPaise(collectedRaw);
    if (!(collectedPaise >= 0)) return fail("Please enter the money collected as a number, or leave it empty.", undefined, { collected: "Enter an amount in ₹" });
    if (intent === "submit" && !anyActivity && !remarks)
      return fail(
        "Nothing to send yet.",
        "Add at least one place with the books you distributed. If you didn't go out today, just write a short note and send.",
        { remarks: "Add a short note if you didn't distribute today" },
      );

    // Managers record their own distribution — no one above them in the Dham to review, so it is approved at once.
    const selfApprove = intent === "submit" && u.role === "manager";
    const status = intent === "draft" ? "draft" : selfApprove ? "approved" : "submitted";
    const values = {
      devoteeId: u.id,
      dhamId,
      campaignId: campaign?.id ?? null,
      reportDate: date,
      status: status as "draft" | "submitted" | "approved",
      totalSold,
      salesPaise,
      collectedPaise,
      remarks,
      submittedAt: status === "draft" ? null : new Date(),
      reviewedBy: selfApprove ? u.id : null,
      reviewedAt: selfApprove ? new Date() : null,
      reviewNote: selfApprove ? "Recorded by the Dham Manager (own distribution)" : null,
      updatedAt: new Date(),
    };
    let reportId: number;
    if (existing) {
      await tx.update(schema.dailyReport).set(values).where(eq(schema.dailyReport.id, existing.id));
      await tx.delete(schema.dailyReportLine).where(eq(schema.dailyReportLine.reportId, existing.id));
      await tx.delete(schema.dailyReportVenue).where(eq(schema.dailyReportVenue.reportId, existing.id));
      reportId = existing.id;
    } else {
      const [r] = await tx.insert(schema.dailyReport).values(values).returning();
      reportId = r.id;
    }
    // Save places, then one line per place per book sold there, plus a day line for returned/damaged.
    const lines: (typeof schema.dailyReportLine.$inferInsert)[] = [];
    for (const [i, v] of venues.entries()) {
      const [vr] = await tx
        .insert(schema.dailyReportVenue)
        .values({ reportId, name: v.name, area: v.area, timeSlot: v.slot, sort: i })
        .returning({ id: schema.dailyReportVenue.id });
      for (const [bookId, n] of v.sold) {
        const b = byId.get(bookId)!;
        lines.push({ reportId, venueId: vr.id, bookId, openingQty: totals.get(bookId)!.opening, soldQty: n, pricePaise: b.pricePaise, amountPaise: n * b.pricePaise });
      }
    }
    for (const [bookId, t] of totals) {
      if (!t.returned && !t.damaged) continue;
      const b = byId.get(bookId)!;
      lines.push({ reportId, venueId: null, bookId, openingQty: t.opening, soldQty: 0, returnedQty: t.returned, damagedQty: t.damaged, pricePaise: b.pricePaise, amountPaise: 0 });
    }
    if (lines.length) await tx.insert(schema.dailyReportLine).values(lines);
    if (selfApprove) {
      const saved = await tx.select().from(schema.dailyReportLine).where(eq(schema.dailyReportLine.reportId, reportId));
      const [rep] = await tx.select().from(schema.dailyReport).where(eq(schema.dailyReport.id, reportId));
      await postReport(tx, rep, saved, u.id);
    }
    return { reportId, status, totalSold, salesPaise, places: venues.length };
  });

  if ("message" in result || ("status" in result && ["error", "success", "idle"].includes(String(result.status)))) return result as ActionState;
  const { reportId, status, totalSold, salesPaise, places } = result as { reportId: number; status: string; totalSold: number; salesPaise: number; places: number };

  revalidatePath("/my/sales");
  revalidatePath("/my/books");
  revalidatePath("/dashboard");
  if (status === "draft") return ok("Saved on the server, not sent yet.", "Press “Send Today's Sales” when you're ready.");
  await logActivity(u.id, `${u.name} added sales for ${fmtDate(date)}: ${num(totalSold)} books at ${places} place${places === 1 ? "" : "s"}, ${inr(salesPaise)}`, {
    dhamId,
    entity: "report",
    entityId: reportId,
  });
  if (status === "submitted")
    await notify(await dhamManagers(dhamId), `New daily report from ${u.name}`, `${fmtDate(date)} · ${num(totalSold)} books · ${places} place${places === 1 ? "" : "s"}`, `/reports/${reportId}`);
  return ok(
    `Thank you! Sales for ${fmtDate(date)} saved. 🙏`,
    `${num(totalSold)} book${totalSold === 1 ? "" : "s"} at ${places} place${places === 1 ? "" : "s"}, worth ${inr(salesPaise)}. ${
      status === "approved" ? "Your stock is updated." : "Your Dham Manager will review it."
    } You can hand over the money any time — there's no rush.`,
    { label: "See my books", href: "/my/books" },
  );
}

/* ---------------- STEP 7: Manager review ---------------- */

const ReviewSchema = z.object({
  id: z.coerce.number().int().positive(),
  decision: z.enum(["approve", "correction", "reject"]),
  note: z.string().trim().optional(),
});

export async function reviewReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser("admin", "manager");
  const p = ReviewSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return fail("Please choose Approve, Request Correction or Reject.");
  const { id, decision, note } = p.data;
  const [r0] = await db.select().from(schema.dailyReport).where(eq(schema.dailyReport.id, id));
  if (!r0) return fail("This report could not be found.");
  if (u.role === "manager" && r0.dhamId !== u.dhamId) return fail("This report belongs to another Dham.");
  if (decision !== "approve" && !note)
    return fail(
      decision === "reject" ? "Please write the reason for rejecting." : "Please write what needs to be corrected.",
      "The devotee will see this note, so keep it clear and kind.",
      { note: "A reason is required" },
    );
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_required";

  const outcome = await db.transaction(async (tx) => {
    await lockHolders(tx, [H.devotee(r0.devoteeId)]);
    const [r] = (await tx.execute(sql`select status from daily_report where id = ${id} for update`)) as unknown as { status: string }[];
    if (!r || r.status !== "submitted") return "already" as const;
    if (decision === "approve") {
      const lines = await tx.select().from(schema.dailyReportLine).where(eq(schema.dailyReportLine.reportId, id));
      if (!(await holdsEnough(tx, r0.devoteeId, lines))) return "short" as const;
      await postReport(tx, r0, lines, u.id);
    }
    await tx
      .update(schema.dailyReport)
      .set({ status, reviewNote: note || null, reviewedBy: u.id, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.dailyReport.id, id), eq(schema.dailyReport.status, "submitted")));
    return "done" as const;
  });
  if (outcome === "already") return fail("This report has already been reviewed.", "Someone may have reviewed it a moment ago. Refresh the page to see its latest status.");
  if (outcome === "short")
    return fail(
      "This report cannot be approved because the devotee no longer holds these books.",
      "Some books may have been taken back after the report was sent. Please use Request Correction so the devotee can update the numbers.",
    );
  const r = r0;
  const [dev] = await db.select().from(schema.user).where(eq(schema.user.id, r.devoteeId));
  const who = dev?.name ?? "the devotee";
  const word = { approve: "approved", correction: "sent back for correction", reject: "rejected" }[decision];
  await logActivity(u.id, `${u.name} ${word} the ${fmtDate(r.reportDate)} report of ${who}`, { dhamId: r.dhamId, entity: "report", entityId: id });
  await notify(
    [r.devoteeId],
    decision === "approve"
      ? `Your report for ${fmtDate(r.reportDate)} is approved ✅`
      : decision === "reject"
        ? `Your report for ${fmtDate(r.reportDate)} was rejected`
        : `Changes required in your ${fmtDate(r.reportDate)} report`,
    note || undefined,
    decision === "approve" ? "/my/reports" : `/my/sales?date=${r.reportDate}`,
  );
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  const detail = {
    approve: `Book stock has been updated: ${num(r.totalSold)} books marked as sold. ${who} has been informed.`,
    correction: `${who} has been informed and can edit and send the report again.`,
    reject: `${who} has been informed with your reason.`,
  }[decision];
  return ok(`Report ${word}.`, detail, { label: "Review the next report", href: "/reports?status=submitted" });
}

/* ---------------- Delete a report ---------------- */

export async function deleteReport(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await requireUser();
  const id = Number(fd.get("id"));
  const [r] = await db.select().from(schema.dailyReport).where(eq(schema.dailyReport.id, id));
  if (!r) return fail("This report was already deleted.");
  const own = r.devoteeId === u.id;
  const canManage = u.role === "admin" || (u.role === "manager" && r.dhamId === u.dhamId);
  if (!own && !canManage) return fail("You can't delete this report.");
  if (own && !canManage && r.status === "approved")
    return fail("This report is already approved.", "Ask your Dham Manager if it needs to be removed.");
  const err = await db.transaction((tx) => deleteReportTx(tx, r, u.id));
  if (err) return fail("This report can't be deleted right now.", err);
  const [dev] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, r.devoteeId));
  await logActivity(u.id, `${u.name} deleted the ${fmtDate(r.reportDate)} report of ${dev?.name ?? "a devotee"}${r.status === "approved" ? " (stock reversed)" : ""}`, {
    dhamId: r.dhamId,
  });
  revalidatePath("/reports");
  revalidatePath("/my/reports");
  revalidatePath("/my/sales");
  revalidatePath("/dashboard");
  // Deleted from its own page: go back to the list (that page no longer exists).
  const after = String(fd.get("after") || "");
  if (/^\/[a-z/?=&_-]*$/i.test(after)) redirect(after);
  return ok(
    "Report deleted.",
    r.status === "approved" ? "The books it marked as sold are back with the devotee." : "You can add that day's sales again any time.",
  );
}
