import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/session";
import { toPdf, toXlsx, type ReportSpec } from "@/lib/export/render";
import { closingExport, distributionExport, moneyExport, reportsExport, stockExport } from "@/lib/export/builders";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILDERS = {
  reports: reportsExport,
  distribution: distributionExport,
  closing: closingExport,
  money: moneyExport,
  stock: (u: Parameters<typeof stockExport>[0]) => stockExport(u),
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const u = await getUser();
  if (!u) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (u.role === "devotee") return NextResponse.json({ error: "Reports are available to Managers and Admins." }, { status: 403 });
  const { kind } = await params;
  const build = BUILDERS[kind as keyof typeof BUILDERS];
  if (!build) return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  const q = Object.fromEntries(req.nextUrl.searchParams.entries());
  const format = q.format === "pdf" ? "pdf" : "xlsx";
  const spec: ReportSpec = await build(u, q);
  const body = format === "pdf" ? await toPdf(spec) : await toXlsx(spec);
  await logActivity(u.id, `${u.name} downloaded "${spec.title}" (${format === "pdf" ? "PDF" : "Excel"})`, { dhamId: u.dhamId });
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${spec.filename}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
