ALTER TABLE "prospect_customers"
ADD COLUMN "converted_point_id" UUID;

CREATE UNIQUE INDEX "prospect_customers_converted_point_id_key"
ON "prospect_customers"("converted_point_id");

ALTER TABLE "prospect_customers"
ADD CONSTRAINT "prospect_customers_converted_point_id_fkey"
FOREIGN KEY ("converted_point_id") REFERENCES "points"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
