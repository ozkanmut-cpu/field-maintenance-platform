CREATE TYPE "ProspectSource" AS ENUM ('GOOGLE_MAPS', 'MANUAL', 'EFESIM');
CREATE TYPE "ProspectStatus" AS ENUM ('CANDIDATE', 'CONVERTED', 'ARCHIVED');
CREATE TYPE "ProspectVisitPurpose" AS ENUM ('SURVEY', 'INSTALLATION');

CREATE TABLE "prospect_customers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sap_no" TEXT,
    "source" "ProspectSource" NOT NULL,
    "status" "ProspectStatus" NOT NULL DEFAULT 'CANDIDATE',
    "google_place_id" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "converted_at" TIMESTAMP(3),
    CONSTRAINT "prospect_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "prospect_visits" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "purpose" "ProspectVisitPurpose" NOT NULL,
    "note" TEXT,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "accuracy_meters" DECIMAL(8,2),
    "location_captured_at" TIMESTAMP(3) NOT NULL,
    "visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_at_server" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prospect_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prospect_customers_status_created_at_idx" ON "prospect_customers"("status", "created_at");
CREATE INDEX "prospect_customers_sap_no_idx" ON "prospect_customers"("sap_no");
CREATE INDEX "prospect_customers_google_place_id_idx" ON "prospect_customers"("google_place_id");
CREATE UNIQUE INDEX "prospect_visits_idempotency_key_key" ON "prospect_visits"("idempotency_key");
CREATE INDEX "prospect_visits_prospect_id_visited_at_idx" ON "prospect_visits"("prospect_id", "visited_at");
CREATE INDEX "prospect_visits_technician_id_visited_at_idx" ON "prospect_visits"("technician_id", "visited_at");

ALTER TABLE "prospect_customers"
ADD CONSTRAINT "prospect_customers_created_by_id_fkey"
FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prospect_visits"
ADD CONSTRAINT "prospect_visits_prospect_id_fkey"
FOREIGN KEY ("prospect_id") REFERENCES "prospect_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "prospect_visits"
ADD CONSTRAINT "prospect_visits_technician_id_fkey"
FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
