ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'FAULTY_KEG';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'FACILITY_INSTALLATION';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'FACILITY_REMOVAL';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'MOBILE_INSTALLATION';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'MOBILE_REMOVAL';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'SMART_TAP_INSTALLATION';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'SMART_TAP_BREAKDOWN';
ALTER TYPE "NonMaintenanceVisitPurpose" ADD VALUE IF NOT EXISTS 'SMART_TAP_REMOVAL';

ALTER TABLE "non_maintenance_visits"
  ALTER COLUMN "point_id" DROP NOT NULL,
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL,
  ALTER COLUMN "location_captured_at" DROP NOT NULL,
  ADD COLUMN "customer_name" TEXT,
  ADD COLUMN "efesim_image_base64" TEXT,
  ADD COLUMN "visual_explanation" TEXT;

ALTER TABLE "non_maintenance_visits"
  ADD CONSTRAINT "non_maintenance_visits_customer_evidence_check"
  CHECK (
    "point_id" IS NOT NULL
    OR (
      length(btrim(COALESCE("customer_name", ''))) >= 2
      AND (
        length(btrim(COALESCE("efesim_image_base64", ''))) > 0
        OR length(btrim(COALESCE("visual_explanation", ''))) > 0
      )
    )
  );
