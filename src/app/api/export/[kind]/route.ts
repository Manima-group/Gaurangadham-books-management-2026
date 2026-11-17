import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/session";
import { toPdf, toXlsx, type ReportSpec } from "@/lib/export/render";
import { closingExport, distributionExport, moneyExport, reportsExport, stockExport } from "@/lib/export/builders";
import { transfersExport } from "@/lib/transfer-report";
import { contactsExport } from "@/lib/outreach";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILDERS = {
  reports: reportsExport,
  distribution: distributionExport,
  closing: closingExport,
  money: moneyExport,
  stock: (u: Parameters<typeof stockExport>[0]) => stockExport(u),
  transfers: transfersExport,
  contacts: contactsExport,
} as const;

const err = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
/** Plain ASCII file name (no quotes or path characters), so every browser saves it with the right extension. */
const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "report";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const u = await getUser();
  if (!u) return err("Please log in again.", 401);
  const { kind } = await params;
  const build = BUILDERS[kind as keyof typeof BUILDERS];
  if (!build) return err("Unknown report.", 404);
  // Contact Collection Sevaks never download anything; outreach contacts are for Chakra / Sector Sevaks only.
  if (u.role === "devotee" || u.role === "contact") return err("Reports are available to Sector Sevaks and Chakra Sevaks.", 403);
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const format = q.format === "pdf" ? "pdf" : "xlsx";
  try {
    const spec: ReportSpec = await build(u, q);
    const body = format === "pdf" ? await toPdf(spec) : await toXlsx(spec);
    if (format === "pdf" && body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("PDF output is not a PDF");
    await logActivity(u.id, `${u.name} downloaded "${spec.title}" (${format === "pdf" ? "PDF" : "Excel"})`, { dhamId: u.dhamId });
    const name = `${safeName(spec.filename)}.${format}`;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(body.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error(`[export] ${kind}.${format} failed:`, e);
    return err(`The ${format === "pdf" ? "PDF" : "Excel file"} could not be made. Please try again; if it keeps failing, tell the app administrator.`, 500);
  }
}
