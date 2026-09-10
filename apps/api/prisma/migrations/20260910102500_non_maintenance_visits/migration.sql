CREATE TYPE "NonMaintenanceVisitPurpose" AS ENUM ('CONTROL', 'CUSTOMER_REQUEST', 'PAPERWORK', 'OTHER');

CREATE TABLE "non_maintenance_visits" (
    "id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "purpose" "NonMaintenanceVisitPurpose" NOT NULL DEFAULT 'OTHER',
    "note" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "location_captured_at" TIMESTAMP(3) NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at_server" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "non_maintenance_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "non_maintenance_visits_idempotency_key_key" ON "non_maintenance_visits"("idempotency_key");
CREATE INDEX "non_maintenance_visits_point_id_visited_at_idx" ON "non_maintenance_visits"("point_id", "visited_at");
CREATE INDEX "non_maintenance_visits_technician_id_visited_at_idx" ON "non_maintenance_visits"("technician_id", "visited_at");

ALTER TABLE "non_maintenance_visits"
ADD CONSTRAINT "non_maintenance_visits_point_id_fkey"
FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "non_maintenance_visits"
ADD CONSTRAINT "non_maintenance_visits_technician_id_fkey"
FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
