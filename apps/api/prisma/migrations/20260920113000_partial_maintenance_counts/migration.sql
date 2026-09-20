ALTER TABLE "maintenance_visits"
  ADD COLUMN "total_cooler_count" INTEGER,
  ADD COLUMN "missing_maintenance_count" INTEGER,
  ADD COLUMN "missing_maintenance_explanation" TEXT;
