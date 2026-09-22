ALTER TABLE "maintenance_visits"
  ADD COLUMN "maintained_cooler_count" INTEGER;

ALTER TABLE "sap_import_runs"
  ADD COLUMN "acquired_at" TIMESTAMP(3);
UPDATE "sap_import_runs"
SET "acquired_at" = "completed_at"
WHERE "acquired_at" IS NULL;
ALTER TABLE "sap_import_runs"
  ALTER COLUMN "acquired_at" SET NOT NULL;

CREATE TABLE "sap_confirmation_import_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_run_id" UUID NOT NULL,
  "confirmation_id" TEXT NOT NULL,
  "point_code" TEXT NOT NULL,
  "record_date" DATE NOT NULL,
  "status" TEXT,
  "product_id" TEXT NOT NULL,
  CONSTRAINT "sap_confirmation_import_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sap_confirmation_import_evidence_import_run_id_confirmation_id_key"
  ON "sap_confirmation_import_evidence"("import_run_id", "confirmation_id");
CREATE INDEX "sap_confirmation_import_evidence_import_run_id_point_code_record_date_idx"
  ON "sap_confirmation_import_evidence"("import_run_id", "point_code", "record_date");
ALTER TABLE "sap_confirmation_import_evidence"
  ADD CONSTRAINT "sap_confirmation_import_evidence_import_run_id_fkey"
  FOREIGN KEY ("import_run_id") REFERENCES "sap_import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sap_confirmation_reconciliations"
  RENAME COLUMN "cooler_count" TO "required_confirmation_count";
