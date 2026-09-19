ALTER TABLE "maintenance_visits"
  ALTER COLUMN "latitude" DROP NOT NULL,
  ALTER COLUMN "longitude" DROP NOT NULL,
  ALTER COLUMN "location_captured_at" DROP NOT NULL;
