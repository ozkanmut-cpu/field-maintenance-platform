CREATE TYPE "AttemptReason" AS ENUM (
  'BUSINESS_CLOSED',
  'AUTHORIZED_PERSON_UNAVAILABLE',
  'ACCESS_FAILED',
  'OTHER'
);

CREATE TABLE "maintenance_attempts" (
  "id" UUID NOT NULL,
  "point_id" UUID NOT NULL,
  "technician_id" UUID NOT NULL,
  "reason" "AttemptReason" NOT NULL,
  "note" TEXT,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "accuracy_meters" DECIMAL(8,2),
  "location_captured_at" TIMESTAMP(3) NOT NULL,
  "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "maintenance_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_attempts_idempotency_key_key"
  ON "maintenance_attempts"("idempotency_key");
CREATE INDEX "maintenance_attempts_point_id_attempted_at_idx"
  ON "maintenance_attempts"("point_id", "attempted_at");
CREATE INDEX "maintenance_attempts_technician_id_attempted_at_idx"
  ON "maintenance_attempts"("technician_id", "attempted_at");

ALTER TABLE "maintenance_attempts"
  ADD CONSTRAINT "maintenance_attempts_point_id_fkey"
  FOREIGN KEY ("point_id") REFERENCES "points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_attempts"
  ADD CONSTRAINT "maintenance_attempts_technician_id_fkey"
  FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
