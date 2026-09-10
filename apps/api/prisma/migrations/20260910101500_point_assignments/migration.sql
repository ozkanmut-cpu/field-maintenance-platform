CREATE TYPE "PointAssignmentKind" AS ENUM ('POINT_OVERRIDE', 'TEMPORARY');

CREATE TABLE "point_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "point_id" UUID NOT NULL,
  "technician_id" UUID NOT NULL,
  "kind" "PointAssignmentKind" NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "created_by_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivated_at" TIMESTAMP(3),
  CONSTRAINT "point_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "point_assignments_point_id_active_starts_at_ends_at_idx"
  ON "point_assignments"("point_id", "active", "starts_at", "ends_at");
CREATE INDEX "point_assignments_technician_id_active_idx"
  ON "point_assignments"("technician_id", "active");

ALTER TABLE "point_assignments"
  ADD CONSTRAINT "point_assignments_point_id_fkey"
  FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "point_assignments"
  ADD CONSTRAINT "point_assignments_technician_id_fkey"
  FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_assignments"
  ADD CONSTRAINT "point_assignments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "point_assignments"
  ADD CONSTRAINT "point_assignments_time_check"
  CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");

ALTER TABLE "point_assignments"
  ADD CONSTRAINT "point_assignments_temporary_end_check"
  CHECK ("kind" <> 'TEMPORARY' OR "ends_at" IS NOT NULL);
