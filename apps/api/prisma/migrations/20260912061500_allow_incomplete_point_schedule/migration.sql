ALTER TABLE "points" DROP CONSTRAINT IF EXISTS "points_maintenance_schedule_ck";

ALTER TABLE "points"
ADD CONSTRAINT "points_maintenance_schedule_ck" CHECK (
  ("maintenance_week" IS NULL OR "maintenance_week" IN (1, 2))
  AND (
    ("maintenance_type" = 'STANDARD' AND "smartclean_reference_at" IS NULL)
    OR
    ("maintenance_type" = 'SMARTCLEAN')
  )
);
