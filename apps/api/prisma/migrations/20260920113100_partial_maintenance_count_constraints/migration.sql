ALTER TABLE "maintenance_visits"
  ADD CONSTRAINT "maintenance_visits_partial_maintenance_counts_check"
  CHECK (
    (
      "total_cooler_count" IS NULL
      AND "maintained_cooler_count" IS NULL
      AND "missing_maintenance_count" IS NULL
      AND "missing_maintenance_explanation" IS NULL
    )
    OR (
      "total_cooler_count" IS NOT NULL
      AND "maintained_cooler_count" IS NOT NULL
      AND "missing_maintenance_count" IS NOT NULL
      AND "total_cooler_count" >= 0
      AND "maintained_cooler_count" >= 0
      AND "maintained_cooler_count" <= "total_cooler_count"
      AND "missing_maintenance_count" = "total_cooler_count" - "maintained_cooler_count"
      AND ("missing_maintenance_count" > 0 OR "missing_maintenance_explanation" IS NULL)
    )
  );
