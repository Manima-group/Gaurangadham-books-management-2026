/**
 * Seed the database.
 *   npm run db:seed              → admin account + realistic demo data
 *   SEED_EMPTY=1 npm run db:seed → admin account only (to try first-time setup)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres((process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!, { max: 1 });
const db = drizzle(client, { schema });

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const day = (offset: number) => {
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function person(name: string, role: "admin" | "manager" | "devotee", phone: string, password: string, dhamId: number | null, email?: string) {
  const id = randomUUID();
  await db.insert(schema.user).values({
    id,
    name,
    email: email ?? `m${phone}@users.gaurangadham.local`,
    emailVerified: true,
    role,
    phone,
    dhamId,
    onboarded: false,
  });
  await db.insert(schema.account).values({
    id: randomUUID(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(password),
  });
  return id;
}

async function main() {
  const existing = await db.select().from(schema.user).limit(1);
  if (existing.length) {
    console.log("Database already has users — skipping seed. Run `npm run db:reset` to start fresh.");
    await client.end();
    return;
  }

  const adminId = await person("Radha Govinda Das", "admin", "9000000001", "admin123", null, "admin@gaurangadham.org");

  if (process.env.SEED_EMPTY) {
    console.log("Created admin only.\n  Login: admin@gaurangadham.org (or 9000000001) / admin123");
    await client.end();
    return;
  }

  await db.insert(schema.organization).values({ name: "Gaurangadham Book Distribution", city: "Hyderabad", contactPhone: "9000000001" });

  const [hyd, wgl, vjw] = await db
    .insert(schema.dham)
    .values([
      { name: "Hyderabad Dham", city: "Hyderabad", address: "Banjara Hills" },
      { name: "Warangal Dham", city: "Warangal", address: "Hanamkonda" },
      { name: "Vijayawada Dham", city: "Vijayawada", address: "Benz Circle" },
    ])
    .returning();

  const books = await db
    .insert(schema.book)
    .values([
      { sku: "BG-EN", title: "Bhagavad Gita As It Is", language: "English", pricePaise: 30000, size: "big" },
      { sku: "BG-TE", title: "Bhagavad Gita As It Is", language: "Telugu", pricePaise: 25000, size: "big" },
      { sku: "SSR-EN", title: "Science of Self-Realization", language: "English", pricePaise: 12000 },
      { sku: "PQPA-EN", title: "Perfect Questions, Perfect Answers", language: "English", pricePaise: 5000 },
      { sku: "CBH-EN", title: "Chant and Be Happy", language: "English", pricePaise: 6000 },
      { sku: "BBD-TE", title: "Beyond Birth and Death", language: "Telugu", pricePaise: 4000 },
    ])
    .returning();
  await db.insert(schema.bookPriceHistory).values(books.map((b) => ({ bookId: b.id, newPricePaise: b.pricePaise, changedBy: adminId })));

  const [drive] = await db
    .insert(schema.campaign)
    .values({ name: "Kartik Book Marathon 2026", description: "Month-long distribution drive across all Dhams", startDate: day(-30), endDate: day(20) })
    .returning();

  const mgrHyd = await person("Madhava Prabhu", "manager", "9000000002", "manager123", hyd.id);
  await person("Keshava Prabhu", "manager", "9000000003", "manager123", wgl.id);
  const devs = [
    await person("Govinda Sharma", "devotee", "9000000011", "devotee123", hyd.id),
    await person("Lakshmi Reddy", "devotee", "9000000012", "devotee123", hyd.id),
    await person("Hari Krishna Rao", "devotee", "9000000013", "devotee123", hyd.id),
    await person("Sita Devi", "devotee", "9000000014", "devotee123", hyd.id),
  ];
  const wglDev = await person("Narayana Murthy", "devotee", "9000000021", "devotee123", wgl.id);

  const mv: (typeof schema.stockMovement.$inferInsert)[] = [];
  const base = { createdBy: adminId, campaignId: drive.id };
  // Central store receives stock 20 days ago
  const receivedQty = [500, 400, 300, 600, 400, 500];
  books.forEach((b, i) =>
    mv.push({ ...base, kind: "received", bookId: b.id, qty: receivedQty[i], fromHolder: "external", toHolder: "central", movementDate: day(-20), reference: "Invoice BBT/2026/118" }),
  );
  // Sent to Dhams
  const toHyd = [200, 150, 120, 250, 150, 200];
  const toWgl = [80, 100, 40, 100, 60, 100];
  books.forEach((b, i) => {
    mv.push({ ...base, kind: "assign_dham", bookId: b.id, qty: toHyd[i], fromHolder: "central", toHolder: `dham:${hyd.id}`, dhamId: hyd.id, movementDate: day(-18) });
    mv.push({ ...base, kind: "assign_dham", bookId: b.id, qty: toWgl[i], fromHolder: "central", toHolder: `dham:${wgl.id}`, dhamId: wgl.id, movementDate: day(-18) });
  });
  // Given to devotees
  const give = [30, 25, 20, 40, 25, 30];
  for (const d of devs)
    books.forEach((b, i) =>
      mv.push({ ...base, createdBy: mgrHyd, kind: "assign_devotee", bookId: b.id, qty: give[i], fromHolder: `dham:${hyd.id}`, toHolder: `devotee:${d}`, dhamId: hyd.id, devoteeId: d, movementDate: day(-15) }),
    );
  books.slice(0, 4).forEach((b) =>
    mv.push({ ...base, kind: "assign_devotee", bookId: b.id, qty: 20, fromHolder: `dham:${wgl.id}`, toHolder: `devotee:${wglDev}`, dhamId: wgl.id, devoteeId: wglDev, movementDate: day(-15) }),
  );
  await db.insert(schema.stockMovement).values(mv);

  // Daily reports for the last 12 days. Older ones approved, yesterday's waiting for review.
  let seedRand = 7;
  const rand = (n: number) => {
    seedRand = (seedRand * 9301 + 49297) % 233280;
    return Math.floor((seedRand / 233280) * n);
  };
  const held = new Map<string, number>();
  for (const d of devs) books.forEach((b, i) => held.set(`${d}:${b.id}`, give[i]));

  for (let off = -12; off <= 0; off++) {
    for (const [di, d] of devs.entries()) {
      if (off === -1 && di === 3) continue; // Sita hasn't reported yesterday
      if (off === 0 && di >= 2) continue; // two devotees haven't reported today yet
      if (rand(10) === 0) continue; // occasional day off
      const status = off >= -1 ? "submitted" : "approved";
      const lines = books.map((b) => {
        const opening = held.get(`${d}:${b.id}`)!;
        const sold = Math.min(opening, rand(4));
        return { b, opening, sold };
      });
      const totalSold = lines.reduce((a, l) => a + l.sold, 0);
      const sales = lines.reduce((a, l) => a + l.sold * l.b.pricePaise, 0);
      const short = di === 2 && off === -3 ? 5000 : 0; // one small difference to review
      const [r] = await db
        .insert(schema.dailyReport)
        .values({
          devoteeId: d,
          dhamId: hyd.id,
          campaignId: drive.id,
          reportDate: day(off),
          status,
          totalSold,
          salesPaise: sales,
          collectedPaise: sales - short,
          remarks: short ? "Gave ₹50 discount to a student" : null,
          submittedAt: new Date(day(off) + "T19:30:00+05:30"),
          reviewedBy: status === "approved" ? mgrHyd : null,
          reviewedAt: status === "approved" ? new Date(day(off + 1) + "T10:00:00+05:30") : null,
        })
        .returning();
      const PLACES = ["Ameerpet Metro Station", "KBR Park Gate 1", "Inorbit Mall", "Charminar", "Secunderabad Station", "Hitech City MMTS"];
      const [v] = await db.insert(schema.dailyReportVenue).values({ reportId: r.id, name: PLACES[(di + off + 20) % PLACES.length], timeSlot: off % 2 ? "evening" : "morning", sort: 0 }).returning();
      await db.insert(schema.dailyReportLine).values(
        lines.map((l) => ({ reportId: r.id, venueId: v.id, bookId: l.b.id, openingQty: l.opening, soldQty: l.sold, pricePaise: l.b.pricePaise, amountPaise: l.sold * l.b.pricePaise })),
      );
      if (status === "approved") {
        const sm = lines
          .filter((l) => l.sold > 0)
          .map((l) => ({
            kind: "sold" as const,
            bookId: l.b.id,
            qty: l.sold,
            fromHolder: `devotee:${d}`,
            toHolder: "sold",
            dhamId: hyd.id,
            devoteeId: d,
            campaignId: drive.id,
            reportId: r.id,
            movementDate: day(off),
            createdBy: mgrHyd,
          }));
        if (sm.length) await db.insert(schema.stockMovement).values(sm);
        for (const l of lines) held.set(`${d}:${l.b.id}`, l.opening - l.sold);
      }
    }
  }

  // Warangal: one devotee, approved reports for the last week
  {
    const wb = books.slice(0, 4);
    const wheld = new Map(wb.map((b) => [b.id, 20]));
    for (let off = -7; off <= 0; off++) {
      const lines = wb.map((b) => {
        const opening = wheld.get(b.id)!;
        return { b, opening, sold: Math.min(opening, rand(3)) };
      });
      const totalSold = lines.reduce((a, l) => a + l.sold, 0);
      const sales = lines.reduce((a, l) => a + l.sold * l.b.pricePaise, 0);
      const status = off === 0 ? "submitted" : "approved";
      const [r] = await db
        .insert(schema.dailyReport)
        .values({ devoteeId: wglDev, dhamId: wgl.id, campaignId: drive.id, reportDate: day(off), status, totalSold, salesPaise: sales, collectedPaise: sales, submittedAt: new Date(day(off) + "T19:00:00+05:30") })
        .returning();
      const [v] = await db.insert(schema.dailyReportVenue).values({ reportId: r.id, name: off % 2 ? "Hanamkonda Chowrasta" : "Kazipet Junction", sort: 0 }).returning();
      await db.insert(schema.dailyReportLine).values(lines.map((l) => ({ reportId: r.id, venueId: v.id, bookId: l.b.id, openingQty: l.opening, soldQty: l.sold, pricePaise: l.b.pricePaise, amountPaise: l.sold * l.b.pricePaise })));
      if (status === "approved") {
        const sm = lines.filter((l) => l.sold > 0).map((l) => ({ kind: "sold" as const, bookId: l.b.id, qty: l.sold, fromHolder: `devotee:${wglDev}`, toHolder: "sold", dhamId: wgl.id, devoteeId: wglDev, campaignId: drive.id, reportId: r.id, movementDate: day(off), createdBy: adminId }));
        if (sm.length) await db.insert(schema.stockMovement).values(sm);
        for (const l of lines) wheld.set(l.b.id, l.opening - l.sold);
      }
    }
  }

  // Money submissions: most devotees submitted most of their money
  const sums = (await client`
    select devotee_id, sum(collected_paise)::bigint as c from daily_report where status in ('approved','submitted') group by devotee_id`) as unknown as { devotee_id: string; c: number }[];
  for (const [i, s] of sums.filter((x) => (devs as string[]).includes(x.devotee_id)).entries()) {
    const c = Number(s.c);
    const portions = i === 0 ? [0.5, 0.5] : i === 1 ? [0.6] : i === 2 ? [0.4, 0.3] : [];
    for (const [j, p] of portions.entries()) {
      const amt = Math.round((c * p) / 100) * 100;
      await db.insert(schema.moneySubmission).values({
        devoteeId: s.devotee_id,
        dhamId: hyd.id,
        amountPaise: amt,
        method: j === 0 ? "cash" : "upi",
        reference: j === 0 ? null : `UPI${400000 + i * 10 + j}`,
        submissionDate: day(-6 + j * 4),
        status: j === portions.length - 1 && i === 0 ? "submitted" : "received",
        receivedBy: mgrHyd,
        receivedAt: new Date(),
      });
    }
  }

  await db.insert(schema.activityLog).values([
    { userId: adminId, action: "Radha Govinda Das set up the organisation and added 3 Dhams" },
    { userId: adminId, action: "Radha Govinda Das created the distribution drive \"Kartik Book Marathon 2026\"" },
  ]);
  await db.insert(schema.notification).values([
    { userId: mgrHyd, title: "3 daily reports are waiting for your review", body: "Reports from yesterday", link: "/reports?status=submitted" },
  ]);

  console.log(`
Demo data created ✔

Log in with:
  Global Admin   admin@gaurangadham.org  (or 9000000001) / admin123
  Dham Manager   9000000002  (Hyderabad Dham)            / manager123
  Devotee        9000000011  (Govinda Sharma, Hyderabad) / devotee123
`);
  void vjw;
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  await client.end();
  process.exit(1);
});
