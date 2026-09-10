CREATE TYPE "MaintenanceObligationStatus" AS ENUM ('OPEN', 'COMPLETED', 'MISSED');

ALTER TABLE "maintenance_obligations"
ADD COLUMN "status" "MaintenanceObligationStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "resolved_at" TIMESTAMP(3),
ADD COLUMN "resolved_by_visit_id" UUID;

UPDATE "maintenance_obligations"
SET "status" = CASE
  WHEN "completed_at" IS NULL THEN 'OPEN'::"MaintenanceObligationStatus"
  ELSE 'COMPLETED'::"MaintenanceObligationStatus"
END,
"resolved_at" = "completed_at";

CREATE INDEX "maintenance_obligations_status_due_start_due_end_idx"
ON "maintenance_obligations"("status", "due_start", "due_end");

CREATE INDEX "maintenance_obligations_resolved_by_visit_id_idx"
ON "maintenance_obligations"("resolved_by_visit_id");
