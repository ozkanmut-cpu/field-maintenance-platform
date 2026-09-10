CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UserRole" AS ENUM ('ADMIN','TECHNICIAN');
CREATE TYPE "PointStatus" AS ENUM ('ACTIVE','PASSIVE','CANCELLED');
CREATE TYPE "MaintenanceType" AS ENUM ('STANDARD','SMARTCLEAN');
CREATE TYPE "VisitStatus" AS ENUM ('VALID','REVERSED');
CREATE TYPE "PaperworkStatus" AS ENUM ('PENDING','PRESENT','MISSING');
CREATE TYPE "LocationSource" AS ENUM ('UNKNOWN','GOOGLE_MATCH','FIELD_CONFIRMED','MANUAL');

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "role" "UserRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "regions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL UNIQUE,
  "technician_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "points" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "region_id" UUID NOT NULL REFERENCES "regions"("id") ON DELETE RESTRICT,
  "status" "PointStatus" NOT NULL DEFAULT 'ACTIVE',
  "maintenance_type" "MaintenanceType" NOT NULL DEFAULT 'STANDARD',
  "maintenance_week" INTEGER,
  "smartclean_reference_at" DATE,
  "canonical_latitude" DECIMAL(9,6),
  "canonical_longitude" DECIMAL(9,6),
  "location_source" "LocationSource" NOT NULL DEFAULT 'UNKNOWN',
  "location_confidence" INTEGER NOT NULL DEFAULT 0,
  "google_place_id" TEXT,
  "google_business_name" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "points_maintenance_schedule_ck" CHECK (
    ("maintenance_type" = 'STANDARD' AND "maintenance_week" IN (1,2) AND "smartclean_reference_at" IS NULL)
    OR
    ("maintenance_type" = 'SMARTCLEAN' AND "maintenance_week" IS NULL)
  ),
  CONSTRAINT "points_location_confidence_ck" CHECK ("location_confidence" BETWEEN 0 AND 100)
);
CREATE INDEX "points_region_status_idx" ON "points"("region_id","status");
CREATE INDEX "points_schedule_idx" ON "points"("maintenance_type","maintenance_week");

CREATE TABLE "maintenance_obligations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "point_id" UUID NOT NULL REFERENCES "points"("id") ON DELETE RESTRICT,
  "cycle_key" TEXT NOT NULL,
  "due_start" DATE NOT NULL,
  "due_end" DATE NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "maintenance_obligations_point_cycle_key" UNIQUE ("point_id","cycle_key"),
  CONSTRAINT "maintenance_obligations_due_ck" CHECK ("due_end" >= "due_start")
);
CREATE INDEX "maintenance_obligations_due_idx" ON "maintenance_obligations"("due_start","due_end","completed_at");

CREATE TABLE "maintenance_visits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "point_id" UUID NOT NULL REFERENCES "points"("id") ON DELETE RESTRICT,
  "technician_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "obligation_id" UUID REFERENCES "maintenance_obligations"("id") ON DELETE SET NULL,
  "performed_at" TIMESTAMPTZ NOT NULL,
  "recorded_at_server" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "device_recorded_at" TIMESTAMPTZ,
  "entered_late" BOOLEAN NOT NULL DEFAULT FALSE,
  "late_entry_minutes" INTEGER,
  "late_entry_reason" TEXT,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "accuracy_meters" DECIMAL(8,2),
  "location_captured_at" TIMESTAMPTZ NOT NULL,
  "location_learning_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "suspicious_batch" BOOLEAN NOT NULL DEFAULT FALSE,
  "review_recommended" BOOLEAN NOT NULL DEFAULT FALSE,
  "review_reason" TEXT,
  "status" "VisitStatus" NOT NULL DEFAULT 'VALID',
  "reversed_at" TIMESTAMPTZ,
  "reversed_by_user_id" UUID,
  "service_slip_status" "PaperworkStatus" NOT NULL DEFAULT 'PENDING',
  "confirmation_status" "PaperworkStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "maintenance_visits_backdate_ck" CHECK (
    ("entered_late" = FALSE AND "late_entry_minutes" IS NULL AND "late_entry_reason" IS NULL)
    OR
    ("entered_late" = TRUE AND "late_entry_minutes" IS NOT NULL AND "late_entry_minutes" >= 0)
  )
);
CREATE INDEX "maintenance_visits_point_performed_idx" ON "maintenance_visits"("point_id","performed_at");
CREATE INDEX "maintenance_visits_technician_performed_idx" ON "maintenance_visits"("technician_id","performed_at");
CREATE INDEX "maintenance_visits_paperwork_idx" ON "maintenance_visits"("service_slip_status","confirmation_status");
