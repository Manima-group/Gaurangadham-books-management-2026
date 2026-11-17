"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/activity";
import { H, lockHolders } from "@/lib/stock";
import { findCampaign } from "@/lib/campaign";
import { num, todayIST } from "@/lib/format";
import { checkRows, MAX_BYTES, readBookFile, type PreviewRow, type RawRow } from "@/lib/book-import";

export type ImportPreview = { ok: true; file: string; rows: PreviewRow[]; raw: RawRow[] } | { ok: false; error: string };
export type ImportResult = { ok: true; added: number; updated: number; priceChanged: number; copies: number } | { ok: false; error: string; rows?: PreviewRow[] };

async function existingBooks() {
  return db.select({ id: schema.book.id, sku: schema.book.sku, title: schema.book.title, language: schema.book.language, pricePaise: schema.book.pricePaise, size: schema.book.size }).from(schema.book);
}

/** Step 1: read the file and show what would happen. Nothing is saved. */
export async function previewBookImport(fd: FormData): Promise<ImportPreview> {
  await requireUser("admin");
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Please choose your Excel file first." };
  if (f.size > MAX_BYTES) return { ok: false, error: "The file is larger than 2 MB. Please keep only the book rows." };
  try {
    const raw = await readBookFile(f.name, Buffer.from(await f.arrayBuffer()));
    return { ok: true, file: f.name, raw, rows: checkRows(raw, await existingBooks()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The file could not be read." };
  }
}

/** Step 2: save. The rows are checked again against the books as they are now, all in one transaction. */
export async function importBooks(fd: FormData): Promise<ImportResult> {
  const u = await requireUser("admin");
  let raw: RawRow[];
  try {
    raw = JSON.parse(String(fd.get("rows") || "[]"));
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000) throw new Error();
  } catch {
    return { ok: false, error: "Please upload the file again." };
  }
  const file = String(fd.get("file") || "Excel file").slice(0, 80);
  const date = todayIST();
  try {
    const res = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('book-import'))`); // one import at a time
      const rows = checkRows(raw, await tx.select({ id: schema.book.id, sku: schema.book.sku, title: schema.book.title, language: schema.book.language, pricePaise: schema.book.pricePaise, size: schema.book.size }).from(schema.book));
      if (rows.some((r) => r.action === "error")) return { ok: false as const, error: "Some rows have problems. Please fix them in the file and upload it again.", rows };
      const receipts: { bookId: number; qty: number; title: string }[] = [];
      let added = 0, updated = 0, priceChanged = 0;
      for (const r of rows) {
        if (r.action === "new") {
          const [b] = await tx.insert(schema.book).values({ title: r.title, language: r.language, sku: r.sku, size: r.size, pricePaise: r.pricePaise, coverUrl: r.coverUrl }).returning({ id: schema.book.id });
          await tx.insert(schema.bookPriceHistory).values({ bookId: b.id, newPricePaise: r.pricePaise, changedBy: u.id });
          added++;
          if (r.qty > 0) receipts.push({ bookId: b.id, qty: r.qty, title: r.title });
        } else {
          await tx.update(schema.book).set({ title: r.title, language: r.language, size: r.size, pricePaise: r.pricePaise, ...(r.coverUrl ? { coverUrl: r.coverUrl } : {}) }).where(eq(schema.book.id, r.bookId!));
          if (r.oldPricePaise !== r.pricePaise) {
            await tx.insert(schema.bookPriceHistory).values({ bookId: r.bookId!, oldPricePaise: r.oldPricePaise ?? null, newPricePaise: r.pricePaise, changedBy: u.id });
            priceChanged++;
          }
          updated++;
          if (r.qty > 0) receipts.push({ bookId: r.bookId!, qty: r.qty, title: r.title });
        }
      }
      if (receipts.length) {
        await lockHolders(tx, [H.central]);
        const campaign = await findCampaign(null, date);
        await tx.insert(schema.stockMovement).values(receipts.map((x) => ({
          kind: "received" as const, bookId: x.bookId, qty: x.qty, fromHolder: "external", toHolder: H.central, dhamId: null,
          campaignId: campaign?.id, movementDate: date, reference: `Excel import: ${file}`, note: "Added from Excel book list", createdBy: u.id,
        })));
      }
      return { ok: true as const, added, updated, priceChanged, copies: receipts.reduce((a, x) => a + x.qty, 0) };
    });
    if (!res.ok) return res;
    await logActivity(u.id, `${u.name} imported books from Excel (${file}): ${res.added} added, ${res.updated} updated${res.priceChanged ? `, ${res.priceChanged} prices changed` : ""}${res.copies ? `, ${num(res.copies)} copies received at the Central Store` : ""}`);
    revalidatePath("/books");
    revalidatePath("/stock");
    return res;
  } catch (e) {
    console.error("[book-import]", e);
    return { ok: false, error: "The import could not be saved. Nothing was changed — please try again." };
  }
}

export type { PreviewRow };
