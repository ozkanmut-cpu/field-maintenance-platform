-- Additive, fail-closed SAP confirmation reconciliation state. APPROVED was
-- committed by the immediately preceding migration before this constraint uses it.
CREATE TYPE "ConfirmationApprovalSource" AS ENUM ('AUTO_SAP', 'MANUAL_ADMIN');
CREATE TYPE "SapImportSource" AS ENUM ('MAIN_CONFIRMATION_203');
CREATE TYPE "SapImportRunStatus" AS ENUM ('SUCCESS');

ALTER TABLE "maintenance_visits"
  ADD COLUMN "confirmation_reconciliation_eligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "confirmation_approval_source" "ConfirmationApprovalSource",
  ADD COLUMN "confirmation_reconciled_at" TIMESTAMP(3);

-- Historical visits are opt-in only when they are valid STANDARD work. Their completion
-- snapshot remains authoritative; a later point type change cannot widen this scope.
UPDATE "maintenance_visits" AS visit
SET "confirmation_reconciliation_eligible" = true
FROM "points" AS point
WHERE visit."point_id" = point."id"
  AND visit."status" = 'VALID'
  AND point."maintenance_type" = 'STANDARD';

ALTER TABLE "maintenance_visits"
  ADD CONSTRAINT "maintenance_visits_confirmation_approval_source_check"
  CHECK (
    ("confirmation_status" = 'APPROVED' AND "confirmation_approval_source" IS NOT NULL)
    OR ("confirmation_status" <> 'APPROVED' AND "confirmation_approval_source" IS NULL)
  );

CREATE INDEX "maintenance_visits_confirmation_reconciliation_eligible_confirmation_status_idx"
  ON "maintenance_visits"("confirmation_reconciliation_eligible", "confirmation_status");

CREATE TABLE "sap_import_runs" (
  "id" UUID NOT NULL,
  "source" "SapImportSource" NOT NULL,
  "status" "SapImportRunStatus" NOT NULL DEFAULT 'SUCCESS',
  "window_start" DATE NOT NULL,
  "window_end" DATE NOT NULL,
  "row_count" INTEGER NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMP(3),
  "reconciled_at" TIMESTAMP(3),
  CONSTRAINT "sap_import_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sap_import_runs_source_reconciled_at_completed_at_idx"
  ON "sap_import_runs"("source", "reconciled_at", "completed_at");

ALTER TABLE "sap_confirmations" ADD COLUMN "last_seen_import_id" UUID;
CREATE INDEX "sap_confirmations_last_seen_import_id_idx" ON "sap_confirmations"("last_seen_import_id");
ALTER TABLE "sap_confirmations"
  ADD CONSTRAINT "sap_confirmations_last_seen_import_id_fkey"
  FOREIGN KEY ("last_seen_import_id") REFERENCES "sap_import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sap_confirmation_reconciliations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_run_id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "previous_status" "PaperworkStatus" NOT NULL,
  "next_status" "PaperworkStatus" NOT NULL,
  "approval_source" "ConfirmationApprovalSource",
  "sap_count" INTEGER NOT NULL,
  "cooler_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sap_confirmation_reconciliations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sap_confirmation_reconciliations_import_run_id_visit_id_key"
  ON "sap_confirmation_reconciliations"("import_run_id", "visit_id");
CREATE INDEX "sap_confirmation_reconciliations_visit_id_created_at_idx"
  ON "sap_confirmation_reconciliations"("visit_id", "created_at");
ALTER TABLE "sap_confirmation_reconciliations"
  ADD CONSTRAINT "sap_confirmation_reconciliations_import_run_id_fkey"
  FOREIGN KEY ("import_run_id") REFERENCES "sap_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sap_confirmation_reconciliations"
  ADD CONSTRAINT "sap_confirmation_reconciliations_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "maintenance_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
