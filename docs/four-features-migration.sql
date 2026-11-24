-- Four features migration (additive only). Run once on production Neon.
BEGIN;

CREATE TABLE "access_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"permission" text NOT NULL,
	"old_value" text,
	"new_value" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "book_stall" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"event_date" date NOT NULL,
	"location" text,
	"description" text,
	"organizing_dham_id" integer NOT NULL,
	"mode" text DEFAULT 'same_dham' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"coordinator_id" text NOT NULL,
	"created_by" text NOT NULL,
	"allocation_version" integer DEFAULT 0 NOT NULL,
	"closing_note" text,
	"posted_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "registration_attempt" (
	"id" serial PRIMARY KEY NOT NULL,
	"invite_id" integer,
	"ip_hash" text NOT NULL,
	"ok" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "registration_invite" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"dham_id" integer NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text
);
CREATE TABLE "stall_allocation" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"version" integer NOT NULL,
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"contributed" integer NOT NULL,
	"suggested_take_home" integer NOT NULL,
	"take_home" integer NOT NULL,
	"loss" integer DEFAULT 0 NOT NULL,
	"transfer_in" integer DEFAULT 0 NOT NULL,
	"transfer_out" integer DEFAULT 0 NOT NULL,
	"attributed_sold" integer NOT NULL,
	"attributed_value_paise" integer DEFAULT 0 NOT NULL
);
CREATE TABLE "stall_approval" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"version" integer NOT NULL,
	"dham_id" integer NOT NULL,
	"approved_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "stall_confirmation" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"version" integer NOT NULL,
	"user_id" text NOT NULL,
	"decision" text NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "stall_contribution" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by" text NOT NULL,
	"client_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"confirmed_at" timestamp
);
CREATE TABLE "stall_count" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"contributed" integer NOT NULL,
	"sold" integer NOT NULL,
	"remaining" integer NOT NULL,
	"loss" integer DEFAULT 0 NOT NULL,
	"note" text,
	"counted_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "stall_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "stall_participant" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"dham_id" integer NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp
);
CREATE TABLE "stall_sale" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"client_key" text NOT NULL,
	"operator_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"mode" text NOT NULL,
	"total_paise" integer NOT NULL,
	"cash_paise" integer DEFAULT 0 NOT NULL,
	"upi_paise" integer DEFAULT 0 NOT NULL,
	"reversal_of" integer,
	"reversed_by" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "stall_sale_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"stall_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"price_paise" integer NOT NULL,
	"amount_paise" integer NOT NULL
);
CREATE TABLE "stall_transfer_line" (
	"id" serial PRIMARY KEY NOT NULL,
	"stall_id" integer NOT NULL,
	"version" integer NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"book_id" integer NOT NULL,
	"qty" integer NOT NULL
);
CREATE TABLE "stock_lot" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer NOT NULL,
	"source" text NOT NULL,
	"qty_received" integer NOT NULL,
	"received_into" text NOT NULL,
	"reference" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "daily_report" ADD COLUMN "payment_mode" text;
ALTER TABLE "daily_report" ADD COLUMN "cash_paise" integer;
ALTER TABLE "daily_report" ADD COLUMN "upi_paise" integer;
ALTER TABLE "money_submission" ADD COLUMN "cash_paise" integer;
ALTER TABLE "money_submission" ADD COLUMN "upi_paise" integer;
ALTER TABLE "money_submission" ADD COLUMN "stall_id" integer;
ALTER TABLE "money_submission" ADD COLUMN "client_key" text;
ALTER TABLE "stock_movement" ADD COLUMN "lot_id" integer;
ALTER TABLE "stock_movement" ADD COLUMN "stall_id" integer;
ALTER TABLE "user" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;
ALTER TABLE "user" ADD COLUMN "can_distribute_books" boolean DEFAULT true NOT NULL;
ALTER TABLE "user" ADD COLUMN "can_view_dham_sales" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN "registered_via" integer;
ALTER TABLE "user" ADD COLUMN "reviewed_by" text;
ALTER TABLE "user" ADD COLUMN "reviewed_at" timestamp;
ALTER TABLE "user" ADD COLUMN "review_note" text;
CREATE INDEX "access_audit_user_idx" ON "access_audit" USING btree ("user_id");
CREATE INDEX "stall_dham_status_idx" ON "book_stall" USING btree ("organizing_dham_id","status");
CREATE INDEX "stall_coord_idx" ON "book_stall" USING btree ("coordinator_id");
CREATE INDEX "regatt_ip_idx" ON "registration_attempt" USING btree ("ip_hash","created_at");
CREATE INDEX "regatt_invite_idx" ON "registration_attempt" USING btree ("invite_id","created_at");
CREATE UNIQUE INDEX "invite_token_uq" ON "registration_invite" USING btree ("token");
CREATE INDEX "invite_dham_idx" ON "registration_invite" USING btree ("dham_id");
CREATE UNIQUE INDEX "stall_alloc_uq" ON "stall_allocation" USING btree ("stall_id","version","user_id","book_id");
CREATE UNIQUE INDEX "stall_appr_uq" ON "stall_approval" USING btree ("stall_id","version","dham_id");
CREATE UNIQUE INDEX "stall_conf_uq" ON "stall_confirmation" USING btree ("stall_id","version","user_id");
CREATE INDEX "stall_contrib_stall_idx" ON "stall_contribution" USING btree ("stall_id");
CREATE INDEX "stall_contrib_user_idx" ON "stall_contribution" USING btree ("user_id","status");
CREATE UNIQUE INDEX "stall_contrib_key_uq" ON "stall_contribution" USING btree ("stall_id","client_key");
CREATE UNIQUE INDEX "stall_count_uq" ON "stall_count" USING btree ("stall_id","book_id");
CREATE INDEX "stall_event_idx" ON "stall_event" USING btree ("stall_id");
CREATE UNIQUE INDEX "stall_part_uq" ON "stall_participant" USING btree ("stall_id","user_id");
CREATE INDEX "stall_part_user_idx" ON "stall_participant" USING btree ("user_id");
CREATE UNIQUE INDEX "stall_sale_key_uq" ON "stall_sale" USING btree ("stall_id","client_key");
CREATE INDEX "stall_sale_recipient_idx" ON "stall_sale" USING btree ("recipient_id");
CREATE INDEX "stall_line_stall_idx" ON "stall_sale_line" USING btree ("stall_id","book_id");
CREATE INDEX "stall_line_sale_idx" ON "stall_sale_line" USING btree ("sale_id");
CREATE INDEX "stall_xfer_idx" ON "stall_transfer_line" USING btree ("stall_id","version");
CREATE INDEX "lot_book_idx" ON "stock_lot" USING btree ("book_id");
CREATE INDEX "lot_source_idx" ON "stock_lot" USING btree ("source");
CREATE UNIQUE INDEX "money_client_key_uq" ON "money_submission" USING btree ("devotee_id","client_key");
CREATE INDEX "sm_lot_idx" ON "stock_movement" USING btree ("lot_id");
CREATE INDEX "sm_stall_idx" ON "stock_movement" USING btree ("stall_id");

COMMIT;
