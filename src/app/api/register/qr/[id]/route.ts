import path from "node:path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db, schema } from "@/db";
import { getUser } from "@/lib/session";
import { baseUrl, inviteLink, qrPng, sectorLabel } from "@/lib/registration";
import { APP_NAME } from "@/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT = path.join(process.cwd(), "assets", "fonts", "NotoSans-Regular.ttf");
const FONT_BOLD = path.join(process.cwd(), "assets", "fonts", "NotoSans-Bold.ttf");
const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getUser();
  if (!u) return err("Please log in again.", 401);
  if (u.approvalStatus !== "approved" || (u.role !== "manager" && u.role !== "admin")) return err("Only Sector Sevaks and Chakra Sevaks can download this.", 403);
  const id = Number((await params).id);
  const [inv] = await db.select().from(schema.registrationInvite).where(eq(schema.registrationInvite.id, id));
  if (!inv || (u.role !== "admin" && inv.dhamId !== u.dhamId)) return err("Not found.", 404);
  if (inv.revokedAt || inv.expiresAt < new Date()) return err("This QR is no longer active.", 410);
  const [d] = await db.select().from(schema.dham).where(eq(schema.dham.id, inv.dhamId));
  const sevaks = await db.select({ name: schema.user.name }).from(schema.user)
    .where(and(eq(schema.user.dhamId, inv.dhamId), eq(schema.user.role, "manager"), eq(schema.user.isActive, true), eq(schema.user.isCoSevak, false)));
  const sector = sectorLabel(d.name, sevaks.map((s) => s.name));
  const link = inviteLink(await baseUrl(), inv.token);
  const png = await qrPng(link);

  const doc = new PDFDocument({ size: "A4", margin: 48, font: FONT, info: { Title: `Registration QR — ${d.name}`, Author: APP_NAME } });
  doc.registerFont("b", FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(chunks))));
  const W = doc.page.width - 96;
  doc.fillColor("#d95512").font("b").fontSize(14).text(APP_NAME, { align: "center", width: W });
  doc.moveDown(0.6).fillColor("#0f1d3a").fontSize(26).text(d.name, { align: "center", width: W });
  doc.font(FONT).fontSize(15).fillColor("#334155").text(sector, { align: "center", width: W });
  const size = 300;
  doc.image(png, (doc.page.width - size) / 2, doc.y + 24, { width: size, height: size });
  doc.y += size + 48;
  doc.font("b").fontSize(16).fillColor("#0f1d3a").text(`Scan this QR to register as a devotee under ${d.name}, ${sector}`, 48, doc.y, { align: "center", width: W });
  doc.moveDown(0.8).font(FONT).fontSize(10).fillColor("#64748b").text("Your Sector Sevak approves each registration.", { align: "center", width: W });
  doc.moveDown(0.3).fontSize(8).text(link, { align: "center", width: W });
  doc.end();
  const body = await done;
  const name = `registration-qr-${d.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
