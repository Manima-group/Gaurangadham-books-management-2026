/**
 * Database schema.
 *
 * Internal names (stock_movement, remittance-style tables etc.) stay technical here.
 * User-facing wording lives in src/lib/terms.ts and is never taken from table names.
 *
 * Money is stored as integer PAISE (₹1 = 100 paise) to avoid rounding errors.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  date,
  jsonb,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Better Auth tables                                                  */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // App fields
  role: text("role", { enum: ["admin", "manager", "devotee"] }).notNull().default("devotee"),
  dhamId: integer("dham_id"),
  phone: text("phone").unique(),
  isActive: boolean("is_active").notNull().default(true),
  onboarded: boolean("onboarded").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Organisation setup                                                  */
/* ------------------------------------------------------------------ */

export const organization = pgTable("organization", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  contactPhone: text("contact_phone"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const dham = pgTable("dham", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** "Distribution Drive" in the UI. */
export const campaign = pgTable("campaign", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  dhamId: integer("dham_id"), // null = all Dhams
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** "Book" in the UI. `sku` is shown as "Book Code". */
export const book = pgTable("book", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  title: text("title").notNull(),
  language: text("language").notNull().default("English"),
  coverUrl: text("cover_url"),
  pricePaise: integer("price_paise").notNull(),
  /** "Big book" (e.g. Bhagavad Gita) or "Small book" (e.g. booklets) — used to count distribution by size. */
  size: text("size", { enum: ["big", "small"] }).notNull().default("small"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookPriceHistory = pgTable("book_price_history", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull(),
  oldPricePaise: integer("old_price_paise"),
  newPricePaise: integer("new_price_paise").notNull(),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Stock ledger ("Book Movement History")                              */
/* ------------------------------------------------------------------ */

/**
 * Every book movement is one row: `qty` copies move from `fromHolder` to `toHolder`.
 * Holders: "external" | "central" | "dham:<id>" | "devotee:<userId>" | "sold" | "damaged".
 * A holder's stock = sum(qty in) - sum(qty out). Nothing is ever overwritten.
 */
export const stockMovement = pgTable(
  "stock_movement",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", {
      enum: ["received", "assign_dham", "assign_devotee", "sold", "returned", "damaged", "correction"],
    }).notNull(),
    bookId: integer("book_id").notNull(),
    qty: integer("qty").notNull(),
    fromHolder: text("from_holder").notNull(),
    toHolder: text("to_holder").notNull(),
    dhamId: integer("dham_id"), // Dham this movement belongs to (null = central store only)
    devoteeId: text("devotee_id"),
    campaignId: integer("campaign_id"),
    reportId: integer("report_id"),
    movementDate: date("movement_date").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** Set when this movement was undone: id of the "correction" movement that reverses it. */
    reversedBy: integer("reversed_by"),
  },
  (t) => [
    index("sm_dham_idx").on(t.dhamId),
    index("sm_from_idx").on(t.fromHolder),
    index("sm_to_idx").on(t.toHolder),
    index("sm_devotee_idx").on(t.devoteeId),
    index("sm_dham_date_idx").on(t.dhamId, t.movementDate),
    index("sm_kind_date_idx").on(t.kind, t.movementDate),
    index("sm_report_idx").on(t.reportId),
  ],
);

/* ------------------------------------------------------------------ */
/* Daily sales reports                                                 */
/* ------------------------------------------------------------------ */

export const dailyReport = pgTable(
  "daily_report",
  {
    id: serial("id").primaryKey(),
    devoteeId: text("devotee_id").notNull(),
    dhamId: integer("dham_id").notNull(),
    campaignId: integer("campaign_id"),
    reportDate: date("report_date").notNull(),
    status: text("status", {
      enum: ["draft", "submitted", "approved", "changes_required", "rejected"],
    })
      .notNull()
      .default("draft"),
    totalSold: integer("total_sold").notNull().default(0),
    salesPaise: integer("sales_paise").notNull().default(0),
    collectedPaise: integer("collected_paise").notNull().default(0),
    remarks: text("remarks"),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at"),
    submittedAt: timestamp("submitted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("report_devotee_date_uq").on(t.devoteeId, t.reportDate),
    index("report_dham_date_idx").on(t.dhamId, t.reportDate),
    index("report_status_idx").on(t.status, t.dhamId),
    index("report_date_idx").on(t.reportDate),
    index("report_campaign_idx").on(t.campaignId),
  ],
);

export const dailyReportLine = pgTable(
  "daily_report_line",
  {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  bookId: integer("book_id").notNull(),
  openingQty: integer("opening_qty").notNull(),
  soldQty: integer("sold_qty").notNull().default(0),
  returnedQty: integer("returned_qty").notNull().default(0),
  damagedQty: integer("damaged_qty").notNull().default(0),
  pricePaise: integer("price_paise").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  /** Place where these copies were sold. Null = returns/damage for the day, or old reports without places. */
  venueId: integer("venue_id"),
  },
  (t) => [index("line_report_idx").on(t.reportId), index("line_book_idx").on(t.bookId), index("line_venue_idx").on(t.venueId)],
);

/** A place where a devotee distributed books on a day (one report can have many). */
export const dailyReportVenue = pgTable(
  "daily_report_venue",
  {
    id: serial("id").primaryKey(),
    reportId: integer("report_id").notNull(),
    name: text("name").notNull(), // e.g. "Ameerpet Metro Station"
    area: text("area"), // e.g. "Gate 2, near ticket counter"
    timeSlot: text("time_slot", { enum: ["morning", "afternoon", "evening"] }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("venue_report_idx").on(t.reportId), index("venue_name_idx").on(t.name)],
);

/* ------------------------------------------------------------------ */
/* Money submissions ("Submit Collected Money")                        */
/* ------------------------------------------------------------------ */

export const moneySubmission = pgTable(
  "money_submission",
  {
  id: serial("id").primaryKey(),
  devoteeId: text("devotee_id").notNull(),
  dhamId: integer("dham_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  method: text("method", { enum: ["cash", "upi", "bank"] }).notNull(),
  reference: text("reference"),
  submissionDate: date("submission_date").notNull(),
  remarks: text("remarks"),
  status: text("status", { enum: ["submitted", "received", "disputed"] })
    .notNull()
    .default("submitted"),
  receivedBy: text("received_by"),
  receivedAt: timestamp("received_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("money_devotee_idx").on(t.devoteeId),
    index("money_dham_status_idx").on(t.dhamId, t.status),
    index("money_date_idx").on(t.submissionDate),
  ],
);

/* ------------------------------------------------------------------ */
/* Daily closing                                                       */
/* ------------------------------------------------------------------ */

export const dailyClosing = pgTable(
  "daily_closing",
  {
    id: serial("id").primaryKey(),
    dhamId: integer("dham_id").notNull(),
    closingDate: date("closing_date").notNull(),
    figures: jsonb("figures").notNull(),
    hasDifferences: boolean("has_differences").notNull().default(false),
    note: text("note"),
    closedBy: text("closed_by").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("closing_dham_date_uq").on(t.dhamId, t.closingDate)],
);

/* ------------------------------------------------------------------ */
/* Notifications & activity history                                    */
/* ------------------------------------------------------------------ */

export const notification = pgTable(
  "notification",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.isRead)],
);

export const activityLog = pgTable(
  "activity_log",
  {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  dhamId: integer("dham_id"),
  action: text("action").notNull(), // plain-language sentence shown to users
  entity: text("entity"),
  entityId: text("entity_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt), index("activity_dham_idx").on(t.dhamId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Stock checkpoints — saved balances so stock is not re-added from    */
/* the full history on every page load.                                */
/* ------------------------------------------------------------------ */

/** A checkpoint covers every stock_movement with id <= uptoMovementId. */
export const stockCheckpoint = pgTable("stock_checkpoint", {
  id: serial("id").primaryKey(),
  uptoMovementId: integer("upto_movement_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Net copies per holder, Dham and book at the checkpoint (same grouping the stock queries use). */
export const stockCheckpointBalance = pgTable(
  "stock_checkpoint_balance",
  {
    checkpointId: integer("checkpoint_id").notNull(),
    holder: text("holder").notNull(),
    dhamId: integer("dham_id"),
    bookId: integer("book_id").notNull(),
    qty: integer("qty").notNull(),
  },
  (t) => [index("cpb_cp_holder_idx").on(t.checkpointId, t.holder), index("cpb_cp_dham_idx").on(t.checkpointId, t.dhamId)],
);
