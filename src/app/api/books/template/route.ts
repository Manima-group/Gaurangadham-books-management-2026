import { NextResponse } from "next/server";
import { getUser } from "@/lib/session";
import { sampleWorkbook } from "@/lib/book-import";

/** The sample Excel file for "Import books from Excel" (Chakra Sevak only). */
export async function GET() {
  const u = await getUser();
  if (!u) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  if (u.role !== "admin") return NextResponse.json({ error: "Only a Chakra Sevak can import books." }, { status: 403 });
  const body = await sampleWorkbook();
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="books-import-sample.xlsx"`,
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}
