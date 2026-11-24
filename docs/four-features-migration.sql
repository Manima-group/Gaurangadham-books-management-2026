CREATE TABLE "access_audit" (
CREATE TABLE "book_stall" (
CREATE TABLE "registration_attempt" (
CREATE TABLE "registration_invite" (
CREATE TABLE "stall_allocation" (
CREATE TABLE "stall_approval" (
CREATE TABLE "stall_confirmation" (
CREATE TABLE "stall_contribution" (
CREATE TABLE "stall_count" (
CREATE TABLE "stall_event" (
CREATE TABLE "stall_participant" (
CREATE TABLE "stall_sale" (
CREATE TABLE "stall_sale_line" (
CREATE TABLE "stall_transfer_line" (
CREATE TABLE "stock_lot" (
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
